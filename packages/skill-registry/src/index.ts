/**
 * @skillauditor/skill-registry
 *
 * TypeScript client for the SkillRegistry.sol smart contract.
 * Wraps viem read/write calls behind a clean interface.
 *
 * Used by:
 *   - apps/skillauditor-api/src/services/onchain-registry.ts
 *   - Any consumer that needs to read/write stamps from SkillRegistry
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type Address,
  type Chain,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia, base } from 'viem/chains'
import type { IOnchainRegistry, RecordStampParams, OnchainStamp } from '@skillauditor/skill-types'

// ── ABI ───────────────────────────────────────────────────────────────────────

export const SKILL_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'recordStamp',
    inputs: [
      { name: 'skillHash', type: 'bytes32' },
      { name: 'verdict',   type: 'uint8'   },
      { name: 'score',     type: 'uint8'   },
      { name: 'reportCid', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'updateEnsNode',
    inputs: [
      { name: 'skillHash', type: 'bytes32' },
      { name: 'ensNode',   type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'revokeStamp',
    inputs: [{ name: 'skillHash', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getStamp',
    inputs: [{ name: 'skillHash', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'auditorAddress', type: 'address' },
          { name: 'verdict',        type: 'uint8'   },
          { name: 'score',          type: 'uint8'   },
          { name: 'timestamp',      type: 'uint64'  },
          { name: 'reportCid',      type: 'bytes32' },
          { name: 'ensNode',        type: 'bytes32' },
          { name: 'metadata',       type: 'bytes32' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isVerified',
    inputs: [{ name: 'skillHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'hasStamp',
    inputs: [{ name: 'skillHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalStamped',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getStampedHashes',
    inputs: [
      { name: 'offset', type: 'uint256' },
      { name: 'limit',  type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32[]' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'SkillAudited',
    inputs: [
      { name: 'skillHash', type: 'bytes32', indexed: true  },
      { name: 'auditor',   type: 'address', indexed: true  },
      { name: 'verdict',   type: 'uint8',   indexed: false },
      { name: 'score',     type: 'uint8',   indexed: false },
      { name: 'timestamp', type: 'uint64',  indexed: false },
    ],
  },
] as const

// ── Types ────────────────────────────────────────────────────────────────────

export interface SkillRegistryConfig {
  /** 0x-prefixed contract address. */
  contractAddress: Address
  /** Chain ID: 84532 = Base Sepolia, 8453 = Base Mainnet. */
  chainId?: number
  /** RPC URL — defaults to public Base Sepolia/Mainnet endpoint. */
  rpcUrl?: string
  /** 0x-prefixed private key for write operations. Required for write methods. */
  privateKey?: Hex | null
}

export interface RawAuditStamp {
  auditorAddress: Address
  verdict:        number
  score:          number
  timestamp:      bigint
  reportCid:      Hex
  ensNode:        Hex
  metadata:       Hex
}

// ── Constants ────────────────────────────────────────────────────────────────

const ZERO_BYTES32 = `0x${'00'.repeat(32)}` as Hex

const VERDICT_TO_UINT8: Record<string, number> = {
  unsafe:           0,
  review_required:  1,
  safe:             2,
}

const UINT8_TO_VERDICT: Record<number, string> = {
  0: 'unsafe',
  1: 'review_required',
  2: 'safe',
}

// ── SkillRegistryClient ────────────────────────────────────────────────────────

export class SkillRegistryClient implements IOnchainRegistry {
  private readonly config: Required<SkillRegistryConfig>
  private readonly chain: Chain

  constructor(config: SkillRegistryConfig) {
    const chainId = config.chainId ?? 84532
    const chain   = chainId === 8453 ? base : baseSepolia
    const rpcUrl  = config.rpcUrl ?? (
      chainId === 8453
        ? 'https://mainnet.base.org'
        : 'https://sepolia.base.org'
    )
    this.chain  = chain
    this.config = {
      contractAddress: config.contractAddress,
      chainId,
      rpcUrl,
      privateKey: config.privateKey ?? null,
    }
  }

  // ── Factories ─────────────────────────────────────────────────────────────

  private publicClient(): PublicClient {
    return createPublicClient({
      chain:     this.chain,
      transport: http(this.config.rpcUrl),
    }) as PublicClient
  }

