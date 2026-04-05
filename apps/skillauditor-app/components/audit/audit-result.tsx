'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'

// ── Types matching the actual API response shape ───────────────────────────────

type AuditStatus = 'pending' | 'running' | 'completed' | 'failed'
type Verdict = 'safe' | 'review_required' | 'unsafe'
type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'

interface Finding {
  severity: Severity
  category: string
  description: string
  evidence: string
  source?: string
}

interface Dimensions {
  intentClarity: number
  scopeAdherence: number
  exfiltrationRisk: number
  injectionRisk: number
  consistencyScore: number
}

interface StructuralAnalysis {
  hash: string
  frontmatter: {
    name?: string
    description?: string
    version?: string
    tools?: string[]
    permissions?: string[]
  }
  externalUrls: string[]
  containsScripts: boolean
  scriptLanguages: string[]
  declaredCapabilities: string[]
  lineCount: number
}

interface BehavioralAnalysis {
  consistencyScore: number
  exfiltrationAttempts: number
  scopeViolations: number
  runs?: unknown[]
}

interface OnchainStamp {
  txHash: string
  chainId: number
  contractAddress: string
  ensSubname: string | null
  ipfsCid: string | null
}

interface AuditData {
  auditId: string
  skillHash: string
  skillName: string
  status: AuditStatus
  tier: string
  createdAt: string
  completedAt?: string
  error?: string
  result?: {
    verdict: Verdict
    score: number
  }
  findings?: Finding[]
  dimensions?: Dimensions
  recommendation?: string
  structuralAnalysis?: StructuralAnalysis
  behavioralAnalysis?: BehavioralAnalysis
  stamp?: OnchainStamp | null
}

interface LogEntry {
  ts: number
  stage: string
  level: 'info' | 'warn' | 'error'
  message: string
}

// ── Main component ─────────────────────────────────────────────────────────────

interface AuditResultProps {
  auditId: string
}

