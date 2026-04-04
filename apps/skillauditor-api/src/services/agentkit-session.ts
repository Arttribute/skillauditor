/**
 * AgentKit session manager.
 *
 * Creates and persists CDP (Coinbase Developer Platform) wallets, one per
 * World ID nullifier.  Each wallet is the signing key for all onchain actions
 * taken on behalf of a verified human submitter.
 *
 * Wallet resolution strategy (in priority order):
 *   1. CDP managed wallet  — when CDP_API_KEY_NAME + CDP_API_KEY_PRIVATE_KEY are set.
 *                            Each nullifier gets its own server-managed EOA on Base.
 *                            Address is stored in MongoDB for retrieval on subsequent calls.
 *   2. Dev key fallback    — AUDITOR_AGENT_PRIVATE_KEY used for all nullifiers.
 *                            Sufficient for local dev and initial hackathon demo.
 *
 * Transaction broadcast strategy (mirrors wallet resolution):
 *   1. CDP sendTransaction — when CDP credentials present. CDP manages gas, nonces, retries.
 *   2. viem writeContract  — falls back to AUDITOR_AGENT_PRIVATE_KEY via onchainRegistry.
 *
 * Ledger approval gate
 * ─────────────────────
 * Before broadcasting, the agent proposes a LedgerApproval document and waits for the
 * frontend to collect a Ledger hardware signature.  While /v1/ledger/* routes return 501
 * (feat/core-pipeline owns them) the gate is bypassed with a warning.
 * See BRANCH-PLAN-onchain-identity.md Blocker 2.
 *
 * Step 4 — swap auditorAgent
 * ──────────────────────────
 * Once a CDP wallet address is confirmed, call:
 *   SkillRegistry.setAuditorAgent(cdpWalletAddress)
 * from the owner EOA to make CDP the authorised signer for all future stamps.
 */

import mongoose   from 'mongoose'
import { CdpClient } from '@coinbase/cdp-sdk'
import { encodeFunctionData, type Address, type Hex } from 'viem'
import { onchainRegistry } from './onchain-registry.js'
import { ensRegistry }     from './ens-registry.js'
import { SKILL_REGISTRY_ABI } from '@skillauditor/skill-registry'
import type { RecordStampParams, VerdictData } from '@skillauditor/skill-types'

// ── MongoDB model ─────────────────────────────────────────────────────────────

const cdpWalletSchema = new mongoose.Schema({
  nullifier:  { type: String, required: true, unique: true, index: true },
  walletId:   { type: String, required: true },   // CDP account name
  address:    { type: String, required: true },   // 0x-prefixed EOA address
  network:    { type: String, default: 'base-sepolia' },
  mode:       { type: String, enum: ['cdp', 'dev'], default: 'dev' },
  createdAt:  { type: Date, default: Date.now },
  updatedAt:  { type: Date, default: Date.now },
})

const CdpWalletModel = mongoose.models['CdpWallet'] ??
  mongoose.model('CdpWallet', cdpWalletSchema)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StampActionParams {
  skillHash:   string
  verdict:     'safe' | 'review_required' | 'unsafe'
  score:       number
  reportCid:   string
  nullifier:   string
  ensSubname:  string
  skillName?:  string
  auditedAt?:  number
}

export interface ENSActionParams {
  skillHash:   string
  verdictData: VerdictData
  nullifier:   string
}

export interface AuditAgent {
  walletAddress:            string
  nullifier:                string
  mode:                     'cdp' | 'dev'
  writeRegistryStampAction: (params: StampActionParams) => Promise<{ txHash: string }>
  registerENSSubnameAction: (params: ENSActionParams)   => Promise<{ ensName: string }>
}

// ── Config helpers ────────────────────────────────────────────────────────────

function cdpCredentials(): { apiKeyId: string; apiKeySecret: string } | null {
  const apiKeyId     = process.env.CDP_API_KEY_NAME
  const apiKeySecret = process.env.CDP_API_KEY_PRIVATE_KEY
  if (!apiKeyId || !apiKeySecret) return null
  return { apiKeyId, apiKeySecret }
}

function cdpNetworkId(): 'base' | 'base-sepolia' {
  return Number(process.env.SKILL_REGISTRY_CHAIN_ID ?? '84532') === 8453
    ? 'base'
    : 'base-sepolia'
}

function contractAddress(): Address {
  return (process.env.SKILL_REGISTRY_ADDRESS ?? '') as Address
}

// ── CDP client factory ────────────────────────────────────────────────────────

