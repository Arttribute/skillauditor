import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface ENSRecord {
  ensName: string
  verdict: 'safe' | 'review_required' | 'unsafe'
  score: number
  reportCid: string
  auditedAt: number
  auditor: string
  skillName: string
  skillHash: string
  auditId: string
  baseTxHash: string
  links: {
    audit: string | null
    baseScan: string | null
    etherscan: string
    ensApp: string
  }
}

async function resolveENS(ensName: string): Promise<ENSRecord | null> {
  const apiBase = process.env.API_URL ?? 'http://localhost:3001'
  try {
    const res = await fetch(`${apiBase}/v1/ens/resolve?name=${encodeURIComponent(ensName)}`)
    if (res.status === 404) return null
    if (!res.ok) return null
    return res.json() as Promise<ENSRecord>
  } catch {
    return null
  }
}

function VerdictBadge({ verdict }: { verdict: ENSRecord['verdict'] }) {
  const cfg = {
    safe:             { label: 'Safe',            dot: 'bg-green-500', cls: 'bg-green-50 border-green-200 text-green-700' },
    review_required:  { label: 'Review Required', dot: 'bg-amber-500', cls: 'bg-amber-50 border-amber-200 text-amber-700' },
    unsafe:           { label: 'Unsafe',          dot: 'bg-red-500',   cls: 'bg-red-50 border-red-200 text-red-700'       },
  }[verdict]
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${cfg.cls}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function Row({ label, value, mono, href }: { label: string; value: string; mono?: boolean; href?: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b border-zinc-100 last:border-0">
      <span className="text-xs font-medium text-zinc-400 uppercase tracking-widest">{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer"
          className={`text-sm text-[#0052ff] hover:underline break-all ${mono ? 'font-mono' : ''}`}>
          {value}
        </a>
      ) : (
        <span className={`text-sm text-zinc-700 break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
      )}
    </div>
  )
}

export default async function ENSResolvePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const ensName = decodeURIComponent(name).toLowerCase()
  const record = await resolveENS(ensName)

  if (!record) notFound()

  const auditedDate = record.auditedAt
    ? new Date(record.auditedAt * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    : null

  const castCommand = `cast call \\
  0xd68f99d601155e7ca79327010dfd2636e6157b5f \\
  "resolveSkill(bytes32)(string,string,string,string,string,string,string,string,string)" \\
  $(cast namehash "${ensName}") \\
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com`

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-100 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-900">SkillAuditor</Link>
        <span className="text-zinc-200">/</span>
        <span className="text-sm text-zinc-500">ENS Lookup</span>
      </header>

      <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full flex flex-col gap-8">

        {/* Name + verified badge */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dbeafe] bg-[#eff6ff] px-2.5 py-1 text-xs font-semibold text-[#1d4ed8]">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L7.5 2.5L9.5 2L10 4L11.5 5.5L10.5 7L11 9L9 9.5L7.5 11L6 10L4.5 11L3 9.5L1 9L1.5 7L0.5 5.5L2 4L2.5 2L4.5 2.5L6 1Z" fill="#1d4ed8"/>
                <path d="M4 6L5.5 7.5L8.5 4.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              ENS Verified
            </span>
            <span className="text-xs text-zinc-400 font-mono">skills.skillauditor.eth</span>
          </div>
          <h1 className="text-xl font-bold font-mono text-zinc-900 break-all">{ensName}</h1>
          {record.skillName && (
            <p className="text-sm text-zinc-500">{record.skillName}</p>
          )}
        </div>

        {/* Verdict + Score */}
        <div className="rounded-xl border border-zinc-200 p-6 flex items-center gap-8">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Verdict</p>
            <VerdictBadge verdict={record.verdict} />
          </div>
          <div className="w-px h-10 bg-zinc-100" />
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Safety Score</p>
            <p className={`text-4xl font-bold tabular-nums tracking-tight ${record.score >= 80 ? 'text-green-600' : record.score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
              {record.score}<span className="text-xl font-normal text-zinc-300">/100</span>
            </p>
          </div>
        </div>

        {/* Audit records */}
        <div className="rounded-xl border border-zinc-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-100 bg-zinc-50">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Onchain Records</p>
          </div>
          <div className="px-5">
            {record.skillName  && <Row label="Skill Name"    value={record.skillName} />}
            {record.skillHash  && <Row label="Skill Hash"    value={record.skillHash}  mono />}
            {record.auditId    && <Row label="Audit ID"      value={record.auditId}    mono
                                        href={record.links.audit ? `https://skillauditor.dev/audits/${record.auditId}` : undefined} />}
            {record.baseTxHash && <Row label="Base Stamp Tx" value={record.baseTxHash} mono
                                        href={record.links.baseScan ?? undefined} />}
            {record.auditor    && <Row label="Auditor"       value={record.auditor}    mono />}
            {record.reportCid  && <Row label="IPFS Report"   value={record.reportCid}  mono />}
            {auditedDate       && <Row label="Audited At"    value={auditedDate} />}
          </div>
        </div>

        {/* Links */}
        <div className="flex gap-3 flex-wrap">
          {record.links.audit && (
            <Link href={`/audits/${record.auditId}`}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
              View Full Audit →
            </Link>
          )}
          {record.links.baseScan && (
            <a href={record.links.baseScan} target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
              Base Sepolia Stamp →
            </a>
          )}
          <a href={record.links.etherscan} target="_blank" rel="noopener noreferrer"
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
            Registrar Contract →
          </a>
        </div>

        {/* "Resolve it yourself" code block — the agent demo */}
        <div className="rounded-xl border border-zinc-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-100 bg-zinc-50 flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Resolve Without This API</p>
            <span className="text-xs text-zinc-400">Any Ethereum RPC · No API key needed</span>
          </div>
          <pre className="px-5 py-4 text-xs font-mono text-zinc-600 overflow-x-auto leading-relaxed bg-white whitespace-pre-wrap break-all">
            {castCommand}
          </pre>
        </div>

      </main>
    </div>
  )
}
