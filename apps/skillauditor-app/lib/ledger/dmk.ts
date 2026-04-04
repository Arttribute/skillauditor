/**
 * lib/ledger/dmk.ts — Ledger Device Management Kit singleton.
 *
 * BROWSER-ONLY. Never import this in server components or API routes.
 * Uses WebHID, which requires a user gesture for the initial connection.
 *
 * Usage pattern (inside a click handler):
 *   const { dmk, deviceSessionId } = await connectLedger()
 */

import {
  DeviceManagementKit,
  DeviceManagementKitBuilder,
} from '@ledgerhq/device-management-kit'
import { webHidTransportFactory } from '@ledgerhq/device-transport-kit-web-hid'

// ── Singleton ──────────────────────────────────────────────────────────────────

let _dmkInstance: DeviceManagementKit | null = null

/**
 * Returns the shared DMK instance, lazily initialised.
 */
export function getDmk(): DeviceManagementKit {
  if (!_dmkInstance) {
    _dmkInstance = new DeviceManagementKitBuilder()
      .addTransport(webHidTransportFactory)
      .build()
  }
  return _dmkInstance
}

// ── Device session management ─────────────────────────────────────────────────

export type DeviceConnectionState = 'idle' | 'connecting' | 'connected' | 'locked' | 'disconnected' | 'error'

let _currentSessionId: string | null = null
let _connectionState: DeviceConnectionState = 'idle'
let _stateListeners: Array<(state: DeviceConnectionState) => void> = []

function notifyStateListeners(state: DeviceConnectionState) {
  _connectionState = state
  _stateListeners.forEach(fn => fn(state))
}

/**
 * Subscribe to device connection state changes.
 * Returns an unsubscribe function.
 */
export function onDeviceStateChange(
  listener: (state: DeviceConnectionState) => void
): () => void {
  _stateListeners.push(listener)
  listener(_connectionState)
  return () => {
    _stateListeners = _stateListeners.filter(fn => fn !== listener)
  }
}

/**
 * Connect to a Ledger device via WebHID.
 * MUST be called inside a click handler (user gesture required by WebHID).
 *
 * Returns the deviceSessionId to use for subsequent DMK operations.
 */
export function connectLedger(): Promise<string> {
  notifyStateListeners('connecting')
  const dmk = getDmk()

  return new Promise<string>((resolve, reject) => {
    const discovery$ = dmk.startDiscovering({})
    const sub = discovery$.subscribe({
      next: (discoveredDevice) => {
        sub.unsubscribe()
        void dmk.stopDiscovering()

        dmk.connect({ device: discoveredDevice }).then(sessionId => {
          _currentSessionId = sessionId as string
          notifyStateListeners('connected')
          resolve(_currentSessionId)
        }).catch((err: unknown) => {
          notifyStateListeners('error')
          reject(err instanceof Error ? err : new Error(String(err)))
        })
      },
      error: (err: unknown) => {
        notifyStateListeners('error')
        reject(err instanceof Error ? err : new Error(String(err)))
      },
    })

    // Timeout after 30s
    setTimeout(() => {
      sub.unsubscribe()
      void dmk.stopDiscovering()
      notifyStateListeners('idle')
      reject(new Error('Ledger device not found — make sure it is connected, unlocked, and the Ethereum app is open'))
    }, 30_000)
  })
}

/**
 * Disconnect the current Ledger device session.
 */
export async function disconnectLedger(): Promise<void> {
  if (!_currentSessionId || !_dmkInstance) return
  try {
    await _dmkInstance.disconnect({ sessionId: _currentSessionId as never })
  } finally {
    _currentSessionId = null
    notifyStateListeners('disconnected')
  }
}

/** Returns the current session ID if connected, otherwise null. */
export function getCurrentSessionId(): string | null {
  return _currentSessionId
}

/** Returns the current connection state. */
export function getConnectionState(): DeviceConnectionState {
  return _connectionState
}
