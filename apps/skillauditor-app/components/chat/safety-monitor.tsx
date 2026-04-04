'use client'

import type { ToolCallRecord } from './chat-message'
import type { AuditFinding } from '@/lib/types'

interface SafetyMonitorProps {
  toolCalls: ToolCallRecord[]
  findings: AuditFinding[]
}

type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'

const SEVERITY_CONFIG: Record<Severity, { dot: string; text: string; bg: string }> = {
  critical: { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
  high:     { dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50' },
  medium:   { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  low:      { dot: 'bg-blue-400', text: 'text-blue-700', bg: 'bg-blue-50' },
  info:     { dot: 'bg-zinc-400', text: 'text-zinc-600', bg: 'bg-zinc-50' },
}

/** Check if a tool call matches any audit finding evidence */
function matchFinding(toolCall: ToolCallRecord, findings: AuditFinding[]): AuditFinding | null {
  const argsStr = JSON.stringify(toolCall.args).toLowerCase()
  for (const f of findings) {
    if (f.evidence && argsStr.includes(f.evidence.slice(0, 20).toLowerCase())) return f
    if (f.category === 'exfiltration' && toolCall.toolName === 'http_request') return f
    if (f.category === 'scope_creep' && toolCall.toolName === 'run_command') return f
  }
  return null
}

export function SafetyMonitor({ toolCalls, findings }: SafetyMonitorProps) {
  const flaggedCount = toolCalls.filter(tc => tc.flagged).length
  const criticalFindings = findings.filter(f => f.severity === 'critical' || f.severity === 'high')

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${flaggedCount > 0 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
          <p className="text-xs font-semibold text-zinc-700">Safety Monitor</p>
        </div>
        {flaggedCount > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
            {flaggedCount} flag{flaggedCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-4 p-4">
        {/* Audit findings context */}
        {criticalFindings.length > 0 && (
          <section className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Known risks from audit</p>
            {criticalFindings.map((f, i) => {
              const cfg = SEVERITY_CONFIG[f.severity as Severity] ?? SEVERITY_CONFIG.info
              return (
                <div key={i} className={`rounded-lg border ${cfg.bg} px-3 py-2 flex items-start gap-2`}>
                  <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                  <div className="min-w-0">
                    <p className={`text-[10px] font-semibold uppercase tracking-wide ${cfg.text}`}>
                      {f.severity} · {f.category.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5 leading-snug">{f.description}</p>
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {/* Live tool call log */}
        <section className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
            Tool calls {toolCalls.length > 0 && `(${toolCalls.length})`}
          </p>

          {toolCalls.length === 0 ? (
            <p className="text-xs text-zinc-400 italic">No tool calls yet. Interact with the skill to see live monitoring.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {toolCalls.map((tc, i) => {
                const matched = matchFinding(tc, findings)
                const flagged = tc.flagged || matched !== null
                return (
                  <div key={i} className={`rounded-lg border px-3 py-2 flex flex-col gap-1 ${flagged ? 'border-red-200 bg-red-50' : 'border-zinc-100 bg-zinc-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${flagged ? 'bg-red-500' : 'bg-zinc-400'}`} />
                        <span className="font-mono text-xs font-semibold text-zinc-700">{tc.toolName}</span>
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {new Date(tc.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="font-mono text-[10px] text-zinc-500 break-all truncate">
                      {Object.entries(tc.args).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(' | ')}
                    </p>
                    {flagged && matched && (
                      <p className="text-[10px] text-red-600 font-medium mt-0.5">
                        Matches finding: {matched.category.replace(/_/g, ' ')}
                      </p>
                    )}
                    {flagged && !matched && tc.flagged && (
                      <p className="text-[10px] text-red-600 font-medium mt-0.5">Flagged by sandbox</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* All clear */}
        {toolCalls.length > 0 && flaggedCount === 0 && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 flex items-center gap-2">
            <span>✓</span>
            <span>No suspicious tool calls detected so far.</span>
          </div>
        )}
      </div>
    </div>
  )
}
