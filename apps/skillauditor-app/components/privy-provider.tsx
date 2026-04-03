'use client'

import dynamic from 'next/dynamic'
import { PrivyProvider as BasePrivyProvider } from '@privy-io/react-auth'

// Wrap in a client-only component so Privy never runs during SSR/prerender
function PrivyProviderInner({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ''

  if (!appId) return <>{children}</>

  return (
    <BasePrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email', 'wallet', 'google'],
        appearance: {
          theme: 'light',
          accentColor: '#000000',
        },
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
      }}
    >
      {children}
    </BasePrivyProvider>
  )
}

export const PrivyProvider = dynamic(
  () => Promise.resolve(PrivyProviderInner),
  { ssr: false },
)
