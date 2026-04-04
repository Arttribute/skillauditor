import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillENSClient, namehash, skillHashToEnsName } from './index.js'

// ── Mock viem ─────────────────────────────────────────────────────────────────

const mockReadContract     = vi.fn()
const mockWriteContract    = vi.fn()
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
  privateKeyToAccount: vi.fn(() => ({ address: '0xAuditorAgent' })),
}))

vi.mock('viem/chains', () => ({
  baseSepolia: { id: 84532, name: 'Base Sepolia' },
  base:        { id: 8453,  name: 'Base'         },
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REGISTRAR = '0xRegistrar0000000000000000000000000000000' as const
const RESOLVER  = '0xResolver00000000000000000000000000000000' as const
const PK        = `0x${'ab'.repeat(32)}` as const
const TX_HASH   = `0x${'cc'.repeat(32)}` as const

// A real skill hash: 32 bytes hex
const SKILL_HASH = `0xaabbccdd${'00'.repeat(28)}` as const

function makeClient(opts: { registrar?: string | null; resolver?: string | null } = {}) {
  return new SkillENSClient({
    registrarAddress: (opts.registrar ?? REGISTRAR) as any,
    resolverAddress:  (opts.resolver  ?? RESOLVER)  as any,
    chainId:          84532,
    rpcUrl:           'https://sepolia.base.org',
    privateKey:       PK,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockWaitForTxReceipt.mockResolvedValue({ status: 'success', blockNumber: 1n })
})

// ── namehash utility ──────────────────────────────────────────────────────────

describe('namehash', () => {
  it('returns 32 zero bytes for empty string', () => {
    expect(namehash('')).toBe(`0x${'00'.repeat(32)}`)
  })

  it('is deterministic', () => {
    const a = namehash('skills.auditor.eth')
    const b = namehash('skills.auditor.eth')
    expect(a).toBe(b)
  })

  it('produces different hashes for different names', () => {
    expect(namehash('foo.eth')).not.toBe(namehash('bar.eth'))
  })

  it('returns a 0x-prefixed 32-byte hex string', () => {
    const h = namehash('auditor.eth')
    expect(h).toMatch(/^0x[0-9a-f]{64}$/)
  })
})

// ── skillHashToEnsName ────────────────────────────────────────────────────────

describe('skillHashToEnsName', () => {
  it('returns {first8hex}.skills.auditor.eth', () => {
    const name = skillHashToEnsName(SKILL_HASH)
    expect(name).toBe('aabbccdd.skills.auditor.eth')
  })

  it('strips 0x prefix before taking first 8 chars', () => {
    const name = skillHashToEnsName('0x1234567890abcdef' + '00'.repeat(24))
    expect(name).toBe('12345678.skills.auditor.eth')
  })

  it('lowercases the hex fragment', () => {
    const name = skillHashToEnsName('0xAABBCCDD' + '00'.repeat(28))
    expect(name).toBe('aabbccdd.skills.auditor.eth')
  })
})

// ── getSkillENSName ────────────────────────────────────────────────────────────

describe('getSkillENSName', () => {
  it('delegates to skillHashToEnsName', async () => {
    const name = await makeClient().getSkillENSName(SKILL_HASH)
    expect(name).toBe('aabbccdd.skills.auditor.eth')
  })
})

// ── registerSkillSubname ──────────────────────────────────────────────────────

describe('registerSkillSubname', () => {
  const verdictData = {
    verdict:    'safe' as const,
    score:      85,
    reportCid:  '',
    auditedAt:  1700000000,
    auditorEns: 'agent-aabbccdd.auditors.auditor.eth',
    skillName:  'My Skill',
    version:    '1',
  }

  it('calls registerSubname on registrar contract and returns ENS name', async () => {
    mockWriteContract.mockResolvedValueOnce(TX_HASH)
    const result = await makeClient().registerSkillSubname(SKILL_HASH, verdictData)
    expect(result).toBe('aabbccdd.skills.auditor.eth')
    expect(mockWriteContract).toHaveBeenCalledOnce()
    const call = mockWriteContract.mock.calls[0][0]
    expect(call.functionName).toBe('registerSubname')
    expect(call.args[0]).toBe(SKILL_HASH)
    expect(call.args[1].verdict).toBe('safe')
    expect(call.args[1].score).toBe(85)
  })

  it('throws when registrar address not configured', async () => {
    await expect(
      makeClient({ registrar: null }).registerSkillSubname(SKILL_HASH, verdictData)
    ).rejects.toThrow('SkillSubnameRegistrar not deployed')
  })

  it('throws when tx reverts', async () => {
    mockWriteContract.mockResolvedValueOnce(TX_HASH)
    mockWaitForTxReceipt.mockResolvedValueOnce({ status: 'reverted', blockNumber: 1n })
    await expect(
      makeClient().registerSkillSubname(SKILL_HASH, verdictData)
    ).rejects.toThrow('registerSubname tx reverted')
  })

  it('clamps score to 0-100', async () => {
    mockWriteContract.mockResolvedValueOnce(TX_HASH)
    await makeClient().registerSkillSubname(SKILL_HASH, { ...verdictData, score: 200 })
    const call = mockWriteContract.mock.calls[0][0]
    expect(call.args[1].score).toBe(100)
  })
})

// ── resolveSkillVerdict ───────────────────────────────────────────────────────

describe('resolveSkillVerdict', () => {
  it('returns ENSAuditRecord when contract returns verdict', async () => {
    mockReadContract.mockResolvedValueOnce([
      'safe', '85', 'bafyQm...', '1700000000',
      'agent-aabbccdd.auditors.auditor.eth', 'My Skill', SKILL_HASH,
    ])
    const record = await makeClient().resolveSkillVerdict('aabbccdd.skills.auditor.eth')
    expect(record).not.toBeNull()
    expect(record!.verdict).toBe('safe')
    expect(record!.score).toBe(85)
    expect(record!.auditedAt).toBe(1700000000)
  })

  it('returns null when verdict is empty', async () => {
    mockReadContract.mockResolvedValueOnce(['', '', '', '', '', '', ''])
    const record = await makeClient().resolveSkillVerdict('aabbccdd.skills.auditor.eth')
    expect(record).toBeNull()
  })

  it('returns null when registrar not configured', async () => {
    const record = await makeClient({ registrar: null }).resolveSkillVerdict('aabbccdd.skills.auditor.eth')
    expect(record).toBeNull()
  })

  it('returns null and logs on RPC error', async () => {
    mockReadContract.mockRejectedValueOnce(new Error('rpc error'))
    const record = await makeClient().resolveSkillVerdict('aabbccdd.skills.auditor.eth')
    expect(record).toBeNull()
  })
})

// ── updateVerdictTextRecords ──────────────────────────────────────────────────

describe('updateVerdictTextRecords', () => {
  it('calls setText for each text record key', async () => {
    mockWriteContract.mockResolvedValue(TX_HASH)
    await makeClient().updateVerdictTextRecords('aabbccdd.skills.auditor.eth', {
      verdict: 'safe', score: 85, reportCid: '', auditedAt: 1700000000,
      auditorEns: '', skillName: 'My Skill', version: '1',
    })
    // Should have called writeContract once per text record key
    const calls = mockWriteContract.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const keys = calls.map((c: any) => c[0].args[1])
    expect(keys).toContain('verdict')
    expect(keys).toContain('score')
    expect(keys).toContain('audited_at')
    expect(keys).toContain('skill_name')
  })

  it('does nothing when neither registrar nor resolver is configured', async () => {
    await makeClient({ registrar: null, resolver: null }).updateVerdictTextRecords(
      'aabbccdd.skills.auditor.eth',
      { verdict: 'safe', score: 85, reportCid: '', auditedAt: 0, auditorEns: '', skillName: '', version: '1' },
    )
    expect(mockWriteContract).not.toHaveBeenCalled()
  })
})

// ── getAuditorENSName ─────────────────────────────────────────────────────────

describe('getAuditorENSName', () => {
  it('returns agent-{first8hex}.auditors.auditor.eth', async () => {
    const addr = '0xAABBCCDD1234567890000000000000000000000000'
    const name = await makeClient().getAuditorENSName(addr)
    expect(name).toBe('agent-aabbccdd.auditors.auditor.eth')
  })
})

// ── registerAuditorAgent (stub) ───────────────────────────────────────────────

describe('registerAuditorAgent', () => {
  it('returns derived ENS name without any onchain call', async () => {
    const addr = '0xAABBCCDD1234567890000000000000000000000000'
    const name = await makeClient().registerAuditorAgent(addr, {
      worldIdVerificationLevel: 'orb',
      totalAudits: 5,
      trustScore: 90,
    })
    expect(name).toBe('agent-aabbccdd.auditors.auditor.eth')
    expect(mockWriteContract).not.toHaveBeenCalled()
  })
})
