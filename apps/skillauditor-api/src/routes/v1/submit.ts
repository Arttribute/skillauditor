import { Hono } from 'hono'
import { startAuditPipeline } from '../../services/audit-pipeline.js'
import { Audit } from '../../db/models/audit.js'
import { runStaticAnalysis } from '../../services/static-analyzer.js'

const submit = new Hono()

// POST /v1/submit — submit a skill for audit
//
// Body:
//   skillContent            string   required  Raw SKILL.md content
//   skillName               string   optional  Human-readable name (fallback to frontmatter)
//   tier                    string   optional  "free" | "pro"  (defaults to "free")
//
// World ID proof is required for rate limiting — for now we accept a placeholder
// nullifier so the pipeline can run without a World App during dev.
//
// Returns 202 with { auditId } on success. Caller polls GET /v1/audits/:auditId.

submit.post('/', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const skillContent = typeof body.skillContent === 'string' ? body.skillContent.trim() : ''
  if (!skillContent) {
    return c.json({ error: 'skillContent is required' }, 400)
  }
  if (skillContent.length > 500_000) {
    return c.json({ error: 'skillContent exceeds 500KB limit' }, 413)
  }

  const tier = body.tier === 'pro' ? 'pro' : 'free'

  // Derive skillName from frontmatter or fallback to body param
  const staticPreview = runStaticAnalysis(skillContent)
  const skillName = (
    typeof body.skillName === 'string' && body.skillName.trim()
      ? body.skillName.trim()
      : staticPreview.frontmatter.name ?? 'Untitled Skill'
  )

  // Check for duplicate in-flight audits on the same content hash
  const existing = await Audit.findOne({
    skillHash: staticPreview.hash,
    status:    { $in: ['pending', 'running'] },
  }).lean()

  if (existing) {
    return c.json(
      { auditId: (existing as { auditId: string }).auditId, message: 'Audit already in progress for this skill content' },
      202,
    )
  }

  // World ID fields — dev mode accepts a placeholder nullifier
  // In production, the caller provides a verified proof and we call verifyWorldIDProof()
  const worldIdNullifier = (
    typeof body.worldIdNullifier === 'string' && body.worldIdNullifier
      ? body.worldIdNullifier
      : `dev_${staticPreview.hash.slice(2, 18)}`
  )
  const worldIdVerificationLevel: 'orb' | 'device' =
    body.worldIdVerificationLevel === 'orb' ? 'orb' : 'device'

  // User identity — from Privy session or body param in dev mode
  const userId = typeof body.userId === 'string' && body.userId
    ? body.userId
    : 'anonymous'

  const auditId = await startAuditPipeline({
    skillContent,
    skillName,
    submittedBy: {
      userId,
      worldIdNullifier,
      worldIdVerificationLevel,
    },
    tier,
  })

  return c.json({ auditId, skillHash: staticPreview.hash }, 202)
})

export default submit
