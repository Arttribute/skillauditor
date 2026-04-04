import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { SubmitForm } from '@/components/audit/submit-form'

export const metadata = { title: 'Submit Skill — SkillAuditor' }

const STEPS = [
  {
    num: '01',
    color: 'text-orange-500',
    bg: 'bg-orange-50 border-orange-100',
    title: 'Structural Extraction',
    desc: 'SHA-256 content hash, frontmatter parse, declared capabilities, and external URLs. Deterministic and tamper-evident.',
  },
  {
    num: '02',
    color: 'text-yellow-500',
    bg: 'bg-yellow-50 border-yellow-100',
    title: 'Content Analysis',
    desc: 'An LLM examines every instruction for deception patterns, injection attempts, and exfiltration directives.',
  },
  {
    num: '03',
    color: 'text-[#0052ff]',
    bg: 'bg-[#eff4ff] border-[#dbeafe]',
    title: 'Sandbox Simulation',
    desc: 'The skill runs in an isolated environment with honeypot credentials and 14 intercepted tool types.',
  },
  {
    num: '04',
    color: 'text-zinc-600',
    bg: 'bg-zinc-50 border-zinc-100',
    title: 'Verdict Synthesis',
    desc: 'A judging layer reconciles what the skill says with what it actually does — scored and recorded onchain.',
  },
]

export default async function SubmitPage() {
  const session = await getSession()
  if (!session) redirect('/?from=submit')

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-100 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-900">SkillAuditor</Link>
        <span className="text-zinc-200">/</span>
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Dashboard</Link>
        <span className="text-zinc-200">/</span>
        <span className="text-sm font-medium text-zinc-900">Submit</span>
      </header>

      <main className="flex-1 px-6 py-10 max-w-6xl mx-auto w-full">
        {/* Page title row */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Submit a Skill for Audit</h1>
          <p className="text-sm text-zinc-500 mt-1.5 leading-relaxed max-w-xl">
            Paste your SKILL.md content. The four-stage pipeline will return a scored verdict
            and an onchain record in under 90 seconds.
          </p>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">

          {/* LEFT — form (2/3) */}
          <div className="lg:col-span-2">
            <SubmitForm userId={session.userId} />
          </div>

          {/* RIGHT — pipeline reference sidebar (1/3), sticky */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-24">

            <div className="rounded-xl border border-zinc-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">How the audit works</p>
              </div>
              <div className="flex flex-col divide-y divide-zinc-100">
                {STEPS.map(({ num, color, bg, title, desc }) => (
                  <div key={num} className="flex gap-3 px-4 py-4">
                    <span className={`shrink-0 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${color} ${bg}`}>
                      {num}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <p className="text-xs font-semibold text-zinc-800">{title}</p>
                      <p className="text-xs text-zinc-400 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tier info card */}
            <div className="rounded-xl border border-zinc-200 p-4 flex flex-col gap-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Audit Tiers</p>
              <div className="flex flex-col gap-2.5 text-xs">
                <div className="flex flex-col gap-0.5">
                  <p className="font-semibold text-zinc-700">Free</p>
                  <p className="text-zinc-400">Full LLM pipeline · no onchain stamp</p>
                </div>
                <div className="h-px bg-zinc-100" />
                <div className="flex flex-col gap-0.5">
                  <p className="font-semibold text-zinc-700">Pro</p>
                  <p className="text-zinc-400">Full pipeline · tamper-proof stamp on Base · ENS subname registration</p>
                </div>
              </div>
            </div>

            {/* Runtime note */}
            <p className="text-xs text-zinc-400 text-center px-2">
              Analysis typically completes in 30–90 seconds.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
