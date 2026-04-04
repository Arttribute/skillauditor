// x402 payment middleware — Pro audit gate
//
// Implements the x402 payment protocol for machine-native USDC payments on Base.
// When a Pro audit is requested without a verified payment:
//   1. Returns HTTP 402 with payment requirements in the response body
//   2. The client (agent or browser) pays $9 USDC on Base
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

// $9.00 USDC — USDC has 6 decimal places
const PRO_AUDIT_AMOUNT_USDC = '9000000'

// USDC contract on Base mainnet
const USDC_BASE             = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

// Coinbase-hosted x402 facilitator (verifies payment receipts)
const X402_FACILITATOR      = process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitate'

const TREASURY_ADDRESS      = process.env.SKILLAUDITOR_TREASURY_ADDRESS ?? ''

// ── Payment requirements response body (x402 spec) ────────────────────────────

function buildPaymentRequirements(resourceUrl: string) {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme:             'exact',
        network:            'base',
        maxAmountRequired:  PRO_AUDIT_AMOUNT_USDC,
        resource:           resourceUrl,
        description:        'Pro skill audit — semantic analysis + onchain stamp + ENS subname',
        mimeType:           'application/json',
        payTo:              TREASURY_ADDRESS,
        maxTimeoutSeconds:  300,
        asset:              USDC_BASE,
        extra: {
          name:    'USD Coin',
          version: '2',
        },
      },
    ],
    error: 'Payment required for Pro tier audit',
  }
}

// ── Payment receipt verification ──────────────────────────────────────────────

interface FacilitatorResponse {
  isValid:  boolean
  error?:   string
}

async function verifyPaymentReceipt(
  paymentHeader: string,
  requirements:  ReturnType<typeof buildPaymentRequirements>,
): Promise<FacilitatorResponse> {
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

  const resourceUrl = `${c.req.url.split('?')[0]}`
  const requirements = buildPaymentRequirements(resourceUrl)

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
