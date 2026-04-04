import { Hono } from 'hono'
import { randomUUID } from 'crypto'
import { LedgerApproval } from '../../db/models/index.js'

const ledger = new Hono()

// POST /v1/ledger/propose — agent proposes an onchain action for Ledger approval
//
// Called by agentkit-session.ts when it needs a human (Ledger device) to approve
// an onchain write. Creates a LedgerApproval record and returns the approvalId.
//
// Body: { agentId, userId, actionType, transactionData, ttlSeconds? }
ledger.post('/propose', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { agentId, userId, actionType, transactionData, ttlSeconds } = body as {
    agentId:         string
    userId:          string
    actionType:      string
    transactionData: Record<string, unknown>
    ttlSeconds?:     number
  }

  if (!agentId || !userId || !actionType || !transactionData) {
    return c.json({ error: 'agentId, userId, actionType, and transactionData are required' }, 400)
  }

  const validActionTypes = ['recordStamp', 'revokeStamp', 'rotateAuditorAgent']
  if (!validActionTypes.includes(actionType)) {
    return c.json({ error: `actionType must be one of: ${validActionTypes.join(', ')}` }, 400)
  }

  const approvalId = randomUUID()
  const ttl = typeof ttlSeconds === 'number' ? Math.min(ttlSeconds, 3600) : 600 // max 1hr, default 10min
  const expiresAt = new Date(Date.now() + ttl * 1000)

  await LedgerApproval.create({
    approvalId,
    agentId,
    userId,
    actionType,
    transactionData,
    status: 'pending',
    expiresAt,
  })

  return c.json({
    approvalId,
    status: 'pending',
    actionType,
    expiresAt: expiresAt.toISOString(),
    message: 'Approval request created. Awaiting Ledger device signature.',
  }, 201)
})

// POST /v1/ledger/approve/:approvalId — frontend submits Ledger signature
//
// Called by the LedgerApproveModal after the user signs the transaction on
// their Ledger device. Marks the approval as 'approved' and stores the signature.
//
// Body: { signature }
ledger.post('/approve/:approvalId', async (c) => {
  const { approvalId } = c.req.param()

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { signature } = body as { signature?: string }
  if (!signature) {
    return c.json({ error: 'signature is required' }, 400)
  }

  const approval = await LedgerApproval.findOne({ approvalId })
  if (!approval) {
    return c.json({ error: 'Approval not found' }, 404)
  }

  if (approval.status !== 'pending') {
    return c.json({
      error: `Approval is already ${approval.status}`,
      status: approval.status,
    }, 409)
  }

  if (approval.expiresAt < new Date()) {
    await LedgerApproval.updateOne({ approvalId }, { status: 'expired' })
    return c.json({ error: 'Approval has expired' }, 410)
  }

  await LedgerApproval.updateOne(
    { approvalId },
    { status: 'approved', signature },
  )

  return c.json({
    approvalId,
    status: 'approved',
    message: 'Ledger signature accepted. Agent will proceed with onchain transaction.',
  })
})

// GET /v1/ledger/pending — list pending approvals for a skill hash or user
//
// Query params:
//   skillHash — filter by skill (matches transactionData.skillHash)
//   userId    — filter by user (falls back to any if omitted)
ledger.get('/pending', async (c) => {
  const skillHash = c.req.query('skillHash')
  const userId    = c.req.query('userId')

  const filter: Record<string, unknown> = { status: 'pending' }
  if (userId) filter.userId = userId

  const docs = await LedgerApproval.find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()

  // Post-filter by skillHash if provided (stored inside transactionData)
  const results = skillHash
    ? docs.filter((d) => {
        const td = d.transactionData as Record<string, unknown>
        return td?.skillHash === skillHash
      })
    : docs

  return c.json({
    approvals: results.map((d) => ({
      approvalId:      d.approvalId,
      actionType:      d.actionType,
      transactionData: d.transactionData,
      status:          d.status,
      expiresAt:       d.expiresAt.toISOString(),
      createdAt:       (d as Record<string, unknown>).createdAt,
    })),
    total: results.length,
  })
})

export default ledger
