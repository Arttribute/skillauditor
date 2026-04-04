/**
 * x402-client.ts — x402 payment-gated fetch wrapper for Pro audits.
 *
 * Protocol:
 *  1. Caller attempts a fetch to /v1/submit (Pro tier).
 *  2. If the server returns HTTP 402 with a `X-Payment-Requirements` header,
 *     the client constructs an EIP-3009 transferWithAuthorization payload,
 *     signs it via Ledger `signTypedData()`, and retries with the signature
 *     in an `X-Payment` header.
 *  3. On success, the server validates the payment and processes the audit.
 *
 * WIRING STATUS:
 *  - x402-client itself: ✅ implemented here.
 *  - Server x402 middleware (`apps/skillauditor-api/src/middleware/x402.ts`):
 *    ⛔ owned by feat/core-pipeline — not yet live.
 *  - Ledger signTypedData integration:
 *    ⛔ depends on feat/onchain-identity delivering AgentKit + Ledger DMK.
 *
 * For now, the Pro tier submit falls back to standard fetch without payment.
 * The wrapper is wired correctly; it will activate once the server starts
 * returning 402 responses.
 */

import type { DeviceManagementKit } from '@ledgerhq/device-management-kit'

export interface PaymentRequirements {
  /** USDC contract address on Base */
  tokenAddress: string
  /** Recipient (SkillAuditor treasury) */
  payTo: string
  /** Amount in USDC atomic units (e.g. 9_000_000 = $9.00 USDC) */
  amount: string
  /** Chain ID — 8453 (Base mainnet) or 84532 (Base Sepolia) */
  chainId: number
}

export interface X402FetchOptions extends RequestInit {
  /** Ledger DMK instance for hardware signing — if absent, falls back to unsigned */
  dmk?: DeviceManagementKit
  /** Connected Ledger device session ID */
  deviceSessionId?: string
  /** Signer's wallet address (from connected Ledger) */
  signerAddress?: string
}

/**
 * x402Fetch — drop-in fetch replacement that handles 402 payment challenges.
 *
 * Usage:
 *   const res = await x402Fetch('/api/proxy/v1/submit', {
 *     method: 'POST',
 *     body: JSON.stringify({ content: '...' }),
 *     dmk,
 *     deviceSessionId,
 *     signerAddress,
 *   })
 */
export async function x402Fetch(
  url: string,
  options: X402FetchOptions = {}
): Promise<Response> {
  const { dmk, deviceSessionId, signerAddress, ...fetchOptions } = options

  // First attempt — no payment header
  const firstRes = await fetch(url, fetchOptions)

  // If not a payment challenge, return as-is
  if (firstRes.status !== 402) return firstRes

  // Parse payment requirements from server
  const requirementsHeader = firstRes.headers.get('X-Payment-Requirements')
  if (!requirementsHeader) {
    console.warn('[x402] Server returned 402 but no X-Payment-Requirements header')
    return firstRes
  }

  let requirements: PaymentRequirements
  try {
    requirements = JSON.parse(requirementsHeader) as PaymentRequirements
  } catch {
    console.warn('[x402] Failed to parse X-Payment-Requirements header')
    return firstRes
  }

  // If no Ledger DMK available, cannot sign — return 402 to caller
  if (!dmk || !deviceSessionId || !signerAddress) {
    console.warn('[x402] 402 payment required but no Ledger signer available. Connect Ledger to proceed.')
    return firstRes
  }

  // Build EIP-3009 transferWithAuthorization typed data
  const nonce = crypto.randomUUID()
  const validAfter = 0
  const validBefore = Math.floor(Date.now() / 1000) + 300 // 5 min window

  const typedData = buildEIP3009TypedData({
    tokenAddress: requirements.tokenAddress,
    chainId: requirements.chainId,
    from: signerAddress,
    to: requirements.payTo,
    value: requirements.amount,
    validAfter,
    validBefore,
    nonce,
  })

  // Sign via Ledger — uses the Ethereum app's signTypedData
  let signature: string
  try {
    signature = await signWithLedger(dmk, deviceSessionId, typedData)
  } catch (err) {
    console.error('[x402] Ledger signing failed:', err)
    return firstRes
  }

  // Retry with payment header
  const paymentPayload = {
    tokenAddress: requirements.tokenAddress,
    from: signerAddress,
    to: requirements.payTo,
    value: requirements.amount,
    validAfter,
    validBefore,
    nonce,
    signature,
    chainId: requirements.chainId,
  }

  return fetch(url, {
    ...fetchOptions,
    headers: {
      ...(fetchOptions.headers as Record<string, string> ?? {}),
      'X-Payment': JSON.stringify(paymentPayload),
    },
  })
}

// ── EIP-3009 helpers ──────────────────────────────────────────────────────────

interface EIP3009Params {
  tokenAddress: string
  chainId: number
  from: string
  to: string
  value: string
  validAfter: number
  validBefore: number
  nonce: string
}

function buildEIP3009TypedData(params: EIP3009Params) {
  return {
    domain: {
      name: 'USD Coin',
      version: '2',
      chainId: params.chainId,
      verifyingContract: params.tokenAddress,
    },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization' as const,
    message: {
      from: params.from,
      to: params.to,
      value: params.value,
      validAfter: params.validAfter,
      validBefore: params.validBefore,
      nonce: params.nonce,
    },
  }
}

// Ledger signTypedData via DMK — deferred until feat/onchain-identity delivers
// the full DMK device action API. This is a typed stub that matches the DMK
// signTypedData device action interface.
async function signWithLedger(
  dmk: DeviceManagementKit,
  deviceSessionId: string,
  typedData: ReturnType<typeof buildEIP3009TypedData>
): Promise<string> {
  // DMK signTypedData device action — browser-only (WebHID)
  // Will be wired once @ledgerhq/device-management-kit signTypedData action is available.
  // The DMK requires the Ledger device to confirm the transaction on-screen.
  void dmk
  void deviceSessionId
  void typedData

  // Temporary: throw so callers fall back gracefully until DMK action is wired
  throw new Error(
    'Ledger signTypedData not yet wired — waiting for feat/onchain-identity to deliver DMK device actions'
  )
}
