import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillRegistryClient, VERDICT_TO_UINT8, UINT8_TO_VERDICT, ZERO_BYTES32 } from './index.js'

// ── Mock viem ─────────────────────────────────────────────────────────────────
// We replace createPublicClient and createWalletClient so no live RPC is needed.

const mockReadContract  = vi.fn()
const mockWriteContract = vi.fn()
const mockWaitForTxReceipt = vi.fn()

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>()
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract:               mockReadContract,
      waitForTransactionReceipt:  mockWaitForTxReceipt,
    })),
    createWalletClient: vi.fn(() => ({
      writeContract: mockWriteContract,
    })),
  }
})

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({ address: '0xAuditor' })),
}))

vi.mock('viem/chains', () => ({
  baseSepolia: { id: 84532, name: 'Base Sepolia' },
  base:        { id: 8453,  name: 'Base'         },
}))

// ── Test fixtures ────────────────────────────────────────────────────────────

const CONTRACT  = '0x87C3E6C452585806Ef603a9501eb74Ce740Cafcc' as const
const PK        = `0x${'ab'.repeat(32)}` as const
const HASH_SAFE = `0x${'aa'.repeat(32)}` as const
const HASH_NEW  = `0x${'bb'.repeat(32)}` as const
const TX_HASH   = `0x${'cc'.repeat(32)}` as const

function makeClient(privateKey: string | null = PK) {
  return new SkillRegistryClient({
    contractAddress: CONTRACT,
    chainId:         84532,
    rpcUrl:          'https://sepolia.base.org',
    privateKey:      privateKey as any,
  })
}

const STAMP_SAFE = {
  auditorAddress: '0xAuditor',
  verdict:        2,
  score:          85,
  timestamp:      BigInt(1700000000),
  reportCid:      `0x${'dd'.repeat(32)}`,
  ensNode:        ZERO_BYTES32,
  metadata:       ZERO_BYTES32,
}

const STAMP_EMPTY = {
  auditorAddress: '0x0000000000000000000000000000000000000000',
  verdict:        0,
  score:          0,
  timestamp:      BigInt(0),
  reportCid:      ZERO_BYTES32,
  ensNode:        ZERO_BYTES32,
  metadata:       ZERO_BYTES32,
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockWaitForTxReceipt.mockResolvedValue({ status: 'success', blockNumber: 1n })
})

// ── checkStampByHash ─────────────────────────────────────────────────────────

describe('checkStampByHash', () => {
  it('returns OnchainStamp when stamp exists', async () => {
    mockReadContract.mockResolvedValueOnce(STAMP_SAFE)
    const result = await makeClient().checkStampByHash(HASH_SAFE)
    expect(result).not.toBeNull()
    expect(result!.contractAddress).toBe(CONTRACT)
    expect(result!.chainId).toBe(84532)
  })

  it('returns null when stamp timestamp is 0 (not yet stamped)', async () => {
    mockReadContract.mockResolvedValueOnce(STAMP_EMPTY)
    const result = await makeClient().checkStampByHash(HASH_NEW)
    expect(result).toBeNull()
  })

  it('returns null and logs error on RPC failure', async () => {
    mockReadContract.mockRejectedValueOnce(new Error('rpc error'))
    const result = await makeClient().checkStampByHash(HASH_SAFE)
    expect(result).toBeNull()
  })
})

// ── isVerified ───────────────────────────────────────────────────────────────

describe('isVerified', () => {
  it('returns true when contract returns true', async () => {
    mockReadContract.mockResolvedValueOnce(true)
    expect(await makeClient().isVerified(HASH_SAFE)).toBe(true)
  })

  it('returns false when contract returns false', async () => {
    mockReadContract.mockResolvedValueOnce(false)
    expect(await makeClient().isVerified(HASH_SAFE)).toBe(false)
  })

  it('returns false on RPC failure', async () => {
    mockReadContract.mockRejectedValueOnce(new Error('rpc error'))
    expect(await makeClient().isVerified(HASH_SAFE)).toBe(false)
  })
})

// ── recordStamp ───────────────────────────────────────────────────────────────

