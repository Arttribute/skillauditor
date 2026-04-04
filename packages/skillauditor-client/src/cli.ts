#!/usr/bin/env node
/**
 * SkillAuditor CLI — verify AI skills before loading them into your agent.
 *
 *   skillauditor verify ./SKILL.md
 *   skillauditor check  ./SKILL.md
 */

import { readFileSync } from 'fs'
import { resolve }      from 'path'
import { parseArgs }    from 'util'
import { SkillAuditorClient }                                   from './client.js'
import { SkillRejectedError, AuditTimeoutError, PaymentError }  from './errors.js'
import { createX402PaymentHandler }                             from './x402.js'

// ── Help text ────────────────────────────────────────────────────────────────

const HELP = `
\x1b[1mSkillAuditor CLI\x1b[0m — verify AI skills before loading them

\x1b[1mUSAGE\x1b[0m
  skillauditor verify <file> [options]   Audit a skill and wait for verdict
  skillauditor check  <file> [options]   Check if already verified (no submission)

\x1b[1mOPTIONS\x1b[0m
  --tier <free|pro>   Audit tier (default: free)
                        free — LLM audit only, no onchain stamp
                        pro  — full audit + onchain stamp + ENS subname
  --key  <0x...>      EVM private key for World AgentKit signing
                        Omit to use dev bypass (local API only)
  --api-url <url>     SkillAuditor API base URL
                        (default: http://localhost:3001)
  --verbose           Show every sandbox tool call in output
  --silent            No output — use exit code only
  --no-reject         Exit 0 even if skill is unsafe
  --timeout <ms>      Abort after N ms (default: 300000)
  --help              Show this message

\x1b[1mEXIT CODES\x1b[0m
  0   Safe   (verdict = safe, score >= 70)
  1   Unsafe (verdict = unsafe | review_required, or audit failed)
  2   Usage error (bad args, file not found, API unreachable)

\x1b[1mEXAMPLES\x1b[0m
  # Audit a skill — live pipeline logs streamed to terminal
  skillauditor verify ./SKILL.md

  # Check if already stamped onchain (fast, no new audit)
  skillauditor check ./SKILL.md

  # Verbose — see every sandbox tool call the auditor makes
  skillauditor verify ./SKILL.md --verbose

  # Pro tier — onchain stamp + ENS subname on completion
  # Wallet must hold USDC on Base and be registered in World AgentBook:
  #   npx @worldcoin/agentkit-cli register <wallet-address>
  skillauditor verify ./SKILL.md --tier pro --key 0xYOUR_PRIVATE_KEY

  # Silent gate — use in scripts / CI
  skillauditor verify ./SKILL.md --silent && echo "safe to load"

  # Point at a remote API
  skillauditor verify ./SKILL.md --api-url https://api.skillauditor.xyz

\x1b[1mWORLD AGENTKIT (Pro tier)\x1b[0m
  Pro audits require a World ID-verified agent wallet. The payment is
  automatically handled via the x402 protocol ($9 USDC on Base).

  1. Register your wallet: npx @worldcoin/agentkit-cli register <address>
  2. Fund it with USDC on Base (or Base Sepolia for testnet)
  3. Run: skillauditor verify ./SKILL.md --tier pro --key 0xYOUR_KEY
`

// ── Arg parsing ───────────────────────────────────────────────────────────────

