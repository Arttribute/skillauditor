import { Hono } from 'hono'
import { randomUUID, createHash } from 'crypto'
import type { AuthContext } from '../../middleware/auth.js'
import { ApiKey } from '../../db/models/index.js'

const apiKeys = new Hono<AuthContext>()

// GET /management/projects/:projectId/api-keys — list API keys for user
apiKeys.get('/', async (c) => {
  const userId = c.get('userId')

  const keys = await ApiKey.find({ userId })
    .sort({ createdAt: -1 })
    .lean()

  return c.json({
    keys: keys.map((k) => {
      const doc = k as Record<string, unknown>
      return {
        keyId:      doc.keyId,
        name:       doc.name,
        lastUsedAt: doc.lastUsedAt ?? null,
        createdAt:  doc.createdAt,
        expiresAt:  doc.expiresAt ?? null,
      }
    }),
    total: keys.length,
  })
})

// POST /management/projects/:projectId/api-keys — create API key
//
// Returns the raw key ONCE. It is not stored — only the SHA-256 hash is saved.
// The caller must copy the returned `key` value immediately.
apiKeys.post('/', async (c) => {
  const userId = c.get('userId')

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return c.json({ error: 'name is required' }, 400)
  }

  // Limit: max 10 active keys per user
  const existing = await ApiKey.countDocuments({ userId })
  if (existing >= 10) {
    return c.json({ error: 'Maximum of 10 API keys per user' }, 429)
  }

  const keyId  = randomUUID()
  const rawKey = `sa_${randomUUID().replace(/-/g, '')}`

  // Store SHA-256 hash of the key (the auth middleware compares against this)
  const keyHash = createHash('sha256').update(rawKey).digest('hex')

  const expiresAt = body.expiresAt ? new Date(body.expiresAt as string) : null

  await ApiKey.create({
    keyId,
    keyHash,
    userId,
    name,
    expiresAt,
  })

  return c.json({
    keyId,
    name,
    key: rawKey, // returned ONCE — not stored
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt?.toISOString() ?? null,
    warning: 'Copy this key now — it will not be shown again.',
  }, 201)
})

// DELETE /management/projects/:projectId/api-keys/:keyId — revoke API key
apiKeys.delete('/:keyId', async (c) => {
  const userId = c.get('userId')
  const { keyId } = c.req.param()

  const result = await ApiKey.deleteOne({ keyId, userId })

  if (result.deletedCount === 0) {
    return c.json({ error: 'API key not found' }, 404)
  }

  return c.json({ keyId, revoked: true })
})

export default apiKeys
