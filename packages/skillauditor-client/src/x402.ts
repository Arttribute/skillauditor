// x402 payment handling for Pro tier audits.
//
// When the server returns HTTP 402, it means the request requires a $5 USDC
// payment on Base before the audit pipeline will run. This module:
//   1. Detects the 402 and extracts the payment requirements from the body
//   2. Invokes a user-supplied `paymentHandler` with those requirements
//   3. Retries the original request with the `X-Payment` header set to the receipt
//
// For free tier audits, this module is never invoked — the server only returns 402
// when the request body contains `tier: "pro"`.
//
// createX402PaymentHandler(privateKey):
//   Convenience factory that builds a PaymentHandler using the `x402` package.
//   Derives a viem wallet from the private key, signs an EIP-3009
//   transferWithAuthorization via x402/client's createPaymentHeader, and returns
//   the base64-encoded receipt string for the X-Payment header.
//
//   Usage:
//     import { createX402PaymentHandler } from '@skillauditor/client'
//     const client = new SkillAuditorClient({
//       privateKey: process.env.AGENT_PRIVATE_KEY!,
//       tier: 'pro',
//       paymentHandler: createX402PaymentHandler(process.env.AGENT_PRIVATE_KEY!),
//     })

import { PaymentError } from './errors.js'
import { createSigner }             from 'x402/types'
import { createPaymentHeader }      from 'x402/client'
import type { PaymentRequirements } from 'x402/types'

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

  const amount  = requirements.accepts[0]?.maxAmountRequired
  const usdcAmt = amount ? `$${(Number(amount) / 1_000_000).toFixed(2)} USDC` : 'USDC'

  if (!paymentHandler) {
    throw new PaymentError(
      `Pro audit requires a ${usdcAmt} payment on Base. ` +
      `Provide a paymentHandler in SkillAuditorClient options to enable automatic payment.`,
      402,
    )
  }

  console.log(`\x1b[36m[x402]\x1b[0m ← 402  ${usdcAmt} required on Base`)
  console.log(`\x1b[36m[x402]\x1b[0m signing EIP-3009 transferWithAuthorization...`)

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

  console.log(`\x1b[36m[x402]\x1b[0m → retrying with X-Payment header`)

  // Retry with payment header
  const headers = new Headers(init.headers)
  headers.set('X-Payment', receipt)

  const retryRes = await fetch(url, { ...init, headers })

  if (retryRes.status === 402) {
    throw new PaymentError('Payment was rejected by the server', 402)
  }

  return retryRes
}

// ── Payment handler factory ───────────────────────────────────────────────────
//
// Creates a PaymentHandler backed by an EVM private key.
// Uses x402/client's createPaymentHeader to sign an EIP-3009
// transferWithAuthorization and return the base64-encoded X-Payment receipt.
//
// The wallet must hold enough USDC on Base (or base-sepolia for testnet).
//
// For Ledger hardware signing, implement a custom PaymentHandler that calls
// your DMK signTypedData device action and passes the signed receipt here.

export function createX402PaymentHandler(privateKey: string): PaymentHandler {
  const key = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`

  return async (requirements: X402PaymentRequirements): Promise<string> => {
    const network = requirements.accepts[0]?.network ?? 'base'
    const signer  = await createSigner(network, key)
    const payReqs = requirements.accepts[0] as unknown as PaymentRequirements
    return createPaymentHeader(signer, requirements.x402Version, payReqs)
  }
}
