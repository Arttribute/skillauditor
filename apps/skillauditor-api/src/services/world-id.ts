// World ID 4.0 verification service
//
// Uses RP_ID (replaces legacy APP_ID) and RP_SIGNING_KEY (new in 4.0).
// Verification endpoint: POST https://developer.world.org/api/v4/verify/{rp_id}
//
// Dev bypass: when WORLD_RP_ID is absent, returns a synthetic dev result so
// the pipeline can run without a World App during development. All such
// submissions are flagged with verification_level='device' and a dev_ prefix
// on the nullifier.

import crypto from 'crypto'
import { Audit } from '../db/models/audit.js'

const WORLD_RP_ID       = process.env.WORLD_RP_ID            // rp_...
const WORLD_SIGNING_KEY = process.env.WORLD_RP_SIGNING_KEY   // backend secret
const WORLD_ACTION      = process.env.WORLD_ACTION ?? 'submit-skill-for-audit'

const VERIFY_ENDPOINT   = 'https://developer.world.org/api/v4/verify'

// Free tier quota — 3 audits per 30-day rolling window per verified human.
// After the quota is exhausted each additional verification costs $0.10 USDC
// (enforced via x402 micropayment in the submit route).
const FREE_AUDITS_PER_MONTH   = 3
const FREE_QUOTA_WINDOW_MS    = 30 * 24 * 60 * 60 * 1000

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorldIDProofInput {
  proof:               string
  merkle_root:         string
  nullifier_hash:      string
  verification_level:  'orb' | 'device'
  signal?:             string
}

export interface WorldIDVerificationResult {
  nullifier_hash:      string
  verification_level:  'orb' | 'device'
  isDev:               boolean
}

export interface NullifierRateLimitResult {
  allowed:   boolean
  remaining: number
  resetAt:   Date
}

export interface FreeQuotaResult {
  /** Audits consumed this 30-day window */
  used:        number
  /** Total monthly free allowance (3) */
  total:       number
  /** How many free audits remain before micropayment is required */
  remaining:   number
  /** When the oldest in-window audit falls off (first slot freed) */
  resetAt:     Date
  /** True when the free monthly quota is fully used — micropayment required */
  exhausted:   boolean
}

// ── Signal generation (for frontend challenge flow) ───────────────────────────
//
// The frontend calls GET /v1/world-id/challenge?nonce=<uuid> to get a
// signed signal_hash. IDKit embeds this in the proof so the proof is
// bound to a specific session — prevents proof phishing across apps.

export function generateSignedChallenge(nonce: string): string {
  if (!WORLD_SIGNING_KEY) {
    // Dev mode: return unsecured signal
    return `dev_${nonce}`
  }
  return crypto
    .createHmac('sha256', WORLD_SIGNING_KEY)
    .update(`${WORLD_ACTION}:${nonce}`)
    .digest('hex')
}

// ── Proof verification ────────────────────────────────────────────────────────

