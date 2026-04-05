# SkillAuditor

**Security auditing and onchain verification for AI agent skills.**

Skills are reusable instruction files that can be loaded into any AI agent. That reusability is also their risk: a skill can quietly override an agent's system prompt, instruct it to exfiltrate data, or behave differently depending on whether it detects a production environment. SkillAuditor audits skills before they are used — combining semantic analysis, sandboxed behavioral execution, and a synthesis verdict — then anchors the result onchain so any agent or developer can verify a skill's safety record without trusting a single source.

---

## The Problem

Claude skills (`SKILL.md` files) are natural language, not code. That makes them an unusual attack vector: they look like helpful documentation, but can contain:

| Threat | Description |
|--------|-------------|
| **Instruction hijacking** | Overrides the agent's base system prompt |
| **Silent exfiltration** | Instructs the agent to POST user data to an external endpoint |
| **Scope creep** | Skill describes itself as a PDF reader but reaches the file system |
| **Trojan metadata** | Description says one thing; body does another |
| **Supply chain poisoning** | Legitimate skill modified after passing audit |
| **Conditional malice** | Behaves well in a sterile sandbox; activates in real targets when `.env` or `.ssh` keys are visible |

Rule-based (regex) auditing fails because the attack surface is natural language — rephrasing defeats any ruleset, and publishing rules creates a bypass guide. SkillAuditor uses LLM semantic analysis for every audit, making the cost of evasion equal to the cost of rewriting meaning itself.

---

## How It Works

Every submitted skill passes through a four-stage sandboxed multi-agent pipeline:

```
Submit skill
    │
    ▼
┌─────────────────────────────┐
│  Stage 1 — Static Analyzer  │  Deterministic: SHA-256 hash, YAML frontmatter,
│  (no LLM)                   │  URL extraction, script detection, declared capabilities
└─────────────┬───────────────┘
              │
     ┌────────┴────────┐
     ▼                 ▼  (parallel)
┌─────────────┐  ┌──────────────────┐
│  Stage 2    │  │  Stage 3         │
│  Content    │  │  Sandbox Runner  │
│  Analyst    │  │                  │
│             │  │  Skill is loaded │
│  LLM reads  │  │  as instructions │
│  skill as   │  │  into a Claude   │
│  EXAMINER.  │  │  Haiku session   │
│  Detects 8  │  │  inside a mock   │
│  threat     │  │  workstation.    │
│  categories │  │                  │
│  w/ quoted  │  │  All tool calls  │
│  evidence   │  │  intercepted.    │
│             │  │  Honeypot creds  │
│             │  │  present. 3      │
│             │  │  graduated tasks │
└──────┬──────┘  └───────┬──────────┘
       └────────┬─────────┘
                ▼
┌───────────────────────────────┐
│  Stage 4 — Verdict Agent      │  Reads only the three upstream reports.
│  (never sees raw skill)       │  Never reads raw skill content.
│                               │  Produces: verdict, 0-100 score,
│                               │  5 dimensions, findings, recommendation
└───────────────────────────────┘
                │
                ▼
      Onchain stamp on Base
      ENS subname: {hash8}.skills.skillauditor.eth
```

### Stage isolation

The architecture is designed so no stage can be hijacked by a malicious skill:

- **Static Analyzer** reads only bytes — no LLM, deterministic output
- **Content Analyst** is framed as an EXAMINER. Any instruction inside the skill telling it to "ignore previous instructions" is itself logged as a finding, not obeyed. Output is schema-validated JSON only
- **Sandbox Runner** treats skill content as data to simulate, not instructions to follow. The mock workstation includes realistic honeypot credentials (`~/.env`, `.ssh/id_rsa`, `.aws/credentials`) to trigger conditional malice
- **Verdict Agent** never sees the raw skill — it synthesises the three upstream reports only
- All inter-agent communication uses schema-validated JSON via forced tool calls

### Verdict dimensions

The final verdict scores five independent dimensions (0–100 each):

