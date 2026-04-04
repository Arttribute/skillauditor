'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { AuditResult } from '@/components/audit/audit-result'

export default function AuditPage() {
  const params = useParams()
  const auditId = typeof params.auditId === 'string' ? params.auditId : Array.isArray(params.auditId) ? params.auditId[0] : ''

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-100 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-900">SkillAuditor</Link>
        <span className="text-zinc-200">/</span>
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Dashboard</Link>
        <span className="text-zinc-200">/</span>
        <span className="text-sm font-medium text-zinc-900">Audit</span>
      </header>

      <main className="flex-1 px-6 py-10 max-w-6xl mx-auto w-full">
        {auditId ? (
          <AuditResult auditId={auditId} />
        ) : (
          <p className="text-sm text-zinc-500">Invalid audit ID.</p>
        )}
      </main>
    </div>
  )
}
