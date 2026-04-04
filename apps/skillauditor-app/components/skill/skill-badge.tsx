/**
 * SkillBadge — inline embeddable safety badge.
 * Intended for embedding in READMEs, docs, or any page that wants
 * to display a skill's audit result at a glance.
 *
 * Usage:
 *   <SkillBadge hash="0xabcdef..." verdict="safe" score={92} />
 */

type Verdict = 'safe' | 'review_required' | 'unsafe'

interface SkillBadgeProps {
  hash: string
  verdict: Verdict | null
  score: number | null
  /** Link to the full audit result — defaults to /skills/{hash} */
  href?: string
  size?: 'sm' | 'md'
}

const VERDICT_CONFIG: Record<Verdict, { label: string; bg: string; border: string; text: string; dot: string }> = {
  safe: {
    label: 'Safe',
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    dot: 'bg-green-500',
  },
  review_required: {
    label: 'Review Required',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  unsafe: {
    label: 'Unsafe',
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
}

export function SkillBadge({ hash, verdict, score, href, size = 'md' }: SkillBadgeProps) {
  const link = href ?? `/skills/${hash}`
  const shortHash = hash.slice(2, 10)

  if (!verdict) {
    return (
      <a
        href={link}
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-500 no-underline hover:bg-zinc-100 transition-colors"
        target="_blank"
        rel="noopener noreferrer"
        title={`SkillAuditor — ${shortHash}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
        SkillAuditor · Unverified
      </a>
    )
  }

  const cfg = VERDICT_CONFIG[verdict]
  const padding = size === 'sm' ? 'px-2.5 py-0.5' : 'px-3 py-1'
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs'

  return (
    <a
      href={link}
      className={`inline-flex items-center gap-1.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text} ${padding} ${textSize} font-semibold no-underline hover:opacity-80 transition-opacity`}
      target="_blank"
      rel="noopener noreferrer"
      title={`SkillAuditor — ${shortHash}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      SkillAuditor · {cfg.label}
      {score !== null && (
        <>
          <span className="opacity-50">·</span>
          <span className="font-mono">{score}</span>
        </>
      )}
    </a>
  )
}
