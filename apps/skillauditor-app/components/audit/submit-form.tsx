'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  WorldIDVerifier,
  WorldIDVerificationBadge,
  type WorldIDProof,
} from '@/components/world-id/world-id-verifier'

interface SubmitFormProps {
  userId: string
}

const PLACEHOLDER = `---
name: My Skill
description: What this skill does
version: 1.0.0
tools:
  - read_file
  - bash
---

# My Skill

Instructions for the AI agent here...`

export function SubmitForm({ userId }: SubmitFormProps) {
  const router = useRouter()
  const [skillContent, setSkillContent] = useState('')
  const [skillName, setSkillName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [worldIdProof, setWorldIdProof] = useState<WorldIDProof | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!skillContent.trim()) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/proxy/v1/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillContent: skillContent.trim(),
          skillName: skillName.trim() || undefined,
          userId,
          // World ID 4.0 proof fields — present when verified, omitted in dev (server uses bypass)
          ...(worldIdProof && {
            proof:              worldIdProof.proof,
            merkle_root:        worldIdProof.merkle_root,
            nullifier_hash:     worldIdProof.nullifier_hash,
            verification_level: worldIdProof.verification_level,
          }),
        }),
      })

      const data = await res.json() as { auditId?: string; skillHash?: string; error?: string; message?: string }

      if (!res.ok) {
        setError(data.error ?? `Submission failed (${res.status})`)
        return
      }

      if (!data.auditId) {
        setError('No auditId returned from server')
        return
      }

      // Persist to local history
      try {
        const history = JSON.parse(localStorage.getItem('sa_audit_history') ?? '[]') as Array<{
          auditId: string; skillName: string; skillHash: string; submittedAt: string
        }>
        const entry = {
          auditId: data.auditId,
          skillName: skillName.trim() || 'Untitled Skill',
          skillHash: data.skillHash ?? '',
          submittedAt: new Date().toISOString(),
        }
        localStorage.setItem('sa_audit_history', JSON.stringify([entry, ...history].slice(0, 20)))
      } catch {
        // localStorage unavailable — non-fatal
      }

      router.push(`/audits/${data.auditId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — is the API running?')
    } finally {
      setSubmitting(false)
    }
  }

  const charCount = skillContent.length
  const isOverLimit = charCount > 500_000

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Skill name */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="skillName" className="text-sm font-medium text-zinc-700">
          Skill name <span className="text-zinc-400 font-normal">(optional — auto-detected from frontmatter)</span>
        </label>
        <input
          id="skillName"
          type="text"
          value={skillName}
          onChange={e => setSkillName(e.target.value)}
          placeholder="e.g. GitHub PR Reviewer"
          disabled={submitting}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent disabled:opacity-50 placeholder:text-zinc-400"
        />
      </div>

      {/* SKILL.md content */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="skillContent" className="text-sm font-medium text-zinc-700">
          SKILL.md content <span className="text-red-500">*</span>
        </label>
        <textarea
          id="skillContent"
          value={skillContent}
          onChange={e => setSkillContent(e.target.value)}
          placeholder={PLACEHOLDER}
          disabled={submitting}
          rows={16}
          className="rounded-lg border border-zinc-200 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent disabled:opacity-50 placeholder:text-zinc-400 resize-y leading-relaxed"
        />
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Paste the raw SKILL.md file content above</span>
          <span className={isOverLimit ? 'text-red-500' : ''}>
            {charCount.toLocaleString()} / 500,000 chars
          </span>
        </div>
      </div>

      {/* World ID verification */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-zinc-700">Human Verification</p>
          <p className="text-xs text-zinc-400">
            World ID ensures each skill is submitted by a verified human — not a bot.
          </p>
        </div>
        {worldIdProof ? (
          <WorldIDVerificationBadge nullifierHash={worldIdProof.nullifier_hash} />
        ) : (
          <WorldIDVerifier
            onSuccess={(proof) => setWorldIdProof(proof)}
            label="Verify with World ID"
          />
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting || !skillContent.trim() || isOverLimit}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {submitting ? (
            <>
              <Spinner />
              Submitting…
            </>
          ) : (
            'Submit for Audit'
          )}
        </button>
        {submitting && (
          <p className="text-sm text-zinc-500">Analysis takes 30–90 seconds…</p>
        )}
      </div>
    </form>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
