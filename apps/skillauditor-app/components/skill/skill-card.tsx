import Link from 'next/link'
import type { SkillResponse } from '@/lib/types'

interface SkillCardProps {
  skill: SkillResponse
}

type Verdict = 'safe' | 'review_required' | 'unsafe'

function VerdictBadge({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
        Unverified
      </span>
    )
  }
  const cfg = {
    safe: { label: 'Safe', dot: 'bg-green-500', classes: 'bg-green-50 border-green-200 text-green-700' },
    review_required: { label: 'Review', dot: 'bg-amber-500', classes: 'bg-amber-50 border-amber-200 text-amber-700' },
    unsafe: { label: 'Unsafe', dot: 'bg-red-500', classes: 'bg-red-50 border-red-200 text-red-700' },
  }[verdict]

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#dbeafe] bg-[#eff6ff] px-2 py-0.5 text-[10px] font-semibold text-[#1d4ed8]">
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
        <path d="M6 1L7.5 2.5L9.5 2L10 4L11.5 5.5L10.5 7L11 9L9 9.5L7.5 11L6 10L4.5 11L3 9.5L1 9L1.5 7L0.5 5.5L2 4L2.5 2L4.5 2.5L6 1Z" fill="#1d4ed8"/>
        <path d="M4 6L5.5 7.5L8.5 4.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Onchain
    </span>
  )
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-red-600'
}

export function SkillCard({ skill }: SkillCardProps) {
  const isOnchain = Boolean(skill.ensSubname)

  return (
    <Link
      href={`/skills/${skill.hash}`}
      className="group flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex flex-col gap-1">
          <p className="text-sm font-semibold text-zinc-900 truncate group-hover:text-[#0052ff] transition-colors">
            {skill.name}
          </p>
          {skill.version && (
            <p className="text-xs text-zinc-400 font-mono">v{skill.version}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <VerdictBadge verdict={skill.latestVerdict} />
          {isOnchain && <VerifiedBadge />}
        </div>
      </div>

      {skill.description && (
        <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">{skill.description}</p>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
        <div className="flex items-center gap-3">
          {skill.latestScore !== null && (
            <span className={`text-xs font-mono font-semibold ${scoreColor(skill.latestScore)}`}>
              {skill.latestScore}/100
            </span>
          )}
          {isOnchain && (
            <span className="text-xs font-mono text-zinc-400 truncate max-w-[120px]">{skill.ensSubname}</span>
          )}
        </div>
        <span className="text-xs text-zinc-400">
          {skill.auditCount} audit{skill.auditCount !== 1 ? 's' : ''}
        </span>
      </div>
    </Link>
  )
}
