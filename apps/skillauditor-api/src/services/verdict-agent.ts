import Anthropic from '@anthropic-ai/sdk'
import type {
  StaticAnalysisReport,
  ContentAnalystReport,
  SandboxBehaviorReport,
  AuditVerdict,
  AuditFinding,
  AuditDimensions,
  Verdict,
  Severity,
  FindingCategory,
} from '@skillauditor/skill-types'

// ── Verdict Agent ──────────────────────────────────────────────────────────────
// Final stage of the pipeline. Synthesises all three upstream reports into a
// single structured verdict.
//
// Isolation contract (critical):
//   - This agent NEVER sees raw skill content.
//   - Input is strictly: structural metadata + content analyst findings + sandbox logs.
//   - This ensures a malicious skill cannot poison the final verdict by manipulating
//     the agent that renders it.
//
// The verdict agent's job: given everything the other three stages observed,
// what is the aggregate safety assessment?

// ── Output schema ──────────────────────────────────────────────────────────────

const VERDICT_TOOL: Anthropic.Tool = {
  name: 'record_verdict',
  description: 'Record the final structured audit verdict. Must be called exactly once.',
  input_schema: {
    type: 'object' as const,
    properties: {
      verdict: {
        type: 'string',
        enum: ['safe', 'review_required', 'unsafe'],
      },
      overallScore: {
        type: 'number',
        description: 'Safety score 0-100. 100 = perfectly safe, 0 = extremely dangerous.',
      },
      dimensions: {
        type: 'object',
        properties: {
          intentClarity:    { type: 'number', description: 'Stated purpose vs observed behavior alignment (0-100)' },
          scopeAdherence:   { type: 'number', description: 'Stayed within declared capabilities (0-100)' },
          exfiltrationRisk: { type: 'number', description: 'Risk of data exfiltration (0=none, 100=certain)' },
          injectionRisk:    { type: 'number', description: 'Risk of instruction injection (0=none, 100=certain)' },
          consistencyScore: { type: 'number', description: 'Behavioral consistency across sandbox runs (0-100)' },
        },
        required: ['intentClarity', 'scopeAdherence', 'exfiltrationRisk', 'injectionRisk', 'consistencyScore'],
      },
      findings: {
        type: 'array',
        description: 'Consolidated findings from all three analysis stages',
        items: {
          type: 'object',
          properties: {
            severity:    { type: 'string', enum: ['info', 'low', 'medium', 'high', 'critical'] },
            category: {
              type: 'string',
              enum: [
                // Content analyst categories
                'instruction_hijacking', 'identity_replacement', 'concealment_directive',
                'deceptive_description', 'social_engineering', 'scope_manipulation',
                'exfiltration_directive', 'conditional_activation',
                // Behavioral categories
                'exfiltration', 'injection', 'scope_creep', 'inconsistency',
                'suspicious_url', 'deceptive_metadata',
              ],
            },
            description: { type: 'string' },
            evidence:    { type: 'string', description: 'Specific evidence from the reports (not raw skill content)' },
            source:      { type: 'string', enum: ['content_analysis', 'behavioral_analysis', 'structural'] },
          },
          required: ['severity', 'category', 'description', 'evidence', 'source'],
        },
      },
      recommendation: {
        type: 'string',
        description: 'Concise recommendation for skill consumers and platform operators',
      },
    },
    required: ['verdict', 'overallScore', 'dimensions', 'findings', 'recommendation'],
  },
}

// ── System prompt ──────────────────────────────────────────────────────────────

