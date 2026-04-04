import { randomUUID } from 'crypto'
import { runStaticAnalysis }  from './static-analyzer.js'
import { runContentAnalysis } from './content-analyst.js'
import { runSandboxAnalysis, type SandboxToolEvent } from './sandbox-runner.js'
import { runVerdictAgent }    from './verdict-agent.js'
import { onchainRegistry }    from './onchain-registry.js'
import { uploadAuditReport }  from './ipfs.js'
import { Audit } from '../db/models/audit.js'
import { Skill } from '../db/models/skill.js'
import type { AuditReport } from '@skillauditor/skill-types'

export interface SubmissionInput {
  skillContent: string
  skillName:    string
  submittedBy: {
    userId:                   string
    worldIdNullifier:         string
    worldIdVerificationLevel: 'orb' | 'device'
  }
  tier: 'free' | 'pro'
}

// ── Pipeline logger ────────────────────────────────────────────────────────────
// Buffers log entries in memory during pipeline execution and flushes them to
// MongoDB incrementally so the UI can stream progress while the audit is running.

type LogLevel = 'info' | 'warn' | 'error'

interface LogEntry {
  ts:      number
  stage:   string
  level:   LogLevel
  message: string
}

class PipelineLogger {
  private buffer: LogEntry[] = []

  constructor(private auditId: string) {}

  info(stage: string, message: string)  { this.emit('info',  stage, message) }
  warn(stage: string, message: string)  { this.emit('warn',  stage, message) }
  error(stage: string, message: string) { this.emit('error', stage, message) }

  private emit(level: LogLevel, stage: string, message: string) {
    const entry: LogEntry = { ts: Date.now(), stage, level, message }
    this.buffer.push(entry)
    console.log(`[audit-pipeline] [${this.auditId}] [${stage}] ${level.toUpperCase()}: ${message}`)
  }

  async flush(): Promise<void> {
    if (!this.buffer.length) return
    const toFlush = this.buffer.splice(0)
    await Audit.updateOne(
      { auditId: this.auditId },
      { $push: { logs: { $each: toFlush } } },
    )
  }
}

// ── Pipeline entry point ───────────────────────────────────────────────────────
// Returns auditId immediately — pipeline runs async. Caller polls /v1/audits/:auditId.

export async function startAuditPipeline(input: SubmissionInput): Promise<string> {
  const auditId = randomUUID()

  await Audit.create({
    auditId,
    skillHash:   'pending',
    skillName:   input.skillName,
    submittedBy: {
      userId:                   input.submittedBy.userId,
      worldIdNullifier:         input.submittedBy.worldIdNullifier,
      worldIdVerificationLevel: input.submittedBy.worldIdVerificationLevel,
      submittedAt:              new Date(),
    },
    status: 'pending',
    tier:   input.tier,
  })

  runPipeline(auditId, input).catch(async (err: Error) => {
    console.error(`[audit-pipeline] ${auditId} failed:`, err.message)
    await Audit.updateOne({ auditId }, { $set: { status: 'failed' } })
  })

  return auditId
}

// ── Four-stage pipeline ────────────────────────────────────────────────────────
//
//  Stage 1: Structural Extraction  (sync, no LLM)
//                    │
//         ┌──────────┴──────────┐
//  Stage 2: Content Analyst   Stage 3: Sandbox Runner   (parallel, both LLM)
//         └──────────┬──────────┘
//                    │
//  Stage 4: Verdict Agent  (LLM, never sees raw skill)

