import { LoginButton } from '@/components/login-button'

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">SkillAuditor</h1>
        <p className="text-zinc-500 max-w-md">
          Security auditing and verification for Claude skills. Submit a skill,
          get a cryptographic safety audit, and an onchain verified stamp.
        </p>
      </div>
      <LoginButton />
    </main>
  )
}