export async function verifyWorldIDProof(
  input: WorldIDProofInput,
): Promise<WorldIDVerificationResult> {
  // Dev bypass — when RP_ID not configured, proof is empty (dev stub), or nullifier is dev-prefixed.
  // This allows staging/dev to run without a real World App while production enforces real proofs.
  const isDevProof = !input.proof || input.nullifier_hash.startsWith('dev_')
  if (!WORLD_RP_ID || (isDevProof && process.env.NODE_ENV !== 'production')) {
    if (!WORLD_RP_ID) {
      console.warn(
        '[world-id] WORLD_RP_ID not set — dev bypass active. ' +
        'Set WORLD_RP_ID and WORLD_RP_SIGNING_KEY for production.',
      )
    } else {
      console.warn('[world-id] Dev/stub proof received — bypassing World ID API (NODE_ENV !== production).')
    }
    return {
      nullifier_hash:     input.nullifier_hash || `dev_${Date.now()}`,
      verification_level: 'device',
      isDev:              true,
    }
  }

  const body = {
    proof:              input.proof,
    merkle_root:        input.merkle_root,
    nullifier_hash:     input.nullifier_hash,
    verification_level: input.verification_level,
    action:             WORLD_ACTION,
    signal_hash:        input.signal ?? '',
  }

  // Sign the request body with RP_SIGNING_KEY (HMAC-SHA256)
  // World ID 4.0 requires request authentication to prevent spoofed verify calls
  const bodyStr  = JSON.stringify(body)
  const reqSig   = WORLD_SIGNING_KEY
    ? crypto.createHmac('sha256', WORLD_SIGNING_KEY).update(bodyStr).digest('hex')
    : ''

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (reqSig) headers['X-RP-Signature'] = reqSig

  let res: Response
  try {
    res = await fetch(`${VERIFY_ENDPOINT}/${WORLD_RP_ID}`, {
      method:  'POST',
      headers,
      body:    bodyStr,
    })
  } catch (err) {
    throw new Error(`World ID API unreachable: ${(err as Error).message}`)
  }

  const data = (await res.json()) as Record<string, unknown>

  if (!res.ok) {
    const code    = data.code    as string | undefined
    const detail  = data.detail  as string | undefined
    const message = data.error   as string | undefined
    throw new WorldIDVerificationError(
      detail ?? message ?? `World ID verification failed (HTTP ${res.status})`,
      code ?? String(res.status),
    )
  }

  // Verify the returned nullifier matches what the client claimed
  const returnedNullifier = data.nullifier_hash as string
  if (returnedNullifier !== input.nullifier_hash) {
    throw new WorldIDVerificationError(
      'Nullifier mismatch — proof may have been tampered with',
      'nullifier_mismatch',
    )
  }

  return {
    nullifier_hash:     returnedNullifier,
    verification_level: (data.verification_level as 'orb' | 'device') ?? input.verification_level,
    isDev:              false,
  }
}

// ── Free tier quota check ─────────────────────────────────────────────────────
//
// Counts free-tier audits within a 30-day rolling window.
// Pro-tier audits are not counted (they are individually paid).
//
// When exhausted, the submit route returns HTTP 402 with $0.10 USDC requirements
// instead of a hard 429, giving the user a path to continue.

export async function checkFreeQuota(nullifier: string): Promise<FreeQuotaResult> {
  const windowStart = new Date(Date.now() - FREE_QUOTA_WINDOW_MS)

  const used = await Audit.countDocuments({
    'submittedBy.worldIdNullifier': nullifier,
    'submittedBy.submittedAt':      { $gte: windowStart },
    tier:                           'free',
    status:                         { $in: ['pending', 'running', 'completed'] },
  })

  // resetAt = when the earliest in-window audit falls out of the 30-day window
  const earliest = await Audit.findOne({
    'submittedBy.worldIdNullifier': nullifier,
    'submittedBy.submittedAt':      { $gte: windowStart },
    tier:                           'free',
    status:                         { $in: ['pending', 'running', 'completed'] },
  }, { 'submittedBy.submittedAt': 1 }).sort({ 'submittedBy.submittedAt': 1 }).lean()

  const earliestDate = earliest
    ? (earliest as Record<string, Record<string, unknown>>).submittedBy?.submittedAt as Date
    : windowStart

  const resetAt = new Date((earliestDate as Date).getTime() + FREE_QUOTA_WINDOW_MS)

  return {
    used,
    total:     FREE_AUDITS_PER_MONTH,
    remaining: Math.max(0, FREE_AUDITS_PER_MONTH - used),
    resetAt,
    exhausted: used >= FREE_AUDITS_PER_MONTH,
  }
}

// ── Nullifier rate limiting (legacy — kept for agent-submit compatibility) ────
//
// Agents use this for a simple allowed/remaining check. Browser submissions
// now go through checkFreeQuota + x402 micropayment in the submit route.

export async function checkNullifierRateLimit(
  nullifier: string,
  tier: 'free' | 'pro',
): Promise<NullifierRateLimitResult> {
  if (tier === 'pro') {
    // Pro tier has no hard cap — each submission is individually paid via x402.
    return { allowed: true, remaining: 999, resetAt: new Date() }
  }

  const quota = await checkFreeQuota(nullifier)
  return {
    allowed:   !quota.exhausted,
    remaining: quota.remaining,
    resetAt:   quota.resetAt,
  }
}

// ── Error type ────────────────────────────────────────────────────────────────

export class WorldIDVerificationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'WorldIDVerificationError'
  }
}
