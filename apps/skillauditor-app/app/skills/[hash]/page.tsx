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
  const ensName = skill.ensSubname ?? null

  return (
    <div className="flex flex-1 flex-col">
      {/* Nav */}
      <header className="border-b border-zinc-100 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-900">SkillAuditor</Link>
        <span className="text-zinc-200">/</span>
        <Link href="/explore" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Registry</Link>
        <span className="text-zinc-200">/</span>
        <span className="text-sm font-medium text-zinc-900 truncate">{skill.name}</span>
      </header>

      <main className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full flex flex-col gap-6">

        {/* Hero row */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">{skill.name}</h1>
              {skill.ensSubname && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#dbeafe] bg-[#eff6ff] px-2.5 py-1 text-xs font-semibold text-[#1d4ed8]">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1L7.5 2.5L9.5 2L10 4L11.5 5.5L10.5 7L11 9L9 9.5L7.5 11L6 10L4.5 11L3 9.5L1 9L1.5 7L0.5 5.5L2 4L2.5 2L4.5 2.5L6 1Z" fill="#1d4ed8"/>
                    <path d="M4 6L5.5 7.5L8.5 4.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Onchain Verified
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              {skill.version && <span className="text-xs text-zinc-400 font-mono">v{skill.version}</span>}
              {skill.version && <span className="text-xs text-zinc-300">·</span>}
              <span className="text-xs text-zinc-400">{skill.auditCount} audit{skill.auditCount !== 1 ? 's' : ''}</span>
              {skill.ensSubname && (
                <>
                  <span className="text-xs text-zinc-300">·</span>
                  <span className="text-xs text-zinc-400 font-mono">{skill.ensSubname}</span>
                </>
              )}
            </div>
            {skill.description && (
              <p className="text-sm text-zinc-500 leading-relaxed mt-2 max-w-xl">{skill.description}</p>
            )}
          </div>
          <Link
            href={`/skills/${hash}/test`}
            className="shrink-0 rounded-lg bg-[#0052ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#0040cc] transition-colors"
          >
            Test this skill →
          </Link>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT — audit results (2/3) */}
          <div className="lg:col-span-2 flex flex-col gap-5">

            {/* Verdict + Score */}
            <div className="rounded-xl border border-zinc-200 p-5 flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Verdict</p>
                <VerdictBadgeLarge verdict={skill.latestVerdict} />
              </div>
              {skill.latestScore !== null && (
                <>
                  <div className="hidden sm:block w-px h-10 bg-zinc-100" />
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Safety Score</p>
                    <p className={`text-4xl font-bold tabular-nums tracking-tight ${scoreColor(skill.latestScore)}`}>
                      {skill.latestScore}<span className="text-xl font-normal text-zinc-300">/100</span>
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Findings summary */}
            {findings.length > 0 && (
              <div className="rounded-xl border border-zinc-200 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-900">Findings</h2>
                  <span className="text-xs text-zinc-400">{findings.length} finding{findings.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex flex-col divide-y divide-zinc-100">
                  {findings.slice(0, 5).map((f, i) => (
                    <div key={i} className="flex items-start gap-3 px-5 py-3">
                      <SeverityDot severity={f.severity} />
                      <span className="text-sm text-zinc-700 leading-relaxed">{f.description}</span>
                    </div>
                  ))}
                </div>
                {findings.length > 5 && (
                  <div className="px-5 py-3 border-t border-zinc-100">
                    <Link href={`/audits/${skill.latestAuditId}`} className="text-xs text-[#0052ff] hover:underline">
                      View all {findings.length} findings →
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Full audit link */}
            {skill.latestAuditId && (
              <Link
                href={`/audits/${skill.latestAuditId}`}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors self-start"
              >
                View full audit report →
              </Link>
            )}
          </div>

          {/* RIGHT — metadata sidebar (1/3) */}
          <div className="flex flex-col gap-4">

            {/* ENS Subname */}
            <div className="rounded-xl border border-zinc-200 p-5 flex flex-col gap-3">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Identity</p>
              {ensName ? (
                <ENSNameDisplay
                  ensName={ensName}
                  etherscanUrl={`https://app.ens.domains/${ensName}`}
                />
              ) : (
                <p className="text-xs text-zinc-400 leading-relaxed">
                  No ENS subname — Pro tier audits receive a registered subname on <span className="font-mono">skills.skillauditor.eth</span>.
                </p>
              )}
            </div>

            {/* Onchain stamp */}
            {audit?.stamp ? (
              <div className="rounded-xl border border-[#dbeafe] bg-[#f0f7ff] p-5 flex flex-col gap-4">
                {/* Verified header */}
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center h-6 w-6 rounded-full bg-[#0052ff]">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  <span className="text-sm font-semibold text-[#0040cc]">Onchain Verified</span>
                </div>

                {/* Fields */}
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[#5b84c4] font-medium">Network</span>
                    <span className="font-medium text-zinc-700">Base Sepolia ({audit.stamp.chainId})</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[#5b84c4] font-medium">Transaction</span>
                    <a
                      href={`https://sepolia.basescan.org/tx/${audit.stamp.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[#0052ff] break-all hover:underline"
                    >
                      {audit.stamp.txHash}
                    </a>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[#5b84c4] font-medium">Contract</span>
                    <a
                      href={`https://sepolia.basescan.org/address/${audit.stamp.contractAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[#0052ff] break-all hover:underline"
                    >
                      {audit.stamp.contractAddress}
                    </a>
                  </div>
                  {audit.stamp.ipfsCid && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[#5b84c4] font-medium">IPFS Report</span>
                      <span className="font-mono text-zinc-600 break-all">{audit.stamp.ipfsCid}</span>
                    </div>
                  )}
                </div>

                <a
                  href={`https://sepolia.basescan.org/tx/${audit.stamp.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[#0052ff] hover:underline"
                >
                  View on BaseScan →
                </a>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-200 p-5 flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-zinc-400">Onchain Stamp</p>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Pro tier audits receive a tamper-proof stamp on Base.
                </p>
              </div>
            )}

            {/* Ledger approval */}
            <SkillLedgerPanel skillHash={hash} />

            {/* Embed badge */}
            <div className="rounded-xl border border-zinc-200 p-5 flex flex-col gap-3">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Embed Badge</p>
              <SkillBadge hash={hash} verdict={skill.latestVerdict} score={skill.latestScore} />
              <code className="rounded-lg bg-zinc-50 border border-zinc-100 px-3 py-2 text-[10px] font-mono text-zinc-500 break-all whitespace-pre-wrap leading-relaxed">
                {`<a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://skillauditor.xyz'}/skills/${hash}">
  <img src="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://skillauditor.xyz'}/api/badge/${hash}" alt="SkillAuditor" />
</a>`}
              </code>
            </div>
          </div>
        </div>
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
