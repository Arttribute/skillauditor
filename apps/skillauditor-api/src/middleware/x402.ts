// x402 payment middleware — Pro audit gate
//
// Implements the x402 payment protocol for machine-native USDC payments on Base.
// When a Pro audit is requested without a verified payment:
//   1. Returns HTTP 402 with payment requirements in the response body
//   2. The client (agent or browser) pays $5 USDC on Base
//   3. Client retries with X-Payment header containing the payment receipt
//   4. This middleware verifies the receipt with the x402 facilitator
//   5. If valid, request proceeds to the audit pipeline
//
// No-op when SKILLAUDITOR_TREASURY_ADDRESS is not configured (dev mode).
//
// References:
//   Protocol spec: https://x402.org
//   USDC on Base:  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

import { createMiddleware } from 'hono/factory'

// $1.00 USDC — full Pro audit with onchain stamp + ENS subname
const PRO_AUDIT_AMOUNT_USDC      = '1000000'

// $0.10 USDC — micropayment for free tier after the 3/month quota is exhausted
const FREE_OVERFLOW_AMOUNT_USDC  = '100000'

// Network + USDC address — configurable for testnet demos.
// Set X402_NETWORK=base-sepolia and X402_USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
// to use Base Sepolia testnet USDC instead of Base mainnet.
const X402_NETWORK          = process.env.X402_NETWORK      ?? 'base'
const USDC_ADDRESS          = process.env.X402_USDC_ADDRESS ?? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

// Coinbase-hosted x402 facilitator (verifies payment receipts)
const X402_FACILITATOR      = process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitate'

// Treasury address that receives payments.
// Set to a non-zero EVM address to enable x402. Empty string or zero address disables it.
const _rawTreasury          = process.env.SKILLAUDITOR_TREASURY_ADDRESS ?? ''
const TREASURY_ADDRESS      = _rawTreasury === '0x0000000000000000000000000000000000000000' ? '' : _rawTreasury

// ── Payment requirements builders ─────────────────────────────────────────────

function buildProPaymentRequirements(resourceUrl: string) {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme:             'exact',
        network:            X402_NETWORK,
        maxAmountRequired:  PRO_AUDIT_AMOUNT_USDC,
        resource:           resourceUrl,
        description:        'Pro skill audit — semantic analysis + onchain stamp + ENS subname ($1.00 USDC)',
        mimeType:           'application/json',
        payTo:              TREASURY_ADDRESS,
        maxTimeoutSeconds:  300,
        asset:              USDC_ADDRESS,
        extra: { name: 'USD Coin', version: '2' },
      },
    ],
    error: 'Payment required for Pro tier audit',
  }
}

// Exported so submit.ts can return this directly as a 402 body.
export function buildFreeOverflowRequirements(resourceUrl: string) {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme:             'exact',
        network:            X402_NETWORK,
        maxAmountRequired:  FREE_OVERFLOW_AMOUNT_USDC,
        resource:           resourceUrl,
        description:        'Skill verification — monthly free quota exceeded ($0.10 USDC per check)',
        mimeType:           'application/json',
        payTo:              TREASURY_ADDRESS,
        maxTimeoutSeconds:  300,
        asset:              USDC_ADDRESS,
        extra: { name: 'USD Coin', version: '2' },
      },
    ],
    error: 'Free monthly quota exhausted — $0.10 USDC required for additional verifications',
  }
}

// ── Payment receipt verification ──────────────────────────────────────────────

interface FacilitatorResponse {
  isValid:  boolean
  error?:   string
}

// Exported so submit routes can verify micropayments inline.
export async function verifyX402Payment(
  paymentHeader: string,
  requirements:  ReturnType<typeof buildProPaymentRequirements | typeof buildFreeOverflowRequirements>,
): Promise<FacilitatorResponse> {
  if (!TREASURY_ADDRESS) {
    // Dev mode — payment gate disabled, treat any header as valid
    return { isValid: true }
  }
  try {
    const res = await fetch(X402_FACILITATOR, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        payment:      paymentHeader,
        requirements: requirements.accepts[0],
      }),
    })
    return (await res.json()) as FacilitatorResponse
  } catch (err) {
    console.error('[x402] facilitator unreachable:', (err as Error).message)
    return { isValid: false, error: 'Facilitator unreachable' }
  }
}

// Backward-compat alias used inside proPaymentGate below
const verifyPaymentReceipt = verifyX402Payment

// ── Middleware factory ────────────────────────────────────────────────────────
//
// Apply to the Pro submit path only. Free audits skip this.
// Usage in index.ts:
//   app.use('/v1/submit', proPaymentGate)
//
// The middleware inspects the request body for `tier: 'pro'` before
// triggering the payment flow, so free submissions pass through unaffected.

export const proPaymentGate = createMiddleware(async (c, next) => {
  // Dev bypass — treasury not configured
  if (!TREASURY_ADDRESS) {
    console.warn('[x402] SKILLAUDITOR_TREASURY_ADDRESS not set — payment gate disabled')
    return next()
  }

  // Peek at tier without consuming the body (Hono buffers the body)
  let tier = 'free'
  try {
    const raw = await c.req.raw.clone().json() as Record<string, unknown>
    tier = raw.tier === 'pro' ? 'pro' : 'free'
  } catch {
    // Malformed JSON — let submit route handle the error
    return next()
  }

  if (tier !== 'pro') {
    return next()
  }

  // Check for payment header
  const paymentHeader = c.req.header('X-Payment')

  // Force https:// — behind a reverse proxy the internal URL may be http://
  // but the x402 facilitator validates against the public-facing URL.
  const rawUrl = c.req.url.split('?')[0]
  const resourceUrl = rawUrl.replace(/^http:\/\//, 'https://')
  const requirements = buildProPaymentRequirements(resourceUrl)

  if (!paymentHeader) {
    return c.json(requirements, 402)
  }

  // Verify the payment receipt
  const result = await verifyPaymentReceipt(paymentHeader, requirements)
  if (!result.isValid) {
    return c.json(
      {
        error:  'Payment verification failed',
        detail: result.error ?? 'Invalid payment receipt',
      },
      402,
    )
  }

  // Payment verified — attach to context for downstream logging
  c.set('paymentVerified', true)
  return next()
})
