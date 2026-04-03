import { Hono } from 'hono'
import type { AuthContext } from '../../middleware/auth.js'

const apiKeys = new Hono<AuthContext>()

// GET /management/projects/:projectId/api-keys — list API keys for project
apiKeys.get('/', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

// POST /management/projects/:projectId/api-keys — create API key
apiKeys.post('/', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

// DELETE /management/projects/:projectId/api-keys/:keyId — revoke API key
apiKeys.delete('/:keyId', async (c) => {
  return c.json({ error: 'Not implemented' }, 501)
})

export default apiKeys
