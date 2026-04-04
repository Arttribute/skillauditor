import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { LoginButton } from '@/components/login-button'
import { LoginWithRedirect } from '@/components/login-with-redirect'

export default async function Home() {
  const session = await getSession()

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
      <div className="text-center flex flex-col gap-3 max-w-md">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">SkillAuditor</h1>
        <p className="text-sm text-zinc-500 leading-relaxed">
          Security auditing for Claude SKILL.md files. Submit a skill, get a
          four-stage sandboxed safety analysis, and an onchain verified stamp.
        </p>
      </div>

      <div className="flex items-center gap-3">
        {session ? (
          <Link
            href="/dashboard"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            Go to Dashboard
          </Link>
        ) : (
          <LoginWithRedirect label="Sign in" redirectTo="/dashboard" />
        )}
      </div>

      <div className="fixed top-4 right-4">
        <LoginButton />
      </div>
    </main>
  )
}
