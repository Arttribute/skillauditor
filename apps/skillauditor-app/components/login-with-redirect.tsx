'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'

interface LoginWithRedirectProps {
  label?: string
  redirectTo: string
  className?: string
}

export function LoginWithRedirect({ label = 'Sign in', redirectTo, className }: LoginWithRedirectProps) {
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
      className={className ?? 'inline-flex items-center gap-2 rounded-lg bg-[#0052ff] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0040cc] transition-colors shadow-sm'}
    >
      {label}
    </button>
  )
}
