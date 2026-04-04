import Link from 'next/link'
import type { SkillResponse } from '@/lib/types'
import { ENSNameDisplay } from '@/components/ens/ens-name-display'

interface SkillCardProps {
  skill: SkillResponse
}

type Verdict = 'safe' | 'review_required' | 'unsafe'

function VerdictBadge({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
        Unverified
      </span>
    )
  }
  const cfg = {
    safe: { label: 'Safe', dot: 'bg-green-500', classes: 'bg-green-50 border-green-200 text-green-700' },
    review_required: { label: 'Review Required', dot: 'bg-amber-500', classes: 'bg-amber-50 border-amber-200 text-amber-700' },
    unsafe: { label: 'Unsafe', dot: 'bg-red-500', classes: 'bg-red-50 border-red-200 text-red-700' },
  }[verdict]

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-red-600'
}

export function SkillCard({ skill }: SkillCardProps) {
  const shortHash = skill.hash.slice(2, 10)

  return (
    <Link
      href={`/skills/${skill.hash}`}
      className="group flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-300 hover:shadow-sm transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900 truncate group-hover:text-zinc-700 transition-colors">
            {skill.name}
          </p>
          {skill.version && (
            <p className="text-xs text-zinc-400 font-mono">v{skill.version}</p>
          )}
        </div>
        <VerdictBadge verdict={skill.latestVerdict} />
      </div>

      {/* Description */}
      {skill.description && (
        <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">{skill.description}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
        <div className="flex items-center gap-3">
          {skill.latestScore !== null && (
            <span className={`text-xs font-mono font-semibold ${scoreColor(skill.latestScore)}`}>
              {skill.latestScore}/100
            </span>
          )}
          {skill.ensSubname ? (
            <ENSNameDisplay ensName={skill.ensSubname} compact />
          ) : (
            <span className="text-xs font-mono text-zinc-300">{shortHash}.skills.auditor.eth</span>
          )}
        </div>
        <span className="text-xs text-zinc-400">
          {skill.auditCount} audit{skill.auditCount !== 1 ? 's' : ''}
        </span>
      </div>
    </Link>
  )
}
