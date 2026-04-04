import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { LoginButton } from '@/components/login-button'
import { LoginWithRedirect } from '@/components/login-with-redirect'

export default async function Home() {
  const session = await getSession()

  return (
    <div className="flex flex-col min-h-full bg-white">

      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/95 backdrop-blur-sm px-6 py-4 flex items-center justify-between">
        <span className="text-sm font-bold tracking-tight text-zinc-900">SkillAuditor</span>
        <nav className="flex items-center gap-6">
          <Link href="/explore" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            Registry
          </Link>
          <LoginButton />
        </nav>
      </header>

      <main className="flex flex-col flex-1">

        {/* ── Hero — centered, large, Stacks-style ── */}
        <section className="px-6 pt-24 pb-20 text-center border-b border-zinc-100">
          <div className="max-w-4xl mx-auto flex flex-col items-center gap-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-600">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
              Security &amp; Trust Layer for Agent Skills
            </span>

            <h1 className="text-6xl md:text-8xl font-bold text-zinc-900 leading-[1.0] tracking-tight">
              Audit skills.<br />
              <span className="text-[#0052ff]">Trust agents.</span>
            </h1>

            <p className="text-lg md:text-xl text-zinc-500 leading-relaxed max-w-2xl">
              Skills are the new attack surface. A skill can quietly push an agent beyond its intended
              scope, extract secrets, hide behavior, or manipulate downstream actions.
              SkillAuditor verifies skills before they are used.
            </p>

            <div className="flex items-center gap-3 flex-wrap justify-center mt-2">
              {session ? (
                <Link
                  href="/dashboard/submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0052ff] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0040cc] transition-colors shadow-sm"
                >
                  Audit a Skill
                </Link>
              ) : (
                <LoginWithRedirect label="Audit a Skill" redirectTo="/dashboard/submit" />
              )}
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                Browse Registry →
              </Link>
            </div>
          </div>
        </section>

        {/* ── Threat categories — card row ── */}
        <section className="px-6 py-16 border-b border-zinc-100">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold tracking-widest text-zinc-400 uppercase text-center mb-10">
              What SkillAuditor catches
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  icon: '⬡',
                  color: 'text-orange-500',
                  bg: 'bg-orange-50 border-orange-100',
                  title: 'Scope manipulation',
                  desc: 'Instructions that silently push agents beyond declared permissions and tool boundaries.',
                },
                {
                  icon: '⬡',
                  color: 'text-yellow-500',
                  bg: 'bg-yellow-50 border-yellow-100',
                  title: 'Secret exfiltration',
                  desc: 'Directives that route credentials, tokens, or context to unauthorized external endpoints.',
                },
                {
                  icon: '⬡',
                  color: 'text-[#0052ff]',
                  bg: 'bg-[#eff4ff] border-[#dbeafe]',
                  title: 'Behavioral deception',
                  desc: 'Skills that behave differently under analysis than during real execution.',
                },
              ].map(({ icon, color, bg, title, desc }) => (
                <div key={title} className={`rounded-xl border p-6 flex flex-col gap-3 ${bg}`}>
                  <span className={`text-2xl ${color}`}>{icon}</span>
                  <p className="text-sm font-bold text-zinc-900">{title}</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How the audit works — Stacks numbered-step layout with grid bg ── */}
        <section className="border-b border-zinc-100 relative overflow-hidden">
          {/* Subtle grid background */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: 'linear-gradient(#0052ff 1px, transparent 1px), linear-gradient(90deg, #0052ff 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />

          <div className="relative max-w-5xl mx-auto px-6 py-20">
            <div className="text-center mb-16">
              <p className="text-xs font-semibold tracking-widest text-zinc-400 uppercase mb-3">How it works</p>
              <h2 className="text-4xl md:text-5xl font-bold text-zinc-900 tracking-tight">
                Four stages. One verdict.
              </h2>
              <p className="text-zinc-400 mt-3 text-base max-w-xl mx-auto">
                Every skill goes through a layered pipeline before a verdict is issued.
              </p>
            </div>

            <div className="flex flex-col gap-0">
              {[
                {
                  step: '01',
                  color: 'text-orange-500',
                  title: 'Structural Extraction',
                  desc: 'SHA-256 content hash, frontmatter parse, declared capabilities, external URLs — deterministic and tamper-evident.',
                  label: 'Parse & Hash',
                },
                {
                  step: '02',
                  color: 'text-yellow-500',
                  title: 'Content Analysis',
                  desc: 'An LLM examines every instruction in the skill for deception patterns, injection attempts, and exfiltration directives.',
                  label: 'Semantic',
                },
                {
                  step: '03',
                  color: 'text-[#0052ff]',
                  title: 'Sandbox Simulation',
                  desc: 'The skill runs in an isolated mock environment with honeypot credentials and 14 intercepted tool types. What it says vs. what it does.',
                  label: 'Execution',
                },
                {
                  step: '04',
                  color: 'text-zinc-700',
                  title: 'Verdict Synthesis',
                  desc: 'A final judging layer — never seeing raw skill content — reconciles all findings into a scored verdict and onchain record.',
                  label: 'Verdict',
                },
              ].map(({ step, color, title, desc, label }, i) => (
                <div
                  key={step}
                  className={`grid grid-cols-1 md:grid-cols-2 gap-8 items-center py-12 ${
                    i < 3 ? 'border-b border-zinc-100' : ''
                  } ${i % 2 === 1 ? 'md:[&>*:first-child]:order-2' : ''}`}
                >
                  {/* Visual side */}
                  <div className={`flex items-center justify-center rounded-2xl border border-zinc-100 bg-zinc-50 h-40 ${i % 2 === 1 ? 'md:order-2' : ''}`}>
                    <div className="flex items-center gap-4">
                      <span className={`text-7xl font-black tracking-tighter opacity-10 ${color}`}>{step}</span>
                      <span className={`text-xs font-bold tracking-widest uppercase ${color}`}>{label}</span>
                    </div>
                  </div>

                  {/* Text side */}
                  <div className={`flex flex-col gap-3 ${i % 2 === 1 ? 'md:order-1' : ''}`}>
                    <span className={`text-xs font-bold tracking-widest uppercase ${color}`}>{step}</span>
                    <h3 className="text-2xl font-bold text-zinc-900 tracking-tight">{title}</h3>
                    <p className="text-zinc-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SDK code interface ── */}
        <section className="border-b border-zinc-100 px-6 py-20">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
            <div className="flex flex-col gap-5">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#dbeafe] bg-[#eff4ff] px-3 py-1 text-xs font-semibold text-[#0052ff] self-start">
                For developers
              </span>
              <h2 className="text-4xl font-bold text-zinc-900 tracking-tight leading-tight">
                Verify before<br />you load.
              </h2>
              <p className="text-zinc-500 leading-relaxed">
                Query the registry in one call. Gate agent workflows on a verified audit.
                The result is a structured verdict any agent can read and act on.
              </p>
              <div className="flex flex-col gap-2.5 text-sm">
                {[
                  ['REST API & CLI', 'text-orange-500'],
                  ['Machine-readable JSON verdicts', 'text-yellow-500'],
                  ['Onchain stamp on Base', 'text-[#0052ff]'],
                ].map(([text, color]) => (
                  <div key={text} className="flex items-center gap-2.5 text-zinc-600">
                    <span className={`h-1.5 w-1.5 rounded-full ${color.replace('text-', 'bg-')}`} />
                    {text}
                  </div>
                ))}
              </div>
            </div>

            {/* Code block */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden text-xs font-mono leading-relaxed shadow-xl">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-zinc-800">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
                <span className="ml-3 text-zinc-500 text-[11px]">verify-skill.ts</span>
              </div>
              <div className="px-5 py-5 flex flex-col gap-0.5">
                <p className="text-zinc-600">{'// Check a skill before loading into your agent'}</p>
                <p className="mt-2">
                  <span className="text-violet-400">const</span>
                  <span className="text-zinc-300"> res </span>
                  <span className="text-zinc-500">= </span>
                  <span className="text-sky-400">await</span>
                  <span className="text-zinc-300"> fetch</span>
                  <span className="text-zinc-500">(</span>
                </p>
                <p className="pl-4 text-emerald-400">
                  {"`https://api.skillauditor.xyz/v1/skills/${hash}`"}
                </p>
                <p><span className="text-zinc-500">)</span></p>
                <p className="mt-1.5">
                  <span className="text-violet-400">const</span>
                  <span className="text-zinc-300"> {'{ verdict, score, stamp }'} </span>
                  <span className="text-zinc-500">= </span>
                  <span className="text-sky-400">await</span>
                  <span className="text-zinc-300"> res</span>
                  <span className="text-zinc-500">.</span>
                  <span className="text-zinc-300">json</span>
                  <span className="text-zinc-500">()</span>
                </p>
                <p className="mt-2.5 text-zinc-600">{'// verdict: "safe" | "review_required" | "unsafe"'}</p>
                <p className="text-zinc-600">{'// stamp.txHash: onchain record on Base'}</p>
                <p className="mt-2.5">
                  <span className="text-sky-400">if</span>
                  <span className="text-zinc-500"> (</span>
                  <span className="text-zinc-300">verdict </span>
                  <span className="text-zinc-500">!== </span>
                  <span className="text-emerald-400">&quot;safe&quot;</span>
                  <span className="text-zinc-500">)</span>
                </p>
                <p className="pl-4">
                  <span className="text-violet-400">throw</span>
                  <span className="text-violet-400"> new </span>
                  <span className="text-zinc-300">Error</span>
                  <span className="text-zinc-500">(</span>
                  <span className="text-emerald-400">&quot;Skill not verified&quot;</span>
                  <span className="text-zinc-500">)</span>
                </p>
                <p className="mt-2.5 text-zinc-600">{'// Safe — load the skill'}</p>
                <p>
                  <span className="text-sky-400">await</span>
                  <span className="text-zinc-300"> agent</span>
                  <span className="text-zinc-500">.</span>
                  <span className="text-zinc-300">loadSkill</span>
                  <span className="text-zinc-500">(</span>
                  <span className="text-zinc-300">hash</span>
                  <span className="text-zinc-500">)</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Result types — Stacks card grid style ── */}
        <section className="px-6 py-20 border-b border-zinc-100">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold tracking-widest text-zinc-400 uppercase text-center mb-10">
              What you get
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  accent: 'border-orange-200 bg-orange-50',
                  dot: 'bg-orange-400',
                  title: 'Audit Report',
                  desc: 'Findings with severity, category, and evidence. Dimensions scored across intent clarity, scope adherence, exfiltration risk, and more.',
                },
                {
                  accent: 'border-yellow-200 bg-yellow-50',
                  dot: 'bg-yellow-400',
                  title: 'Machine Verdict',
                  desc: 'Structured JSON — safe, review_required, or unsafe. Readable by agents, embeddable in pipelines, queryable via API.',
                },
                {
                  accent: 'border-[#dbeafe] bg-[#eff4ff]',
                  dot: 'bg-[#0052ff]',
                  title: 'Onchain Record',
                  desc: 'A tamper-proof stamp anchored on Base with ENS subname registration. Independently verifiable by humans and agents.',
                },
              ].map(({ accent, dot, title, desc }) => (
                <div key={title} className={`rounded-xl border p-6 flex flex-col gap-4 ${accent}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                  <p className="text-base font-bold text-zinc-900">{title}</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA — centered, Stacks-style ── */}
        <section className="px-6 py-24 text-center relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'linear-gradient(#0052ff 1px, transparent 1px), linear-gradient(90deg, #0052ff 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
          <div className="relative max-w-2xl mx-auto flex flex-col items-center gap-6">
            <h2 className="text-4xl md:text-5xl font-bold text-zinc-900 tracking-tight">
              Don&apos;t load skills blind.
            </h2>
            <p className="text-zinc-500 text-lg leading-relaxed">
              Submit a SKILL.md. Get a report, a verdict, and a verifiable record in under 90 seconds.
            </p>
            <div className="flex items-center gap-3 flex-wrap justify-center">
              {session ? (
                <Link
                  href="/dashboard/submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0052ff] px-7 py-3.5 text-sm font-semibold text-white hover:bg-[#0040cc] transition-colors shadow-sm"
                >
                  Audit a Skill
                </Link>
              ) : (
                <LoginWithRedirect label="Get Started" redirectTo="/dashboard/submit" className="inline-flex items-center gap-2 rounded-lg bg-[#0052ff] px-7 py-3.5 text-sm font-semibold text-white hover:bg-[#0040cc] transition-colors shadow-sm" />
              )}
              <Link
                href="/explore"
                className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                Browse the Registry →
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-100 px-6 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-xs font-bold tracking-tight text-zinc-900">SkillAuditor</span>
          <div className="flex items-center gap-6">
            <Link href="/explore" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors">Registry</Link>
            <Link href="/dashboard" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors">Dashboard</Link>
            <span className="text-xs text-zinc-300">Security &amp; trust for agent skills</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
