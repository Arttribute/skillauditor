import Link from 'next/link'
import { SkillCard } from '@/components/skill/skill-card'
import type { SkillListResponse, SkillResponse } from '@/lib/types'

export const metadata = { title: 'Explore Skills — SkillAuditor' }

// Re-fetch on every request so skill list stays fresh
export const dynamic = 'force-dynamic'

interface ExplorePageProps {
  searchParams: Promise<{
    q?: string
    verdict?: string
    page?: string
  }>
}

async function fetchSkills(params: {
  q?: string
  verdict?: string
  page: number
}): Promise<SkillListResponse> {
  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3001'
  const qs = new URLSearchParams()
  qs.set('page', String(params.page))
  qs.set('pageSize', '24')
  if (params.q) qs.set('q', params.q)
  if (params.verdict && params.verdict !== 'all') qs.set('verdict', params.verdict)

  try {
    const res = await fetch(`${apiBase}/v1/skills?${qs.toString()}`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 30 },
    })
    if (!res.ok) return { skills: [], total: 0, page: params.page, pageSize: 24 }
    return res.json() as Promise<SkillListResponse>
  } catch {
    return { skills: [], total: 0, page: params.page, pageSize: 24 }
  }
}

const VERDICT_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'safe', label: 'Safe' },
  { value: 'review_required', label: 'Review Required' },
  { value: 'unsafe', label: 'Unsafe' },
]

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const { skills, total, pageSize } = await fetchSkills({
    q: params.q,
    verdict: params.verdict,
    page,
  })

  const totalPages = Math.ceil(total / pageSize)
  const hasNext = page < totalPages
  const hasPrev = page > 1

  function buildUrl(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams()
    const merged = { q: params.q, verdict: params.verdict, page: String(page), ...overrides }
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== 'all' && v !== '1') p.set(k, v)
    }
    const qs = p.toString()
    return `/explore${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Nav */}
      <header className="border-b border-zinc-100 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold text-zinc-900 hover:text-zinc-600 transition-colors">
          SkillAuditor
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/explore" className="text-sm font-medium text-zinc-900">Explore</Link>
          <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">Dashboard</Link>
        </nav>
      </header>

      <main className="flex-1 px-6 py-8 max-w-5xl mx-auto w-full flex flex-col gap-6">
        {/* Title + search */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Skill Registry</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Browse all audited Claude skills. {total > 0 && <span>{total} skill{total !== 1 ? 's' : ''} indexed.</span>}
            </p>
          </div>

          {/* Search + filter row */}
          <form method="GET" action="/explore" className="flex flex-col sm:flex-row gap-3">
            <input
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Search by name…"
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
            />
            <input type="hidden" name="verdict" value={params.verdict ?? 'all'} />
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
            >
              Search
            </button>
          </form>

          {/* Verdict filter pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {VERDICT_FILTERS.map(f => {
              const active = (params.verdict ?? 'all') === f.value
              return (
                <Link
                  key={f.value}
                  href={buildUrl({ verdict: f.value, page: '1' })}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'
                  }`}
                >
                  {f.label}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Skill grid */}
        {skills.length === 0 ? (
          <EmptyState query={params.q} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((skill: SkillResponse) => (
              <SkillCard key={skill.hash} skill={skill} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
            <span className="text-xs text-zinc-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              {hasPrev && (
                <Link
                  href={buildUrl({ page: String(page - 1) })}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  ← Previous
                </Link>
              )}
              {hasNext && (
                <Link
                  href={buildUrl({ page: String(page + 1) })}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function EmptyState({ query }: { query?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <div className="text-3xl text-zinc-200">⬡</div>
      <p className="text-sm font-medium text-zinc-500">
        {query ? `No skills matching "${query}"` : 'No skills in the registry yet'}
      </p>
      <p className="text-xs text-zinc-400">
        {query ? 'Try a different search term or clear the filter.' : 'Submit a SKILL.md to be the first.'}
      </p>
      <Link
        href="/dashboard/submit"
        className="mt-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
      >
        Submit a skill
      </Link>
    </div>
  )
}
