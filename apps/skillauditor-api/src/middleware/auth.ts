import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { PrivyClient } from '@privy-io/server-auth'
import { ApiKey } from '../db/models/index.js'

const privyAppId = process.env.PRIVY_APP_ID ?? ''
const privyAppSecret = process.env.PRIVY_APP_SECRET ?? ''

// Lazy-initialise so the module loads even if env vars aren't set yet
let _privy: PrivyClient | null = null
function getPrivy(): PrivyClient {
  if (!_privy) _privy = new PrivyClient(privyAppId, privyAppSecret)
  return _privy
}

export type AuthContext = {
  Variables: {
    userId: string
    authMethod: 'privy' | 'api-key'
  }
}

// Full auth — Privy session cookie OR API key header
export const authMiddleware = createMiddleware<AuthContext>(async (c, next) => {
  // 1. Try API key (X-API-Key header) — used by agents and programmatic clients
  const apiKey = c.req.header('X-API-Key')
  if (apiKey) {
    const record = await ApiKey.findOne({ keyHash: apiKey }).lean()
    if (!record) return c.json({ error: 'Invalid API key' }, 401)
    c.set('userId', record.userId)
    c.set('authMethod', 'api-key')
    return next()
  }

  // 2. Try Privy session cookie — used by the Next.js app
  const sessionToken =
    getCookie(c, 'sa-session') ??
    c.req.header('Authorization')?.replace('Bearer ', '')

  if (sessionToken) {
    try {
      const claims = await getPrivy().verifyAuthToken(sessionToken)
      c.set('userId', claims.userId)
      c.set('authMethod', 'privy')
      return next()
    } catch {
      return c.json({ error: 'Invalid or expired session' }, 401)
    }
  }

  return c.json({ error: 'Authentication required' }, 401)
})
