import { Hono } from 'hono'
import { startAuditPipeline } from '../../services/audit-pipeline.js'
import { Audit } from '../../db/models/audit.js'
import { runStaticAnalysis } from '../../services/static-analyzer.js'
import {
  verifyWorldIDProof,
  checkFreeQuota,
  WorldIDVerificationError,
  type WorldIDProofInput,
} from '../../services/world-id.js'
import {
  buildFreeOverflowRequirements,
  verifyX402Payment,
} from '../../middleware/x402.js'

const submit = new Hono()

// POST /v1/submit — submit a skill for audit
//
// World ID 4.0 proof is required in production (WORLD_RP_ID set).
// When WORLD_RP_ID is absent the service runs in dev bypass mode:
// a synthetic dev_ nullifier is accepted so the pipeline can run
// without a World App during development.
//
// Required body fields (production):
//   skillContent            string   Raw SKILL.md content
//   proof                   string   World ID ZK proof
//   merkle_root             string   World ID merkle root
//   nullifier_hash          string   World ID nullifier (unique per human per action)
//   verification_level      string   "orb" | "device"
//   signal                  string   optional — signed challenge from GET /v1/world-id/challenge
//
// Optional body fields:
//   skillName               string   Human-readable name (fallback to frontmatter)
//   tier                    string   "free" | "pro" (defaults to "free")
//   userId                  string   Privy userId (forwarded from frontend proxy)
//
// Returns 202 with { auditId } on success. Caller polls GET /v1/audits/:auditId.

submit.post('/', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  // ── Validate skill content ─────────────────────────────────────────────────
  const skillContent = typeof body.skillContent === 'string' ? body.skillContent.trim() : ''
  if (!skillContent) {
    return c.json({ error: 'skillContent is required' }, 400)
  }
  if (skillContent.length > 500_000) {
    return c.json({ error: 'skillContent exceeds 500KB limit' }, 413)
  }

  const tier = body.tier === 'pro' ? 'pro' : 'free'

  // ── Structural preview (sync, no LLM — used for hash + skill name) ────────
  const staticPreview = runStaticAnalysis(skillContent)
  const skillName = (
    typeof body.skillName === 'string' && body.skillName.trim()
      ? body.skillName.trim()
      : staticPreview.frontmatter.name ?? 'Untitled Skill'
  )

  // ── World ID 4.0 verification ─────────────────────────────────────────────
  // Extract proof fields from body. In dev bypass mode (WORLD_RP_ID absent),
  // verifyWorldIDProof accepts whatever nullifier is provided.
  const proofInput: WorldIDProofInput = {
    proof:              String(body.proof ?? ''),
    merkle_root:        String(body.merkle_root ?? ''),
    nullifier_hash:     String(body.nullifier_hash ?? `dev_${staticPreview.hash.slice(2, 18)}`),
    verification_level: body.verification_level === 'orb' ? 'orb' : 'device',
    signal:             typeof body.signal === 'string' ? body.signal : undefined,
  }

  let verificationResult
  try {
    verificationResult = await verifyWorldIDProof(proofInput)
  } catch (err) {
    if (err instanceof WorldIDVerificationError) {
      return c.json({
        error:   'World ID verification failed',
        details: err.message,
        code:    err.code,
      }, 403)
    }
    console.error('[submit] World ID API error:', err)
    return c.json({ error: 'World ID verification temporarily unavailable' }, 503)
  }

  const { nullifier_hash, verification_level } = verificationResult

  // ── Free tier quota enforcement ───────────────────────────────────────────
  // Pro tier: payment gate handled upstream by proPaymentGate middleware.
  // Free tier: 3 audits per 30-day rolling window per verified human.
  //   - Within quota → proceeds free.
  //   - Quota exhausted, no X-Payment → returns 402 with $0.10 requirements.
  //   - Quota exhausted, X-Payment present → verifies and proceeds.
  // Dev nullifiers skip enforcement entirely.
  if (tier === 'free' && !verificationResult.isDev) {
    const quota = await checkFreeQuota(nullifier_hash)
    if (quota.exhausted) {
      const resourceUrl = c.req.url.split('?')[0]
      const requirements = buildFreeOverflowRequirements(resourceUrl)
      const paymentHeader = c.req.header('X-Payment')

      if (!paymentHeader) {
        // No payment — tell the client what is required
        return c.json(
          {
            ...requirements,
            quota: { used: quota.used, total: quota.total, resetAt: quota.resetAt },
          },
          402,
        )
      }

      // Payment header present — verify it
      const verification = await verifyX402Payment(paymentHeader, requirements)
      if (!verification.isValid) {
        return c.json(
          {
            error:  'Payment verification failed',
            detail: verification.error ?? 'Invalid payment receipt',
          },
          402,
        )
      }
      // Verified — proceed as a paid free-tier submission
    }
  }

  // ── Deduplicate in-flight audits on the same content hash ─────────────────
  const existing = await Audit.findOne({
    skillHash: staticPreview.hash,
    status:    { $in: ['pending', 'running'] },
  }).lean()

  if (existing) {
    return c.json(
      {
        auditId: (existing as { auditId: string }).auditId,
        message: 'Audit already in progress for this skill content',
      },
      202,
    )
  }

  // ── User identity ──────────────────────────────────────────────────────────
  const userId = typeof body.userId === 'string' && body.userId
    ? body.userId
    : 'anonymous'

  // ── Start the pipeline ─────────────────────────────────────────────────────
  const auditId = await startAuditPipeline({
    skillContent,
    skillName,
    submittedBy: {
      userId,
      worldIdNullifier:         nullifier_hash,
      worldIdVerificationLevel: verification_level,
    },
    tier,
  })

  return c.json({ auditId, skillHash: staticPreview.hash }, 202)
})

export default submit
