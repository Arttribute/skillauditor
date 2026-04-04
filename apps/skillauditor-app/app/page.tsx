import Link from "next/link";
import { getSession } from "@/lib/auth";
import { LoginButton } from "@/components/login-button";
import { LoginWithRedirect } from "@/components/login-with-redirect";

export default async function Home() {
  const session = await getSession();

  return (
    <div className="flex flex-col min-h-full bg-white">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/95 backdrop-blur-sm px-8 py-4 flex items-center justify-between">
        <span className="text-sm font-bold tracking-tight text-zinc-900">
          SkillAuditor
        </span>
        <nav className="flex items-center gap-6">
          <Link
            href="/explore"
            className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            Registry
          </Link>
          <LoginButton />
        </nav>
      </header>

      <main className="flex flex-col flex-1">
        {/* ── Hero ── */}
        <section className="px-8 pt-24 pb-24 border-b border-zinc-100">
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left: headline + CTAs */}
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-5">
                {/* Vivid blue pill eyebrow */}
                <p className="text-[11px] font-mono text-blue-600 tracking-[0.18em] uppercase mb-2">
                  Security &amp; Trust for Agent Skills
                </p>
                <h1 className="text-5xl lg:text-6xl font-bold text-zinc-900 leading-[1.05] tracking-tight">
                  The <span className="text-blue-600">trust</span> layer
                  <br />
                  for agent <span className="text-blue-600">skills.</span>
                </h1>
                <p className="text-base text-zinc-500 leading-relaxed max-w-md">
                  A skill can quietly expand an agent&apos;s scope, extract
                  secrets, or hide behavior. SkillAuditor audits and verifies
                  every skill before it runs.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {session ? (
                  <Link
                    href="/dashboard/submit"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#0052ff] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0040cc] transition-colors shadow-sm shadow-[#0052ff]/20"
                  >
                    Audit a Skill
                  </Link>
                ) : (
                  <LoginWithRedirect
                    label="Audit a Skill"
                    redirectTo="/dashboard/submit"
                  />
                )}
                <Link
                  href="/explore"
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  Browse Registry →
                </Link>
              </div>
            </div>

            {/* Right: threat list card with colored header */}
            <div className="rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
              <div className="px-5 py-3 bg-[#0052ff] flex items-center justify-between">
                <span className="text-xs font-semibold text-white uppercase tracking-widest">
                  Threat vectors
                </span>
                <span className="text-xs text-blue-50">
                  detected by SkillAuditor
                </span>
              </div>
              <div className="flex flex-col divide-y divide-zinc-100">
                {[
                  {
                    label: "Scope manipulation",
                    color: "bg-orange-300",
                    light: "bg-orange-50",
                    text: "text-gray-800",
                    desc: "Instructions that push agents beyond declared permissions",
                  },
                  {
                    label: "Secret exfiltration",
                    color: "bg-yellow-300",
                    light: "bg-yellow-50",
                    text: "text-gray-800",
                    desc: "Directives routing credentials to unauthorized endpoints",
                  },
                  {
                    label: "Behavioral deception",
                    color: "bg-[#0052ff]",
                    light: "bg-[#eff4ff]",
                    text: "text-gray-800",
                    desc: "Skills that behave differently under analysis than in execution",
                  },
                  {
                    label: "Downstream manipulation",
                    color: "bg-zinc-300",
                    light: "bg-zinc-50",
                    text: "text-gray-800",
                    desc: "Subverting actions and outputs visible to agents and users",
                  },
                ].map(({ label, color, light, text, desc }) => (
                  <div
                    key={label}
                    className="flex items-center gap-4 px-5 py-4 bg-white hover:bg-zinc-50/60 transition-colors"
                  >
                    <span className={`h-2 w-2 rounded-full ${color}`} />

                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${text}`}>{label}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── How the audit works — blue-tinted bg + solid step badges ── */}
        <section className="border-b border-zinc-100 relative overflow-hidden bg-[#f7faff]">
          <div
            className="absolute inset-0 opacity-[0.045]"
            style={{
              backgroundImage:
                "linear-gradient(#0052ff 1px, transparent 1px), linear-gradient(90deg, #0052ff 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <div className="relative max-w-5xl mx-auto px-8 py-20">
            <div className="mb-14">
              <p className="text-xs font-semibold tracking-widest text-[#0052ff] uppercase mb-3">
                How it works
              </p>
              <h2 className="text-4xl font-bold text-zinc-900 tracking-tight">
                Four stages. One verdict.
              </h2>
            </div>

            <div className="flex flex-col">
              {[
                {
                  num: "01",
                  solidBg: "bg-orange-500",
                  title: "Structural Extraction",
                  desc: "SHA-256 content hash, frontmatter parse, declared capabilities, external URLs. Deterministic and tamper-evident.",
                },
                {
                  num: "02",
                  solidBg: "bg-yellow-400",
                  title: "Content Analysis",
                  desc: "An LLM examines every instruction for deception patterns, injection attempts, and exfiltration directives.",
                },
                {
                  num: "03",
                  solidBg: "bg-[#0052ff]",
                  title: "Sandbox Simulation",
                  desc: "The skill runs in an isolated environment with honeypot credentials and 14 intercepted tool types. What it says vs. what it does.",
                },
                {
                  num: "04",
                  solidBg: "bg-zinc-800",
                  title: "Verdict Synthesis",
                  desc: "A judging layer reconciles all findings into a scored verdict and tamper-proof onchain record on Base.",
                },
              ].map(({ num, solidBg, title, desc }, i) => (
                <div
                  key={num}
                  className={`grid grid-cols-[64px_1fr] gap-6 py-8 ${i < 3 ? "border-b border-zinc-200/60" : ""}`}
                >
                  <div
                    className={`flex items-center justify-center h-10 w-10 rounded-xl text-sm font-bold text-white shadow-sm ${solidBg}`}
                  >
                    {num}
                  </div>
                  <div className="flex flex-col gap-1 pt-1.5">
                    <p className="text-base font-bold text-zinc-900">{title}</p>
                    <p className="text-sm text-zinc-500 leading-relaxed max-w-2xl">
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SDK strip ── */}
        <section className="border-b border-zinc-100 px-8 py-20">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-xs font-semibold tracking-widest text-[#0052ff] uppercase mb-3">
                  For developers
                </p>
                <h2 className="text-4xl font-bold text-zinc-900 tracking-tight leading-tight">
                  Verify before
                  <br />
                  you load.
                </h2>
              </div>
              <p className="text-zinc-500 leading-relaxed">
                Query the registry in one call. Gate agent workflows on a
                verified audit. The result is a structured verdict any agent can
                read and act on.
              </p>
              <div className="flex flex-col gap-2.5 text-sm text-zinc-600">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-yellow-50">
                    <span className="h-2 w-2 rounded-full bg-yellow-400" />
                  </span>
                  Machine-readable JSON verdicts
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#eff4ff]">
                    <span className="h-2 w-2 rounded-full bg-[#0052ff]" />
                  </span>
                  Onchain stamp on Base
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden text-xs font-mono leading-relaxed shadow-xl shadow-zinc-900/20">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-zinc-800">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
                <span className="ml-3 text-zinc-500 text-[11px]">terminal</span>
              </div>
              <div className="px-5 py-5 flex flex-col gap-0.5">
                <p className="text-zinc-600">
                  {"# audit a skill before loading it into your agent"}
                </p>
                <p className="mt-2">
                  <span className="text-zinc-500">$ </span>
                  <span className="text-zinc-300">
                    npx @skillauditor/client verify ./SKILL.md
                  </span>
                </p>
                <p className="mt-3">
                  <span className="text-[#0052ff]">▶ </span>
                  <span className="text-zinc-300">
                    Auditing: GitHub PR Reviewer{" "}
                  </span>
                  <span className="text-zinc-600">[audit-a1b2c3d4]</span>
                </p>
                <p className="mt-2 pl-3">
                  <span className="text-emerald-400">✔ </span>
                  <span className="text-zinc-500">
                    Stage 1 — Structural extraction complete
                  </span>
                </p>
                <p className="pl-3">
                  <span className="text-emerald-400">✔ </span>
                  <span className="text-zinc-500">
                    Stage 2 — Content analysis complete
                  </span>
                </p>
                <p className="pl-3">
                  <span className="text-emerald-400">✔ </span>
                  <span className="text-zinc-500">
                    Stage 3 — Sandbox simulation complete
                  </span>
                </p>
                <p className="pl-3">
                  <span className="text-emerald-400">✔ </span>
                  <span className="text-zinc-500">
                    Stage 4 — Verdict synthesis complete
                  </span>
                </p>
                <p className="mt-3">
                  <span className="text-emerald-400">✔ SAFE </span>
                  <span className="text-zinc-600">score=</span>
                  <span className="text-emerald-400">91/100</span>
                </p>
                <p className="mt-4 text-zinc-600">
                  {"# use exit code in CI — 0 = safe, 1 = unsafe"}
                </p>
                <p className="mt-1">
                  <span className="text-zinc-500">$ </span>
                  <span className="text-zinc-300">
                    skillauditor verify ./SKILL.md --silent{" "}
                  </span>
                  <span className="text-zinc-500">&amp;&amp; </span>
                  <span className="text-zinc-300">load_skill</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Final CTA — bold blue section, ProvenanceKit-style ── */}
        <section className="px-8 py-24 bg-[#0052ff] relative overflow-hidden">
          {/* Subtle grid overlay on blue */}
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <div className="relative max-w-5xl mx-auto">
            <h2 className="text-5xl font-bold text-white tracking-tight mb-5">
              Don&apos;t load skills blind.
            </h2>
            <p className="text-blue-200 text-base leading-relaxed mb-10 max-w-lg">
              Submit a SKILL.md. Get a full report, a machine-readable verdict,
              and a verifiable onchain record in under 90 seconds.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              {session ? (
                <Link
                  href="/dashboard/submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-[#0052ff] hover:bg-blue-50 transition-colors"
                >
                  Audit a Skill
                </Link>
              ) : (
                <LoginWithRedirect
                  label="Get Started"
                  redirectTo="/dashboard/submit"
                  className="inline-flex items-center rounded-lg bg-white px-6 py-3 text-sm font-semibold text-[#0052ff] hover:bg-blue-50 transition-colors"
                />
              )}
              <Link
                href="/explore"
                className="text-sm font-medium text-blue-200 hover:text-white transition-colors"
              >
                Browse the Registry →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-100 px-8 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-xs font-bold tracking-tight text-zinc-900">
            SkillAuditor
          </span>
          <div className="flex items-center gap-6">
            <Link
              href="/explore"
              className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              Registry
            </Link>
            <Link
              href="/dashboard"
              className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
