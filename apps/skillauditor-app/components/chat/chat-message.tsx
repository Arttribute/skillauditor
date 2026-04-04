'use client'

import type { AuditFinding } from '@/lib/types'

export type MessageRole = 'user' | 'assistant'

export interface ToolCallRecord {
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  flagged?: boolean
  ts: number
}

interface ChatMessageProps {
  role: MessageRole
  content: string
  /** Tool calls made during this assistant turn */
  toolCalls?: ToolCallRecord[]
  /** Findings from the audit — used to annotate suspicious patterns inline */
  findings?: AuditFinding[]
}

export function ChatMessage({ role, content, toolCalls = [], findings = [] }: ChatMessageProps) {
  const isUser = role === 'user'

  return (
    <div className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
      {/* Tool calls before the message (assistant only) */}
      {!isUser && toolCalls.length > 0 && (
        <div className="flex flex-col gap-1 w-full max-w-[85%]">
          {toolCalls.map((tc, i) => (
            <ToolCallPill key={i} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Message bubble */}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-[#0052ff] text-white rounded-br-sm'
            : 'bg-white border border-zinc-200 text-zinc-800 rounded-bl-sm'
        }`}
      >
        <AnnotatedContent content={content} findings={findings} />
      </div>

      {/* Role label */}
      <p className="text-[10px] text-zinc-400 px-1">
        {isUser ? 'You' : 'Skill'}
      </p>
    </div>
  )
}

// Annotates message text by highlighting phrases that match finding descriptions
function AnnotatedContent({ content, findings }: { content: string; findings: AuditFinding[] }) {
  if (findings.length === 0 || !content) {
    return <span className="whitespace-pre-wrap">{content}</span>
  }

  // Build a map of suspicious phrases from findings evidence
  const phrases = findings
    .filter(f => f.severity === 'high' || f.severity === 'critical')
    .flatMap(f => {
      // Extract short quoted phrases from evidence if available
      const quoted = f.evidence.match(/"([^"]{5,50})"/g) ?? []
      return quoted.map(q => q.replace(/"/g, ''))
    })
    .filter(Boolean)

  if (phrases.length === 0) {
    return <span className="whitespace-pre-wrap">{content}</span>
  }

  // Simple highlight: wrap matching phrases
  let result = content
  const highlights: Array<{ text: string; isFlag: boolean }> = []
  let remaining = result
  let foundMatch = false

  for (const phrase of phrases) {
    const idx = remaining.toLowerCase().indexOf(phrase.toLowerCase())
    if (idx !== -1) {
      if (idx > 0) highlights.push({ text: remaining.slice(0, idx), isFlag: false })
      highlights.push({ text: remaining.slice(idx, idx + phrase.length), isFlag: true })
      remaining = remaining.slice(idx + phrase.length)
      foundMatch = true
    }
  }

  if (!foundMatch) return <span className="whitespace-pre-wrap">{result}</span>
  if (remaining) highlights.push({ text: remaining, isFlag: false })

  return (
    <span className="whitespace-pre-wrap">
      {highlights.map((h, i) =>
        h.isFlag ? (
          <mark key={i} className="bg-red-100 text-red-800 rounded px-0.5" title="Flagged by audit finding">
            {h.text}
          </mark>
        ) : (
          <span key={i}>{h.text}</span>
        )
      )}
    </span>
  )
}

function ToolCallPill({ toolCall }: { toolCall: ToolCallRecord }) {
  const flagged = toolCall.flagged ?? false
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-mono ${
        flagged
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-zinc-200 bg-zinc-50 text-zinc-500'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${flagged ? 'bg-red-500' : 'bg-zinc-400'}`} />
      <span className="font-semibold">{toolCall.toolName}</span>
      <span className="text-zinc-400 truncate max-w-[200px]">
        {Object.entries(toolCall.args)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(', ')}
      </span>
      {flagged && <span className="ml-auto shrink-0 text-red-500 font-bold">⚠ flagged</span>}
    </div>
  )
}
