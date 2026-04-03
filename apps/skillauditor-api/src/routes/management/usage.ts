import { Hono } from 'hono'
import type { AuthContext } from '../../middleware/auth.js'

const usage = new Hono<AuthContext>()

// GET /management/projects/:projectId/usage — 30-day usage stats
usage.get('/', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

export default usage
