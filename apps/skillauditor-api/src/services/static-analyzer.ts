import { createHash } from 'crypto'
import matter from 'gray-matter'
import type { StaticAnalysisReport } from '@skillauditor/skill-types'

// ── Structural Extractor ───────────────────────────────────────────────────────
// Pure mechanical analysis — no LLM, no interpretation.
// Answers: "what is this thing made of?"
//
// Produces the metadata every downstream stage depends on:
//   - Content hash  → skill identity, dedup, onchain anchor
//   - Frontmatter   → declared name, tools, permissions (the "contract")
//   - URLs          → compared against sandbox network attempts
//   - Scripts       → code block presence and languages
//   - Capabilities  → declared tools+permissions (scope baseline for deviation detection)
//   - Line count    → size signal
//
// Semantic interpretation (what the skill *means*) belongs to the Content Analyst.

const URL_REGEX = /https?:\/\/[^\s\)>\]"']+/g
const SCRIPT_LANGUAGE_REGEX = /```(bash|sh|python|javascript|js|typescript|ts|ruby|go|rust|powershell|cmd|sql)\b/gi

export function runStaticAnalysis(skillContent: string): StaticAnalysisReport {
  // Identity — SHA-256 of exact bytes, 0x-prefixed hex
  const hash = `0x${createHash('sha256').update(skillContent).digest('hex')}`

  // YAML frontmatter — treat content as raw string data, never as instructions
  let frontmatter: StaticAnalysisReport['frontmatter'] = {}
  try {
    const parsed = matter(skillContent)
    frontmatter = {
      name:        parsed.data?.name,
      description: parsed.data?.description,
      version:     parsed.data?.version,
      tools:       Array.isArray(parsed.data?.tools)       ? parsed.data.tools       : undefined,
      permissions: Array.isArray(parsed.data?.permissions) ? parsed.data.permissions : undefined,
    }
  } catch {
    // Malformed frontmatter — treat whole content as body, frontmatter stays empty
  }

  // URL extraction — all external URLs present in the content
  const urlMatches   = skillContent.match(URL_REGEX) ?? []
  const externalUrls = [...new Set(urlMatches.map(u => u.replace(/[.,;!?]+$/, '')))]

  // Script / code block detection
  const containsScripts  = /```\w*/.test(skillContent)
  const scriptLangMatches = [...skillContent.matchAll(SCRIPT_LANGUAGE_REGEX)]
  const scriptLanguages   = [...new Set(scriptLangMatches.map(m => m[1].toLowerCase()))]

  // Declared capabilities — flat union of tools + permissions from frontmatter
  const declaredCapabilities: string[] = [
    ...(frontmatter.tools       ?? []),
    ...(frontmatter.permissions ?? []),
  ]

  const lineCount = skillContent.split('\n').length

  return {
    hash,
    frontmatter,
    externalUrls,
    containsScripts,
    scriptLanguages,
    declaredCapabilities,
    lineCount,
  }
}
