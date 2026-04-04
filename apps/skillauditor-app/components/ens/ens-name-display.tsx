/**
 * ENSNameDisplay — renders a `{hash8}.skills.auditor.eth` ENS subname
 * with an optional Etherscan link.
 *
 * Compact mode: single-line pill for use inside skill cards.
 * Full mode: two-line block with label and copy button.
 */

'use client'

import { useState } from 'react'

interface ENSNameDisplayProps {
  ensName: string
  /** Etherscan URL for the ENS name — populated once contracts are deployed */
  etherscanUrl?: string
  /** Compact single-line pill variant */
  compact?: boolean
}

export function ENSNameDisplay({ ensName, etherscanUrl, compact = false }: ENSNameDisplayProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(ensName)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400">
        <span className="text-zinc-300">⬡</span>
        {etherscanUrl ? (
          <a
            href={etherscanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-600 transition-colors"
          >
            {ensName}
          </a>
        ) : (
          <span>{ensName}</span>
        )}
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">ENS Subname</p>
      <div className="flex items-center gap-2">
        <span className="text-zinc-300 text-sm">⬡</span>
        {etherscanUrl ? (
          <a
            href={etherscanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-zinc-700 hover:text-zinc-900 transition-colors underline underline-offset-2"
          >
            {ensName}
          </a>
        ) : (
          <span className="font-mono text-sm text-zinc-700">{ensName}</span>
        )}
        <button
          onClick={handleCopy}
          className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors px-1.5 py-0.5 rounded border border-zinc-200 hover:border-zinc-300"
          title="Copy ENS name"
        >
          {copied ? '✓' : 'copy'}
        </button>
      </div>
      {!etherscanUrl && (
        <p className="text-xs text-zinc-400">Onchain registration pending contract deployment</p>
      )}
    </div>
  )
}
