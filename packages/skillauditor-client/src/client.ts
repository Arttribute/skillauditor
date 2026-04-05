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

import { buildAgentkitHeader }                                     from './agentkit.js'
import { fetchWithX402, type PaymentHandler }                      from './x402.js'
import { pollUntilComplete, type VerifyResult, type ProgressEvent } from './poller.js'
import { SkillRejectedError }                                      from './errors.js'
import {
  createConsoleLogger,
  printAuditHeader,
  printAuditResult,
  printAuditRejected,
  type LogsOption,
} from './logger.js'

export type { LogsOption }

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
   * "pro"            — full audit + onchain stamp + ENS subname, requires $5 USDC payment.
   */
  tier?: 'free' | 'pro'

  /**
   * Required when tier = "pro". Receives the x402 payment requirements and
   * must return an X-Payment receipt string. See src/x402.ts for details.
   */
  paymentHandler?: PaymentHandler

  /**
   * Controls terminal log output.
   *
   *   true (default)  — normal: stage transitions + warnings, no per-tool-call noise
   *   'verbose'       — everything, including every sandbox tool call
   *   false           — silent: no terminal output at all
   *
   * You can also supply a custom onProgress callback instead for full control.
   * If both logs and onProgress are provided, onProgress takes precedence.
   */
  logs?: LogsOption

  /**
   * Custom progress handler. Overrides the built-in console logger.
   * Called for each pipeline log entry while the audit is running.
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
  /** Override the instance-level logs setting for this call only. */
  logs?: LogsOption
  /** Override the instance-level onProgress for this call only. */
  onProgress?: (event: ProgressEvent) => void
}

export class SkillAuditorClient {
  private readonly apiUrl:         string
  private readonly privateKey:     string
  private readonly tier:           'free' | 'pro'
  private readonly paymentHandler: PaymentHandler | undefined
  private readonly logs:           LogsOption
  private readonly onProgress:     ((e: ProgressEvent) => void) | undefined
  private readonly pollIntervalMs: number
  private readonly timeoutMs:      number
  private readonly rejectOnUnsafe: boolean

  constructor(opts: SkillAuditorClientOptions = {}) {
    this.apiUrl         = (opts.apiUrl ?? process.env.SKILLAUDITOR_API_URL ?? 'https://api.skillauditor.dev').replace(/\/$/, '')
    this.privateKey     = opts.privateKey ?? 'dev'
    this.tier           = opts.tier ?? 'free'
    this.paymentHandler = opts.paymentHandler
    this.logs           = opts.logs ?? true          // on by default
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
   *   3. Poll /v1/audits/:auditId until complete (with live log streaming to stdout)
   *   4. Return VerifyResult — or throw SkillRejectedError if verdict is not safe
   */
  async verifySkill(
    skillContent: string,
    opts: VerifyOptions = {},
  ): Promise<VerifyResult> {
    const tier       = opts.tier ?? this.tier
    const logsLevel  = opts.logs ?? this.logs
    // Explicit onProgress overrides the built-in logger
    const onProgress = opts.onProgress ?? this.onProgress ?? createConsoleLogger(logsLevel)
    const silent     = logsLevel === false && !opts.onProgress && !this.onProgress

    // ── Fast path: already verified ────────────────────────────────────────────
    const cached = await this.checkVerified(skillContent)
    if (cached.verified) {
      if (!silent) printAuditResult(cached)
      return cached
    }

    // ── Submit for audit ────────────────────────────────────────────────────────
    // Dev mode (no real key): use /v1/submit — no AgentKit auth required.
    // Production (real key):  use /v1/agent/submit — SIWE + x402 payment gate.
    const isDev      = !this.privateKey || this.privateKey === 'dev'
    const submitUrl  = isDev
      ? `${this.apiUrl}/v1/submit`
      : `${this.apiUrl}/v1/agent/submit`

    const body = JSON.stringify({ skillContent, tier })

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (!isDev) {
      headers['agentkit'] = await buildAgentkitHeader(this.privateKey, submitUrl)
    }

    const submitRes = await fetchWithX402(
      submitUrl,
      { method: 'POST', headers, body },
      tier === 'pro' ? this.paymentHandler : undefined,
    )

    if (!submitRes.ok && submitRes.status !== 202) {
      const err = await submitRes.json().catch(() => ({ error: submitRes.statusText })) as { error: string }
      throw new Error(`Skill submission failed (${submitRes.status}): ${err.error}`)
    }

    const { auditId, skillHash } = await submitRes.json() as { auditId: string; skillHash: string }

    // ── Print header now that we have auditId + skillHash ──────────────────────
    // Extract skill name from frontmatter if possible (simple regex — no dep needed)
    const nameMatch = skillContent.match(/^name\s*:\s*(.+)$/m)
    const skillName = nameMatch?.[1]?.trim() ?? skillHash.slice(0, 10) + '…'
    if (!silent) printAuditHeader(skillName, auditId, tier)

    // ── Poll until done ─────────────────────────────────────────────────────────
    let result: VerifyResult
    try {
      result = await pollUntilComplete(this.apiUrl, auditId, {
        intervalMs:     this.pollIntervalMs,
        timeoutMs:      this.timeoutMs,
        onProgress,
        rejectOnUnsafe: this.rejectOnUnsafe,
      })
    } catch (err) {
      if (err instanceof SkillRejectedError && !silent) {
        printAuditRejected(err.verdict, err.score)
      }
      throw err
    }

    if (!silent) printAuditResult(result)
    return result
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
