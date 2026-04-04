// Terminal logger for the SkillAuditor audit pipeline.
//
// Mirrors the same stage labels, colors, and information hierarchy shown in the
// web UI's Pipeline Logs panel so agents and terminal users see the same picture.
//
// Usage:
//   new SkillAuditorClient({ logs: true })        // normal (default) — stage transitions + warnings
//   new SkillAuditorClient({ logs: 'verbose' })   // verbose — every sandbox tool call too
//   new SkillAuditorClient({ logs: false })        // silent — no output
//
// You can also use createConsoleLogger() directly as an onProgress callback:
//   new SkillAuditorClient({ onProgress: createConsoleLogger('verbose') })

import type { ProgressEvent, VerifyResult } from './poller.js'

// ── ANSI color codes ───────────────────────────────────────────────────────────
// Only applied when stdout is a real TTY (not piped into a file or CI that
// doesn't support ANSI). Falls back to plain text automatically.

const tty = typeof process !== 'undefined' && process.stdout?.isTTY === true

const c = {
  reset:  tty ? '\x1b[0m'  : '',
  dim:    tty ? '\x1b[2m'  : '',
  bold:   tty ? '\x1b[1m'  : '',
  red:    tty ? '\x1b[31m' : '',
  green:  tty ? '\x1b[32m' : '',
  yellow: tty ? '\x1b[33m' : '',
  blue:   tty ? '\x1b[34m' : '',
  cyan:   tty ? '\x1b[36m' : '',
  white:  tty ? '\x1b[37m' : '',
  gray:   tty ? '\x1b[90m' : '',
  // Bright variants
  bRed:    tty ? '\x1b[91m' : '',
  bGreen:  tty ? '\x1b[92m' : '',
  bYellow: tty ? '\x1b[93m' : '',
  bBlue:   tty ? '\x1b[94m' : '',
  bCyan:   tty ? '\x1b[96m' : '',
}

// Stage → ANSI color, mirroring the UI:
//   structural = sky     → cyan
//   content    = violet  → blue
//   sandbox    = orange  → yellow
//   verdict    = emerald → green
//   onchain    = blue    → bright blue
//   pipeline   = zinc    → gray
const STAGE_COLOR: Record<string, string> = {
  structural: c.cyan,
  content:    c.blue,
  sandbox:    c.yellow,
  verdict:    c.bGreen,
  onchain:    c.bBlue,
  pipeline:   c.gray,
}

// Pad stage label to a fixed width so message columns align
const STAGE_WIDTH = 10   // "structural" is the longest

function stageLabel(stage: string): string {
  const padded = stage.padEnd(STAGE_WIDTH)
  const color  = STAGE_COLOR[stage] ?? c.gray
  return `${color}${padded}${c.reset}`
}

// ── Timestamp ─────────────────────────────────────────────────────────────────

function fmtTime(ts: number): string {
  return `${c.gray}${new Date(ts).toISOString().slice(11, 23)}${c.reset}`
}

// ── Filtering ─────────────────────────────────────────────────────────────────
// In normal mode, skip the noisy per-tool-call sandbox lines.
// They look like "[run 1/3 · task] → toolName: target" or "  ← result snippet".
// Warnings (scope violations, exfil attempts) are always shown.

function isToolCallLine(msg: string): boolean {
  return msg.startsWith('[run ') || msg.startsWith('  ←')
}

function shouldShow(event: ProgressEvent, verbose: boolean): boolean {
  if (verbose) return true
  if (event.stage === 'sandbox' && event.level === 'info' && isToolCallLine(event.message)) {
    return false
  }
  return true
}

// ── Header ────────────────────────────────────────────────────────────────────

export function printAuditHeader(skillName: string, auditId: string, tier: 'free' | 'pro'): void {
  const tierLabel = tier === 'pro'
    ? `${c.bCyan}pro${c.reset}`
    : `${c.gray}free${c.reset}`

  process.stdout.write(
    `\n${c.bold}▶  SkillAuditor${c.reset}  auditing ${c.white}"${skillName}"${c.reset} (${tierLabel})\n` +
    `${c.gray}   audit ${auditId}${c.reset}\n\n`,
  )
}

// ── Result footer ─────────────────────────────────────────────────────────────

export function printAuditResult(result: VerifyResult): void {
  const { verdict, score, onchain, ensSubname } = result

  const icon  = verdict === 'safe'             ? `${c.bGreen}✔${c.reset}`
              : verdict === 'review_required'  ? `${c.bYellow}▲${c.reset}`
              : `${c.bRed}✖${c.reset}`

  const verdictText = verdict === 'safe'            ? `${c.bGreen}SAFE${c.reset}`
                    : verdict === 'review_required' ? `${c.bYellow}REVIEW REQUIRED${c.reset}`
                    : `${c.bRed}UNSAFE${c.reset}`

  const scoreColor = score >= 80 ? c.bGreen : score >= 60 ? c.bYellow : c.bRed

  let out = `\n${icon}  ${verdictText}  ${scoreColor}${score}/100${c.reset}\n`

  const ens = ensSubname ?? onchain?.ensName
  if (ens)               out += `   ${c.bBlue}ENS${c.reset}  ${ens}\n`
  if (onchain?.txHash)   out += `   ${c.gray}tx   ${onchain.txHash}${c.reset}\n`

  out += '\n'
  process.stdout.write(out)
}

export function printAuditRejected(verdict: string, score: number): void {
  const icon        = verdict === 'review_required' ? `${c.bYellow}▲${c.reset}` : `${c.bRed}✖${c.reset}`
  const verdictText = verdict === 'review_required'
    ? `${c.bYellow}REVIEW REQUIRED${c.reset}`
    : `${c.bRed}UNSAFE${c.reset}`
  const scoreColor  = score >= 60 ? c.bYellow : c.bRed

  process.stdout.write(
    `\n${icon}  ${verdictText}  ${scoreColor}${score}/100${c.reset}\n\n`,
  )
}

// ── Per-event renderer ────────────────────────────────────────────────────────

function renderEvent(event: ProgressEvent): void {
  const { stage, level, message, ts } = event

  const time  = fmtTime(ts)
  const label = stageLabel(stage)

  let prefix = ''
  let msgColor = ''

  if (level === 'warn') {
    prefix   = `${c.bYellow}⚠ ${c.reset}`
    msgColor = c.bYellow
  } else if (level === 'error') {
    prefix   = `${c.bRed}✖ ${c.reset}`
    msgColor = c.bRed
  }

  process.stdout.write(`   ${time}  ${label}  ${prefix}${msgColor}${message}${c.reset}\n`)
}

// ── Public factory ────────────────────────────────────────────────────────────

export type LogsOption = boolean | 'verbose'

/**
 * Returns an onProgress callback that prints formatted pipeline logs to stdout.
 *
 * @param level
 *   true      — normal: stage transitions + warnings (default)
 *   'verbose' — everything, including every sandbox tool call
 *   false     — silent: returns undefined (no callback)
 */
export function createConsoleLogger(
  level: LogsOption,
): ((event: ProgressEvent) => void) | undefined {
  if (level === false) return undefined

  const verbose = level === 'verbose'

  return (event: ProgressEvent) => {
    if (!shouldShow(event, verbose)) return
    renderEvent(event)
  }
}
