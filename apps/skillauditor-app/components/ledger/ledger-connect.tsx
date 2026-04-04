'use client'

/**
 * LedgerConnect — device discovery and connection.
 *
 * IMPORTANT: The `connectLedger()` call MUST be inside a click handler.
 * WebHID requires a user gesture to open the device picker dialog.
 * Never call connectLedger() in a useEffect or during render.
 */

import { useState } from 'react'
import { connectLedger, disconnectLedger, getConnectionState } from '@/lib/ledger/dmk'
import { LedgerStatus } from './ledger-status'

interface LedgerConnectProps {
  /** Called with the session ID after successful connection */
  onConnect?: (sessionId: string) => void
  /** Called after disconnection */
  onDisconnect?: () => void
  className?: string
}

export function LedgerConnect({ onConnect, onDisconnect, className = '' }: LedgerConnectProps) {
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if already connected
  const isConnected = getConnectionState() === 'connected'

  async function handleConnect() {
    // This is the required user gesture handler for WebHID
    setConnecting(true)
    setError(null)
    try {
      const sessionId = await connectLedger()
      onConnect?.(sessionId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to Ledger'
      setError(message)
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    await disconnectLedger()
    onDisconnect?.()
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <LedgerStatus />

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      {isConnected ? (
        <button
          type="button"
          onClick={handleDisconnect}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          Disconnect Ledger
        </button>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {connecting ? (
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full border border-white border-t-transparent animate-spin" />
              Searching for device…
            </span>
          ) : (
            'Connect Ledger'
          )}
        </button>
      )}

      {!isConnected && !connecting && (
        <p className="text-[10px] text-zinc-400 leading-snug">
          Connect your Ledger, unlock it, and open the Ethereum app before clicking.
        </p>
      )}
    </div>
  )
}
