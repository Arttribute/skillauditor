'use client'

import { useEffect, useState } from 'react'
import {
  onDeviceStateChange,
  getConnectionState,
  type DeviceConnectionState,
} from '@/lib/ledger/dmk'

const STATE_CONFIG: Record<DeviceConnectionState, { label: string; dot: string; text: string }> = {
  idle: { label: 'No device', dot: 'bg-zinc-300', text: 'text-zinc-400' },
  connecting: { label: 'Connecting…', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-600' },
  connected: { label: 'Connected', dot: 'bg-green-500', text: 'text-green-700' },
  locked: { label: 'Locked — unlock device', dot: 'bg-amber-500', text: 'text-amber-700' },
  disconnected: { label: 'Disconnected', dot: 'bg-zinc-400', text: 'text-zinc-500' },
  error: { label: 'Error', dot: 'bg-red-500', text: 'text-red-600' },
}

interface LedgerStatusProps {
  className?: string
}

export function LedgerStatus({ className = '' }: LedgerStatusProps) {
  const [state, setState] = useState<DeviceConnectionState>(getConnectionState())

  useEffect(() => {
    const unsub = onDeviceStateChange(setState)
    return unsub
  }, [])

  const cfg = STATE_CONFIG[state]

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      Ledger · {cfg.label}
    </span>
  )
}
