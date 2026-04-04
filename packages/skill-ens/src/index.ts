/**
 * @skillauditor/skill-ens
 *
 * TypeScript client for ENS subname registration and resolution.
 * Registers `{hash8}.skills.auditor.eth` subnames via SkillSubnameRegistrar.sol
 * and reads audit verdicts from ENS text records.
 *
 * Used by:
 *   - apps/skillauditor-api/src/services/ens-registry.ts
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  keccak256,
  toBytes,
  concat,
  type Hex,
  type Address,
  type Chain,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia, base } from 'viem/chains'
import type {
  IENSRegistry,
  VerdictData,
  ENSAuditRecord,
  AuditorMetadata,
} from '@skillauditor/skill-types'

// ── ABIs ─────────────────────────────────────────────────────────────────────

/** Minimal SkillSubnameRegistrar ABI — only the functions we call. */
const REGISTRAR_ABI = [
  {
    type: 'function',
    name: 'registerSubname',
    inputs: [
      { name: 'skillHash', type: 'bytes32' },
      {
        name: 'record',
        type: 'tuple',
        components: [
          { name: 'verdict',   type: 'string' },
          { name: 'score',     type: 'uint8'  },
          { name: 'reportCid', type: 'string' },
          { name: 'skillName', type: 'string' },
          { name: 'auditor',   type: 'string' },
        ],
      },
    ],
    outputs: [
      { name: 'subnameNode', type: 'bytes32' },
      { name: 'ensName',     type: 'string'  },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'resolveSkill',
    inputs: [{ name: 'subnameNode', type: 'bytes32' }],
    outputs: [
      { name: 'verdict',   type: 'string' },
      { name: 'score',     type: 'string' },
      { name: 'reportCid', type: 'string' },
      { name: 'auditedAt', type: 'string' },
      { name: 'auditor',   type: 'string' },
      { name: 'skillName', type: 'string' },
      { name: 'skillHash', type: 'string' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'subnameNodeOf',
    inputs: [{ name: 'skillHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'ensNameOf',
    inputs: [{ name: 'skillHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'pure',
  },
] as const

/** ENS PublicResolver — setText and text() read. */
const RESOLVER_ABI = [
  {
    type: 'function',
    name: 'setText',
    inputs: [
      { name: 'node',  type: 'bytes32' },
      { name: 'key',   type: 'string'  },
      { name: 'value', type: 'string'  },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'text',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key',  type: 'string'  },
    ],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
] as const

// ── Config ───────────────────────────────────────────────────────────────────

export interface SkillENSConfig {
  /** SkillSubnameRegistrar contract address (deployed on same chain as SkillRegistry). */
  registrarAddress?: Address | null
  /** ENS Public Resolver address (for direct text record reads). */
  resolverAddress?: Address | null
  chainId?: number
  rpcUrl?: string
  /** 0x-prefixed private key — required for registerSkillSubname / registerAuditorAgent. */
  privateKey?: Hex | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Compute ENS namehash per ENSIP-1. */
function namehash(name: string): Hex {
  if (!name) return `0x${'00'.repeat(32)}` as Hex
  const labels = name.split('.').reverse()
  let node = new Uint8Array(32)
  for (const label of labels) {
    const labelHash = keccak256(toBytes(label), 'bytes')
    node = keccak256(concat([node, labelHash]), 'bytes')
  }
  return `0x${Buffer.from(node).toString('hex')}` as Hex
}

/** Derive `{hash8}.skills.auditor.eth` ENS name from a skill hash. */
function skillHashToEnsName(skillHash: string): string {
  const clean = skillHash.startsWith('0x') ? skillHash.slice(2) : skillHash
  const h8    = clean.slice(0, 8).toLowerCase()
  return `${h8}.skills.auditor.eth`
}

function toBytes32(hex: string): Hex {
  const clean = hex.startsWith('0x') ? hex : `0x${hex}`
  if (clean.length !== 66) throw new Error(`Invalid bytes32: ${hex}`)
  return clean as Hex
}

// ── SkillENSClient ────────────────────────────────────────────────────────────

export class SkillENSClient implements IENSRegistry {
  private readonly config: SkillENSConfig
  private readonly chain:  Chain

  constructor(config: SkillENSConfig = {}) {
    const chainId = config.chainId ?? 84532
    this.chain  = chainId === 8453 ? base : baseSepolia
    this.config = {
      ...config,
      chainId,
      rpcUrl: config.rpcUrl ?? (
        chainId === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org'
      ),
    }
  }

  private publicClient(): PublicClient {
    return createPublicClient({
      chain:     this.chain,
      transport: http(this.config.rpcUrl),
    }) as PublicClient
  }

  private walletClient(): WalletClient {
    if (!this.config.privateKey) {
      throw new Error('SkillENSClient: privateKey required for write operations')
    }
    return createWalletClient({
      account:   privateKeyToAccount(this.config.privateKey),
      chain:     this.chain,
      transport: http(this.config.rpcUrl),
    })
  }

  private requireRegistrar(): Address {
    if (!this.config.registrarAddress) {
      throw new Error(
        'SkillSubnameRegistrar not deployed — set SKILL_SUBNAME_REGISTRAR_ADDRESS. ' +
        'See BRANCH-PLAN-onchain-identity.md Blocker 1.',
      )
    }
    return this.config.registrarAddress
  }

  // ── IENSRegistry impl ────────────────────────────────────────────────────

  async getSkillENSName(skillHash: string): Promise<string> {
    return skillHashToEnsName(skillHash)
  }

  async registerSkillSubname(skillHash: string, verdictData: VerdictData): Promise<string> {
    const registrar = this.requireRegistrar()
    const wallet    = this.walletClient()
    const public_   = this.publicClient()

    const txHash = await wallet.writeContract({
      address:      registrar,
      abi:          REGISTRAR_ABI,
      functionName: 'registerSubname',
      args: [
        toBytes32(skillHash),
        {
          verdict:   verdictData.verdict,
          score:     Math.max(0, Math.min(100, Math.round(verdictData.score))),
          reportCid: verdictData.reportCid ?? '',
          skillName: verdictData.skillName ?? '',
          auditor:   verdictData.auditorEns ?? '',
        },
      ],
    })

    const receipt = await public_.waitForTransactionReceipt({
      hash:            txHash,
      confirmations:   1,
      pollingInterval: 2_000,
      timeout:         60_000,
    })

    if (receipt.status !== 'success') {
      throw new Error(`registerSubname tx reverted: ${txHash}`)
    }

    // Decode the ensName from the return value via event / return data
    // Fall back to computing locally (matches on-chain logic)
    const ensName = skillHashToEnsName(skillHash)
    console.log(`[skill-ens] registered ${ensName} tx=${txHash}`)
    return ensName
  }

  async resolveSkillVerdict(ensName: string): Promise<ENSAuditRecord | null> {
    const registrar = this.config.registrarAddress
    if (!registrar) return null

    try {
      // Compute the subname node from the skill hash encoded in the ENS name
      // ensName format: "{hash8}.skills.auditor.eth"
      const subnameNode = namehash(ensName)

      const result = await this.publicClient().readContract({
        address:      registrar,
        abi:          REGISTRAR_ABI,
        functionName: 'resolveSkill',
        args:         [subnameNode],
      }) as [string, string, string, string, string, string, string]

      const [verdict, score, reportCid, auditedAt, auditor, skillName] = result
      if (!verdict) return null

      return {
        ensName,
        verdict:    verdict as ENSAuditRecord['verdict'],
        score:      Number(score),
        reportCid:  reportCid ?? '',
        auditedAt:  Number(auditedAt),
        auditorEns: auditor ?? '',
      }
    } catch (err) {
      console.error('[skill-ens] resolveSkillVerdict error:', err)
      return null
    }
  }

  async updateVerdictTextRecords(ensName: string, data: VerdictData): Promise<void> {
    // Text records are set during registerSubname via SkillSubnameRegistrar.
    // Direct resolver updates are only needed if the registrar is not available.
    const resolver = this.config.resolverAddress
    if (!resolver) {
      console.warn('[skill-ens] updateVerdictTextRecords: no resolverAddress configured')
      return
    }

    const node   = namehash(ensName)
    const wallet = this.walletClient()

    const textUpdates: [string, string][] = [
      ['verdict',    data.verdict],
      ['score',      String(data.score)],
      ['report_cid', data.reportCid ?? ''],
      ['audited_at', String(data.auditedAt)],
      ['auditor',    data.auditorEns ?? ''],
      ['skill_name', data.skillName ?? ''],
      ['version',    data.version ?? '1'],
    ]

    for (const [key, value] of textUpdates) {
      const txHash = await wallet.writeContract({
        address:      resolver,
        abi:          RESOLVER_ABI,
        functionName: 'setText',
        args:         [node, key, value],
      })
      await this.publicClient().waitForTransactionReceipt({
        hash: txHash, confirmations: 1, pollingInterval: 2_000, timeout: 60_000,
      })
    }
    console.log(`[skill-ens] updated text records for ${ensName}`)
  }

  async getAuditorENSName(agentAddress: string): Promise<string> {
    return `agent-${agentAddress.slice(2, 10).toLowerCase()}.auditors.auditor.eth`
  }

  async registerAuditorAgent(agentAddress: string, metadata: AuditorMetadata): Promise<string> {
    // AgentKit agent registration via ENS — uses same registrar pattern.
    // For the hackathon, agent names are derived deterministically; a separate
    // AuditorSubnameRegistrar contract would be needed for full on-chain registration.
    // This stub returns the derived name to unblock the API layer.
    console.log('[skill-ens] registerAuditorAgent (stub — on-chain not yet wired):', agentAddress, metadata)
    return this.getAuditorENSName(agentAddress)
  }
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export { namehash, skillHashToEnsName }
export type { IENSRegistry, VerdictData, ENSAuditRecord, AuditorMetadata }
