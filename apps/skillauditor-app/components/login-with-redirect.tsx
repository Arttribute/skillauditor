'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'

interface LoginWithRedirectProps {
  label?: string
  redirectTo: string
}

export function LoginWithRedirect({ label = 'Sign in', redirectTo }: LoginWithRedirectProps) {
  const { ready, authenticated, login } = usePrivy()
  const router = useRouter()

  if (!ready) return null

  if (authenticated) {
    router.push(redirectTo)
    return null
  }

  return (
    <button
      onClick={login}
      className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
    >
      {label}
    </button>
  )
}
