'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface AuditHistoryEntry {
  auditId: string
  skillName: string
  skillHash: string
  submittedAt: string
}

interface AuditStatus {
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: { verdict: 'safe' | 'review_required' | 'unsafe'; score: number }
}

export function RecentAudits() {
  const [history, setHistory] = useState<AuditHistoryEntry[]>([])
  const [statuses, setStatuses] = useState<Record<string, AuditStatus>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('sa_audit_history')
      const entries = raw ? (JSON.parse(raw) as AuditHistoryEntry[]) : []
      setHistory(entries)

      // Fetch status for each
      entries.forEach(entry => {
        fetch(`/api/proxy/v1/audits/${entry.auditId}`)
          .then(r => r.json())
          .then((data: AuditStatus) => {
            setStatuses(prev => ({ ...prev, [entry.auditId]: data }))
          })
          .catch(() => {/* non-fatal */})
      })
    } finally {
      setLoaded(true)
    }
  }, [])

  if (!loaded) return null

  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 px-6 py-10 text-center">
        <p className="text-sm text-zinc-500">No audits yet</p>
        <p className="text-xs text-zinc-400 mt-1">Submitted audits will appear here</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-zinc-100 rounded-xl border border-zinc-200 overflow-hidden">
      {history.map(entry => {
        const s = statuses[entry.auditId]
        const verdict = s?.result?.verdict
        const score = s?.result?.score
        const status = s?.status

        return (
          <Link
            key={entry.auditId}
            href={`/audits/${entry.auditId}`}
            className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900 truncate">{entry.skillName}</p>
              <p className="text-xs text-zinc-400 font-mono truncate">{entry.skillHash || entry.auditId}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {verdict ? (
                <VerdictPill verdict={verdict} score={score} />
              ) : status === 'pending' || status === 'running' ? (
                <span className="text-xs text-zinc-500 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse" />
                  Running
                </span>
              ) : status === 'failed' ? (
                <span className="text-xs text-red-500">Failed</span>
              ) : (
                <span className="text-xs text-zinc-400">—</span>
              )}
              <span className="text-xs text-zinc-400">
                {timeAgo(entry.submittedAt)}
              </span>
              <span className="text-zinc-300 text-xs">›</span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

function VerdictPill({ verdict, score }: { verdict: string; score?: number }) {
  const cfg = {
    safe: 'bg-green-50 text-green-700',
    review_required: 'bg-amber-50 text-amber-700',
    unsafe: 'bg-red-50 text-red-700',
  }[verdict] ?? 'bg-zinc-100 text-zinc-600'

  const label = {
    safe: 'Safe',
    review_required: 'Review',
    unsafe: 'Unsafe',
  }[verdict] ?? verdict

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg}`}>
      {label}
      {score != null && <span className="opacity-60">· {score}</span>}
    </span>
  )
}

function timeAgo(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
