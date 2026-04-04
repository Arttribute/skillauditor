// SkillAuditorClient — single-call agent SDK for SkillAuditor.
//
// Hides all protocol complexity so any agent (Claude Code, custom LLM agent,
// CI pipeline) can verify a skill with one method call and zero knowledge of
// World AgentKit, x402, or polling.
//
// Usage (dev mode — no real keys needed):
//   const client = new SkillAuditorClient({ privateKey: 'dev' })
//   const result = await client.verifySkill(skillContent)
//
// Usage (prod mode):
//   const client = new SkillAuditorClient({
//     privateKey: process.env.AGENT_PRIVATE_KEY!,
//     tier: 'pro',
//     paymentHandler: (req) => getPaymentHeader(req, wallet),
//   })
//   const result = await client.verifySkill(skillContent)
//
// The wallet at privateKey must be registered in World AgentBook for prod:
//   npx @worldcoin/agentkit-cli register <wallet-address>

import { buildAgentkitHeader }                      from './agentkit.js'
import { fetchWithX402, type PaymentHandler }        from './x402.js'
import { pollUntilComplete, type VerifyResult, type ProgressEvent } from './poller.js'
import { SkillRejectedError }                        from './errors.js'

export interface SkillAuditorClientOptions {
  /**
   * Base URL of the SkillAuditor API.
   * Defaults to http://localhost:3001 for local development.
   */
  apiUrl?: string

  /**
   * EVM private key for World AgentKit SIWE signing ("0x...").
   * Pass "dev" (or omit) to use the dev bypass — no signing, no AgentBook required.
   */
  privateKey?: string

  /**
   * "free" (default) — LLM audit only, no onchain stamp, no payment required.
   * "pro"            — full audit + onchain stamp + ENS subname, requires $9 USDC payment.
   */
  tier?: 'free' | 'pro'

  /**
   * Required when tier = "pro". Receives the x402 payment requirements and
   * must return an X-Payment receipt string. See src/x402.ts for details.
   */
  paymentHandler?: PaymentHandler

  /**
   * Called for each pipeline log entry while the audit is running.
   * Useful for showing live progress in a UI or terminal.
   */
  onProgress?: (event: ProgressEvent) => void

  /**
   * How often to check audit status. Default: 3000ms.
   */
  pollIntervalMs?: number

  /**
   * Abort and throw AuditTimeoutError after this many ms. Default: 5 minutes.
   */
  timeoutMs?: number

  /**
   * When true (default), throw SkillRejectedError if verdict != "safe" or score < 70.
   * Set to false to receive the result regardless of verdict.
   */
  rejectOnUnsafe?: boolean
}

export interface VerifyOptions {
  /** Override the instance-level tier for this call only. */
  tier?: 'free' | 'pro'
  /** Override the instance-level onProgress for this call only. */
  onProgress?: (event: ProgressEvent) => void
}

export class SkillAuditorClient {
  private readonly apiUrl:         string
  private readonly privateKey:     string
  private readonly tier:           'free' | 'pro'
  private readonly paymentHandler: PaymentHandler | undefined
  private readonly onProgress:     ((e: ProgressEvent) => void) | undefined
  private readonly pollIntervalMs: number
  private readonly timeoutMs:      number
  private readonly rejectOnUnsafe: boolean

  constructor(opts: SkillAuditorClientOptions = {}) {
    this.apiUrl         = (opts.apiUrl ?? 'http://localhost:3001').replace(/\/$/, '')
    this.privateKey     = opts.privateKey ?? 'dev'
    this.tier           = opts.tier ?? 'free'
    this.paymentHandler = opts.paymentHandler
    this.onProgress     = opts.onProgress
    this.pollIntervalMs = opts.pollIntervalMs ?? 3_000
    this.timeoutMs      = opts.timeoutMs      ?? 5 * 60 * 1_000
    this.rejectOnUnsafe = opts.rejectOnUnsafe ?? true
  }

  /**
   * Verify a skill is safe before using it.
   *
   * Flow:
   *   1. POST /v1/verify — if already stamped and safe, return immediately (fast path)
   *   2. POST /v1/agent/submit — kick off the audit pipeline
   *      - Auto-builds World AgentKit SIWE header from privateKey
   *      - Auto-handles x402: if 402 received, pays via paymentHandler and retries
   *   3. Poll /v1/audits/:auditId until complete (with onProgress streaming)
   *   4. Return VerifyResult — or throw SkillRejectedError if verdict is not safe
   */
  async verifySkill(
    skillContent: string,
    opts: VerifyOptions = {},
  ): Promise<VerifyResult> {
    const tier       = opts.tier       ?? this.tier
    const onProgress = opts.onProgress ?? this.onProgress

    // ── Fast path: already verified ────────────────────────────────────────────
    const cached = await this.checkVerified(skillContent)
    if (cached.verified) return cached

    // ── Submit for audit ────────────────────────────────────────────────────────
    const submitUrl = `${this.apiUrl}/v1/agent/submit`
    const agentkit  = await buildAgentkitHeader(this.privateKey, submitUrl)

    const body = JSON.stringify({ skillContent, tier })

    const submitRes = await fetchWithX402(
      submitUrl,
      {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'agentkit':     agentkit,
        },
        body,
      },
      tier === 'pro' ? this.paymentHandler : undefined,
    )

    if (!submitRes.ok && submitRes.status !== 202) {
      const err = await submitRes.json().catch(() => ({ error: submitRes.statusText })) as { error: string }
      throw new Error(`Skill submission failed (${submitRes.status}): ${err.error}`)
    }

    const { auditId } = await submitRes.json() as { auditId: string }

    // ── Poll until done ─────────────────────────────────────────────────────────
    return pollUntilComplete(this.apiUrl, auditId, {
      intervalMs:    this.pollIntervalMs,
      timeoutMs:     this.timeoutMs,
      onProgress,
      rejectOnUnsafe: this.rejectOnUnsafe,
    })
  }

  /**
   * Check if a skill has already been audited and verified, without submitting.
   * Returns verified: false (with null verdict/score) if no audit exists yet.
   */
  async checkVerified(skillContent: string): Promise<VerifyResult> {
    const res  = await fetch(`${this.apiUrl}/v1/verify`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ skillContent }),
    })
    const data = await res.json() as {
      verified:   boolean
      verdict:    string | null
      score:      number | null
      auditId:    string | null
      skillHash:  string
      auditedAt:  string | null
      ensSubname: string | null
    }

    return {
      verified:   data.verified,
      verdict:    (data.verdict ?? 'unsafe') as VerifyResult['verdict'],
      score:      data.score ?? 0,
      auditId:    data.auditId ?? '',
      skillHash:  data.skillHash,
      auditedAt:  data.auditedAt ?? '',
      ensSubname: data.ensSubname ?? undefined,
    }
  }

  /**
   * Like verifySkill, but returns false instead of throwing when the skill
   * is unsafe. Useful for conditional loading logic.
   *
   *   if (await client.isSafe(skillContent)) { loadSkill() }
   */
  async isSafe(skillContent: string, opts: VerifyOptions = {}): Promise<boolean> {
    try {
      const result = await this.verifySkill(skillContent, opts)
      return result.verified
    } catch (err) {
      if (err instanceof SkillRejectedError) return false
      throw err
    }
  }
}
