'use client'

import { usePrivy } from '@privy-io/react-auth'

export function LoginButton() {
  const { ready, authenticated, login, logout, user } = usePrivy()

  if (!ready) return null

  if (authenticated) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-zinc-600">{user?.email?.address ?? user?.wallet?.address?.slice(0, 8) + '...'}</span>
        <button
          onClick={async () => {
            await fetch('/api/auth/session', { method: 'DELETE' })
            await logout()
          }}
          className="text-sm font-medium text-zinc-900 underline underline-offset-2"
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={login}
      className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
    >
      Sign in
    </button>
  )
}