  private walletClient(): WalletClient {
    if (!this.config.privateKey) {
      throw new Error('SkillRegistryClient: privateKey is required for write operations')
    }
    const account = privateKeyToAccount(this.config.privateKey)
    return createWalletClient({
      account,
      chain:     this.chain,
      transport: http(this.config.rpcUrl),
    })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private toBytes32(hex: string): Hex {
    const clean = hex.startsWith('0x') ? hex : `0x${hex}`
    if (clean.length !== 66) throw new Error(`Invalid bytes32: ${hex}`)
    return clean as Hex
  }

  /** Strip the 0x1220 CIDv1 multihash prefix to extract the raw sha256 digest. */
  private cidToBytes32(cid: string): Hex {
    if (!cid) return ZERO_BYTES32
    const hex = cid.startsWith('0x1220') ? cid.slice(6) : null
    if (hex && hex.length === 64) return `0x${hex}` as Hex
    return ZERO_BYTES32
  }

  private async waitForReceipt(txHash: Hex): Promise<void> {
    const receipt = await this.publicClient().waitForTransactionReceipt({
      hash:            txHash,
      confirmations:   1,
      pollingInterval: 2_000,
      timeout:         60_000,
    })
    if (receipt.status !== 'success') {
      throw new Error(`Transaction reverted: ${txHash}`)
    }
  }

  // ── IOnchainRegistry impl ────────────────────────────────────────────────

  async checkStampByHash(hash: string): Promise<OnchainStamp | null> {
    try {
      const stamp = await this.publicClient().readContract({
        address:      this.config.contractAddress,
        abi:          SKILL_REGISTRY_ABI,
        functionName: 'getStamp',
        args:         [this.toBytes32(hash)],
      }) as RawAuditStamp

      if (!stamp.timestamp || stamp.timestamp === BigInt(0)) return null

      return {
        txHash:          '',
        chainId:         this.config.chainId,
        contractAddress: this.config.contractAddress,
        ensSubname:      '',
        ipfsCid:         stamp.reportCid !== ZERO_BYTES32 ? stamp.reportCid : '',
      }
    } catch (err) {
      console.error('[skill-registry] checkStampByHash error:', err)
      return null
    }
  }

  async isVerified(skillHash: string): Promise<boolean> {
    try {
      return await this.publicClient().readContract({
        address:      this.config.contractAddress,
        abi:          SKILL_REGISTRY_ABI,
        functionName: 'isVerified',
        args:         [this.toBytes32(skillHash)],
      }) as boolean
    } catch (err) {
      console.error('[skill-registry] isVerified error:', err)
      return false
    }
  }

  async recordStamp(params: RecordStampParams): Promise<{ txHash: string }> {
    const verdictUint = VERDICT_TO_UINT8[params.verdict]
    if (verdictUint === undefined) throw new Error(`Unknown verdict: ${params.verdict}`)

    const skillHashBytes32 = this.toBytes32(params.skillHash)
    const reportCidBytes32 = this.cidToBytes32(params.reportCid ?? '')
    const scoreUint        = Math.max(0, Math.min(100, Math.round(params.score)))

    const account  = privateKeyToAccount(this.config.privateKey!)
    const wallet   = this.walletClient()
    const address  = this.config.contractAddress

    console.log(
      `[skill-registry] recordStamp hash=${params.skillHash.slice(0, 10)}… ` +
      `verdict=${params.verdict}(${verdictUint}) score=${scoreUint}`,
    )

    const txHash = await wallet.writeContract({
      address,
      abi:          SKILL_REGISTRY_ABI,
      functionName: 'recordStamp',
      args:         [skillHashBytes32, verdictUint, scoreUint, reportCidBytes32],
      account,
      chain:        this.chain,
    })

    console.log(`[skill-registry] tx submitted: ${txHash}`)
    await this.waitForReceipt(txHash)
    console.log(`[skill-registry] recordStamp confirmed`)
    return { txHash }
  }

  async revokeStamp(skillHash: string): Promise<{ txHash: string }> {
    const account = privateKeyToAccount(this.config.privateKey!)
    const wallet  = this.walletClient()
    const txHash  = await wallet.writeContract({
      address:      this.config.contractAddress,
      abi:          SKILL_REGISTRY_ABI,
      functionName: 'revokeStamp',
      args:         [this.toBytes32(skillHash)],
      account,
      chain:        this.chain,
    })
    await this.waitForReceipt(txHash)
    return { txHash }
  }

  /** Backfill ENS node after SkillSubnameRegistrar registers the subname. */
  async updateEnsNode(skillHash: string, ensNode: string): Promise<{ txHash: string }> {
    const account = privateKeyToAccount(this.config.privateKey!)
    const wallet  = this.walletClient()
    const txHash  = await wallet.writeContract({
      address:      this.config.contractAddress,
      abi:          SKILL_REGISTRY_ABI,
      functionName: 'updateEnsNode',
      args:         [this.toBytes32(skillHash), this.toBytes32(ensNode)],
      account,
      chain:        this.chain,
    })
    await this.waitForReceipt(txHash)
    return { txHash }
  }

  /** Raw stamp read — returns null if no stamp exists. */
  async getRawStamp(skillHash: string): Promise<RawAuditStamp | null> {
    const stamp = await this.publicClient().readContract({
      address:      this.config.contractAddress,
      abi:          SKILL_REGISTRY_ABI,
      functionName: 'getStamp',
      args:         [this.toBytes32(skillHash)],
    }) as RawAuditStamp

    if (!stamp.timestamp || stamp.timestamp === BigInt(0)) return null
    return stamp
  }

  /** Returns the total number of uniquely-stamped skills. */
  async totalStamped(): Promise<number> {
    const total = await this.publicClient().readContract({
      address:      this.config.contractAddress,
      abi:          SKILL_REGISTRY_ABI,
      functionName: 'totalStamped',
    }) as bigint
    return Number(total)
  }

  /** Paginated list of stamped skill hashes. */
  async getStampedHashes(offset: number, limit: number): Promise<string[]> {
    const hashes = await this.publicClient().readContract({
      address:      this.config.contractAddress,
      abi:          SKILL_REGISTRY_ABI,
      functionName: 'getStampedHashes',
      args:         [BigInt(offset), BigInt(limit)],
    }) as Hex[]
    return hashes
  }
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export { VERDICT_TO_UINT8, UINT8_TO_VERDICT, ZERO_BYTES32 }
export type { IOnchainRegistry, RecordStampParams, OnchainStamp }
