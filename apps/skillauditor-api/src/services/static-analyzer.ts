import { createHash } from 'crypto'
import matter from 'gray-matter'
import type { StaticAnalysisReport, SuspiciousPattern } from '@skillauditor/skill-types'

// ── Suspicious pattern definitions ────────────────────────────────────────────
// These are structural signals, not semantic. Semantic analysis is the judge's job.

const SUSPICIOUS_PATTERNS: Array<{
  regex: RegExp
  label: string
  riskLevel: 'low' | 'medium' | 'high'
}> = [
  // Instruction hijacking attempts
  { regex: /ignore\s+(all\s+)?(previous|prior|earlier|above)\s+(instructions?|context|rules?|guidelines?)/i,   label: 'instruction_override_attempt', riskLevel: 'high' },
  { regex: /disregard\s+(all\s+)?(previous|prior|earlier|above)/i,                                             label: 'instruction_disregard_attempt', riskLevel: 'high' },
  { regex: /forget\s+(everything|all)\s+(you|I|we)\s+(know|said|told)/i,                                       label: 'context_wipe_attempt',         riskLevel: 'high' },
  { regex: /your\s+(new\s+)?(primary\s+)?(instructions?|directives?|purpose|goal|objective)\s+(is|are)/i,      label: 'system_prompt_replacement',    riskLevel: 'high' },
  { regex: /do\s+not\s+(reveal|share|mention|disclose)\s+(this|these|the)\s+(instructions?|prompt|context)/i, label: 'concealment_directive',        riskLevel: 'high' },

  // Exfiltration patterns
  { regex: /send\s+(all\s+)?(the\s+)?(conversation|chat|message|history|context|data)/i, label: 'data_exfiltration_instruction', riskLevel: 'high' },
  { regex: /POST\s+(to\s+)?https?:\/\//i,                                                 label: 'hardcoded_post_endpoint',       riskLevel: 'high' },
  { regex: /include\s+(the\s+)?(user|conversation|previous)\s+(data|history|messages?)/i,label: 'history_inclusion_directive',   riskLevel: 'medium' },

  // Conditional malice
  { regex: /if\s+\.env\s+(file\s+)?(is\s+)?(present|exists|found)/i, label: 'env_file_check', riskLevel: 'high' },
  { regex: /when\s+(the\s+)?user\s+(is\s+)?(not\s+)?looking/i,       label: 'concealed_execution',  riskLevel: 'high' },

  // Scope creep
  { regex: /access\s+(the\s+)?(file\s+system|filesystem|disk|drive)/i, label: 'filesystem_access_directive', riskLevel: 'medium' },
  { regex: /execute\s+(shell|bash|powershell|cmd|command)/i,            label: 'shell_execution_directive',   riskLevel: 'medium' },
  { regex: /read\s+(all\s+)?files?\s+in/i,                              label: 'bulk_file_read_directive',    riskLevel: 'medium' },

  // Deceptive metadata signals
  { regex: /for\s+(optimal|best|maximum)\s+performance,?\s+/i, label: 'fake_performance_claim', riskLevel: 'low' },
  { regex: /this\s+(message|instruction|prompt)\s+(will\s+)?(self.destruct|auto.delete|disappear)/i, label: 'ephemeral_instruction_claim', riskLevel: 'medium' },
]

const URL_REGEX = /https?:\/\/[^\s\)>\]"']+/g
const CODE_BLOCK_REGEX = /```(\w+)?/g
const SCRIPT_LANGUAGE_REGEX = /```(bash|sh|python|javascript|js|typescript|ts|ruby|go|rust|powershell|cmd|sql)\b/gi

// ── Main export ────────────────────────────────────────────────────────────────

export function runStaticAnalysis(skillContent: string): StaticAnalysisReport {
  // Content hash — identity of this exact skill version
  const hash = `0x${createHash('sha256').update(skillContent).digest('hex')}`

  // YAML frontmatter parsing — treat content as raw string data
  let frontmatter: StaticAnalysisReport['frontmatter'] = {}
  let body = skillContent
  try {
    const parsed = matter(skillContent)
    frontmatter = {
      name:        parsed.data?.name,
      description: parsed.data?.description,
      version:     parsed.data?.version,
      tools:       Array.isArray(parsed.data?.tools) ? parsed.data.tools : undefined,
      permissions: Array.isArray(parsed.data?.permissions) ? parsed.data.permissions : undefined,
    }
    body = parsed.content
  } catch {
    // Malformed frontmatter — treat whole content as body
  }

  // URL extraction
  const urlMatches = skillContent.match(URL_REGEX) ?? []
  const externalUrls = [...new Set(urlMatches.map(u => u.replace(/[.,;!?]+$/, '')))]

  // Script / code block detection
  const codeBlockMatches = skillContent.match(CODE_BLOCK_REGEX) ?? []
  const containsScripts = codeBlockMatches.length > 0

  const scriptLangMatches = [...skillContent.matchAll(SCRIPT_LANGUAGE_REGEX)]
  const scriptLanguages = [...new Set(scriptLangMatches.map(m => m[1].toLowerCase()))]

  // Declared capabilities — extracted from frontmatter + body heuristics
  const declaredCapabilities: string[] = []
  if (frontmatter.tools) declaredCapabilities.push(...frontmatter.tools)
  if (frontmatter.permissions) declaredCapabilities.push(...frontmatter.permissions)

  // Line count
  const lineCount = skillContent.split('\n').length

  // Suspicious pattern scan — runs over raw content
  const suspiciousPatterns: SuspiciousPattern[] = []
  const lines = skillContent.split('\n')

  for (const { regex, label, riskLevel } of SUSPICIOUS_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        suspiciousPatterns.push({
          pattern:   label,
          location:  `line:${i + 1}`,
          riskLevel,
        })
        // Only log first occurrence of each pattern to avoid noise
        break
      }
    }
  }

  return {
    hash,
    frontmatter,
    externalUrls,
    containsScripts,
    scriptLanguages,
    declaredCapabilities,
    lineCount,
    suspiciousPatterns,
  }
}