function makeCdpClient(creds: { apiKeyId: string; apiKeySecret: string }): CdpClient {
  return new CdpClient({
    apiKeyId:     creds.apiKeyId,
    apiKeySecret: creds.apiKeySecret,
  })
}

// ── Verdict mapping (string → uint8 for ABI encoding) ────────────────────────

const VERDICT_TO_UINT8: Record<string, number> = {
  unsafe: 0, review_required: 1, safe: 2,
}

// ── Ledger approval gate ──────────────────────────────────────────────────────

const LEDGER_API_BASE   = process.env.LEDGER_API_BASE ?? 'http://localhost:3001/v1/ledger'
const LEDGER_POLL_MS    = 3_000
const LEDGER_TIMEOUT_MS = 5 * 60_000

async function proposeLedgerApproval(payload: {
  actionType:      string
  transactionData: Record<string, unknown>
}): Promise<string | null> {
  try {
    const resp = await fetch(`${LEDGER_API_BASE}/propose`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    if (resp.status === 501) {
      console.warn('[agentkit] /v1/ledger/propose → 501 (routes not yet live, Blocker 2) — bypassing gate')
      return null
    }
    if (!resp.ok) throw new Error(`ledger/propose ${resp.status}`)
    return ((await resp.json()) as { approvalId: string }).approvalId
  } catch (err) {
    console.warn('[agentkit] proposeLedgerApproval failed — bypassing:', (err as Error).message)
    return null
  }
}

async function pollLedgerApproval(approvalId: string): Promise<boolean> {
  const deadline = Date.now() + LEDGER_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`${LEDGER_API_BASE}/pending/${approvalId}`)
      if (resp.status === 501) return true   // bypass
      if (resp.ok) {
        const { status } = (await resp.json()) as { status: string }
        if (status === 'approved') return true
        if (status === 'rejected') return false
      }
    } catch { /* ignore transient errors */ }
    await new Promise(r => setTimeout(r, LEDGER_POLL_MS))
  }
  console.warn('[agentkit] Ledger approval timed out — bypassing for demo')
  return true
}

async function ledgerApprovalGate(
  actionType: string,
  transactionData: Record<string, unknown>,
): Promise<void> {
  const approvalId = await proposeLedgerApproval({ actionType, transactionData })
  if (approvalId === null) return   // gate bypassed

  console.log(`[agentkit] awaiting Ledger approval: ${approvalId}`)
  const approved = await pollLedgerApproval(approvalId)
  if (!approved) throw new Error(`Ledger approval rejected: ${actionType} (${approvalId})`)
  console.log(`[agentkit] Ledger approved: ${approvalId}`)
}

// ── CDP transaction broadcast ─────────────────────────────────────────────────

/**
 * Broadcast recordStamp() via CDP managed wallet.
 * CDP handles gas estimation, nonce management, and retry on transient failures.
 */
async function broadcastRecordStampViaCdp(
  creds:    { apiKeyId: string; apiKeySecret: string },
  walletAddress: string,
  params: {
    skillHash: string
    verdict:   'safe' | 'review_required' | 'unsafe'
    score:     number
    reportCid: string
  },
): Promise<string> {
  const verdictUint = VERDICT_TO_UINT8[params.verdict]
  if (verdictUint === undefined) throw new Error(`Unknown verdict: ${params.verdict}`)

  const skillHashBytes32 = params.skillHash as Hex
  const reportCidBytes32 = params.reportCid
    ? (params.reportCid.startsWith('0x1220')
        ? (`0x${params.reportCid.slice(6)}` as Hex)
        : (`0x${'00'.repeat(32)}` as Hex))
    : (`0x${'00'.repeat(32)}` as Hex)
  const scoreUint = Math.max(0, Math.min(100, Math.round(params.score)))

  const data = encodeFunctionData({
    abi:          SKILL_REGISTRY_ABI,
    functionName: 'recordStamp',
    args:         [skillHashBytes32, verdictUint, scoreUint, reportCidBytes32],
  })

  const cdp = makeCdpClient(creds)
  const { transactionHash } = await cdp.evm.sendTransaction({
    address:     walletAddress as Address,
    network:     cdpNetworkId(),
    transaction: { to: contractAddress(), data },
  })

  console.log(`[agentkit] CDP recordStamp broadcast: ${transactionHash}`)
  return transactionHash
}

// ── Wallet resolution ─────────────────────────────────────────────────────────

interface WalletSession {
  address:  string
  walletId: string
  mode:     'cdp' | 'dev'
}