| Dimension | What it measures |
|-----------|-----------------|
| `intentClarity` | Stated purpose vs observed behavior alignment |
| `scopeAdherence` | Stays within declared capabilities |
| `exfiltrationRisk` | Likelihood of outbound data leakage |
| `injectionRisk` | Attempts to override agent instructions |
| `consistencyScore` | Behavioral consistency across sandbox runs |

A skill that *says* it will exfiltrate in Stage 2 **and** *tries* to POST in Stage 3 produces a convergence signal — high-confidence `unsafe` verdict.

---

## Onchain Verification

Passing audits receive a permanent onchain stamp on **Base** and an **ENS subname** on Ethereum.

### SkillRegistry (Base Sepolia)
`0x87C3E6C452585806Ef603a9501eb74Ce740Cafcc`

Records `skillHash → (verdict, score, auditor, timestamp)`. Any agent or developer can call `getStamp(hash)` permissionlessly to verify a skill without trusting SkillAuditor's API.

### ENS subnames (Ethereum Sepolia)
`{hash8}.skills.skillauditor.eth`

Every audited skill gets a human-readable, resolvable name. An agent can resolve the name, read metadata and audit records, and verify that the hash matches the content it is about to load. The name also ties the skill to its author — `pdf-reader.marcuschen.eth` makes both the artifact and publisher visible, giving agents a verifiable author track record over time.

### ERC-7730 Clear Signing
`contracts/erc7730/SkillRegistry.json` describes the `recordStamp` call in structured human-readable form. Ledger hardware wallets display the exact fields being signed — skill hash, verdict, score — before a user approves an onchain stamp.

---

## Submission & Access Control

### World ID 4.0 (human gating)
Skills can only be submitted by verified humans. Developers submit directly with a World ID proof; agents submit on a developer's behalf with cryptographic proof of delegation via World AgentKit. Payment alone is not enough — a bot without a human-backed identity cannot submit, making large-scale anonymous skill poisoning infeasible.

### World AgentKit (agent-to-agent)
The `/v1/agent/submit` endpoint uses World AgentKit SIWE (Sign-In with Ethereum) sessions. Agents authenticate with their EVM wallet, which must be registered in World's AgentBook. The endpoint also enforces an x402 payment gate for Pro audits — machine-native USDC micropayments on Base with no human in the loop.

### Tiers
| Tier | What you get |
|------|-------------|
| Free | Full 4-stage LLM audit + findings report |
| Pro | Audit + onchain stamp on Base + ENS subname + IPFS report pin |

---

## Architecture

```
skillauditor/
├── apps/
│   ├── skillauditor-api/        # Hono REST API (Node.js, port 3001)
│   │   └── src/
│   │       ├── services/
│   │       │   ├── audit-pipeline.ts     # Orchestrator
│   │       │   ├── static-analyzer.ts    # Stage 1: deterministic
│   │       │   ├── content-analyst.ts    # Stage 2: LLM semantic
│   │       │   ├── sandbox-runner.ts     # Stage 3: behavioral
│   │       │   ├── verdict-agent.ts      # Stage 4: synthesis
│   │       │   ├── onchain-registry.ts   # Base viem integration
│   │       │   ├── ens-registry.ts       # ENS subname writes
│   │       │   ├── agentkit-session.ts   # World AgentKit SIWE
│   │       │   └── world-id.ts           # World ID 4.0 verification
│   │       ├── routes/v1/               # REST endpoints
│   │       └── db/                      # MongoDB/Mongoose models
│   │
│   └── skillauditor-app/        # Next.js 15 frontend (App Router)
│       ├── app/
│       │   ├── page.tsx                 # Landing page
│       │   ├── dashboard/               # Auth-gated dashboard + submit
│       │   ├── audits/[auditId]/        # Live audit result with polling
│       │   ├── skills/[hash]/           # Skill detail + onchain stamp
│       │   └── explore/                 # Public skill browser
│       └── components/
│           ├── world-id/                # WorldIDVerifier widget
│           ├── ledger/                  # Ledger DMK connect + approve modal
│           └── ens/                     # ENS name display
│
├── packages/
│   ├── skillauditor-client/     # Agent SDK (@skillauditor/client)
│   ├── skill-registry/          # viem write helpers
│   ├── skill-ens/               # ENS subname registration
│   └── skill-types/             # Shared TypeScript types
│
└── contracts/
    ├── src/
    │   ├── SkillRegistry.sol            # Base Sepolia
    │   └── SkillSubnameRegistrar.sol    # Ethereum Sepolia
    └── erc7730/
        └── SkillRegistry.json           # Ledger Clear Signing descriptor
```

