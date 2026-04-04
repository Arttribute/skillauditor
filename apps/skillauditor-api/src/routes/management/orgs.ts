import { Hono } from 'hono'
import type { AuthContext } from '../../middleware/auth.js'

const orgs = new Hono<AuthContext>()

// GET /management/orgs — list orgs for current user
// No org model yet — returns the user's personal workspace as a default org.
orgs.get('/', async (c) => {
  const userId = c.get('userId')
  return c.json({
    orgs: [
      {
        orgId:     `personal_${userId}`,
        name:      'Personal',
        role:      'owner',
        createdAt: new Date().toISOString(),
      },
    ],
    total: 1,
  })
})

// POST /management/orgs — create org (not yet implemented)
orgs.post('/', async (c) => {
  return c.json({ error: 'Org creation coming soon' }, 501)
})

// GET /management/orgs/:orgId — get org
orgs.get('/:orgId', async (c) => {
  const userId = c.get('userId')
  const { orgId } = c.req.param()

  // Only personal org is supported for now
  if (orgId !== `personal_${userId}`) {
    return c.json({ error: 'Org not found' }, 404)
  }

  return c.json({
    orgId,
    name: 'Personal',
    role: 'owner',
    createdAt: new Date().toISOString(),
  })
})

// PUT /management/orgs/:orgId — update org (not yet implemented)
orgs.put('/:orgId', async (c) => {
  return c.json({ error: 'Org updates coming soon' }, 501)
})

export default orgs
