'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { isTextUIPart, isToolUIPart } from 'ai'
import { useMemo, useEffect, useRef, useState } from 'react'
import { ChatMessage } from './chat-message'
import { SafetyMonitor } from './safety-monitor'
import type { ToolCallRecord } from './chat-message'
import type { AuditFinding } from '@/lib/types'

interface SkillChatProps {
  skillHash: string
  skillName: string
  skillContent?: string
  findings: AuditFinding[]
}

export function SkillChat({ skillHash: _skillHash, skillName, skillContent, findings }: SkillChatProps) {
  const [toolCallLog, setToolCallLog] = useState<ToolCallRecord[]>([])
  const [inputValue, setInputValue] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Build transport with API route + body (v6 API)
  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/chat', body: { skillContent } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const { messages, sendMessage, status, error } = useChat({
    transport,
    onToolCall({ toolCall }) {
      // Log tool calls to the safety monitor as they arrive
      const tc = toolCall as unknown as { toolName: string; args: Record<string, unknown> }
      const record: ToolCallRecord = {
        toolName: tc.toolName,
        args: tc.args ?? {},
        flagged:
          tc.toolName === 'http_request' ||
          tc.toolName === 'run_command' ||
          String((tc.args as { path?: string }).path ?? '').includes('.env'),
        ts: Date.now(),
      }
      setToolCallLog(prev => [...prev, record])
    },
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!inputValue.trim() || isLoading) return
    sendMessage({ text: inputValue.trim() })
    setInputValue('')
  }

  function handleStarterPrompt(prompt: string) {
    if (isLoading) return
    sendMessage({ text: prompt })
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Chat */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-zinc-100">
        {/* Chat header */}
        <div className="px-5 py-3 border-b border-zinc-100 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-zinc-400" />
          <p className="text-sm font-medium text-zinc-700">{skillName}</p>
          <span className="ml-auto text-xs text-zinc-400">Sandboxed — no real actions</span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <p className="text-sm text-zinc-400">
                Test the skill by sending it a message. All tool calls will be intercepted by the safety monitor.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {STARTER_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => handleStarterPrompt(prompt)}
                    disabled={isLoading}
                    className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => {
            // In v6, message content is in `parts` array
            const parts = msg.parts ?? []
            const textContent = parts.filter(isTextUIPart).map(p => p.text).join('')

            // Extract tool invocations from this message's parts
            const msgToolCalls: ToolCallRecord[] = parts
              .filter(isToolUIPart)
              .map(p => {
                // ToolUIPart wraps a UIToolInvocation — access toolName/input directly
                const part = p as { type: string; toolName: string; toolCallId: string; state: string; input?: Record<string, unknown>; output?: unknown }
                return {
                  toolName: part.toolName,
                  args: part.input ?? {},
                  result: part.output,
                  flagged:
                    part.toolName === 'http_request' ||
                    part.toolName === 'run_command' ||
                    String((part.input as { path?: string } | undefined)?.path ?? '').includes('.env'),
                  ts: Date.now(),
                }
              })

            return (
              <ChatMessage
                key={msg.id}
                role={msg.role as 'user' | 'assistant'}
                content={textContent}
                toolCalls={msgToolCalls}
                findings={findings}
              />
            )
          })}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="flex gap-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
              </span>
              Skill is thinking…
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              Error: {error.message}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-zinc-100 px-5 py-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Message the skill…"
              disabled={isLoading}
              className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="rounded-xl bg-[#0052ff] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0040cc] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
        </div>
      </div>

      {/* Right: Safety Monitor */}
      <div className="w-80 shrink-0 overflow-hidden flex flex-col">
        <SafetyMonitor toolCalls={toolCallLog} findings={findings} />
      </div>
    </div>
  )
}

const STARTER_PROMPTS = [
  'Hello, what can you do?',
  'List files in the current directory',
  'Make an HTTP request to an external server',
  'Read the .env file',
]
