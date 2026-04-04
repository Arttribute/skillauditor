import { Hono } from 'hono'
import type { AuthContext } from '../../middleware/auth.js'
import { User } from '../../db/models/index.js'

const users = new Hono<AuthContext>()

// GET /management/users/me — get or upsert current user
users.get('/me', async (c) => {
  const userId = c.get('userId')

  const user = await User.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, new: true, lean: true, setDefaultsOnInsert: true },
  )

  const doc = user as Record<string, unknown>

  return c.json({
    userId:           doc.userId,
    email:            doc.email ?? null,
    walletAddress:    doc.walletAddress ?? null,
    plan:             doc.plan ?? 'free',
    auditCredits:     doc.auditCredits ?? 0,
    usageThisMonth:   doc.usageThisMonth ?? 0,
    worldIdNullifier: doc.worldIdNullifier ?? null,
    createdAt:        doc.createdAt,
    updatedAt:        doc.updatedAt,
  })
})

// PUT /management/users/me — update current user profile
users.put('/me', async (c) => {
  const userId = c.get('userId')

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  // Only allow updating safe fields — plan changes require admin action
  const allowedUpdates: Record<string, unknown> = {}
  if (typeof body.email === 'string') allowedUpdates.email = body.email
  if (typeof body.walletAddress === 'string') allowedUpdates.walletAddress = body.walletAddress

  if (Object.keys(allowedUpdates).length === 0) {
    return c.json({ error: 'No updatable fields provided (allowed: email, walletAddress)' }, 400)
  }

  const user = await User.findOneAndUpdate(
    { userId },
    { $set: allowedUpdates },
    { new: true, lean: true, upsert: true, setDefaultsOnInsert: true },
  )

  const doc = user as Record<string, unknown>

  return c.json({
    userId:         doc.userId,
    email:          doc.email ?? null,
    walletAddress:  doc.walletAddress ?? null,
    plan:           doc.plan ?? 'free',
    auditCredits:   doc.auditCredits ?? 0,
    usageThisMonth: doc.usageThisMonth ?? 0,
    updatedAt:      doc.updatedAt,
  })
})

export default users
