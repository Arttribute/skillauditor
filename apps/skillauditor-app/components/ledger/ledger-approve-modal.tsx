'use client'

/**
 * LedgerApproveModal — polls for pending Ledger approvals related to a skill,
 * shows a modal when the agent proposes a stamp, and triggers hardware signing.
 *
 * STATUS:
 *   ✅ Component implemented and wired to poll /v1/ledger/pending?skillHash=
 *   ⛔ Real approvals only flow once feat/onchain-identity delivers:
 *       - AgentKit session (services/agentkit-session.ts)
 *       - writeRegistryStampAction that calls /v1/ledger/propose
 *   Until then, the poll returns an empty list and the modal stays hidden.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { LedgerConnect } from './ledger-connect'
import { getCurrentSessionId } from '@/lib/ledger/dmk'
import type { LedgerApprovalResponse } from '@/lib/types'

interface LedgerApproveModalProps {
  skillHash: string
}

export function LedgerApproveModal({ skillHash }: LedgerApproveModalProps) {
  const [pendingApprovals, setPendingApprovals] = useState<LedgerApprovalResponse[]>([])
  const [activeApproval, setActiveApproval] = useState<LedgerApprovalResponse | null>(null)
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(getCurrentSessionId())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pollPending = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/proxy/v1/ledger/pending?skillHash=${encodeURIComponent(skillHash)}`
      )
      if (!res.ok) return
      const body = await res.json() as { approvals: LedgerApprovalResponse[] }
      const pending = body.approvals ?? []
      setPendingApprovals(pending)
      if (pending.length > 0 && !activeApproval) {
        setActiveApproval(pending[0])
      }
    } catch {
      // non-fatal — approvals are best-effort
    }
  }, [skillHash, activeApproval])

  // Poll every 5s for pending approvals
  useEffect(() => {
    void pollPending()
    pollRef.current = setInterval(() => void pollPending(), 5_000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [pollPending])

  async function handleApprove() {
    if (!activeApproval || !sessionId) return
    setSigning(true)
    setSignError(null)

    try {
      // POST signature to /v1/ledger/approve/:id
      // In the full flow, we'd call Ledger DMK signTypedData here.
      // For now: confirm approval with a placeholder signature (dev mode).
      const res = await fetch(
        `/api/proxy/v1/ledger/approve/${activeApproval.approvalId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signature: '0x_LEDGER_SIGNATURE_PLACEHOLDER',
            deviceSessionId: sessionId,
          }),
        }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      // Remove approved item
      setActiveApproval(null)
      setPendingApprovals(prev => prev.filter(a => a.approvalId !== activeApproval.approvalId))
      await pollPending()
    } catch (err) {
      setSignError(err instanceof Error ? err.message : 'Signing failed')
    } finally {
      setSigning(false)
    }
  }

  async function handleReject() {
    if (!activeApproval) return
    await fetch(`/api/proxy/v1/ledger/approve/${activeApproval.approvalId}`, {
      method: 'DELETE',
    }).catch(() => {})
    setActiveApproval(null)
    setPendingApprovals(prev => prev.filter(a => a.approvalId !== activeApproval.approvalId))
  }

  // Nothing to show if no pending approvals
  if (pendingApprovals.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-100">
          <div className="h-8 w-8 rounded-full bg-zinc-900 flex items-center justify-center text-white text-sm font-bold">
            L
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900">Ledger Approval Required</p>
            <p className="text-xs text-zinc-400">Review and confirm the onchain action on your device</p>
          </div>
        </div>

        {activeApproval && (
          <>
            {/* Action summary */}
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 flex flex-col gap-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Action</p>
                <p className="text-sm font-medium text-zinc-900">
                  {activeApproval.actionType.replace(/_/g, ' ')}
                </p>
              </div>

              {/* Transaction data preview */}
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 flex flex-col gap-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Transaction data</p>
                <pre className="text-xs font-mono text-zinc-700 overflow-auto max-h-32 whitespace-pre-wrap break-all">
                  {JSON.stringify(activeApproval.transactionData, null, 2)}
                </pre>
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Approval ID: <span className="font-mono">{activeApproval.approvalId.slice(0, 12)}…</span></span>
                <span>Expires: {new Date(activeApproval.expiresAt).toLocaleTimeString()}</span>
              </div>

              {/* Ledger connection required */}
              {!sessionId && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold text-amber-800 mb-2">Connect Ledger to approve</p>
                  <LedgerConnect onConnect={id => setSessionId(id)} />
                </div>
              )}

              {signError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
                  {signError}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 px-6 py-4 border-t border-zinc-100 bg-zinc-50">
              <button
                onClick={handleReject}
                disabled={signing}
                className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={signing || !sessionId}
                className="flex-1 rounded-xl bg-[#0052ff] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0040cc] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {signing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-3 w-3 rounded-full border border-white border-t-transparent animate-spin" />
                    Confirm on device…
                  </span>
                ) : (
                  'Approve on Ledger'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
