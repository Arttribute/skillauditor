import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { LoginButton } from '@/components/login-button'
import { RecentAudits } from '@/components/audit/recent-audits'

export const metadata = { title: 'Dashboard — SkillAuditor' }

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/')

  const shortId = session.userId.slice(0, 8)

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-100 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-sm font-bold tracking-tight text-zinc-900">SkillAuditor</Link>
        <div className="flex items-center gap-4">
          <Link href="/explore" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Registry</Link>
          <LoginButton />
        </div>
      </header>

      <main className="flex-1 px-6 py-10 max-w-5xl mx-auto w-full flex flex-col gap-10">

        {/* Title + actions */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Dashboard</h1>
            <p className="text-xs text-zinc-400 mt-1 font-mono">{session.userId}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/dashboard/settings"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Settings
            </Link>
            <Link
              href="/dashboard/submit"
              className="rounded-lg bg-[#0052ff] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0040cc] transition-colors"
            >
              + New Audit
            </Link>
          </div>
        </div>

        {/* Quick-action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href="/dashboard/submit"
            className="group rounded-xl border border-zinc-200 p-5 flex flex-col gap-3 hover:border-[#0052ff]/30 hover:bg-[#eff4ff]/30 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eff4ff] text-[#0052ff] text-sm font-bold">+</span>
              <span className="text-zinc-300 text-xs group-hover:text-[#0052ff] transition-colors">→</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">New Audit</p>
              <p className="text-xs text-zinc-400 mt-0.5">Submit a SKILL.md for analysis</p>
            </div>
          </Link>

          <Link
            href="/explore"
            className="group rounded-xl border border-zinc-200 p-5 flex flex-col gap-3 hover:border-orange-200 hover:bg-orange-50/40 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-500 text-sm font-bold">⬡</span>
              <span className="text-zinc-300 text-xs group-hover:text-orange-500 transition-colors">→</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">Registry</p>
              <p className="text-xs text-zinc-400 mt-0.5">Browse all audited skills</p>
            </div>
          </Link>

          <Link
            href="/dashboard/settings"
            className="group rounded-xl border border-zinc-200 p-5 flex flex-col gap-3 hover:border-zinc-300 hover:bg-zinc-50 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 text-sm font-bold">⚙</span>
              <span className="text-zinc-300 text-xs group-hover:text-zinc-600 transition-colors">→</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">API Keys</p>
              <p className="text-xs text-zinc-400 mt-0.5">Manage programmatic access</p>
            </div>
          </Link>
        </div>

        {/* Recent audits */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Recent Audits</h2>
            <Link href="/dashboard/submit" className="text-xs text-[#0052ff] hover:underline">
              + New →
            </Link>
          </div>
          <RecentAudits />
        </div>
      </main>
    </div>
  )
}
