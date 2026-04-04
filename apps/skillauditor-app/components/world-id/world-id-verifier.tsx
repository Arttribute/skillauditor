'use client'

/**
 * WorldIDVerifier — World ID verification gate for skill submission.
 *
 * STATUS:
 *   - UI component: ✅ implemented (button + badge)
 *   - IDKit integration: ⛔ BLOCKED — requires full World ID Developer Portal
 *     credentials (rp_context, preset) which are environment-specific.
 *     Activate by installing @worldcoin/idkit and using IDKitRequestWidget
 *     once NEXT_PUBLIC_WLD_APP_ID + rp_context are configured.
 *   - Server-side proof verification (`services/world-id.ts`): ⛔ dev placeholder
 *     in use — owned by feat/core-pipeline.
 *
 * Current behaviour:
 *   Renders a "Verify with World ID" button that opens a stub modal.
 *   Replace this with real IDKit once credentials are configured.
 */

import { useState } from 'react'

interface WorldIDVerifierProps {
  /** Called with the World ID proof on success */
  onSuccess: (proof: WorldIDProof) => void
  label?: string
}

export interface WorldIDProof {
  merkle_root: string
  nullifier_hash: string
  proof: string
  verification_level: string
}

export function WorldIDVerifier({
  onSuccess,
  label = 'Verify with World ID',
}: WorldIDVerifierProps) {
  const [open, setOpen] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const isConfigured =
    Boolean(process.env.NEXT_PUBLIC_WLD_APP_ID) &&
    process.env.NEXT_PUBLIC_WLD_APP_ID !== 'app_staging_demo'

  async function handleVerify() {
    setVerifying(true)
    // In development / unconfigured: simulate a successful verification with a stub proof.
    // Replace with real IDKit flow once credentials are configured.
    await new Promise(r => setTimeout(r, 1000))
    onSuccess({
      merkle_root: '0x' + '0'.repeat(64),
      nullifier_hash: '0x' + Math.random().toString(16).slice(2).padStart(64, '0'),
      proof: '0x' + '0'.repeat(512),
      verification_level: 'orb',
    })
    setOpen(false)
    setVerifying(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors shadow-sm"
      >
        <WorldIDOrb />
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <WorldIDOrb size={32} />
              <div>
                <p className="text-sm font-semibold text-zinc-900">World ID Verification</p>
                <p className="text-xs text-zinc-400">
                  {isConfigured ? 'Verify with World App' : 'Dev mode — stub verification'}
                </p>
              </div>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              {isConfigured
                ? 'Open World App on your phone and scan the QR code to verify your identity.'
                : 'World ID credentials not configured (NEXT_PUBLIC_WLD_APP_ID). This is a development stub — real verification requires Developer Portal credentials.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={verifying}
                className="flex-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="flex-1 rounded-xl bg-[#0052ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#0040cc] transition-colors disabled:opacity-50"
              >
                {verifying ? 'Verifying…' : isConfigured ? 'Open World App' : 'Continue (dev)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * WorldIDVerificationBadge — shown after successful verification.
 */
export function WorldIDVerificationBadge({ nullifierHash }: { nullifierHash: string }) {
  const short = nullifierHash.slice(2, 10)
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
      <WorldIDOrb size={12} fill="#16a34a" />
      World ID verified · {short}
    </span>
  )
}

function WorldIDOrb({ size = 20, fill = '#000' }: { size?: number; fill?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="32" fill={fill} />
      <circle cx="32" cy="32" r="20" fill="#fff" />
      <circle cx="32" cy="32" r="8" fill={fill} />
    </svg>
  )
}