export function AuditResult({ auditId }: AuditResultProps) {
  const [data, setData] = useState<AuditData | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const lastLogTs = useRef<number>(0)

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/proxy/v1/audits/${auditId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setFetchError(body.error ?? `HTTP ${res.status}`)
        return
      }
      const json = await res.json() as AuditData
      setData(json)
    } catch {
      setFetchError('Network error — could not reach the API')
    }
  }, [auditId])

  const pollLogs = useCallback(async () => {
    try {
      const since = lastLogTs.current
      const res = await fetch(`/api/proxy/v1/audits/${auditId}/logs${since > 0 ? `?since=${since}` : ''}`)
      if (!res.ok) return
      const body = await res.json() as { logs: LogEntry[]; total: number }
      if (body.logs.length > 0) {
        setLogs(prev => [...prev, ...body.logs])
        lastLogTs.current = body.logs[body.logs.length - 1].ts
      }
    } catch {
      // non-fatal — logs are best-effort
    }
  }, [auditId])

  useEffect(() => {
    void poll()
    void pollLogs()
  }, [poll, pollLogs])

  // Poll audit status while pending/running
  useEffect(() => {
    if (!data) return
    if (data.status === 'completed' || data.status === 'failed') return

    const timer = setInterval(() => { void poll() }, 3000)
    return () => clearInterval(timer)
  }, [data, poll])

  // Poll logs while pending/running; do a final fetch on completion
  useEffect(() => {
    if (!data) return

    if (data.status === 'completed' || data.status === 'failed') {
      // One final fetch to capture any logs flushed just before completion
      void pollLogs()
      return
    }

    const timer = setInterval(() => { void pollLogs() }, 2000)
    return () => clearInterval(timer)
  }, [data, pollLogs])

  // ── Fetch error ──────────────────────────────────────────────────────────────
  if (fetchError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <p className="font-medium mb-1">Could not load audit</p>
        <p className="text-red-600">{fetchError}</p>
      </div>
    )
  }

  // ── Loading (first fetch) ────────────────────────────────────────────────────
  if (!data) return <AuditSkeleton />

  // ── Pipeline running ─────────────────────────────────────────────────────────
  if (data.status === 'pending' || data.status === 'running') {
    return <AuditRunning auditId={auditId} status={data.status} skillName={data.skillName} logs={logs} />
  }

  // ── Failed ───────────────────────────────────────────────────────────────────
  if (data.status === 'failed') {
    return (
      <div className="flex flex-col gap-4">
        <AuditHeader skillName={data.skillName} skillHash={data.skillHash} auditId={auditId} />
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-medium text-red-700 mb-1">Audit failed</p>
          <p className="text-sm text-red-600">
            {data.error ?? 'An error occurred in the pipeline. Please try resubmitting.'}
          </p>
          <Link
            href="/dashboard/submit"
            className="mt-4 inline-block text-sm font-medium text-red-700 underline underline-offset-2"
          >
            Resubmit
          </Link>
        </div>
        {logs.length > 0 && <LogsPanel logs={logs} />}
      </div>
    )
  }

  // ── Completed ────────────────────────────────────────────────────────────────
  const { result, findings = [], dimensions, recommendation, structuralAnalysis, behavioralAnalysis } = data
  const verdict = result?.verdict
  const score = result?.score ?? 0

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <AuditHeader skillName={data.skillName} skillHash={data.skillHash} auditId={auditId} />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT — main report (2/3) */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Recommendation — full width, breathes on its own */}
          {recommendation && (
            <div className="rounded-xl border border-zinc-200 p-5 flex flex-col gap-2">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Recommendation</p>
              <p className="text-base text-zinc-700 leading-relaxed">{recommendation}</p>
            </div>
          )}

          {/* Findings */}
          {findings.length > 0 ? (
            <FindingsPanel findings={findings} />
          ) : (
            <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-700">
              No security findings detected.
            </div>
          )}

          {/* Pipeline logs */}
          {logs.length > 0 && <LogsPanel logs={logs} defaultOpen={false} />}
        </div>

        {/* RIGHT — verdict, score, dimensions, metadata (1/3) */}
        <div className="flex flex-col gap-4">

          {/* Verdict + Score — top of sidebar */}
          <div className="rounded-xl border border-zinc-200 p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Verdict</p>
              <VerdictBadge verdict={verdict} />
            </div>
            <div className="h-px bg-zinc-100" />
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Safety Score</p>
              <p className={`text-5xl font-bold tabular-nums tracking-tight ${scoreColor(score)}`}>
                {score}<span className="text-2xl font-normal text-zinc-300">/100</span>
              </p>
            </div>
          </div>

          {/* Dimensions — below verdict in sidebar */}
          {dimensions && <DimensionsPanel dimensions={dimensions} />}

          {/* Meta card */}
          <div className="rounded-xl border border-zinc-200 p-5 flex flex-col gap-3">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Audit Info</p>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-zinc-400">Tier</span>
                <span className="font-medium text-zinc-700 capitalize">{data.tier}</span>
              </div>
              {data.completedAt && (
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Completed</span>
                  <span className="font-medium text-zinc-700">{new Date(data.completedAt).toLocaleDateString()}</span>
                </div>
              )}
              <div className="pt-1 border-t border-zinc-100">
                <p className="text-zinc-400 mb-1">Audit ID</p>
                <p className="font-mono text-zinc-600 break-all text-[10px]">{auditId}</p>
              </div>
            </div>
          </div>

          {/* Onchain stamp (Pro tier) */}
          {data.stamp ? (
            <OnchainStampPanel stamp={data.stamp} />
          ) : data.tier === 'pro' && (
            <RecordOnchainButton auditId={auditId} onSuccess={() => void poll()} />
          )}

          {/* Structural analysis */}
          {structuralAnalysis && <StructuralPanel structural={structuralAnalysis} />}

          {/* Behavioral summary */}
          {behavioralAnalysis && <BehavioralPanel behavioral={behavioralAnalysis} />}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AuditHeader({ skillName, skillHash, auditId }: { skillName: string; skillHash: string; auditId: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">{skillName}</h1>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-mono text-zinc-400 truncate max-w-xs">{skillHash.slice(0, 20)}…</span>
        <span className="text-zinc-200 text-xs">·</span>
        <span className="text-xs text-zinc-400 font-mono">audit/{auditId.slice(0, 8)}…</span>
      </div>
    </div>
  )
}

