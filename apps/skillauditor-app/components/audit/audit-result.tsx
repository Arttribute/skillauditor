'use client'

import { useEffect, useState, useCallback } from 'react'
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
}

// ── Main component ─────────────────────────────────────────────────────────────

interface AuditResultProps {
  auditId: string
}

export function AuditResult({ auditId }: AuditResultProps) {
  const [data, setData] = useState<AuditData | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

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

  useEffect(() => {
    void poll()
  }, [poll])

  // Poll while pending/running
  useEffect(() => {
    if (!data) return
    if (data.status === 'completed' || data.status === 'failed') return

    const timer = setInterval(() => { void poll() }, 3000)
    return () => clearInterval(timer)
  }, [data, poll])

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
    return <AuditRunning auditId={auditId} status={data.status} skillName={data.skillName} />
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

      {/* Verdict + score */}
      <div className="rounded-xl border border-zinc-200 p-6 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Verdict</p>
          <VerdictBadge verdict={verdict} />
        </div>
        <div className="hidden sm:block w-px h-12 bg-zinc-100" />
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Safety Score</p>
          <p className={`text-4xl font-semibold tabular-nums ${scoreColor(score)}`}>
            {score}<span className="text-xl font-normal text-zinc-400">/100</span>
          </p>
        </div>
        {recommendation && (
          <>
            <div className="hidden sm:block w-px h-12 bg-zinc-100" />
            <div className="flex-1 flex flex-col gap-2">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Recommendation</p>
              <p className="text-sm text-zinc-700 leading-relaxed">{recommendation}</p>
            </div>
          </>
        )}
      </div>

      {/* Dimensions */}
      {dimensions && <DimensionsPanel dimensions={dimensions} />}

      {/* Findings */}
      {findings.length > 0 && <FindingsPanel findings={findings} />}
      {findings.length === 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-700">
          No security findings detected.
        </div>
      )}

      {/* Structural analysis */}
      {structuralAnalysis && <StructuralPanel structural={structuralAnalysis} />}

      {/* Behavioral summary */}
      {behavioralAnalysis && <BehavioralPanel behavioral={behavioralAnalysis} />}

      {/* Meta footer */}
      <div className="text-xs text-zinc-400 pt-2 border-t border-zinc-100 flex flex-wrap gap-x-6 gap-y-1">
        <span>Audit ID: <span className="font-mono">{auditId}</span></span>
        {data.completedAt && (
          <span>Completed: {new Date(data.completedAt).toLocaleString()}</span>
        )}
        <span>Tier: {data.tier}</span>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AuditHeader({ skillName, skillHash, auditId }: { skillName: string; skillHash: string; auditId: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold text-zinc-900">{skillName}</h1>
      <p className="text-xs font-mono text-zinc-400 break-all">{skillHash}</p>
      <p className="text-xs text-zinc-400">Audit <span className="font-mono">{auditId}</span></p>
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
    <div className="rounded-xl border border-zinc-200 p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-zinc-900">Audit Dimensions</h2>
      <div className="flex flex-col gap-3">
        {rows.map(({ label, value, inverted }) => {
          const safeValue = Math.max(0, Math.min(100, value ?? 0))
          const barColor = inverted
            ? safeValue >= 50 ? 'bg-red-400' : safeValue >= 20 ? 'bg-amber-400' : 'bg-green-400'
            : safeValue >= 80 ? 'bg-green-400' : safeValue >= 60 ? 'bg-amber-400' : 'bg-red-400'
          return (
            <div key={label} className="flex items-center gap-3">
              <span className="text-sm text-zinc-600 w-36 shrink-0">{label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-zinc-100">
                <div
                  className={`h-1.5 rounded-full ${barColor} transition-all`}
                  style={{ width: `${safeValue}%` }}
                />
              </div>
              <span className="text-sm font-mono text-zinc-700 w-8 text-right">{safeValue}</span>
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
    <div className="rounded-xl border border-zinc-200 p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Findings</h2>
        <span className="text-xs text-zinc-400">{findings.length} finding{findings.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex flex-col gap-2">
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

function AuditRunning({ auditId, status, skillName }: { auditId: string; status: AuditStatus; skillName: string }) {
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
