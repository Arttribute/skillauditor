import { PrivyClient } from '@privy-io/server-auth'
import { cookies } from 'next/headers'

const appId = process.env.PRIVY_APP_ID ?? ''
const appSecret = process.env.PRIVY_APP_SECRET ?? ''

let _privy: PrivyClient | null = null
function getPrivy(): PrivyClient {
  if (!_privy) _privy = new PrivyClient(appId, appSecret)
  return _privy
}

export const SESSION_COOKIE = 'sa-session'

// Verify the session cookie and return the userId, or null if invalid
export async function getSession(): Promise<{ userId: string } | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  try {
    const claims = await getPrivy().verifyAuthToken(token)
    return { userId: claims.userId }
  } catch {
    return null
  }
}

// Use in Server Components / Route Handlers to require auth
// Returns userId or throws a Response (caught by Next.js error boundary)
export async function requireSession(): Promise<{ userId: string }> {
  const session = await getSession()
  if (!session) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return session
}