function VerdictBadge({ verdict }: { verdict: Verdict | undefined }) {
  if (!verdict) return null
  const cfg = {
    safe: { label: 'Safe', classes: 'bg-green-50 text-green-700 border-green-200' },
    review_required: { label: 'Review Required', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
    unsafe: { label: 'Unsafe', classes: 'bg-red-50 text-red-700 border-red-200' },
  }[verdict]

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${cfg.classes}`}>
      <span className={`h-2 w-2 rounded-full ${verdict === 'safe' ? 'bg-green-500' : verdict === 'review_required' ? 'bg-amber-500' : 'bg-red-500'}`} />
      {cfg.label}
    </span>
  )
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-red-600'
}

function DimensionsPanel({ dimensions }: { dimensions: Dimensions }) {
  const rows: Array<{ label: string; value: number; inverted?: boolean }> = [
    { label: 'Intent Clarity', value: dimensions.intentClarity },
    { label: 'Scope Adherence', value: dimensions.scopeAdherence },
    { label: 'Exfiltration Risk', value: dimensions.exfiltrationRisk, inverted: true },
    { label: 'Injection Risk', value: dimensions.injectionRisk, inverted: true },
    { label: 'Consistency', value: dimensions.consistencyScore },
  ]

  return (
    <div className="rounded-xl border border-zinc-200 p-5 flex flex-col gap-4">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Dimensions</p>
      <div className="flex flex-col gap-3">
        {rows.map(({ label, value, inverted }) => {
          const safeValue = Math.max(0, Math.min(100, value ?? 0))
          const barColor = inverted
            ? safeValue >= 50 ? 'bg-red-400' : safeValue >= 20 ? 'bg-amber-400' : 'bg-green-400'
            : safeValue >= 80 ? 'bg-green-400' : safeValue >= 60 ? 'bg-amber-400' : 'bg-red-400'
          return (
            <div key={label} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">{label}</span>
                <span className="text-xs font-mono font-semibold text-zinc-700">{safeValue}</span>
              </div>
              <div className="h-1 rounded-full bg-zinc-100">
                <div className={`h-1 rounded-full ${barColor} transition-all`} style={{ width: `${safeValue}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

const SEVERITY_CONFIG: Record<Severity, { label: string; dot: string; text: string; bg: string; border: string }> = {
  critical: { label: 'Critical', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  high:     { label: 'High',     dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  medium:   { label: 'Medium',   dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  low:      { label: 'Low',      dot: 'bg-blue-400', text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  info:     { label: 'Info',     dot: 'bg-zinc-400', text: 'text-zinc-600', bg: 'bg-zinc-50', border: 'border-zinc-200' },
}

function FindingsPanel({ findings }: { findings: Finding[] }) {
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  )

  return (
    <div className="rounded-xl border border-zinc-200 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 bg-white">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Findings</h2>
        <span className="text-xs text-zinc-400">{findings.length} finding{findings.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-y-auto max-h-[420px] flex flex-col gap-2 p-4">
        {sorted.map((f, i) => <FindingRow key={i} finding={f} />)}
      </div>
    </div>
  )
}

function FindingRow({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false)
  const cfg = SEVERITY_CONFIG[finding.severity] ?? SEVERITY_CONFIG.info
  const category = finding.category.replace(/_/g, ' ')

  return (
    <div className={`rounded-lg border ${cfg.border} overflow-hidden`}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50 transition-colors ${cfg.bg}`}
      >
        <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.text}`}>{cfg.label}</span>
            <span className="text-xs text-zinc-400">·</span>
            <span className="text-xs text-zinc-500 capitalize">{category}</span>
            {finding.source && (
              <>
                <span className="text-xs text-zinc-400">·</span>
                <span className="text-xs text-zinc-400 font-mono">{finding.source.replace(/_/g, ' ')}</span>
              </>
            )}
          </div>
          <p className="text-sm text-zinc-700 mt-0.5">{finding.description}</p>
        </div>
        <span className="text-zinc-400 text-xs shrink-0 mt-1">{open ? '▲' : '▼'}</span>
      </button>
      {open && finding.evidence && (
        <div className="border-t border-zinc-200 bg-white px-4 py-3">
          <p className="text-xs font-medium text-zinc-500 mb-1">Evidence</p>
          <p className="text-xs font-mono text-zinc-600 whitespace-pre-wrap leading-relaxed">{finding.evidence}</p>
        </div>
      )}
    </div>
  )
}

function StructuralPanel({ structural }: { structural: StructuralAnalysis }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-zinc-900">Structural Analysis</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Stat label="Lines" value={String(structural.lineCount)} />
        <Stat label="External URLs" value={String(structural.externalUrls.length)} />
        <Stat label="Contains Scripts" value={structural.containsScripts ? 'Yes' : 'No'} />
        {structural.scriptLanguages.length > 0 && (
          <Stat label="Script Languages" value={structural.scriptLanguages.join(', ')} />
        )}
        {structural.declaredCapabilities.length > 0 && (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-xs text-zinc-500 mb-1.5">Declared Capabilities</p>
            <div className="flex flex-wrap gap-1.5">
              {structural.declaredCapabilities.map(cap => (
                <span key={cap} className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-mono text-zinc-600">
                  {cap}
                </span>
              ))}
            </div>
          </div>
        )}
        {structural.externalUrls.length > 0 && (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-xs text-zinc-500 mb-1.5">External URLs</p>
            <div className="flex flex-col gap-0.5">
              {structural.externalUrls.map(url => (
                <span key={url} className="text-xs font-mono text-zinc-600 break-all">{url}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function BehavioralPanel({ behavioral }: { behavioral: BehavioralAnalysis }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-zinc-900">Behavioral Analysis</h2>
      <div className="grid grid-cols-3 gap-4">
        <Stat
          label="Consistency"
          value={`${behavioral.consistencyScore}/100`}
          valueClass={behavioral.consistencyScore >= 80 ? 'text-green-600' : behavioral.consistencyScore >= 60 ? 'text-amber-600' : 'text-red-600'}
        />
        <Stat
          label="Exfil Attempts"
          value={String(behavioral.exfiltrationAttempts)}
          valueClass={behavioral.exfiltrationAttempts > 0 ? 'text-red-600' : 'text-green-600'}
        />
        <Stat
          label="Scope Violations"
          value={String(behavioral.scopeViolations)}
          valueClass={behavioral.scopeViolations > 0 ? 'text-red-600' : 'text-green-600'}
        />
      </div>
    </div>
  )
}

// ── Logs panel ─────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  structural: 'text-sky-400',
  content:    'text-violet-400',
  sandbox:    'text-orange-400',
  verdict:    'text-emerald-400',
  onchain:    'text-blue-400',
  pipeline:   'text-zinc-400',
}

const LEVEL_COLORS: Record<string, string> = {
  info:  'text-zinc-300',
  warn:  'text-amber-400',
  error: 'text-red-400',
}

function LogsPanel({ logs, defaultOpen = true }: { logs: LogEntry[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom as new logs arrive
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, open])

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-900 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-zinc-500" />
          <span className="text-xs font-mono font-medium text-zinc-300">Pipeline Logs</span>
          <span className="text-xs text-zinc-600 font-mono">{logs.length} lines</span>
        </div>
        <span className="text-zinc-600 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          ref={scrollRef}
          className="overflow-y-auto max-h-96 px-4 pb-4 pt-1"
        >
          {logs.map((entry, i) => {
            const time = new Date(entry.ts).toISOString().slice(11, 23) // HH:MM:SS.mmm
            const stageColor = STAGE_COLORS[entry.stage] ?? 'text-zinc-500'
            const levelColor = LEVEL_COLORS[entry.level] ?? 'text-zinc-300'
            return (
              <div key={i} className="flex items-start gap-2 py-0.5 font-mono text-xs leading-5 min-w-0">
                <span className="text-zinc-600 shrink-0 select-none">{time}</span>
                <span className={`shrink-0 w-14 ${stageColor}`}>{entry.stage}</span>
                {entry.level !== 'info' && (
                  <span className={`shrink-0 uppercase text-[10px] font-bold ${levelColor}`}>{entry.level}</span>
                )}
                <span className={`break-all ${levelColor}`}>{entry.message}</span>
              </div>
            )
          })}
          {logs.length === 0 && (
            <p className="text-xs text-zinc-600 font-mono py-2">Waiting for pipeline to start…</p>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, valueClass = 'text-zinc-900' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-sm font-medium ${valueClass}`}>{value}</p>
    </div>
  )
}

// ── Loading states ─────────────────────────────────────────────────────────────

function AuditSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-6 w-48 rounded bg-zinc-100" />
      <div className="rounded-xl border border-zinc-200 p-6 h-28 bg-zinc-50" />
      <div className="rounded-xl border border-zinc-200 p-6 h-40 bg-zinc-50" />
    </div>
  )
}

const STAGES = [
  { key: 'stage1', label: 'Structural Extraction', desc: 'Parsing frontmatter, hashing content, extracting URLs' },
  { key: 'stage2', label: 'Content Analysis', desc: 'Examining skill instructions for injection and deception patterns' },
  { key: 'stage3', label: 'Sandbox Simulation', desc: 'Executing skill in isolated mock environment with honeypot credentials' },
  { key: 'stage4', label: 'Verdict Synthesis', desc: 'Aggregating findings into a final safety verdict' },
]

function AuditRunning({ auditId, status, skillName, logs }: { auditId: string; status: AuditStatus; skillName: string; logs: LogEntry[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">{skillName}</h1>
        <p className="text-xs font-mono text-zinc-400 mt-0.5">{auditId}</p>
      </div>

      <div className="rounded-xl border border-zinc-200 p-6 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <PulsingDot />
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              {status === 'pending' ? 'Queued' : 'Running pipeline…'}
            </p>
            <p className="text-xs text-zinc-500">This usually takes 30–90 seconds</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-zinc-100 pt-4">
          {STAGES.map((stage, i) => (
            <StageRow
              key={stage.key}
              label={stage.label}
              desc={stage.desc}
              state={
                status === 'pending' ? 'waiting'
                : i === 0 ? 'done'
                : i <= 2 ? 'running'
                : 'waiting'
              }
            />
          ))}
        </div>
      </div>

      <LogsPanel logs={logs} defaultOpen={true} />
    </div>
  )
}

type StageState = 'waiting' | 'running' | 'done'

function StageRow({ label, desc, state }: { label: string; desc: string; state: StageState }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">
        {state === 'done' && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600 text-xs">✓</span>
        )}
        {state === 'running' && (
          <span className="flex h-5 w-5 items-center justify-center">
            <svg className="animate-spin h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </span>
        )}
        {state === 'waiting' && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50" />
        )}
      </div>
      <div>
        <p className={`text-sm font-medium ${state === 'waiting' ? 'text-zinc-400' : 'text-zinc-700'}`}>{label}</p>
        <p className="text-xs text-zinc-400">{desc}</p>
      </div>
    </div>
  )
}

function PulsingDot() {
  return (
    <span className="relative flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-50" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-zinc-600" />
    </span>
  )
}

function OnchainStampPanel({ stamp }: { stamp: NonNullable<AuditData['stamp']> }) {
  return (
    <div className="rounded-xl border border-[#dbeafe] bg-[#f0f7ff] p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-[#0052ff]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
        <span className="text-sm font-semibold text-[#0040cc]">Onchain Verified</span>
      </div>
      <div className="flex flex-col gap-2 text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="text-[#5b84c4] font-medium">Network</span>
          <span className="font-medium text-zinc-700">Base Sepolia ({stamp.chainId})</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[#5b84c4] font-medium">Transaction</span>
          <a
            href={`https://sepolia.basescan.org/tx/${stamp.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[#0052ff] break-all hover:underline"
          >
            {stamp.txHash}
          </a>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[#5b84c4] font-medium">Contract</span>
          <a
            href={`https://sepolia.basescan.org/address/${stamp.contractAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[#0052ff] break-all hover:underline"
          >
            {stamp.contractAddress}
          </a>
        </div>
        {stamp.ensSubname && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[#5b84c4] font-medium">ENS Identity</span>
            <a
              href={`https://app.ens.domains/${stamp.ensSubname}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[#0052ff] break-all hover:underline"
            >
              {stamp.ensSubname}
            </a>
          </div>
        )}
        {stamp.ipfsCid && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[#5b84c4] font-medium">IPFS Report</span>
            <span className="font-mono text-zinc-600 break-all">{stamp.ipfsCid}</span>
          </div>
        )}
      </div>
      <a
        href={`https://sepolia.basescan.org/tx/${stamp.txHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium text-[#0052ff] hover:underline"
      >
        View on BaseScan →
      </a>
    </div>
  )
}

function RecordOnchainButton({ auditId, onSuccess }: { auditId: string; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/proxy/v1/audits/${auditId}/record-onchain`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(body.error ?? `Failed (HTTP ${res.status})`)
      } else {
        onSuccess()
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-zinc-200 p-5 flex flex-col gap-3">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Onchain Stamp</p>
      <p className="text-xs text-zinc-400 leading-relaxed">
        Pro audit — record verdict and ENS subname on Base Sepolia.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={() => void handleClick()}
        disabled={loading}
        className="rounded-lg bg-[#0052ff] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0040cc] transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-start"
      >
        {loading ? 'Recording…' : 'Record Onchain + Register ENS'}
      </button>
    </div>
  )
}
