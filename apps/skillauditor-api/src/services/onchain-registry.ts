import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type Address,
  type Chain,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia, base } from 'viem/chains'
import type {
  IOnchainRegistry,
  RecordStampParams,
  OnchainStamp,
} from '@skillauditor/skill-types'

// ── ABI (only the functions we call) ──────────────────────────────────────────
const SKILL_REGISTRY_ABI = [
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
] as const

// ── Verdict mapping (API strings → contract uint8) ─────────────────────────────
const VERDICT_TO_UINT8: Record<string, number> = {
  unsafe:           0,
  review_required:  1,
  safe:             2,
}

const ZERO_BYTES32 = `0x${'00'.repeat(32)}` as Hex

// ── Config ─────────────────────────────────────────────────────────────────────

function getConfig() {
  const chainId  = Number(process.env.SKILL_REGISTRY_CHAIN_ID ?? '84532')
  const chain: Chain = chainId === 8453 ? base : baseSepolia
  const rpcUrl   = chainId === 8453
    ? (process.env.BASE_MAINNET_RPC_URL ?? 'https://mainnet.base.org')
    : (process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org')
  const addr     = (process.env.SKILL_REGISTRY_ADDRESS ?? '') as Address
  const pk       = (process.env.AUDITOR_AGENT_PRIVATE_KEY ?? '') as Hex | ''
  return { chainId, chain, rpcUrl, contractAddress: addr, privateKey: pk || null }
}

// Build clients fresh each call — lazy, avoids startup failures when env not yet set.
// viem clients are lightweight; the HTTP transport pools connections.
function makePublicClient() {
  const { chain, rpcUrl } = getConfig()
  return createPublicClient({ chain, transport: http(rpcUrl) })
}

function makeWalletClient() {
  const { chain, rpcUrl, privateKey } = getConfig()
  if (!privateKey) throw new Error('AUDITOR_AGENT_PRIVATE_KEY is not set')
  const account = privateKeyToAccount(privateKey)
  return createWalletClient({ account, chain, transport: http(rpcUrl) })
}

function getContractAddress(): Address {
  const { contractAddress } = getConfig()
  if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error('SKILL_REGISTRY_ADDRESS is not set')
  }
  return contractAddress
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toBytes32(hex: string): Hex {
  const clean = hex.startsWith('0x') ? hex : `0x${hex}`
  if (clean.length !== 66) throw new Error(`Invalid bytes32: ${hex}`)
  return clean as Hex
}

/**
 * Convert an IPFS CIDv1 sha2-256 to bytes32 by extracting the raw 32-byte digest.
 * Returns bytes32(0) when cid is empty (IPFS not yet wired).
 */
function cidToBytes32(cid: string): Hex {
  if (!cid) return ZERO_BYTES32
  // CIDv1 hex with 0x1220 prefix: strip header and take the 32-byte sha256 digest
  const hex = cid.startsWith('0x1220') ? cid.slice(6) : null
  if (hex && hex.length === 64) return `0x${hex}` as Hex
  return ZERO_BYTES32
}

// ── IOnchainRegistry implementation ───────────────────────────────────────────

export const onchainRegistry: IOnchainRegistry = {

  async checkStampByHash(hash: string): Promise<OnchainStamp | null> {
    try {
      const stamp = await makePublicClient().readContract({
        address:      getContractAddress(),
        abi:          SKILL_REGISTRY_ABI,
        functionName: 'getStamp',
        args:         [toBytes32(hash)],
      })

      if (!stamp.timestamp || stamp.timestamp === BigInt(0)) return null

      const { chainId, contractAddress } = getConfig()
      return {
        txHash:          '',
        chainId,
        contractAddress,
        ensSubname:      '',
        ipfsCid:         stamp.reportCid !== ZERO_BYTES32 ? stamp.reportCid : '',
      }
    } catch (err) {
      console.error('[onchain-registry] checkStampByHash error:', err)
      return null
    }
  },

  async isVerified(skillHash: string): Promise<boolean> {
    try {
      return await makePublicClient().readContract({
        address:      getContractAddress(),
        abi:          SKILL_REGISTRY_ABI,
        functionName: 'isVerified',
        args:         [toBytes32(skillHash)],
      })
    } catch (err) {
      console.error('[onchain-registry] isVerified error:', err)
      return false
    }
  },

  async recordStamp(params: RecordStampParams): Promise<{ txHash: string }> {
    const verdictUint = VERDICT_TO_UINT8[params.verdict]
    if (verdictUint === undefined) throw new Error(`Unknown verdict: ${params.verdict}`)

    const skillHashBytes32 = toBytes32(params.skillHash)
    const reportCidBytes32 = cidToBytes32(params.reportCid ?? '')
    const scoreUint        = Math.max(0, Math.min(100, Math.round(params.score))) as number

    const walletClient = makeWalletClient()
    const publicClient = makePublicClient()
    const address      = getContractAddress()

    console.log(
      `[onchain-registry] recordStamp hash=${params.skillHash.slice(0, 10)}… ` +
      `verdict=${params.verdict}(${verdictUint}) score=${scoreUint}`,
    )

    const txHash = await walletClient.writeContract({
      address,
      abi:          SKILL_REGISTRY_ABI,
      functionName: 'recordStamp',
      args:         [skillHashBytes32, verdictUint, scoreUint, reportCidBytes32],
    })

    console.log(`[onchain-registry] tx submitted: ${txHash}`)

    const receipt = await publicClient.waitForTransactionReceipt({
      hash:            txHash,
      confirmations:   1,
      pollingInterval: 2_000,
      timeout:         60_000,
    })

    if (receipt.status !== 'success') {
      throw new Error(`recordStamp tx reverted: ${txHash}`)
    }

    console.log(`[onchain-registry] confirmed in block ${receipt.blockNumber}`)
    return { txHash }
  },

  async revokeStamp(skillHash: string): Promise<{ txHash: string }> {
    const walletClient = makeWalletClient()
    const publicClient = makePublicClient()
    const address      = getContractAddress()

    const txHash = await walletClient.writeContract({
      address,
      abi:          SKILL_REGISTRY_ABI,
      functionName: 'revokeStamp',
      args:         [toBytes32(skillHash)],
    })

    await publicClient.waitForTransactionReceipt({
      hash:            txHash,
      confirmations:   1,
      pollingInterval: 2_000,
      timeout:         60_000,
    })

    return { txHash }
  },
}