describe('recordStamp', () => {
  it('calls writeContract with correct uint8 verdict and returns txHash', async () => {
    mockWriteContract.mockResolvedValueOnce(TX_HASH)
    const result = await makeClient().recordStamp({
      skillHash:  HASH_SAFE,
      verdict:    'safe',
      score:      85,
      reportCid:  '',
      ensSubname: '',
      nullifier:  'nullifier123',
    })
    expect(result.txHash).toBe(TX_HASH)
    expect(mockWriteContract).toHaveBeenCalledOnce()
    const [callArgs] = mockWriteContract.mock.calls
    expect(callArgs[0].functionName).toBe('recordStamp')
    expect(callArgs[0].args[1]).toBe(2) // verdict uint8 for 'safe'
    expect(callArgs[0].args[2]).toBe(85)
  })

  it('maps all verdict strings to correct uint8', async () => {
    for (const [verdict, uint8] of Object.entries(VERDICT_TO_UINT8)) {
      mockWriteContract.mockResolvedValueOnce(TX_HASH)
      await makeClient().recordStamp({
        skillHash: HASH_SAFE, verdict: verdict as any, score: 50,
        reportCid: '', ensSubname: '', nullifier: '',
      })
      const args = mockWriteContract.mock.calls.at(-1)![0].args
      expect(args[1]).toBe(uint8)
    }
  })

  it('clamps score to 0-100', async () => {
    mockWriteContract.mockResolvedValueOnce(TX_HASH)
    await makeClient().recordStamp({
      skillHash: HASH_SAFE, verdict: 'safe', score: 150,
      reportCid: '', ensSubname: '', nullifier: '',
    })
    const args = mockWriteContract.mock.calls[0][0].args
    expect(args[2]).toBe(100)
  })

  it('throws for unknown verdict', async () => {
    await expect(makeClient().recordStamp({
      skillHash: HASH_SAFE, verdict: 'unknown' as any, score: 80,
      reportCid: '', ensSubname: '', nullifier: '',
    })).rejects.toThrow('Unknown verdict')
  })

  it('throws when no privateKey configured', async () => {
    await expect(makeClient(null).recordStamp({
      skillHash: HASH_SAFE, verdict: 'safe', score: 80,
      reportCid: '', ensSubname: '', nullifier: '',
    })).rejects.toThrow('privateKey is required')
  })

  it('throws when tx reverts', async () => {
    mockWriteContract.mockResolvedValueOnce(TX_HASH)
    mockWaitForTxReceipt.mockResolvedValueOnce({ status: 'reverted', blockNumber: 1n })
    await expect(makeClient().recordStamp({
      skillHash: HASH_SAFE, verdict: 'safe', score: 80,
      reportCid: '', ensSubname: '', nullifier: '',
    })).rejects.toThrow('Transaction reverted')
  })
})

// ── revokeStamp ───────────────────────────────────────────────────────────────

describe('revokeStamp', () => {
  it('calls revokeStamp on contract and returns txHash', async () => {
    mockWriteContract.mockResolvedValueOnce(TX_HASH)
    const result = await makeClient().revokeStamp(HASH_SAFE)
    expect(result.txHash).toBe(TX_HASH)
    expect(mockWriteContract.mock.calls[0][0].functionName).toBe('revokeStamp')
    expect(mockWriteContract.mock.calls[0][0].args[0]).toBe(HASH_SAFE)
  })
})

// ── updateEnsNode ─────────────────────────────────────────────────────────────

describe('updateEnsNode', () => {
  it('calls updateEnsNode on contract and returns txHash', async () => {
    mockWriteContract.mockResolvedValueOnce(TX_HASH)
    const ensNode = `0x${'ee'.repeat(32)}`
    const result = await makeClient().updateEnsNode(HASH_SAFE, ensNode)
    expect(result.txHash).toBe(TX_HASH)
    const call = mockWriteContract.mock.calls[0][0]
    expect(call.functionName).toBe('updateEnsNode')
    expect(call.args[0]).toBe(HASH_SAFE)
    expect(call.args[1]).toBe(ensNode)
  })
})

// ── getRawStamp ────────────────────────────────────────────────────────────────

describe('getRawStamp', () => {
  it('returns stamp when timestamp > 0', async () => {
    mockReadContract.mockResolvedValueOnce(STAMP_SAFE)
    const stamp = await makeClient().getRawStamp(HASH_SAFE)
    expect(stamp).not.toBeNull()
    expect(stamp!.verdict).toBe(2)
    expect(stamp!.score).toBe(85)
  })

  it('returns null when timestamp is 0', async () => {
    mockReadContract.mockResolvedValueOnce(STAMP_EMPTY)
    expect(await makeClient().getRawStamp(HASH_NEW)).toBeNull()
  })
})

// ── totalStamped ──────────────────────────────────────────────────────────────

describe('totalStamped', () => {
  it('returns total as a number', async () => {
    mockReadContract.mockResolvedValueOnce(42n)
    expect(await makeClient().totalStamped()).toBe(42)
  })
})

// ── getStampedHashes ──────────────────────────────────────────────────────────

describe('getStampedHashes', () => {
  it('returns array of hashes', async () => {
    const hashes = [HASH_SAFE, HASH_NEW]
    mockReadContract.mockResolvedValueOnce(hashes)
    const result = await makeClient().getStampedHashes(0, 10)
    expect(result).toEqual(hashes)
  })

  it('returns empty array when no stamps', async () => {
    mockReadContract.mockResolvedValueOnce([])
    expect(await makeClient().getStampedHashes(0, 10)).toEqual([])
  })
})

// ── Constants ─────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('VERDICT_TO_UINT8 maps all three verdicts', () => {
    expect(VERDICT_TO_UINT8['unsafe']).toBe(0)
    expect(VERDICT_TO_UINT8['review_required']).toBe(1)
    expect(VERDICT_TO_UINT8['safe']).toBe(2)
  })

  it('UINT8_TO_VERDICT inverts VERDICT_TO_UINT8', () => {
    for (const [str, num] of Object.entries(VERDICT_TO_UINT8)) {
      expect(UINT8_TO_VERDICT[num]).toBe(str)
    }
  })

  it('ZERO_BYTES32 is 66 chars and all zeros', () => {
    expect(ZERO_BYTES32).toMatch(/^0x0{64}$/)
  })
})
