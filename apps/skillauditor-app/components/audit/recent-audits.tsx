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
      <div className="rounded-xl border border-dashed border-zinc-200 px-6 py-12 text-center">
        <p className="text-sm font-medium text-zinc-400">No audits yet</p>
        <p className="text-xs text-zinc-300 mt-1">Submitted skills will appear here</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-200 overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-2.5 border-b border-zinc-100 bg-zinc-50">
        <span className="text-xs font-medium text-zinc-400">Skill</span>
        <span className="text-xs font-medium text-zinc-400">Status</span>
        <span className="text-xs font-medium text-zinc-400">Time</span>
      </div>

      {history.map(entry => {
        const s = statuses[entry.auditId]
        const verdict = s?.result?.verdict
        const score = s?.result?.score
        const status = s?.status

        return (
          <Link
            key={entry.auditId}
            href={`/audits/${entry.auditId}`}
            className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-5 py-3.5 border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900 truncate">{entry.skillName}</p>
              <p className="text-xs text-zinc-400 font-mono truncate mt-0.5">
                {entry.skillHash ? entry.skillHash.slice(0, 12) + '…' : entry.auditId.slice(0, 12) + '…'}
              </p>
            </div>

            <div className="shrink-0">
              {verdict ? (
                <VerdictPill verdict={verdict} score={score} />
              ) : status === 'pending' || status === 'running' ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse" />
                  Running
                </span>
              ) : status === 'failed' ? (
                <span className="text-xs font-medium text-red-500">Failed</span>
              ) : (
                <span className="text-xs text-zinc-300">—</span>
              )}
            </div>

            <span className="text-xs text-zinc-400 shrink-0">{timeAgo(entry.submittedAt)}</span>
          </Link>
        )
      })}
    </div>
  )
}

function VerdictPill({ verdict, score }: { verdict: string; score?: number }) {
  const cfg = {
    safe: 'bg-green-50 text-green-700 border border-green-200',
    review_required: 'bg-amber-50 text-amber-700 border border-amber-200',
    unsafe: 'bg-red-50 text-red-700 border border-red-200',
  }[verdict] ?? 'bg-zinc-100 text-zinc-600 border border-zinc-200'

  const label = {
    safe: 'Safe',
    review_required: 'Review',
    unsafe: 'Unsafe',
  }[verdict] ?? verdict

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg}`}>
      {label}
      {score != null && <span className="opacity-50 font-normal">· {score}</span>}
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
