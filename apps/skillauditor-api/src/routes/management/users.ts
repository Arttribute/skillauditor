import { Hono } from 'hono'
import type { AuthContext } from '../../middleware/auth.js'

const users = new Hono<AuthContext>()

// GET /management/users/me — get or upsert current user
users.get('/me', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

// PUT /management/users/me — update current user profile
users.put('/me', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

export default users