function parseCliArgs(argv: string[]) {
  return parseArgs({
    args: argv,
    options: {
      tier:        { type: 'string',  default: 'free' },
      key:         { type: 'string',  default: 'dev'  },
      'api-url':   { type: 'string',  default: 'http://localhost:3001' },
      verbose:     { type: 'boolean', default: false },
      silent:      { type: 'boolean', default: false },
      'no-reject': { type: 'boolean', default: false },
      timeout:     { type: 'string',  default: '300000' },
      help:        { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: false,
  })
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const rawArgs = process.argv.slice(2)

  if (rawArgs.length === 0 || rawArgs[0] === '--help' || rawArgs[0] === '-h') {
    console.log(HELP)
    process.exit(0)
  }

  const command = rawArgs[0]
  if (command !== 'verify' && command !== 'check') {
    console.error(`\x1b[31mUnknown command:\x1b[0m ${command}\nRun \x1b[1mskillauditor --help\x1b[0m for usage.`)
    process.exit(2)
  }

  const { values, positionals } = parseCliArgs(rawArgs.slice(1))

  if (values.help) {
    console.log(HELP)
    process.exit(0)
  }

  // ── Resolve file ────────────────────────────────────────────────────────────
  const filePath = positionals[0]
  if (!filePath) {
    console.error('\x1b[31mError:\x1b[0m file path is required\n\n  skillauditor verify <file>')
    process.exit(2)
  }

  let skillContent: string
  try {
    skillContent = readFileSync(resolve(process.cwd(), filePath), 'utf8')
  } catch {
    console.error(`\x1b[31mError:\x1b[0m could not read file: ${filePath}`)
    process.exit(2)
  }

  // ── Build client ────────────────────────────────────────────────────────────
  const tier       = values.tier === 'pro' ? 'pro' : 'free'
  const silent     = values.silent  as boolean
  const verbose    = values.verbose as boolean
  const logs       = silent ? false : verbose ? 'verbose' : true
  const privateKey = values.key as string

  // Wire x402 payment handler for pro tier when a real key is supplied.
  // The handler uses x402/client to sign an EIP-3009 transferWithAuthorization
  // and returns the base64-encoded receipt for the X-Payment retry header.
  const isRealKey      = privateKey !== 'dev' && privateKey.startsWith('0x')
  const paymentHandler = (tier === 'pro' && isRealKey)
    ? createX402PaymentHandler(privateKey)
    : undefined

  if (tier === 'pro' && !isRealKey && !silent) {
    console.warn(
      '\x1b[33m[warn]\x1b[0m --tier pro requires a real EVM private key (--key 0x...).\n' +
      '       Register your wallet first: npx @worldcoin/agentkit-cli register <address>',
    )
  }

  const client = new SkillAuditorClient({
    apiUrl:         values['api-url'] as string,
    privateKey,
    tier,
    logs,
    paymentHandler,
    rejectOnUnsafe: !(values['no-reject'] as boolean),
    timeoutMs:      Number(values.timeout),
  })

  // ── check command ────────────────────────────────────────────────────────────
  if (command === 'check') {
    try {
      const result = await client.checkVerified(skillContent)
      if (!silent) {
        if (result.verified) {
          console.log(`\x1b[32m✔  Already verified\x1b[0m — ${result.verdict}  score=${result.score}/100`)
          if (result.ensSubname) console.log(`   ENS: \x1b[2m${result.ensSubname}\x1b[0m`)
          if (result.auditId)    console.log(`   Audit: \x1b[2m${result.auditId}\x1b[0m`)
        } else {
          console.log('\x1b[33m  Not yet audited\x1b[0m — submit with: skillauditor verify <file>')
        }
      }
      process.exit(result.verified ? 0 : 1)
    } catch (err) {
      if (!silent) console.error(`\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : String(err)}`)
      process.exit(2)
    }
  }

  // ── verify command ───────────────────────────────────────────────────────────
  try {
    const result = await client.verifySkill(skillContent)
    process.exit(result.verified ? 0 : 1)
  } catch (err) {
    if (err instanceof SkillRejectedError) {
      // printAuditRejected already called inside verifySkill — just exit
      process.exit(1)
    }
    if (err instanceof AuditTimeoutError) {
      if (!silent) console.error(`\n\x1b[31mTimeout:\x1b[0m audit exceeded ${values.timeout}ms`)
      process.exit(1)
    }
    if (err instanceof PaymentError) {
      if (!silent) console.error(`\n\x1b[31mPayment failed:\x1b[0m ${err.message}`)
      process.exit(1)
    }
    if (!silent) console.error(`\n\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
