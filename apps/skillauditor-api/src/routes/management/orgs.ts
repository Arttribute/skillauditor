import { Hono } from 'hono'
import type { AuthContext } from '../../middleware/auth.js'

const orgs = new Hono<AuthContext>()

// GET /management/orgs — list orgs for current user
orgs.get('/', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

// POST /management/orgs — create org
orgs.post('/', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

// GET /management/orgs/:orgId — get org
orgs.get('/:orgId', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

// PUT /management/orgs/:orgId — update org
orgs.put('/:orgId', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

export default orgs
