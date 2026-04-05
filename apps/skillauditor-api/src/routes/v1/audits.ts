import { Hono } from 'hono'
import { Audit } from '../../db/models/audit.js'
import { checkFreeQuota } from '../../services/world-id.js'
import { triggerOnchainRecord } from '../../services/audit-pipeline.js'

const audits = new Hono()

// GET /v1/audits/quota?nullifier_hash=xxx
//
// Returns the free tier monthly quota status for a verified human.
// Used by the frontend to show remaining free audits after World ID verification.
// Does NOT verify the proof — callers must have already verified the nullifier
// with World ID. Dev nullifiers (dev_ prefix) always return full quota.
audits.get('/quota', async (c) => {
  const nullifier = c.req.query('nullifier_hash')
  if (!nullifier) {
    return c.json({ error: 'nullifier_hash query parameter is required' }, 400)
  }

  // Dev nullifiers always get full quota (no DB lookup needed)
  if (nullifier.startsWith('dev_')) {
    return c.json({
      used:             0,
      total:            3,
      remaining:        3,
      resetAt:          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      exhausted:        false,
      micropayment:     { required: false, amountUsd: '0.10' },
    })
  }

  const quota = await checkFreeQuota(nullifier)

  return c.json({
    used:         quota.used,
    total:        quota.total,
    remaining:    quota.remaining,
    resetAt:      quota.resetAt.toISOString(),
    exhausted:    quota.exhausted,
    micropayment: { required: quota.exhausted, amountUsd: '0.10' },
  })
})

// GET /v1/audits/:auditId — poll for audit status and result
audits.get('/:auditId', async (c) => {
  const { auditId } = c.req.param()

  const audit = await Audit.findOne({ auditId }).lean()
  if (!audit) {
    return c.json({ error: 'Audit not found' }, 404)
  }

  const doc = audit as Record<string, unknown>

  // Always return status + meta
  const base = {
    auditId:   doc.auditId,
    skillHash: doc.skillHash,
    skillName: doc.skillName,
    status:    doc.status,
    tier:      doc.tier,
    createdAt: doc.createdAt,
  }

  // Pending / running — return status only
  if (doc.status === 'pending' || doc.status === 'running') {
    return c.json(base)
  }

  // Failed
  if (doc.status === 'failed') {
    return c.json({ ...base, error: 'Audit pipeline failed. Please resubmit.' })
  }

  // Completed — return full result
  const result = doc.result as Record<string, unknown> | undefined
  const pipeline = doc.pipeline as Record<string, unknown> | undefined
  const onchain = doc.onchain as Record<string, unknown> | undefined

  // Map onchain fields to the `stamp` shape expected by the frontend
  const stamp = onchain?.txHash
    ? {
        txHash:          onchain.txHash,
        chainId:         onchain.chainId,
        contractAddress: onchain.contractAddress,
        ensSubname:      onchain.ensSubname ?? null,
        ipfsCid:         result?.reportCid ?? null,
      }
    : null

  return c.json({
    ...base,
    completedAt: doc.completedAt,
    result: {
      verdict: result?.verdict,
      score:   result?.score,
    },
    findings: doc.findings,
    dimensions:          pipeline?.verdict
      ? (pipeline.verdict as Record<string, unknown>).dimensions
      : undefined,
    recommendation:      pipeline?.verdict
      ? (pipeline.verdict as Record<string, unknown>).recommendation
      : undefined,
    structuralAnalysis:  pipeline?.structuralAnalysis,
    contentAnalysis:     pipeline?.contentAnalysis,
    behavioralAnalysis:  pipeline?.sandboxRuns,
    stamp,
  })
})

// POST /v1/audits/:auditId/record-onchain — manually trigger onchain stamp + ENS registration.
// Used as a retry when automatic recording (which runs after pipeline completion) failed.
// Only valid for completed Pro-tier audits that do not already have a stamp.
audits.post('/:auditId/record-onchain', async (c) => {
  const { auditId } = c.req.param()

  // Pre-flight guard — validate before dispatching async work
  const existing = await Audit.findOne({ auditId }, { status: 1, tier: 1, onchain: 1 }).lean()
  if (!existing) return c.json({ error: 'Audit not found' }, 404)

  const doc = existing as Record<string, unknown>
  if (doc.status !== 'completed') return c.json({ error: 'Audit is not completed' }, 409)
  if (doc.tier !== 'pro') return c.json({ error: 'Onchain recording is only available for Pro tier' }, 403)

  const onchain = doc.onchain as Record<string, unknown> | undefined
  if (onchain?.txHash) return c.json({ error: 'Audit already has an onchain stamp' }, 409)

  // Dispatch async — caller polls GET /:auditId until stamp appears
  triggerOnchainRecord(auditId).catch((err: Error) => {
    console.error(`[audits] manual record-onchain failed for ${auditId}:`, err.message)
  })

  return c.json({ message: 'Onchain recording started — poll the audit until stamp appears' }, 202)
})

// GET /v1/audits/:auditId/logs — stream pipeline logs for the running or completed audit.
// Optional ?since=<unix_ms> to return only entries newer than that timestamp (for
// incremental polling while the audit is in flight).
audits.get('/:auditId/logs', async (c) => {
  const { auditId } = c.req.param()
  const since = Number(c.req.query('since') ?? 0)

  const audit = await Audit.findOne({ auditId }, { logs: 1, status: 1 }).lean()
  if (!audit) {
    return c.json({ error: 'Audit not found' }, 404)
  }

  const doc = audit as Record<string, unknown>
  const allLogs = (doc.logs ?? []) as Array<{ ts: number; stage: string; level: string; message: string }>
  const logs = since > 0 ? allLogs.filter(l => l.ts > since) : allLogs

  return c.json({ logs, total: allLogs.length, status: doc.status })
})

export default audits
