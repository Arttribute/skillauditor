import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { SubmitForm } from '@/components/audit/submit-form'

export const metadata = { title: 'Submit Skill — SkillAuditor' }

export default async function SubmitPage() {
  const session = await getSession()
  if (!session) redirect('/?from=submit')

  return (
    <div className="flex flex-1 flex-col">
      {/* Nav */}
      <header className="border-b border-zinc-100 px-6 py-4 flex items-center gap-4">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
          ← Dashboard
        </Link>
        <span className="text-zinc-200">|</span>
        <span className="text-sm font-medium text-zinc-900">Submit Skill for Audit</span>
      </header>

      <main className="flex-1 px-6 py-8 max-w-2xl mx-auto w-full">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-zinc-900">Submit a SKILL.md for Audit</h1>
          <p className="text-sm text-zinc-500 mt-1.5 leading-relaxed">
            Paste the raw content of a SKILL.md file. The four-stage pipeline will analyze it
            for instruction hijacking, data exfiltration, scope manipulation, and other threats.
          </p>
        </div>

        <SubmitForm userId={session.userId} />

        {/* How it works */}
        <div className="mt-10 border-t border-zinc-100 pt-8">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4">How the audit works</p>
          <ol className="flex flex-col gap-3">
            {[
              ['Structural Extraction', 'Deterministic parse — SHA-256 hash, frontmatter, declared capabilities, external URLs'],
              ['Content Analysis', 'LLM examines the skill for deception patterns, injection attempts, and exfiltration directives'],
              ['Sandbox Simulation', 'Skill executed in an isolated mock workstation with honeypot credentials and 14 intercepted tool types'],
              ['Verdict Synthesis', 'A final agent synthesizes all findings — never seeing raw skill content — into a scored verdict'],
            ].map(([title, desc], i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-500">
                  {i + 1}
                </span>
                <div>
                  <span className="font-medium text-zinc-700">{title}</span>
                  <span className="text-zinc-500"> — {desc}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </main>
    </div>
  )
}
