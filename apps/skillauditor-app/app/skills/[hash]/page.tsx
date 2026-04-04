import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SkillBadge } from '@/components/skill/skill-badge'
import { ENSNameDisplay } from '@/components/ens/ens-name-display'
import { SkillLedgerPanel } from '@/components/skill/skill-ledger-panel'
import type { SkillResponse, AuditResponse } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface SkillDetailPageProps {
  params: Promise<{ hash: string }>
}

async function fetchSkill(hash: string): Promise<SkillResponse | null> {
  const apiBase = process.env.API_URL ?? 'http://localhost:3001'
  try {
    const res = await fetch(`${apiBase}/v1/skills/${hash}`, { next: { revalidate: 60 } })
    if (res.status === 404) return null
    if (!res.ok) return null
    return res.json() as Promise<SkillResponse>
  } catch {
    return null
  }
}

async function fetchLatestAudit(auditId: string): Promise<AuditResponse | null> {
  const apiBase = process.env.API_URL ?? 'http://localhost:3001'
  try {
    const res = await fetch(`${apiBase}/v1/audits/${auditId}`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    return res.json() as Promise<AuditResponse>
  } catch {
    return null
  }
}

type Verdict = 'safe' | 'review_required' | 'unsafe'

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-red-600'
}

function VerdictBadgeLarge({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-500">
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
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
    <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${cfg.classes}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export async function generateMetadata({ params }: SkillDetailPageProps) {
  const { hash } = await params
  const skill = await fetchSkill(hash)
  if (!skill) return { title: 'Skill Not Found — SkillAuditor' }
  return { title: `${skill.name} — SkillAuditor` }
}

export default async function SkillDetailPage({ params }: SkillDetailPageProps) {
  const { hash } = await params
  const skill = await fetchSkill(hash)
  if (!skill) notFound()

  const audit = skill.latestAuditId ? await fetchLatestAudit(skill.latestAuditId) : null
  const findings = audit?.findings ?? []
  const shortHash = hash.slice(2, 10)
  const ensName = skill.ensSubname ?? `${shortHash}.skills.skillauditor.eth`

  return (
    <div className="flex flex-1 flex-col">
      {/* Nav */}
      <header className="border-b border-zinc-100 px-6 py-4 flex items-center gap-4">
        <Link href="/explore" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
          ← Explore
        </Link>
        <span className="text-zinc-200">|</span>
        <span className="text-sm font-medium text-zinc-900 truncate">{skill.name}</span>
      </header>

      <main className="flex-1 px-6 py-8 max-w-3xl mx-auto w-full flex flex-col gap-6">
        {/* Hero */}
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">{skill.name}</h1>
              {skill.version && (
                <p className="text-sm text-zinc-400 font-mono mt-0.5">v{skill.version}</p>
              )}
            </div>
            <Link
              href={`/skills/${hash}/test`}
              className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
            >
              Test this skill →
            </Link>
          </div>
          {skill.description && (
            <p className="text-sm text-zinc-500 leading-relaxed">{skill.description}</p>
          )}
        </div>

        {/* Verdict + Score */}
        <div className="rounded-xl border border-zinc-200 p-6 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Verdict</p>
            <VerdictBadgeLarge verdict={skill.latestVerdict} />
          </div>
          {skill.latestScore !== null && (
            <>
              <div className="hidden sm:block w-px h-12 bg-zinc-100" />
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Safety Score</p>
                <p className={`text-4xl font-semibold tabular-nums ${scoreColor(skill.latestScore)}`}>
                  {skill.latestScore}<span className="text-xl font-normal text-zinc-400">/100</span>
                </p>
              </div>
            </>
          )}
          <div className="hidden sm:block w-px h-12 bg-zinc-100" />
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Audits</p>
            <p className="text-sm font-medium text-zinc-700">{skill.auditCount} audit{skill.auditCount !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* ENS Subname */}
        <div className="rounded-xl border border-zinc-200 p-6">
          <ENSNameDisplay
            ensName={ensName}
            etherscanUrl={skill.ensSubname ? `https://app.ens.domains/${ensName}` : undefined}
          />
        </div>

        {/* Onchain stamp */}
        {audit?.stamp ? (
          <div className="rounded-xl border border-zinc-200 p-6 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-900">Onchain Stamp</h2>
            <div className="grid grid-cols-1 gap-2">
              <StampRow label="Tx Hash" value={audit.stamp.txHash} mono />
              <StampRow label="Contract" value={audit.stamp.contractAddress} mono />
              <StampRow label="Chain" value={`Base Sepolia (${audit.stamp.chainId})`} />
              {audit.stamp.ipfsCid && <StampRow label="IPFS Report" value={audit.stamp.ipfsCid} mono />}
            </div>
            <a
              href={`https://sepolia.basescan.org/tx/${audit.stamp.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 text-xs text-blue-600 hover:underline"
            >
              View on BaseScan →
            </a>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-200 p-6 flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-zinc-500">Onchain Stamp</h2>
            <p className="text-xs text-zinc-400">
              Onchain registration pending. Pro tier audits receive a tamper-proof stamp on Base.
            </p>
          </div>
        )}

        {/* Ledger approval modal — polls for pending stamp approvals */}
        <SkillLedgerPanel skillHash={hash} />

        {/* Findings summary */}
        {findings.length > 0 && (
          <div className="rounded-xl border border-zinc-200 p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Findings</h2>
              <span className="text-xs text-zinc-400">{findings.length} finding{findings.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex flex-col gap-2">
              {findings.slice(0, 5).map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <SeverityDot severity={f.severity} />
                  <span className="text-zinc-700">{f.description}</span>
                </div>
              ))}
              {findings.length > 5 && (
                <p className="text-xs text-zinc-400">
                  + {findings.length - 5} more —{' '}
                  <Link href={`/audits/${skill.latestAuditId}`} className="text-zinc-600 underline underline-offset-2">
                    view full audit
                  </Link>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Embed badge */}
        <div className="rounded-xl border border-zinc-200 p-6 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">Embed Badge</h2>
          <p className="text-xs text-zinc-500">Add this to your README to show the audit status.</p>
          <SkillBadge hash={hash} verdict={skill.latestVerdict} score={skill.latestScore} />
          <code className="mt-1 rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-xs font-mono text-zinc-600 break-all whitespace-pre-wrap">
            {`<a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://skillauditor.xyz'}/skills/${hash}">
  <img src="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://skillauditor.xyz'}/api/badge/${hash}" alt="SkillAuditor" />
</a>`}
          </code>
        </div>

        {/* Full audit link */}
        {skill.latestAuditId && (
          <div className="flex justify-end">
            <Link
              href={`/audits/${skill.latestAuditId}`}
              className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors underline underline-offset-2"
            >
              View full audit report →
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}


function StampRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-zinc-400 w-24 shrink-0 pt-0.5">{label}</span>
      <span className={`text-xs text-zinc-700 break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'

function SeverityDot({ severity }: { severity: Severity }) {
  const color = {
    critical: 'bg-red-500',
    high: 'bg-orange-500',
    medium: 'bg-amber-500',
    low: 'bg-blue-400',
    info: 'bg-zinc-400',
  }[severity] ?? 'bg-zinc-400'
  return <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${color}`} />
}
