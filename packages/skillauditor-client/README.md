# @skillauditor/client

Agent SDK for [SkillAuditor](https://skillauditor.xyz) — verify that an AI skill (SKILL.md) is safe before loading it into your agent.

One call. Handles World AgentKit auth, x402 payments, polling, and live terminal logging automatically.

## Install

```bash
npm install @skillauditor/client
```

## Usage

### Quick start (dev mode — no keys needed)

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
  privateKey: process.env.AGENT_PRIVATE_KEY, // EVM key for World AgentKit SIWE
  tier: 'pro',                               // onchain stamp + ENS subname
  paymentHandler: async (req) => {           // called on HTTP 402 — return X-Payment header
    return await wallet.payX402(req)
  },
})

const result = await client.verifySkill(skillContent)
console.log(result.verdict)    // "safe" | "unsafe" | "review_required"
console.log(result.score)      // 0-100
console.log(result.ensSubname) // "a1b2c3d4.skills.skillauditor.eth"
```

### Guard pattern

```ts
if (await client.isSafe(skillContent)) {
  loadSkill(skillContent)
}
```

### Check without submitting

```ts
const cached = await client.checkVerified(skillContent)
if (cached.verified) {
  // already audited — use cached result, no new audit kicked off
}
```

## Options

```ts
new SkillAuditorClient({
  apiUrl?:         string                      // default: http://localhost:3001
  privateKey?:     string                      // "dev" skips signing (local only)
  tier?:           'free' | 'pro'              // default: "free"
  paymentHandler?: (req) => Promise<string>    // required for tier: "pro" in prod
  logs?:           true | 'verbose' | false    // default: true
  onProgress?:     (event) => void             // custom progress handler
  pollIntervalMs?: number                      // default: 3000
  timeoutMs?:      number                      // default: 300000 (5 min)
  rejectOnUnsafe?: boolean                     // default: true
})
```

### Terminal logging

```
▶  Auditing: My GitHub Skill  [audit-abc123]  tier=free
   ✔  Stage 1 — Structural extraction complete
   ✔  Stage 2 — Content analysis complete
   ✔  Stage 3 — Sandbox simulation complete
   ✔  Stage 4 — Verdict synthesis complete
✔  SAFE  score=92/100
```

- `logs: true` (default) — stage transitions only
- `logs: 'verbose'` — every sandbox tool call included
- `logs: false` — silent

## Result shape

```ts
interface VerifyResult {
  verified:    boolean
  verdict:     'safe' | 'unsafe' | 'review_required'
  score:       number           // 0-100
  auditId:     string
  skillHash:   string           // 0x-prefixed SHA-256
  auditedAt:   string           // ISO timestamp
  ensSubname?: string           // set for Pro tier audits
  onchainStamp?: {
    txHash:          string
    chainId:         number
    contractAddress: string
    ensName:         string | null
    stampedAt:       string
  }
}
```

## Errors

```ts
import { SkillRejectedError, AuditTimeoutError, PaymentError } from '@skillauditor/client'

try {
  await client.verifySkill(content)
} catch (err) {
  if (err instanceof SkillRejectedError) {
    console.log(err.verdict, err.score)  // "unsafe", 23
  }
  if (err instanceof AuditTimeoutError) {
    // audit took > timeoutMs
  }
  if (err instanceof PaymentError) {
    // x402 payment failed
  }
}
```

## How it works

1. `POST /v1/verify` — fast path, returns immediately if already audited
2. `POST /v1/agent/submit` — kicks off 4-stage pipeline (structural → content → sandbox → verdict)
3. Polls `GET /v1/audits/:id/logs` with live progress events until complete
4. Returns `VerifyResult` — or throws `SkillRejectedError` if unsafe

The wallet at `privateKey` must be registered in [World AgentBook](https://docs.world.org/agentkit) for production use. In dev mode (`privateKey: 'dev'`), the server bypass is used — no registration needed.
