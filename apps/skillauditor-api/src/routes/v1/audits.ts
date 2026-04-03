import { Hono } from 'hono'

const audits = new Hono()

// GET /v1/audits/:auditId — get audit result by ID
audits.get('/:auditId', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

export default audits
