import { requireSession } from '@/lib/auth'
import { LoginButton } from '@/components/login-button'

export default async function DashboardPage() {
  // Redirects with 401 if not logged in
  const { userId } = await requireSession()

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <h1 className="font-semibold">Dashboard</h1>
        <LoginButton />
      </header>
      <main className="flex-1 p-6">
        <p className="text-zinc-500 text-sm">Welcome, {userId}</p>
        {/* Audit history table — coming in P.3 */}
      </main>
    </div>
  )
}
