import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { LoginButton } from '@/components/login-button'
import { RecentAudits } from '@/components/audit/recent-audits'

export const metadata = { title: 'Dashboard — SkillAuditor' }

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/')

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-100 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-900">SkillAuditor</Link>
        <div className="flex items-center gap-4">
          <Link href="/explore" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Registry</Link>
          <LoginButton />
        </div>
      </header>

      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full flex flex-col gap-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Dashboard</h1>
            <p className="text-xs text-zinc-400 mt-1 font-mono">{session.userId}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/settings"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Settings
            </Link>
            <Link
              href="/dashboard/submit"
              className="rounded-lg bg-[#0052ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#0040cc] transition-colors"
            >
              + New Audit
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Recent Audits</h2>
          <RecentAudits />
        </div>
      </main>
    </div>
  )
}
