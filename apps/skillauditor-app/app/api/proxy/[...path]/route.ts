import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

const API_URL = process.env.API_URL ?? ''

// Proxy all /api/proxy/* requests to the Hono API, forwarding the session cookie.
// This keeps PRIVY_APP_SECRET and API keys server-side only.

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const apiPath = '/' + path.join('/')

  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('sa-session')?.value

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (sessionToken) {
    headers['Cookie'] = `sa-session=${sessionToken}`
  }

  // Forward API key if client sent one (agent use case)
  const apiKey = request.headers.get('X-API-Key')
  if (apiKey) headers['X-API-Key'] = apiKey

  const url = new URL(apiPath, API_URL)
  // Forward query params
  request.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v))

  const body = request.method !== 'GET' && request.method !== 'HEAD'
    ? await request.text()
    : undefined

  const res = await fetch(url.toString(), {
    method: request.method,
    headers,
    body,
  })

  const data = await res.text()
  return new Response(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET    = proxy
export const POST   = proxy
export const PUT    = proxy
export const PATCH  = proxy
export const DELETE = proxy
