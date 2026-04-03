import { Hono } from 'hono'

const ledger = new Hono()

// POST /v1/ledger/propose — agent proposes an onchain action for Ledger approval
ledger.post('/propose', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

// POST /v1/ledger/approve/:approvalId — frontend submits Ledger signature
ledger.post('/approve/:approvalId', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

// GET /v1/ledger/pending — list pending approvals for authenticated user
ledger.get('/pending', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

export default ledger
