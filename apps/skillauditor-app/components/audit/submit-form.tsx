'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWallets } from '@privy-io/react-auth'
import {
  WorldIDVerifier,
  WorldIDVerificationBadge,
  type WorldIDProof,
} from '@/components/world-id/world-id-verifier'

interface SubmitFormProps {
  userId: string
}

// x402 payment requirements shape returned by the server on HTTP 402
interface X402Requirements {
  x402Version: number
  accepts: Array<{
    scheme: string
    network: string
    maxAmountRequired: string // USDC atomic units (6 decimals)
    resource: string
    description: string
    payTo: string
    maxTimeoutSeconds: number
    asset: string
    extra?: { name?: string; version?: string }
  }>
  error: string
  quota?: { used: number; total: number; resetAt: string }
}

interface QuotaInfo {
  used: number
  total: number
  remaining: number
  resetAt: string
  exhausted: boolean
  micropayment: { required: boolean; amountUsd: string }
}

// x402 network name → EVM chain ID
const NETWORK_CHAIN_IDS: Record<string, number> = {
  base:           8453,
  'base-sepolia': 84532,
}

const PLACEHOLDER = `---
name: My Skill
description: What this skill does
version: 1.0.0
tools:
  - read_file
  - bash
---

# My Skill

Instructions for the AI agent here...`

// ── x402 payment header construction ─────────────────────────────────────────
//
// Builds a base64-encoded x402 v1 "exact" EVM payment payload by signing an
// EIP-3009 TransferWithAuthorization via the connected wallet's eth_signTypedData_v4.

