import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SkillChat } from '@/components/chat/skill-chat'
import type { SkillResponse, AuditResponse, AuditFinding } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface TestPageProps {
  params: Promise<{ hash: string }>
}

async function fetchSkill(hash: string): Promise<SkillResponse | null> {
  const apiBase = process.env.API_URL ?? 'http://localhost:3001'
  try {
    const res = await fetch(`${apiBase}/v1/skills/${hash}`, { cache: 'no-store' })
    if (res.status === 404) return null
    if (!res.ok) return null
    return res.json() as Promise<SkillResponse>
  } catch {
    return null
  }
}

async function fetchAudit(auditId: string): Promise<AuditResponse | null> {
  const apiBase = process.env.API_URL ?? 'http://localhost:3001'
  try {
    const res = await fetch(`${apiBase}/v1/audits/${auditId}`, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json() as Promise<AuditResponse>
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: TestPageProps) {
  const { hash } = await params
  const skill = await fetchSkill(hash)
  return { title: skill ? `Test: ${skill.name} — SkillAuditor` : 'Skill Test — SkillAuditor' }
}

export default async function SkillTestPage({ params }: TestPageProps) {
  const { hash } = await params
  const skill = await fetchSkill(hash)
  if (!skill) notFound()

  const audit = skill.latestAuditId ? await fetchAudit(skill.latestAuditId) : null
  const findings: AuditFinding[] = audit?.findings ?? []

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Nav */}
      <header className="shrink-0 border-b border-zinc-100 px-6 py-3 flex items-center gap-4">
        <Link
          href={`/skills/${hash}`}
          className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          ← {skill.name}
        </Link>
        <span className="text-zinc-200">|</span>
        <span className="text-sm font-medium text-zinc-900">Sandbox Test</span>
        <div className="ml-auto flex items-center gap-2">
          {skill.latestVerdict && (
            <VerdictPill verdict={skill.latestVerdict} />
          )}
          <span className="text-xs text-zinc-400">No auth required · Sandboxed</span>
        </div>
      </header>

      {/* Two-panel chat */}
      <SkillChat
        skillHash={hash}
        skillName={skill.name}
        findings={findings}
      />
    </div>
  )
}

type Verdict = 'safe' | 'review_required' | 'unsafe'

function VerdictPill({ verdict }: { verdict: Verdict }) {
  const cfg = {
    safe: 'bg-green-50 border-green-200 text-green-700',
    review_required: 'bg-amber-50 border-amber-200 text-amber-700',
    unsafe: 'bg-red-50 border-red-200 text-red-700',
  }[verdict]
  const label = { safe: 'Safe', review_required: 'Review Required', unsafe: 'Unsafe' }[verdict]
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg}`}>
      {label}
    </span>
  )
}