async function runPipeline(auditId: string, input: SubmissionInput): Promise<void> {
  const log = new PipelineLogger(auditId)
  await Audit.updateOne({ auditId }, { $set: { status: 'running' } })

  // ── Stage 1: Structural Extraction ───────────────────────────────────────────
  log.info('structural', `Starting structural extraction — ${input.skillContent.length} bytes`)
  const t1 = Date.now()
  const structuralReport = runStaticAnalysis(input.skillContent)

  log.info('structural', `Content hash: ${structuralReport.hash}`)
  log.info('structural', `Lines: ${structuralReport.lineCount} · External URLs: ${structuralReport.externalUrls.length} · Contains scripts: ${structuralReport.containsScripts}`)
  if (structuralReport.frontmatter.name) {
    log.info('structural', `Frontmatter — name: "${structuralReport.frontmatter.name}" version: ${structuralReport.frontmatter.version ?? 'unset'}`)
  }
  if (structuralReport.declaredCapabilities.length > 0) {
    log.info('structural', `Declared capabilities: ${structuralReport.declaredCapabilities.join(', ')}`)
  }
  if (structuralReport.externalUrls.length > 0) {
    for (const url of structuralReport.externalUrls) {
      log.warn('structural', `External URL detected: ${url}`)
    }
  }
  log.info('structural', `Stage 1 complete (${Date.now() - t1}ms)`)

  await Audit.updateOne(
    { auditId },
    { $set: { skillHash: structuralReport.hash, 'pipeline.structuralAnalysis': structuralReport } },
  )

  // Upsert the Skill record (de-duped by content hash)
  await Skill.updateOne(
    { hash: structuralReport.hash },
    {
      $setOnInsert: {
        hash:           structuralReport.hash,
        name:           structuralReport.frontmatter.name ?? input.skillName,
        description:    structuralReport.frontmatter.description ?? '',
        version:        structuralReport.frontmatter.version ?? '0.0.0',
        firstAuditedAt: new Date(),
      },
      $set: {
        lastAuditedAt: new Date(),
        latestAuditId: auditId,
      },
      $inc: { auditCount: 1 },
    },
    { upsert: true },
  )

  await log.flush()

  // ── Stages 2 + 3: Content Analysis and Sandbox — run in parallel ─────────────
  log.info('content',  'Starting content analysis — examining skill instructions for injection and deception patterns')
  log.info('sandbox',  'Starting sandbox simulation — executing skill with mock tools in isolated environment')
  log.info('sandbox',  'Sandbox environment: 16 mock tools, honeypot credentials, synthetic filesystem')
  await log.flush()

  // Live callback — fires for every tool call the sandboxed agent makes.
  // Logs immediately and flushes so the UI can stream progress in real time.
  const onToolCall = async (event: SandboxToolEvent) => {
    const taskTag = `[run ${event.taskIndex + 1}/3 · ${event.taskDescription}]`
    const flags: string[] = []
    if (event.isNetworkAttempt) flags.push('NETWORK')
    if (event.isScopeViolation) flags.push('SCOPE VIOLATION')

    const flagStr = flags.length > 0 ? `  ⚠ ${flags.join(' · ')}` : ''
    const methodStr = event.method ? ` (${event.method})` : ''
    const level = event.isScopeViolation ? 'warn' : 'info'

    log[level]('sandbox', `${taskTag} → ${event.toolName}${methodStr}: ${event.target}${flagStr}`)

    // Show a snippet of what the mock environment returned (helps spot exfil of real secrets)
    if (event.resultSnippet) {
      log.info('sandbox', `  ← ${event.resultSnippet}`)
    }

    await log.flush()
  }

  const t2 = Date.now()
  const [contentReport, sandboxReport] = await Promise.all([
    runContentAnalysis(input.skillContent, structuralReport),
    runSandboxAnalysis(input.skillContent, structuralReport, onToolCall),
  ])

  // Log content analysis results
  const contentFindings = (contentReport as { findings?: unknown[] }).findings ?? []
  log.info('content', `Content analysis complete (${Date.now() - t2}ms) — ${contentFindings.length} finding(s)`)
  if ((contentReport as { deceptionRisk?: number }).deceptionRisk !== undefined) {
    const risk = (contentReport as { deceptionRisk: number }).deceptionRisk
    if (risk > 50) {
      log.warn('content', `Elevated deception risk score: ${risk}/100`)
    }
  }

  // Log sandbox results
  const runs = (sandboxReport as { runs?: unknown[] }).runs ?? []
  const exfilAttempts = (sandboxReport as { exfiltrationAttempts?: number }).exfiltrationAttempts ?? 0
  const scopeViolations = (sandboxReport as { scopeViolations?: number }).scopeViolations ?? 0
  const consistency = (sandboxReport as { consistencyScore?: number }).consistencyScore ?? 100

  log.info('sandbox', `Sandbox simulation complete — ${runs.length} run(s)`)

  // Count total tool calls across all runs
  const totalToolCalls = runs.reduce((sum: number, r) => {
    const run = r as { toolCallLog?: unknown[] }
    return sum + (run.toolCallLog?.length ?? 0)
  }, 0)
  log.info('sandbox', `Tool calls observed: ${totalToolCalls}`)

  if (exfilAttempts > 0) {
    log.warn('sandbox', `Exfiltration attempts detected: ${exfilAttempts}`)
  } else {
    log.info('sandbox', 'No exfiltration attempts detected')
  }
  if (scopeViolations > 0) {
    log.warn('sandbox', `Scope violations: ${scopeViolations}`)
  } else {
    log.info('sandbox', 'No scope violations detected')
  }
  log.info('sandbox', `Behavioral consistency score: ${consistency}/100`)

  await Audit.updateOne(
    { auditId },
    {
      $set: {
        'pipeline.contentAnalysis': contentReport,
        'pipeline.sandboxRuns':     sandboxReport,
      },
    },
  )

  await log.flush()

  // ── Stage 4: Verdict Agent ────────────────────────────────────────────────────
  log.info('verdict', 'Starting verdict synthesis — aggregating structural, content, and behavioral reports')
  log.info('verdict', 'Verdict agent operates on reports only — never sees raw skill content')
  await log.flush()

  const t4 = Date.now()
  const verdict = await runVerdictAgent(structuralReport, contentReport, sandboxReport)

  log.info('verdict', `Verdict: ${verdict.verdict.toUpperCase()} · Score: ${verdict.overallScore}/100 (${Date.now() - t4}ms)`)
  if (verdict.findings?.length > 0) {
    log.info('verdict', `${verdict.findings.length} finding(s) consolidated into final report`)
    const critical = verdict.findings.filter((f: { severity: string }) => f.severity === 'critical').length
    const high = verdict.findings.filter((f: { severity: string }) => f.severity === 'high').length
    if (critical > 0) log.warn('verdict', `${critical} critical finding(s)`)
    if (high > 0)     log.warn('verdict', `${high} high-severity finding(s)`)
  }
  if (verdict.recommendation) {
    log.info('verdict', `Recommendation: ${verdict.recommendation}`)
  }

  // ── Assemble full report ──────────────────────────────────────────────────────
  const report: AuditReport = {
    version:                  '1.0.0',
    skillHash:                structuralReport.hash,
    skillName:                structuralReport.frontmatter.name ?? input.skillName,
    auditedAt:                new Date().toISOString(),
    auditorAgent:             'skillauditor-api/v1',
    worldIdVerificationLevel: input.submittedBy.worldIdVerificationLevel,
    verdict:                  verdict.verdict,
    overallScore:             verdict.overallScore,
    dimensions:               verdict.dimensions,
    findings:                 verdict.findings,
    structuralAnalysis:       structuralReport,
    contentAnalysis:          contentReport,
    behavioralAnalysis:       sandboxReport,
    recommendation:           verdict.recommendation,
  }

  log.info('pipeline', 'Audit complete — uploading report to IPFS')
  await log.flush()

  // ── IPFS upload (non-blocking on failure) ─────────────────────────────────────
  let reportCid: string | null = null
  try {
    const ipfsResult = await uploadAuditReport(report)
    if (ipfsResult) {
      reportCid = ipfsResult.cid
      log.info('pipeline', `Report pinned to IPFS — CID: ${reportCid}`)
    } else {
      log.warn('pipeline', 'IPFS upload skipped (PINATA_JWT not configured)')
    }
  } catch (err) {
    log.warn('pipeline', `IPFS upload failed (non-fatal): ${(err as Error).message}`)
  }

  // Attach CID to report for onchain stamp
  report.reportCid = reportCid ?? undefined

  log.info('pipeline', 'Persisting final results')

  // ── Persist completed state ───────────────────────────────────────────────────
  await Promise.all([
    Audit.updateOne(
      { auditId },
      {
        $set: {
          status:                'completed',
          'pipeline.verdict':    verdict,
          'result.verdict':      verdict.verdict,
          'result.score':        verdict.overallScore,
          'result.reportCid':    reportCid,
          findings:              verdict.findings,
          completedAt:           new Date(),
        },
      },
    ),
    Skill.updateOne(
      { hash: structuralReport.hash },
      {
        $set: {
          latestAuditId: auditId,
          latestVerdict: verdict.verdict,
          latestScore:   verdict.overallScore,
        },
      },
    ),
  ])

  await log.flush()

  // ── Onchain stamp ─────────────────────────────────────────────────────────────
  recordOnchain(auditId, report, log).catch(err => {
    console.error(`[audit-pipeline] ${auditId} — onchain stamp failed (non-fatal):`, err.message)
  })
}

async function recordOnchain(auditId: string, report: AuditReport, log: PipelineLogger): Promise<void> {
  log.info('onchain', 'Recording audit stamp on Base…')
  await log.flush()

  try {
    const { txHash } = await onchainRegistry.recordStamp({
      skillHash:  report.skillHash,
      verdict:    report.verdict,
      score:      report.overallScore,
      reportCid:  report.reportCid ?? '',
      ensSubname: '',
      nullifier:  '',
    })

    await Audit.updateOne(
      { auditId },
      {
        $set: {
          'onchain.txHash':          txHash,
          'onchain.chainId':         Number(process.env.SKILL_REGISTRY_CHAIN_ID ?? '84532'),
          'onchain.contractAddress': process.env.SKILL_REGISTRY_ADDRESS ?? '',
          'onchain.stampedAt':       new Date(),
        },
      },
    )

    log.info('onchain', `Onchain stamp confirmed — txHash: ${txHash}`)
    await log.flush()
  } catch (err) {
    throw err
  }
}
