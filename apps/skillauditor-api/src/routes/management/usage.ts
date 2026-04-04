import { Hono } from 'hono'
import type { AuthContext } from '../../middleware/auth.js'
import { Audit } from '../../db/models/index.js'

const usage = new Hono<AuthContext>()

// GET /management/projects/:projectId/usage — 30-day usage stats for authenticated user
usage.get('/', async (c) => {
  const userId = c.get('userId')

  const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [total, byVerdict, byTier] = await Promise.all([
    Audit.countDocuments({
      'submittedBy.userId': userId,
      createdAt: { $gte: windowStart },
    }),
    Audit.aggregate([
      {
        $match: {
          'submittedBy.userId': userId,
          createdAt: { $gte: windowStart },
          status: 'completed',
        },
      },
      { $group: { _id: '$result.verdict', count: { $sum: 1 } } },
    ]),
    Audit.aggregate([
      {
        $match: {
          'submittedBy.userId': userId,
          createdAt: { $gte: windowStart },
        },
      },
      { $group: { _id: '$tier', count: { $sum: 1 } } },
    ]),
  ])

  const verdictCounts: Record<string, number> = { safe: 0, review_required: 0, unsafe: 0 }
  for (const row of byVerdict) {
    if (row._id) verdictCounts[row._id as string] = row.count as number
  }

  const tierCounts: Record<string, number> = { free: 0, pro: 0 }
  for (const row of byTier) {
    if (row._id) tierCounts[row._id as string] = row.count as number
  }

  return c.json({
    windowDays: 30,
    windowStart: windowStart.toISOString(),
    totalAudits: total,
    byVerdict: verdictCounts,
    byTier: tierCounts,
  })
})

export default usage