### Tech stack

| Layer | Technologies |
|-------|-------------|
| Backend | Node.js, Hono, MongoDB/Mongoose, Anthropic Claude API |
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS 4, Privy |
| Contracts | Solidity, Foundry, Base L2 (viem) |
| Auth | Privy (email / wallet / Google) + API key headers |
| Onchain | Base Sepolia (SkillRegistry), Ethereum Sepolia (ENS) |
| Packages | pnpm 10 monorepo |

---

## Agent SDK

Any agent — Claude Code, a custom LLM pipeline, a CI step — can verify a skill with a single call:

```typescript
import { SkillAuditorClient } from '@skillauditor/client'

const client = new SkillAuditorClient({
  privateKey: process.env.AGENT_PRIVATE_KEY, // World AgentKit wallet
  tier: 'pro',
  paymentHandler: (req) => getPaymentHeader(req, wallet), // x402 USDC
})

const result = await client.verifySkill(skillContent)

if (!result.safe) {
  throw new Error(`Skill rejected: ${result.verdict.recommendation}`)
}
```

In dev mode, pass `privateKey: 'dev'` — no AgentBook registration, no payment required.

The client handles World AgentKit SIWE signing, x402 payment negotiation, result polling, and terminal logging. The caller sees only `{ safe, verdict, auditId }`.

---

## Deployed Contracts

| Network | Contract | Address |
|---------|----------|---------|
| Base Sepolia | SkillRegistry | `0x87C3E6C452585806Ef603a9501eb74Ce740Cafcc` |
| Ethereum Sepolia | SkillSubnameRegistrar | `0x83466a77A8EeE107083876a311EC0700c3cC8453` |

ENS name: `skillauditor.eth` — subnames issued as `{hash8}.skills.skillauditor.eth`

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/submit` | Submit skill (World ID verified human) |
| `POST` | `/v1/agent/submit` | Submit skill (World AgentKit agent + x402) |
| `GET` | `/v1/audits/:id` | Poll audit status |
| `GET` | `/v1/audits/:id/logs` | Incremental log stream |
| `POST` | `/v1/verify` | Verify skill by content or hash |
| `GET` | `/v1/skills` | Browse audited skills (paginated) |
| `GET` | `/v1/skills/:hash` | Skill detail + onchain stamp |
| `POST` | `/v1/ledger/propose` | Propose Ledger hardware approval |
| `POST` | `/v1/ledger/approve/:id` | Store Ledger signature |

---

## Running Locally

**Prerequisites:** Node.js 20+, pnpm 10, MongoDB

```bash
# Install
pnpm install

# API — copy and fill env vars
cp apps/skillauditor-api/.env.example apps/skillauditor-api/.env
# Required: ANTHROPIC_API_KEY, MONGODB_URI, PRIVY_APP_SECRET

# Start API (port 3001)
pnpm --filter skillauditor-api dev

# Start frontend (port 3000)
pnpm --filter skillauditor-app dev
```

**Minimum env vars for local dev (World ID bypassed, no onchain stamps):**
```env
ANTHROPIC_API_KEY=sk-ant-...
MONGODB_URI=mongodb://localhost:27017/skillauditor
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
```

**To activate onchain stamps and World ID in production:**

| Feature | Env var(s) |
|---------|------------|
| World ID verification | `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY` |
| AgentKit wallet | `CDP_API_KEY_NAME`, `CDP_API_KEY_PRIVATE_KEY` |
| x402 payment gate | `SKILLAUDITOR_TREASURY_ADDRESS` |
| IPFS report pinning | `PINATA_JWT` |
| ENS subname writes | `AUDITOR_AGENT_PRIVATE_KEY` |

---

## Built At

ETH Cannes hackathon — targeting World AgentKit, World ID 4.0, ENS AI Agents, and Ledger AI×Ledger bounties.
