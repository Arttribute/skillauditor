'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useCallback } from 'react'

// Syncs Privy's access token to the httpOnly session cookie on the server.
// Drop this inside the PrivyProvider — it runs silently in the background.
export function AuthSync() {
  const { ready, authenticated, getAccessToken, logout } = usePrivy()

  const syncSession = useCallback(async () => {
    if (!authenticated) return
    const token = await getAccessToken()
    if (!token) return

    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: token }),
    })

    if (!res.ok) {
      // Token rejected — force logout
      await logout()
    }
  }, [authenticated, getAccessToken, logout])

  useEffect(() => {
    if (!ready) return
    syncSession()
  }, [ready, authenticated, syncSession])

  return null
}
