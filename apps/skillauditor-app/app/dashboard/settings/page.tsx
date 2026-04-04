'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import type { ApiKeyResponse } from '@/lib/types'

export default function SettingsPage() {
  return <SettingsClient />
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CreateKeyResult {
  keyId: string
  name: string
  secret: string // only returned once on creation
  createdAt: string
}

// ── Main client component ─────────────────────────────────────────────────────

function SettingsClient() {
  const [keys, setKeys] = useState<ApiKeyResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<CreateKeyResult | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/proxy/management/api-keys')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json() as { keys: ApiKeyResponse[] }
      setKeys(body.keys ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newKeyName.trim()) return
    setCreating(true)
    setCreatedKey(null)
    try {
      const res = await fetch('/api/proxy/management/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json() as CreateKeyResult
      setCreatedKey(body)
      setNewKeyName('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create API key')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(keyId: string) {
    if (!confirm('Revoke this API key? This cannot be undone.')) return
    setRevokingId(keyId)
    try {
      const res = await fetch(`/api/proxy/management/api-keys/${keyId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke key')
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Nav */}
      <header className="border-b border-zinc-100 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-900">SkillAuditor</Link>
        <span className="text-zinc-200">/</span>
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Dashboard</Link>
        <span className="text-zinc-200">/</span>
        <span className="text-sm font-medium text-zinc-900">Settings</span>
      </header>

      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">API Keys</h1>
          <p className="text-sm text-zinc-500 mt-1.5">
            Use API keys to authenticate programmatic access to the SkillAuditor API.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* New key success banner */}
        {createdKey && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-5 flex flex-col gap-2">
            <p className="text-sm font-semibold text-green-800">API key created — copy it now</p>
            <p className="text-xs text-green-700">This secret is shown only once. Store it securely.</p>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 rounded-lg border border-green-300 bg-white px-3 py-2 text-xs font-mono text-zinc-800 break-all">
                {createdKey.secret}
              </code>
              <CopyButton value={createdKey.secret} />
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              className="self-end text-xs text-green-600 hover:underline mt-1"
            >
              I've saved it, dismiss
            </button>
          </div>
        )}

        {/* Create key form */}
        <div className="rounded-xl border border-zinc-200 p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-zinc-900">Create new key</h2>
          <form onSubmit={handleCreate} className="flex gap-3">
            <input
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g. CI/CD pipeline)"
              maxLength={64}
              disabled={creating}
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0052ff] focus:border-transparent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={creating || !newKeyName.trim()}
              className="rounded-lg bg-[#0052ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#0040cc] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
        </div>

        {/* Keys list */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-700">Active keys</h2>
          {loading ? (
            <div className="flex flex-col gap-2">
              {[1, 2].map(i => (
                <div key={i} className="h-14 rounded-xl border border-zinc-100 bg-zinc-50 animate-pulse" />
              ))}
            </div>
          ) : keys.length === 0 ? (
            <p className="text-sm text-zinc-400">No API keys yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {keys.map(key => (
                <div key={key.keyId} className="rounded-xl border border-zinc-200 px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{key.name}</p>
                    <p className="text-xs text-zinc-400 font-mono mt-0.5">
                      {key.keyId}
                      {key.lastUsedAt && (
                        <span className="ml-3 font-sans">Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRevoke(key.keyId)}
                    disabled={revokingId === key.keyId}
                    className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                  >
                    {revokingId === key.keyId ? 'Revoking…' : 'Revoke'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Usage note */}
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-5 text-xs text-zinc-500 leading-relaxed">
          <p className="font-semibold text-zinc-700 mb-1">Using the API</p>
          <p>
            Pass your key in the <code className="font-mono bg-zinc-200 px-1 rounded">X-API-Key</code> header:
          </p>
          <code className="block mt-2 font-mono bg-white border border-zinc-200 rounded-lg px-3 py-2 text-zinc-700 whitespace-pre">
            {`curl -X POST https://api.skillauditor.xyz/v1/submit \\
  -H "X-API-Key: sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"content": "..."}'`}
          </code>
        </div>
      </main>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 rounded-lg border border-green-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}
