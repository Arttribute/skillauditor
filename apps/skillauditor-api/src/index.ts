import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { connectDb } from './db/client.js'
import { authMiddleware } from './middleware/auth.js'
import { generalRateLimit, submitRateLimit } from './middleware/rate-limit.js'

// Routes — v1 (public + World ID gated)
import submitRoute from './routes/v1/submit.js'
import auditsRoute from './routes/v1/audits.js'
import skillsRoute from './routes/v1/skills.js'
import verifyRoute from './routes/v1/verify.js'
import ledgerRoute from './routes/v1/ledger.js'

// Routes — management (auth required)
import usersRoute from './routes/management/users.js'
import orgsRoute from './routes/management/orgs.js'
import apiKeysRoute from './routes/management/api-keys.js'
import usageRoute from './routes/management/usage.js'

const app = new Hono()

// ── Global middleware ──────────────────────────────────────────────────────────
app.use('*', logger())
app.use('*', cors({
  origin: [
    'http://localhost:3000',
    process.env.APP_URL ?? '',
  ].filter(Boolean),
  credentials: true,
}))

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/', (c) => c.json({ status: 'ok', service: 'skillauditor-api' }))
app.get('/health', (c) => c.json({ status: 'ok' }))

// ── v1 routes ─────────────────────────────────────────────────────────────────
app.use('/v1/*', generalRateLimit)

// Public — no auth required
app.route('/v1/skills', skillsRoute)
app.route('/v1/verify', verifyRoute)
app.route('/v1/audits', auditsRoute)

// World ID gated — auth handled inside the route
app.use('/v1/submit', submitRateLimit)
app.route('/v1/submit', submitRoute)

// Ledger — auth required
app.use('/v1/ledger/*', authMiddleware)
app.route('/v1/ledger', ledgerRoute)

// ── Management routes (auth required) ─────────────────────────────────────────
app.use('/management/*', authMiddleware)
app.route('/management/users', usersRoute)
app.route('/management/orgs', orgsRoute)
app.route('/management/projects/:projectId/api-keys', apiKeysRoute)
app.route('/management/projects/:projectId/usage', usageRoute)

// ── 404 ───────────────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'Not found' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

// ── Start ─────────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT) || 3001

async function start() {
  // Only connect to DB if MONGODB_URI is set — allows local dev without MongoDB
  if (process.env.MONGODB_URI) {
    await connectDb()
  } else {
    console.warn('MONGODB_URI not set — skipping DB connection')
  }

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`skillauditor-api running on http://localhost:${info.port}`)
  })
}

start()
