import { Hono } from 'hono'
import { Audit } from '../../db/models/audit.js'

const audits = new Hono()

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
    onchain:             doc.onchain,
  })
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
