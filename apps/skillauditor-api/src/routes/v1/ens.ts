import { Hono } from 'hono'
import { createPublicClient, http, keccak256, toBytes, concat, type Hex, type Address } from 'viem'
import { sepolia } from 'viem/chains'

const ens = new Hono()

const REGISTRAR_ADDRESS = (process.env.SKILL_SUBNAME_REGISTRAR_ADDRESS ?? '') as Address
const ETH_SEPOLIA_RPC   = process.env.ETH_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'

const RESOLVE_SKILL_ABI = [
  {
    type: 'function',
    name: 'resolveSkill',
    inputs: [{ name: 'subnameNode', type: 'bytes32' }],
    outputs: [
      { name: 'verdict',    type: 'string' },
      { name: 'score',      type: 'string' },
      { name: 'reportCid',  type: 'string' },
      { name: 'auditedAt',  type: 'string' },
      { name: 'auditor',    type: 'string' },
      { name: 'skillName',  type: 'string' },
      { name: 'skillHash',  type: 'string' },
      { name: 'auditId',    type: 'string' },
      { name: 'baseTxHash', type: 'string' },
    ],
    stateMutability: 'view',
  },
] as const

function namehash(name: string): Hex {
  if (!name) return `0x${'00'.repeat(32)}` as Hex
  const labels = name.split('.').reverse()
  let node: Uint8Array = new Uint8Array(32)
  for (const label of labels) {
    const labelHash = keccak256(toBytes(label), 'bytes')
    node = keccak256(concat([node, labelHash as unknown as Uint8Array]), 'bytes') as unknown as Uint8Array
  }
  return `0x${Buffer.from(node).toString('hex')}` as Hex
}

// GET /v1/ens/resolve?name=github-pr-reviewer-7afc6af3.skills.skillauditor.eth
ens.get('/resolve', async (c) => {
  const ensName = c.req.query('name')?.trim().toLowerCase()
  if (!ensName) return c.json({ error: 'name query parameter is required' }, 400)

  if (!REGISTRAR_ADDRESS || REGISTRAR_ADDRESS === '0x') {
    return c.json({ error: 'ENS registrar not configured on this server' }, 503)
  }

  try {
    const client = createPublicClient({ chain: sepolia, transport: http(ETH_SEPOLIA_RPC) })
    const node   = namehash(ensName)

    const result = await client.readContract({
      address:      REGISTRAR_ADDRESS,
      abi:          RESOLVE_SKILL_ABI,
      functionName: 'resolveSkill',
      args:         [node],
    }) as unknown as [string, string, string, string, string, string, string, string, string]

    const [verdict, score, reportCid, auditedAt, auditor, skillName, skillHash, auditId, baseTxHash] = result

    // Empty verdict means the name isn't registered
    if (!verdict) return c.json({ error: 'ENS name not found or not yet registered' }, 404)

    return c.json({
      ensName,
      verdict,
      score:       Number(score),
      reportCid,
      auditedAt:   Number(auditedAt),
      auditor,
      skillName,
      skillHash,
      auditId,
      baseTxHash,
      links: {
        audit:        auditId ? `/v1/audits/${auditId}` : null,
        baseScan:     baseTxHash ? `https://sepolia.basescan.org/tx/${baseTxHash}` : null,
        etherscan:    `https://sepolia.etherscan.io/address/${REGISTRAR_ADDRESS}`,
        ensApp:       `https://app.ens.domains/${ensName}?chain=sepolia`,
      },
    })
  } catch (err) {
    const message = (err as Error).message ?? 'Unknown error'
    console.error('[ens/resolve]', ensName, message)
    return c.json({ error: 'Failed to resolve ENS name', detail: message }, 500)
  }
})

export default ens
