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
      {/* Nav */}
      <header className="border-b border-zinc-100 px-6 py-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-900">SkillAuditor</span>
        <LoginButton />
      </header>

      <main className="flex-1 px-6 py-8 max-w-2xl mx-auto w-full flex flex-col gap-8">
        {/* Welcome */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Dashboard</h1>
            <p className="text-sm text-zinc-400 mt-0.5 font-mono">{session.userId}</p>
          </div>
          <Link
            href="/dashboard/submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            + New Audit
          </Link>
        </div>

        {/* Recent audits */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-700">Recent Audits</h2>
          </div>
          <RecentAudits />
        </div>
      </main>
    </div>
  )
}
