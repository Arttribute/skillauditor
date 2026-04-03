import { randomUUID } from 'crypto'
import { runStaticAnalysis } from './static-analyzer.js'
import { runSandboxAnalysis } from './sandbox-runner.js'
import { runSemanticJudge } from './semantic-judge.js'
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
// Returns auditId immediately. Pipeline runs async — caller polls /v1/audits/:auditId.

export async function startAuditPipeline(input: SubmissionInput): Promise<string> {
  const auditId = randomUUID()

  // Create audit record synchronously so the route can return 202 right away
  await Audit.create({
    auditId,
    skillHash:  'pending',  // updated after static analysis
    skillName:  input.skillName,
    submittedBy: {
      userId:                   input.submittedBy.userId,
      worldIdNullifier:         input.submittedBy.worldIdNullifier,
      worldIdVerificationLevel: input.submittedBy.worldIdVerificationLevel,
      submittedAt:              new Date(),
    },
    status: 'pending',
    tier:   input.tier,
  })

  // Fire off the pipeline without awaiting — caller polls for status
  runPipeline(auditId, input).catch(async (err: Error) => {
    console.error(`[audit-pipeline] auditId=${auditId} failed:`, err.message)
    await Audit.updateOne({ auditId }, { $set: { status: 'failed' } })
  })

  return auditId
}

// ── Full three-agent pipeline ──────────────────────────────────────────────────

async function runPipeline(auditId: string, input: SubmissionInput): Promise<void> {
  await Audit.updateOne({ auditId }, { $set: { status: 'running' } })

  // ── Stage 1: Static Analysis ─────────────────────────────────────────────────
  console.log(`[audit-pipeline] ${auditId} — Stage 1: static analysis`)
  const staticReport = runStaticAnalysis(input.skillContent)

  await Audit.updateOne(
    { auditId },
    {
      $set: {
        skillHash:               staticReport.hash,
        'pipeline.staticAnalysis': staticReport,
      },
    },
  )

  // Upsert the Skill record (one record per content hash — de-duped)
  await Skill.updateOne(
    { hash: staticReport.hash },
    {
      $setOnInsert: {
        hash:           staticReport.hash,
        name:           staticReport.frontmatter.name ?? input.skillName,
        description:    staticReport.frontmatter.description ?? '',
        version:        staticReport.frontmatter.version ?? '0.0.0',
        firstAuditedAt: new Date(),
        auditCount:     0,  // $inc below will bring it to 1
      },
      $set: {
        lastAuditedAt: new Date(),
        latestAuditId: auditId,
      },
      $inc: { auditCount: 1 },
    },
    { upsert: true },
  )

  // ── Stage 2: Sandbox Execution ───────────────────────────────────────────────
  console.log(`[audit-pipeline] ${auditId} — Stage 2: sandbox execution (3 runs)`)
  const sandboxReport = await runSandboxAnalysis(input.skillContent, staticReport)

  await Audit.updateOne(
    { auditId },
    { $set: { 'pipeline.sandboxRuns': sandboxReport } },
  )

  // ── Stage 3: Semantic Judge ───────────────────────────────────────────────────
  // Judge receives ONLY the static and sandbox reports — never raw skill content.
  console.log(`[audit-pipeline] ${auditId} — Stage 3: semantic judge`)
  const verdict = await runSemanticJudge(staticReport, sandboxReport)

  // ── Assemble full report ──────────────────────────────────────────────────────
  const report: AuditReport = {
    version:                  '1.0.0',
    skillHash:                staticReport.hash,
    skillName:                staticReport.frontmatter.name ?? input.skillName,
    auditedAt:                new Date().toISOString(),
    auditorAgent:             'skillauditor-api/v1',
    worldIdVerificationLevel: input.submittedBy.worldIdVerificationLevel,
    verdict:                  verdict.verdict,
    overallScore:             verdict.overallScore,
    dimensions:               verdict.dimensions,
    findings:                 verdict.findings,
    staticAnalysis:           staticReport,
    behavioralAnalysis:       sandboxReport,
    recommendation:           verdict.recommendation,
  }

  // ── Persist completed state ───────────────────────────────────────────────────
  await Promise.all([
    Audit.updateOne(
      { auditId },
      {
        $set: {
          status:                   'completed',
          'pipeline.semanticJudge': verdict,
          'result.verdict':         verdict.verdict,
          'result.score':           verdict.overallScore,
          findings:                 verdict.findings,
          completedAt:              new Date(),
        },
      },
    ),
    Skill.updateOne(
      { hash: staticReport.hash },
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
}
