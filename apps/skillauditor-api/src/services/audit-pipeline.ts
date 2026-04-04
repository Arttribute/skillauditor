import { randomUUID } from 'crypto'
import { runStaticAnalysis }  from './static-analyzer.js'
import { runContentAnalysis } from './content-analyst.js'
import { runSandboxAnalysis } from './sandbox-runner.js'
import { runVerdictAgent }    from './verdict-agent.js'
import { onchainRegistry }    from './onchain-registry.js'
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
  await Audit.updateOne({ auditId }, { $set: { status: 'running' } })

  // ── Stage 1: Structural Extraction ───────────────────────────────────────────
  console.log(`[audit-pipeline] ${auditId} — stage 1: structural extraction`)
  const structuralReport = runStaticAnalysis(input.skillContent)

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

  // ── Stages 2 + 3: Content Analysis and Sandbox — run in parallel ─────────────
  // Content analyst reads raw skill. Sandbox runner executes it with mock tools.
  // Neither depends on the other — run concurrently to halve elapsed time.
  console.log(`[audit-pipeline] ${auditId} — stages 2+3: content analysis + sandbox (parallel)`)

  const [contentReport, sandboxReport] = await Promise.all([
    runContentAnalysis(input.skillContent, structuralReport),
    runSandboxAnalysis(input.skillContent, structuralReport),
  ])

  await Audit.updateOne(
    { auditId },
    {
      $set: {
        'pipeline.contentAnalysis': contentReport,
        'pipeline.sandboxRuns':     sandboxReport,
      },
    },
  )

  // ── Stage 4: Verdict Agent ────────────────────────────────────────────────────
  // Receives all three reports — NEVER the raw skill content.
  console.log(`[audit-pipeline] ${auditId} — stage 4: verdict agent`)
  const verdict = await runVerdictAgent(structuralReport, contentReport, sandboxReport)

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

  console.log(
    `[audit-pipeline] ${auditId} — complete. verdict=${verdict.verdict} score=${verdict.overallScore}`,
  )

  // ── Onchain stamp ─────────────────────────────────────────────────────────────
  // Record the audit result on Base. Runs async after the audit is marked complete
  // so the API response is never blocked. A failure here does not fail the audit —
  // the result is already persisted in MongoDB and shown in the UI.
  //
  // reportCid is '' until the IPFS module is wired (Step 2 of the modular plan).
  // The contract accepts bytes32(0) for reportCid, which we handle in the registry.
  recordOnchain(auditId, report).catch(err => {
    console.error(`[audit-pipeline] ${auditId} — onchain stamp failed (non-fatal):`, err.message)
  })
}

async function recordOnchain(auditId: string, report: AuditReport): Promise<void> {
  console.log(`[audit-pipeline] ${auditId} — recording onchain stamp…`)
  try {
    const { txHash } = await onchainRegistry.recordStamp({
      skillHash:  report.skillHash,
      verdict:    report.verdict,
      score:      report.overallScore,
      reportCid:  '',           // populated once IPFS module is live
      ensSubname: '',           // populated once ENS module is live
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
    console.log(`[audit-pipeline] ${auditId} — onchain stamp confirmed. txHash=${txHash}`)
  } catch (err) {
    // Rethrow so the caller can log it as non-fatal
    throw err
  }
}