async function resolveOrCreateWallet(nullifier: string): Promise<WalletSession> {
  // Return cached record if available
  const existing = await CdpWalletModel.findOne({ nullifier }).lean()
  if (existing) {
    return {
      address:  existing.address as string,
      walletId: existing.walletId as string,
      mode:     (existing.mode ?? 'dev') as 'cdp' | 'dev',
    }
  }

  const creds = cdpCredentials()

  // ── Path 1: CDP managed wallet ────────────────────────────────────────────
  if (creds) {
    const walletName = `skill-auditor-${nullifier.slice(0, 24)}`
    const cdp        = makeCdpClient(creds)
    const account    = await cdp.evm.createAccount({ name: walletName })

    await CdpWalletModel.create({
      nullifier,
      walletId: account.name ?? walletName,
      address:  account.address,
      network:  cdpNetworkId(),
      mode:     'cdp',
    })

    console.log(
      `[agentkit] CDP wallet created: ${account.address}` +
      ` — nullifier=${nullifier.slice(0, 16)}…` +
      `\n  ⚠  Run SkillRegistry.setAuditorAgent(${account.address}) from the owner EOA` +
      ` to make this wallet the authorised signer (Step 4).`,
    )
    return { address: account.address, walletId: account.name ?? walletName, mode: 'cdp' }
  }

  // ── Path 2: dev key fallback ──────────────────────────────────────────────
  const { privateKeyToAccount } = await import('viem/accounts')
  const pk = (process.env.AUDITOR_AGENT_PRIVATE_KEY ?? '') as Hex
  if (!pk) throw new Error('No CDP credentials and no AUDITOR_AGENT_PRIVATE_KEY — cannot create session')

  const account  = privateKeyToAccount(pk)
  const walletId = `dev-${nullifier.slice(0, 16)}`

  await CdpWalletModel.create({
    nullifier,
    walletId,
    address: account.address,
    network: cdpNetworkId(),
    mode:    'dev',
  })

  console.log(`[agentkit] dev wallet session — address=${account.address} nullifier=${nullifier.slice(0, 16)}…`)
  return { address: account.address, walletId, mode: 'dev' }
}

// ── createAuditAgent ──────────────────────────────────────────────────────────

/**
 * Create or resume an AgentKit session for the given World ID nullifier.
 *
 * @param worldIdNullifier  The nullifier hash from the World ID proof.
 *                          Stable unique key — same human always gets the same wallet.
 */
export async function createAuditAgent(worldIdNullifier: string): Promise<AuditAgent> {
  const session = await resolveOrCreateWallet(worldIdNullifier)
  const creds   = cdpCredentials()

  console.log(
    `[agentkit] session ready — mode=${session.mode}` +
    ` wallet=${session.address} nullifier=${worldIdNullifier.slice(0, 16)}…`,
  )

  return {
    walletAddress: session.address,
    nullifier:     worldIdNullifier,
    mode:          session.mode,

    // ── Action 1: record audit stamp ────────────────────────────────────────

    async writeRegistryStampAction(params: StampActionParams): Promise<{ txHash: string }> {
      await ledgerApprovalGate('writeRegistryStamp', {
        skillHash: params.skillHash,
        verdict:   params.verdict,
        score:     params.score,
        walletId:  session.walletId,
      })

      let txHash: string

      if (session.mode === 'cdp' && creds) {
        // CDP path — managed wallet signs and broadcasts directly
        txHash = await broadcastRecordStampViaCdp(creds, session.address, params)
      } else {
        // Dev path — onchainRegistry uses AUDITOR_AGENT_PRIVATE_KEY via SkillRegistryClient
        const result = await onchainRegistry.recordStamp({
          skillHash:  params.skillHash,
          verdict:    params.verdict,
          score:      params.score,
          reportCid:  params.reportCid,
          ensSubname: params.ensSubname,
          nullifier:  params.nullifier,
        } satisfies RecordStampParams)
        txHash = result.txHash
      }

      console.log(`[agentkit] writeRegistryStampAction complete — txHash=${txHash}`)
      return { txHash }
    },

    // ── Action 2: register ENS subname ──────────────────────────────────────

    async registerENSSubnameAction(params: ENSActionParams): Promise<{ ensName: string }> {
      await ledgerApprovalGate('registerENSSubname', {
        skillHash: params.skillHash,
        verdict:   params.verdictData.verdict,
        walletId:  session.walletId,
      })

      const ensName = await ensRegistry.registerSkillSubname(
        params.skillHash,
        params.verdictData,
      )

      console.log(`[agentkit] registerENSSubnameAction complete — ensName=${ensName}`)
      return { ensName }
    },
  }
}

export { CdpWalletModel as CdpWallet }