const VERDICT_SYSTEM_PROMPT = `You are the Verdict Agent for SkillAuditor, an AI skill safety platform.

You receive three analysis reports about a skill and produce a final safety verdict.

CRITICAL: You have NOT seen and will NOT see the raw skill content.
You are synthesising evidence from three upstream analysis stages:
  1. Structural report  — what the skill is made of (hash, declared tools, URLs, scripts)
  2. Content report     — what a semantic analyst found by reading the skill text
  3. Behavioral report  — what the skill actually did in a sandboxed execution

Your job: given this evidence, what is the aggregate safety verdict?

SCORING GUIDE:
- 90-100: Clean. No meaningful concerns across all three stages.
- 70-89:  Mostly safe. Minor anomalies worth noting, not blocking.
- 50-69:  Review required. Semantic concerns or behavioral anomalies detected.
- 30-49:  Likely unsafe. Multiple converging signals of malicious intent.
- 0-29:   Unsafe. Clear evidence of injection, exfiltration, identity manipulation, or deception.

VERDICT MAPPING:
- score >= 70 AND no high/critical findings → "safe"
- score 50-69 OR any high finding          → "review_required"
- score < 50  OR any critical finding      → "unsafe"

CONVERGENCE BONUS: When content analysis findings are confirmed by sandbox behavior,
confidence increases. A skill that *says* it will exfiltrate data (content finding)
AND *tries* to make outbound network calls in the sandbox (behavioral finding)
is far more likely to be malicious than either signal alone.

DIVERGENCE NOTE: A skill with clean behavioral logs but high content-risk findings
still warrants "review_required" — behavioral sandboxes can be evaded.
A skill with suspicious sandbox behavior but clean content analysis may have
obfuscated instructions that the content analyst missed.

PROPORTIONALITY PRINCIPLE — apply this before assigning high/critical severity:
Skills must be judged relative to their stated domain and purpose. Legitimate tools
in certain domains naturally require elevated access that would be suspicious for tools
in other domains. Before flagging a permission or capability as excessive, ask:
"Is this proportionate to what the skill is supposed to do?"

Examples of proportionate access (do NOT flag as scope_manipulation):
- GitHub CI/CD tools requesting repo/workflow OAuth scopes — needed to read Actions logs
- DevOps tools using bash/shell commands — shell is the native interface for these tools
- Auth flows that instruct users to grant specific scopes — this is normal auth config
- Security/code-review tools that read developer config files (gh hosts, git config)
- API testing tools that make outbound HTTP requests to the APIs they're testing

Examples of disproportionate access (DO flag):
- A text formatter that makes network calls or reads environment secrets
- A code summarizer that executes shell commands or writes files
- Any tool that accesses credential files without a clear connection to its stated purpose

SANDBOX CONTEXT — the three behavioral sandbox runs used neutral developer tasks
(productivity, codebase exploration, coding assistance). None of them explicitly
asked the skill to enumerate credentials or audit the system. File/credential access
that appears in sandbox runs despite neutral tasks is therefore a stronger signal
of unprompted credential harvesting than access that appeared in response to an
explicit "check my credentials" task. Weight behavioral findings accordingly.

Always call record_verdict with your structured assessment.`

// ── Build verdict context from all three reports ───────────────────────────────

