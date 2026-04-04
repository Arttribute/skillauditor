// x402 payment handling for Pro tier audits.
//
// When the server returns HTTP 402, it means the request requires a $9 USDC
// payment on Base before the audit pipeline will run. This module:
//   1. Detects the 402 and extracts the payment requirements from the body
//   2. Invokes a user-supplied `paymentHandler` with those requirements
//   3. Retries the original request with the `X-Payment` header set to the receipt
//
// For free tier audits, this module is never invoked — the server only returns 402
// when the request body contains `tier: "pro"`.
//
// Implementing `paymentHandler`:
//   The handler receives the payment requirements and must return a payment receipt
//   string suitable for the X-Payment header. Typical implementations use:
//   - `x402-fetch` from the x402 npm package (auto-pays from an EVM wallet)
//   - A Privy embedded wallet signing a USDC TransferWithAuthorization (EIP-3009)
//   - A Ledger device signing the same EIP-3009 payload for hardware approval
//
// Example (x402-fetch):
//   import { getPaymentHeader } from 'x402-fetch'
//   const handler: PaymentHandler = async (req) => getPaymentHeader(req, wallet)

import { PaymentError } from './errors.js'

export interface X402PaymentRequirements {
  x402Version: number
  accepts: Array<{
    scheme:            string
    network:           string
    maxAmountRequired: string   // USDC amount in base units (6 decimals)
    resource:          string
    description:       string
    payTo:             string
    maxTimeoutSeconds: number
    asset:             string
  }>
  error: string
}

/**
 * Called when a 402 is received. Must return the X-Payment header value
 * (a payment receipt string) for the retry request.
 */
export type PaymentHandler = (
  requirements: X402PaymentRequirements,
) => Promise<string>

/**
 * Perform a fetch that transparently handles x402 payment for Pro audits.
 *
 * On first call, sends the request normally.
 * If a 402 is received and `paymentHandler` is provided, pays and retries once.
 * If no `paymentHandler` is provided, throws PaymentError immediately.
 */
export async function fetchWithX402(
  url: string,
  init: RequestInit,
  paymentHandler?: PaymentHandler,
): Promise<Response> {
  const res = await fetch(url, init)

  if (res.status !== 402) return res

  // Parse payment requirements
  let requirements: X402PaymentRequirements
  try {
    requirements = await res.json() as X402PaymentRequirements
  } catch {
    throw new PaymentError('Received 402 but could not parse payment requirements', 402)
  }

  if (!paymentHandler) {
    const amount = requirements.accepts[0]?.maxAmountRequired
    const usdcAmt = amount ? `$${(Number(amount) / 1_000_000).toFixed(2)} USDC` : 'USDC'
    throw new PaymentError(
      `Pro audit requires a ${usdcAmt} payment on Base. ` +
      `Provide a paymentHandler in SkillAuditorClient options to enable automatic payment.`,
      402,
    )
  }

  // Obtain payment receipt from the handler
  let receipt: string
  try {
    receipt = await paymentHandler(requirements)
  } catch (err) {
    throw new PaymentError(
      `Payment handler failed: ${(err as Error).message}`,
      402,
    )
  }

  // Retry with payment header
  const headers = new Headers(init.headers)
  headers.set('X-Payment', receipt)

  const retryRes = await fetch(url, { ...init, headers })

  if (retryRes.status === 402) {
    throw new PaymentError('Payment was rejected by the server', 402)
  }

  return retryRes
}
