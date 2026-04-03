import { Hono } from 'hono'
import { Skill } from '../../db/models/skill.js'
import { Audit } from '../../db/models/audit.js'

const skills = new Hono()

// GET /v1/skills — browse audited skills (paginated)
// Query params: page (default 1), limit (default 20, max 100), verdict
skills.get('/', async (c) => {
  const page  = Math.max(1, Number(c.req.query('page')  ?? 1))
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 20)))
  const verdict = c.req.query('verdict')

  const filter: Record<string, unknown> = {}
  if (verdict && ['safe', 'review_required', 'unsafe'].includes(verdict)) {
    filter.latestVerdict = verdict
  }

  const [docs, total] = await Promise.all([
    Skill.find(filter)
      .sort({ lastAuditedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Skill.countDocuments(filter),
  ])

  return c.json({
    data:  docs,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  })
})

// GET /v1/skills/:hash — get skill by content hash with latest audit summary
skills.get('/:hash', async (c) => {
  const { hash } = c.req.param()

  const skill = await Skill.findOne({ hash }).lean()
  if (!skill) {
    return c.json({ error: 'Skill not found' }, 404)
  }

  const skillDoc = skill as Record<string, unknown>

  // Fetch latest completed audit for this skill
  const latestAudit = await Audit.findOne(
    { skillHash: hash, status: 'completed' },
    {
      auditId: 1,
      'result.verdict': 1,
      'result.score': 1,
      findings: 1,
      'pipeline.semanticJudge': 1,
      completedAt: 1,
    },
  )
    .sort({ completedAt: -1 })
    .lean()

  const auditDoc = latestAudit as Record<string, unknown> | null
  const pipeline = auditDoc?.pipeline as Record<string, unknown> | undefined
  const result   = auditDoc?.result   as Record<string, unknown> | undefined

  return c.json({
    ...skillDoc,
    latestAudit: auditDoc
      ? {
          auditId:        auditDoc.auditId,
          verdict:        result?.verdict,
          score:          result?.score,
          findings:       auditDoc.findings,
          recommendation: pipeline?.semanticJudge
            ? (pipeline.semanticJudge as Record<string, unknown>).recommendation
            : undefined,
          completedAt: auditDoc.completedAt,
        }
      : null,
  })
})

export default skills
