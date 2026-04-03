import { cookies } from 'next/headers'
import { PrivyClient } from '@privy-io/server-auth'
import { SESSION_COOKIE } from '@/lib/auth'

const privy = new PrivyClient(
  process.env.PRIVY_APP_ID ?? '',
  process.env.PRIVY_APP_SECRET ?? '',
)

// POST /api/auth/session
// Called by the client after Privy login — exchanges the Privy access token
// for an httpOnly session cookie that the API proxy can forward.
export async function POST(request: Request) {
  const { accessToken } = await request.json()

  if (!accessToken || typeof accessToken !== 'string') {
    return Response.json({ error: 'accessToken required' }, { status: 400 })
  }

  try {
    await privy.verifyAuthToken(accessToken)
  } catch {
    return Response.json({ error: 'Invalid token' }, { status: 401 })
  }

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  })

  return Response.json({ ok: true })
}

// DELETE /api/auth/session — logout
export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  return Response.json({ ok: true })
}