function generateNonce(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function buildPaymentHeader(
  requirements: X402Requirements,
  walletAddress: string,
  signTypedData: (typedData: object) => Promise<string>,
): Promise<string> {
  const req = requirements.accepts[0]
  if (!req) throw new Error('No payment requirements received')

  const now = Math.floor(Date.now() / 1000)
  const validAfter  = BigInt(now - 600).toString()
  const validBefore = BigInt(now + req.maxTimeoutSeconds).toString()
  const nonce       = generateNonce()

  // EIP712Domain must be explicitly included in types for MetaMask compatibility.
  // MetaMask v11+ rejects or computes the domain hash differently when EIP712Domain
  // is absent — viem always includes it; we follow the same pattern.
  const typedData = {
    domain: {
      name:              req.extra?.name    ?? 'USDC',
      version:           req.extra?.version ?? '2',
      chainId:           NETWORK_CHAIN_IDS[req.network] ?? 84532,
      verifyingContract: req.asset,
    },
    types: {
      EIP712Domain: [
        { name: 'name',              type: 'string'  },
        { name: 'version',           type: 'string'  },
        { name: 'chainId',           type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      TransferWithAuthorization: [
        { name: 'from',        type: 'address' },
        { name: 'to',          type: 'address' },
        { name: 'value',       type: 'uint256' },
        { name: 'validAfter',  type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce',       type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from:        walletAddress,
      to:          req.payTo,
      value:       req.maxAmountRequired,
      validAfter,
      validBefore,
      nonce,
    },
  }

  const signature = await signTypedData(typedData)

  const payload = {
    x402Version: requirements.x402Version,
    scheme:      req.scheme,
    network:     req.network,
    payload: {
      signature,
      authorization: {
        from:        walletAddress,
        to:          req.payTo,
        value:       req.maxAmountRequired,
        validAfter,
        validBefore,
        nonce,
      },
    },
  }

  return btoa(JSON.stringify(payload))
}

// ── Display helpers ───────────────────────────────────────────────────────────

function usdcDisplay(atomicUnits: string) {
  return `$${(Number(atomicUnits) / 1_000_000).toFixed(2)}`
}

// ─────────────────────────────────────────────────────────────────────────────

export function SubmitForm({ userId }: SubmitFormProps) {
  const router = useRouter()
  const { wallets } = useWallets()

  const [skillContent,   setSkillContent]   = useState('')
  const [skillName,      setSkillName]       = useState('')
  const [tier,           setTier]            = useState<'free' | 'pro'>('free')
  const [submitting,     setSubmitting]      = useState(false)
  const [error,          setError]           = useState<string | null>(null)
  const [worldIdProof,   setWorldIdProof]    = useState<WorldIDProof | null>(null)
  const [quota,          setQuota]           = useState<QuotaInfo | null>(null)

  // x402 payment state — set when server returns 402
  const [pendingPayment, setPendingPayment]  = useState<{
    requirements: X402Requirements
    bodyJson:     string
  } | null>(null)
  const [paymentSigning, setPaymentSigning]  = useState(false)

  // Fetch free quota once World ID is verified
  useEffect(() => {
    if (!worldIdProof) return
    fetch(`/api/proxy/v1/audits/quota?nullifier_hash=${encodeURIComponent(worldIdProof.nullifier_hash)}`)
      .then(r => r.json())
      .then((data: QuotaInfo) => setQuota(data))
      .catch(() => { /* non-fatal */ })
  }, [worldIdProof])

  // ── Core submit ───────────────────────────────────────────────────────────
  async function doSubmit(bodyJson: string, paymentHeader?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (paymentHeader) headers['X-Payment'] = paymentHeader

    const res  = await fetch('/api/proxy/v1/submit', { method: 'POST', headers, body: bodyJson })
    const data = await res.json() as { auditId?: string; skillHash?: string; error?: string; x402Version?: number; accepts?: unknown[] }

    if (res.status === 402) {
      const req = data as unknown as X402Requirements
      if (req.x402Version && Array.isArray(req.accepts) && req.accepts.length > 0) {
        setPendingPayment({ requirements: req, bodyJson })
        return null
      }
    }

    if (!res.ok) {
      throw new Error(data.error ?? `Submission failed (${res.status})`)
    }

    if (!data.auditId) throw new Error('No auditId returned from server')

    return { auditId: data.auditId, skillHash: data.skillHash ?? '' }
  }

  // ── Initial submit ────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!skillContent.trim()) return

    setSubmitting(true)
    setError(null)
    setPendingPayment(null)

    try {
      const bodyJson = JSON.stringify({
        skillContent: skillContent.trim(),
        skillName:    skillName.trim() || undefined,
        userId,
        tier,
        ...(worldIdProof && {
          proof:              worldIdProof.proof,
          merkle_root:        worldIdProof.merkle_root,
          nullifier_hash:     worldIdProof.nullifier_hash,
          verification_level: worldIdProof.verification_level,
        }),
      })

      const result = await doSubmit(bodyJson)
      if (!result) return // 402 — payment UI shown

      persistHistory(result.auditId, result.skillHash)
      router.push(`/audits/${result.auditId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — is the API running?')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Payment authorisation ─────────────────────────────────────────────────
  async function handleAuthorizePayment() {
    if (!pendingPayment) return

    const wallet = wallets[0]
    if (!wallet) {
      setError('No wallet connected. Please connect a wallet to pay.')
      return
    }

    setPaymentSigning(true)
    setError(null)

    try {
      const req = pendingPayment.requirements.accepts[0]
      const targetChainId = NETWORK_CHAIN_IDS[req?.network ?? 'base'] ?? 8453
      const provider = await wallet.getEthereumProvider()

      const currentChainHex = await provider.request({ method: 'eth_chainId' }) as string
      if (parseInt(currentChainHex, 16) !== targetChainId) {
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x' + targetChainId.toString(16) }],
          })
        } catch {
          if (targetChainId === 8453) {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x2105', chainName: 'Base',
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://mainnet.base.org'],
                blockExplorerUrls: ['https://basescan.org'],
              }],
            })
          } else if (targetChainId === 84532) {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x14a34', chainName: 'Base Sepolia',
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://sepolia.base.org'],
                blockExplorerUrls: ['https://sepolia-explorer.base.org'],
              }],
            })
          }
        }
      }

      const paymentHeader = await buildPaymentHeader(
        pendingPayment.requirements,
        wallet.address,
        async (typedData) => provider.request({
          method: 'eth_signTypedData_v4',
          params: [wallet.address, JSON.stringify(typedData)],
        }) as Promise<string>,
      )

      setPendingPayment(null)
      setSubmitting(true)

      const result = await doSubmit(pendingPayment.bodyJson, paymentHeader)
      if (!result) return

      persistHistory(result.auditId, result.skillHash)
      router.push(`/audits/${result.auditId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed — please try again')
    } finally {
      setPaymentSigning(false)
      setSubmitting(false)
    }
  }

  function persistHistory(auditId: string, skillHash: string) {
    try {
      const history = JSON.parse(localStorage.getItem('sa_audit_history') ?? '[]') as Array<{
        auditId: string; skillName: string; skillHash: string; submittedAt: string
      }>
      localStorage.setItem('sa_audit_history', JSON.stringify([
        { auditId, skillName: skillName.trim() || 'Untitled Skill', skillHash, submittedAt: new Date().toISOString() },
        ...history,
      ].slice(0, 20)))
    } catch { /* localStorage unavailable */ }
  }

  const charCount   = skillContent.length
  const isOverLimit = charCount > 500_000

  // Payment amount from current pending requirements or default
  const paymentAmountDisplay = pendingPayment
    ? usdcDisplay(pendingPayment.requirements.accepts[0]?.maxAmountRequired ?? '100000')
    : tier === 'pro' ? '$1.00' : '$0.10'

  // What tier would require payment on next submit (for free tier quota badge)
  const freeTierNeedsPayment = quota?.exhausted && tier === 'free'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Skill name */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="skillName" className="text-sm font-medium text-zinc-700">
          Skill name <span className="text-zinc-400 font-normal">(optional — auto-detected from frontmatter)</span>
        </label>
        <input
          id="skillName"
          type="text"
          value={skillName}
          onChange={e => setSkillName(e.target.value)}
          placeholder="e.g. GitHub PR Reviewer"
          disabled={submitting || paymentSigning}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0052ff] focus:border-transparent disabled:opacity-50 placeholder:text-zinc-400"
        />
      </div>

      {/* SKILL.md content */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="skillContent" className="text-sm font-medium text-zinc-700">
          SKILL.md content <span className="text-red-500">*</span>
        </label>
        <textarea
          id="skillContent"
          value={skillContent}
          onChange={e => setSkillContent(e.target.value)}
          placeholder={PLACEHOLDER}
          disabled={submitting || paymentSigning}
          rows={16}
          className="rounded-lg border border-zinc-200 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0052ff] focus:border-transparent disabled:opacity-50 placeholder:text-zinc-400 resize-y leading-relaxed"
        />
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Paste the raw SKILL.md file content above</span>
          <span className={isOverLimit ? 'text-red-500' : ''}>
            {charCount.toLocaleString()} / 500,000 chars
          </span>
        </div>
      </div>

      {/* Tier selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-zinc-700">Audit Tier</label>
        <div className="grid grid-cols-2 gap-3">
          {/* Free tier */}
          <button
            type="button"
            onClick={() => { setTier('free'); setPendingPayment(null) }}
            className={`rounded-lg border p-4 text-left transition-colors ${
              tier === 'free'
                ? 'border-[#0052ff] bg-[#0052ff] text-white'
                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Free</p>
              {quota && tier === 'free' && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  quota.exhausted
                    ? tier === 'free' ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-600'
                    : tier === 'free' ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500'
                }`}>
                  {quota.exhausted ? '$0.10/check' : `${quota.remaining}/${quota.total} left`}
                </span>
              )}
            </div>
            <p className={`text-xs mt-0.5 ${tier === 'free' ? 'text-zinc-300' : 'text-zinc-400'}`}>
              LLM audit · no onchain stamp
            </p>
          </button>

          {/* Pro tier */}
          <button
            type="button"
            onClick={() => setTier('pro')}
            className={`rounded-lg border p-4 text-left transition-colors ${
              tier === 'pro'
                ? 'border-[#0052ff] bg-[#0052ff] text-white'
                : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Pro</p>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                tier === 'pro' ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500'
              }`}>
                $1.00 USDC
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${tier === 'pro' ? 'text-zinc-300' : 'text-zinc-400'}`}>
              Full audit · onchain stamp · ENS subname
            </p>
          </button>
        </div>

        {/* Contextual hint below tier selector */}
        {tier === 'free' && quota && (
          quota.exhausted ? (
            <p className="text-xs text-orange-600 mt-0.5">
              Monthly free quota used ({quota.used}/{quota.total}).
              Each additional check costs $0.10 USDC on Base — just a signature, no gas.
              Resets {new Date(quota.resetAt).toLocaleDateString()}.
            </p>
          ) : (
            <p className="text-xs text-zinc-400 mt-0.5">
              {quota.remaining} free {quota.remaining === 1 ? 'check' : 'checks'} remaining this month.
              After that, $0.10 USDC per check.
            </p>
          )
        )}
        {tier === 'pro' && (
          <p className="text-xs text-zinc-400 mt-0.5">
            Pro audits write a tamper-proof stamp to Base and register an ENS subname.
            $1.00 USDC — just a signature, no gas from your wallet.
          </p>
        )}
      </div>

      {/* World ID verification — optional */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-zinc-700">
            Human Verification
            <span className="ml-2 text-[10px] font-normal text-zinc-400 uppercase tracking-wide">optional</span>
          </p>
          <p className="text-xs text-zinc-400">
            Verify with World ID to unlock a higher free quota. You can skip this and submit directly.
          </p>
        </div>
        {worldIdProof ? (
          <WorldIDVerificationBadge nullifierHash={worldIdProof.nullifier_hash} />
        ) : (
          <WorldIDVerifier
            onSuccess={(proof) => setWorldIdProof(proof)}
            label="Verify with World ID"
          />
        )}
      </div>

      {/* x402 Payment prompt — shown when server returns 402 */}
      {pendingPayment && (
        <div className={`rounded-lg border p-4 flex flex-col gap-3 ${
          freeTierNeedsPayment || tier === 'free'
            ? 'border-orange-200 bg-orange-50'
            : 'border-[#0052ff] bg-[#eff4ff]'
        }`}>
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              {tier === 'pro' ? 'Payment Required — Pro Audit' : 'Payment Required — Quota Exceeded'}
            </p>
            <p className="text-xs text-zinc-600 mt-0.5">
              {tier === 'pro'
                ? `This Pro audit costs `
                : `Your monthly free quota is used. This check costs `}
              <span className={`font-semibold ${tier === 'pro' ? 'text-[#0052ff]' : 'text-orange-600'}`}>
                {paymentAmountDisplay} USDC
              </span>
              {' '}on Base. Your wallet will sign an EIP-3009 authorization — no gas required.
            </p>
          </div>

          {wallets[0] && (
            <p className="text-xs text-zinc-500 font-mono truncate">
              Wallet: {wallets[0].address}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleAuthorizePayment}
              disabled={paymentSigning || !wallets[0]}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 ${
                tier === 'pro' ? 'bg-[#0052ff] hover:bg-[#0040cc]' : 'bg-orange-500 hover:bg-orange-600'
              }`}
            >
              {paymentSigning ? (
                <><Spinner /> Signing…</>
              ) : (
                `Authorize ${paymentAmountDisplay} USDC`
              )}
            </button>
            <button
              type="button"
              onClick={() => { setPendingPayment(null); setError(null) }}
              disabled={paymentSigning}
              className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
          </div>

          {!wallets[0] && (
            <p className="text-xs text-red-600">
              No wallet connected. Sign in with a wallet to pay.
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Submit */}
      {!pendingPayment && (
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={submitting || !skillContent.trim() || isOverLimit}
            className="rounded-lg bg-[#0052ff] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#0040cc] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? (
              <><Spinner />Submitting…</>
            ) : (
              freeTierNeedsPayment ? 'Submit for Audit ($0.10 USDC)' : 'Submit for Audit'
            )}
          </button>
          {submitting && (
            <p className="text-sm text-zinc-500">Analysis takes 30–90 seconds…</p>
          )}
        </div>
      )}
    </form>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
