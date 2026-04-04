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

// Rate limits — enforced via MongoDB count query
const FREE_AUDITS_PER_DAY = 5
const PRO_AUDITS_PER_DAY  = 1

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

// ── Nullifier rate limiting ───────────────────────────────────────────────────
//
// Queries the Audit collection directly — no separate table needed.
// Window: last 24 hours (rolling).

export async function checkNullifierRateLimit(
  nullifier: string,
  tier: 'free' | 'pro',
): Promise<NullifierRateLimitResult> {
  const limit   = tier === 'pro' ? PRO_AUDITS_PER_DAY : FREE_AUDITS_PER_DAY
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const count = await Audit.countDocuments({
    'submittedBy.worldIdNullifier': nullifier,
    'submittedBy.submittedAt':      { $gte: windowStart },
    status:                         { $in: ['pending', 'running', 'completed'] },
  })

  const resetAt = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000)

  return {
    allowed:   count < limit,
    remaining: Math.max(0, limit - count),
    resetAt,
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