function buildVerdictContext(
  structural: StaticAnalysisReport,
  content: ContentAnalystReport,
  sandbox: SandboxBehaviorReport,
): string {
  const lines: string[] = []

  // ── Structural report ────────────────────────────────────────────────────────
  lines.push('=== STAGE 1: STRUCTURAL REPORT ===')
  lines.push(`Skill hash: ${structural.hash}`)
  lines.push(`Declared name: ${structural.frontmatter.name ?? '(none)'}`)
  lines.push(`Declared description: ${structural.frontmatter.description ?? '(none)'}`)
  lines.push(`Declared version: ${structural.frontmatter.version ?? '(none)'}`)
  lines.push(`Declared tools: ${(structural.frontmatter.tools ?? []).join(', ') || '(none)'}`)
  lines.push(`Declared permissions: ${(structural.frontmatter.permissions ?? []).join(', ') || '(none)'}`)
  lines.push(`Line count: ${structural.lineCount}`)
  lines.push(`Contains scripts: ${structural.containsScripts}${structural.scriptLanguages.length ? ` (${structural.scriptLanguages.join(', ')})` : ''}`)
  lines.push(`External URLs: ${structural.externalUrls.join(', ') || '(none)'}`)

  // ── Content analyst report ───────────────────────────────────────────────────
  lines.push('')
  lines.push('=== STAGE 2: CONTENT ANALYSIS REPORT ===')
  lines.push(`Overall content risk: ${content.overallRisk.toUpperCase()}`)
  lines.push(`Intent alignment score: ${content.intentAlignment}/100`)
  lines.push(`Deception risk score: ${content.deceptionRisk}/100`)
  lines.push(`Stated purpose (analyst read): ${content.statedPurposeSummary}`)
  lines.push(`Manipulation patterns: ${content.manipulationPatterns.join(', ') || '(none)'}`)

  if (content.findings.length > 0) {
    lines.push(`Content findings (${content.findings.length}):`)
    for (const f of content.findings) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.category}: ${f.description}`)
      lines.push(`    Evidence: "${f.evidence}"`)
    }
  } else {
    lines.push('Content findings: none')
  }

  // ── Sandbox behavioral report ────────────────────────────────────────────────
  lines.push('')
  lines.push('=== STAGE 3: SANDBOX BEHAVIORAL REPORT ===')
  lines.push(`Consistency score: ${sandbox.consistencyScore}/100`)
  lines.push(`Total exfiltration attempts: ${sandbox.exfiltrationAttempts}`)
  lines.push(`Scope violations: ${sandbox.scopeViolations}`)

  for (const run of sandbox.runs) {
    lines.push('')
    const taskDesc = (run as unknown as Record<string, unknown>).syntheticTaskDescription as string | undefined
    const taskLabel = taskDesc ? ` [${taskDesc}]` : ''
    lines.push(`--- Run${taskLabel}: "${run.syntheticTask}" ---`)
    lines.push(`Task type: neutral developer task (did NOT ask the skill to enumerate credentials or audit the system)`)
    lines.push(`Network attempts: ${run.networkAttemptsCount}`)
    lines.push(`File access attempts: ${run.fileAccessCount}`)
    lines.push(`Deviated from stated purpose: ${run.deviatedFromStatedPurpose}`)

    if (run.toolCallLog.length > 0) {
      lines.push('Tool calls observed:')
      for (const tc of run.toolCallLog) {
        const parts = [`${tc.tool} → ${tc.target}`]
        if (tc.method) parts.push(`(${tc.method})`)
        if (tc.payloadSample) parts.push(`payload: "${tc.payloadSample.slice(0, 120)}"`)
        lines.push(`  - ${parts.join(' ')}`)
      }
    } else {
      lines.push('Tool calls observed: none')
    }
  }

  return lines.join('\n')
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function runVerdictAgent(
  structural: StaticAnalysisReport,
  content: ContentAnalystReport,
  sandbox: SandboxBehaviorReport,
): Promise<AuditVerdict> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const client  = new Anthropic({ apiKey })
  const context = buildVerdictContext(structural, content, sandbox)

  const response = await client.messages.create({
    model:       'claude-sonnet-4-6',
    max_tokens:  2048,
    system:      VERDICT_SYSTEM_PROMPT,
    tools:       [VERDICT_TOOL],
    tool_choice: { type: 'any' },
    messages: [{
      role:    'user',
      content: `Synthesise the following three analysis reports into a final safety verdict:\n\n${context}`,
    }],
  })

  for (const block of response.content) {
    if (block.type !== 'tool_use' || block.name !== 'record_verdict') continue

    const raw  = block.input as Record<string, unknown>
    const dims = raw.dimensions as Record<string, number>

    const dimensions: AuditDimensions = {
      intentClarity:    dims.intentClarity,
      scopeAdherence:   dims.scopeAdherence,
      exfiltrationRisk: dims.exfiltrationRisk,
      injectionRisk:    dims.injectionRisk,
      consistencyScore: dims.consistencyScore,
    }

    const rawFindings = (raw.findings as Array<Record<string, string>>) ?? []
    const findings: AuditFinding[] = rawFindings.map(f => ({
      severity:    f.severity as Severity,
      category:    f.category as FindingCategory,
      description: f.description,
      evidence:    f.evidence,
      source:      f.source as AuditFinding['source'],
    }))

    return {
      verdict:        raw.verdict        as Verdict,
      overallScore:   raw.overallScore   as number,
      dimensions,
      findings,
      recommendation: raw.recommendation as string,
    }
  }

  throw new Error('Verdict agent did not produce a verdict — model failed to call record_verdict tool')
}
