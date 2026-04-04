import { Hono } from 'hono'
import { startAuditPipeline }   from '../../services/audit-pipeline.js'
import { Audit }                 from '../../db/models/audit.js'
import { runStaticAnalysis }     from '../../services/static-analyzer.js'
import { checkNullifierRateLimit } from '../../services/world-id.js'
import type { WorldAgentkitContext } from '../../middleware/world-agentkit.js'

// POST /v1/agent/submit
//
// Submission endpoint for third-party agents carrying a World AgentKit credential.
// Auth is handled upstream by worldAgentkitMiddleware (see index.ts) — by the time
// this handler runs, the agent's wallet signature has been verified and the human
// identity resolved from AgentBook.
//
// The agentHumanId (resolved from AgentBook) plays the same role as a World ID
// nullifier from a browser submission: it is the stable, unique-per-human key used
// for rate limiting and is stored in submittedBy.worldIdNullifier so all downstream
// systems (onchain stamps, usage stats, ledger gate) treat agent submissions
// identically to human browser submissions.
//
// Pro tier payments follow the same x402 flow — the proPaymentGate middleware is
// applied before this route in index.ts, so agents must include X-Payment with a
// $9 USDC receipt on Base, exactly as browser users do.
//
// Required body fields:
//   skillContent   string   Raw SKILL.md content
//
// Optional body fields:
//   skillName      string   Human-readable name (fallback to frontmatter)
//   tier           string   "free" | "pro" (defaults to "free")
//
// Returns 202 with { auditId, skillHash }. Caller polls GET /v1/audits/:auditId.

const agentSubmit = new Hono<WorldAgentkitContext>()

agentSubmit.post('/', async (c) => {
  // Identity resolved by worldAgentkitMiddleware
  const agentHumanId       = c.get('agentHumanId')
  const agentWalletAddress = c.get('agentWalletAddress')

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

  // ── Structural preview (sync, no LLM) ─────────────────────────────────────
  const staticPreview = runStaticAnalysis(skillContent)
  const skillName = (
    typeof body.skillName === 'string' && body.skillName.trim()
      ? body.skillName.trim()
      : staticPreview.frontmatter.name ?? 'Untitled Skill'
  )

  // ── Rate limiting — keyed by human identifier ──────────────────────────────
  // agentHumanId is the anonymous stable ID from AgentBook, equivalent to a
  // World ID nullifier. The same human cannot exceed the tier quota regardless
  // of how many agent wallets they register.
  const rateCheck = await checkNullifierRateLimit(agentHumanId, tier)
  if (!rateCheck.allowed) {
    return c.json(
      {
        error:     `Rate limit exceeded — ${tier} tier allows ${tier === 'pro' ? 1 : 5} audit(s) per 24 hours per verified human`,
        remaining: 0,
        resetAt:   rateCheck.resetAt,
      },
      429,
    )
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

  // ── Start the pipeline ─────────────────────────────────────────────────────
  // agentHumanId → worldIdNullifier so onchain stamps, usage queries, and the
  // Ledger approval gate all treat this identically to a browser submission.
  // verification_level is 'orb' — AgentBook registration requires orb-level World ID.
  const auditId = await startAuditPipeline({
    skillContent,
    skillName,
    submittedBy: {
      userId:                   agentWalletAddress,  // wallet address as userId
      worldIdNullifier:         agentHumanId,
      worldIdVerificationLevel: 'orb',               // AgentBook mandates orb verification
    },
    tier,
  })

  console.log(
    `[agent-submit] started auditId=${auditId}` +
    ` wallet=${agentWalletAddress.slice(0, 10)}…` +
    ` humanId=${agentHumanId.slice(0, 16)}…` +
    ` tier=${tier}`,
  )

  return c.json({ auditId, skillHash: staticPreview.hash }, 202)
})

export default agentSubmit
