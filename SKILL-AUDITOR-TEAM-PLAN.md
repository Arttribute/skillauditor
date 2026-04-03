# SkillAuditor — Team Execution Plan

> This document governs how the three-person team executes against `SKILL-AUDITOR-MASTER-PLAN.md`.
> **When an AI agent is asked to work on this project, it MUST:**
> 1. Run `git branch --show-current`
> 2. Find the matching branch section below
> 3. Execute ONLY the tasks listed for that branch
> 4. Never touch files owned by another branch

---

## How Branching Works

Work happens in two sequential phases:

**Phase 0 — Foundation (you, on `feat/core-pipeline`, before teammates start)**
You build the entire project scaffold first: monorepo structure, Privy auth, management API routes, x402 middleware, MongoDB models, skill-types package, and all stub interfaces. This is the base layer every teammate branches off from.

**Phase 1 — Parallel Sprint (all three branches active simultaneously)**
Once foundation is pushed to `feat/core-pipeline` and teammates have branched off, everyone works in parallel in their own lane.

```
main
 └── staging
       ├── feat/core-pipeline        ← YOU (Phase 0 foundation, then Phase 1 audit engine)
       │     ├── feat/onchain-identity   ← Teammate A (branches off after Foundation Checkpoint)
       │     └── feat/frontend-apps      ← Teammate B (branches off after Foundation Checkpoint)
```

---

## Branch Map

| Branch | Owner | Phase | Focus |
|--------|-------|-------|-------|
| `feat/core-pipeline` | You | 0 + 1 | Foundation setup → audit engine + World ID + API backbone |
| `feat/onchain-identity` | Teammate A | 1 only | Contracts + ENS subname registry + World AgentKit |
| `feat/frontend-apps` | Teammate B | 1 only | Dashboard UI + Privy flows + audit result views |
| `staging` | All | Integration | Merge target for all three feature branches |
| `main` | All | Production | Merge target from staging after QA |

> **MiniKit is out of scope.** It has been removed from all branch plans.

---

## Conflict Avoidance Rules

1. No branch touches another branch's owned directories. Period.
2. `apps/skillauditor-api/src/index.ts` is owned by `feat/core-pipeline`. Teammates add routes by exporting routers from their owned directories; core-pipeline mounts them.
3. Root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` are owned by `feat/core-pipeline`. All of this is done in Phase 0 before teammates branch.
4. `packages/skill-types` is owned by `feat/core-pipeline`. All shared types are defined here in Phase 0. If a teammate needs a new type, they request it via `BRANCH-REQUESTS.md`.
5. Stub files are created by `feat/core-pipeline` in Phase 0. Teammates implement the stubs — never create new files from scratch.
6. `DEPLOYED-ADDRESSES.md` at repo root is the only file `feat/onchain-identity` writes to outside its owned directories.

---

## Phase 0 — Foundation (feat/core-pipeline, YOU, do this first)

**Complete this before teammates branch off. Push to `feat/core-pipeline` when done and announce Foundation Checkpoint.**

### What gets built in Phase 0

```
skillauditor/                           ← new repo root
├── pnpm-workspace.yaml
├── package.json                        ← pnpm workspaces, shared scripts
├── tsconfig.base.json
├── DEPLOYED-ADDRESSES.md               ← empty template for Teammate A to fill
├── BRANCH-REQUESTS.md                  ← empty template for change requests
├── packages/
│   └── skill-types/                    ← ALL core TypeScript interfaces
│       ├── src/index.ts
│       └── package.json
├── apps/
│   ├── skillauditor-api/
│   │   ├── src/
│   │   │   ├── index.ts                ← Hono entry, mounts all routers
│   │   │   ├── routes/
│   │   │   │   ├── v1/                 ← empty stubs (you fill in Phase 1)
│   │   │   │   └── management/
│   │   │   │       ├── index.ts        ← Hono router export
│   │   │   │       ├── users.ts        ← GET/PUT /management/users/me
│   │   │   │       ├── orgs.ts         ← Org CRUD
│   │   │   │       ├── api-keys.ts     ← API key management
│   │   │   │       └── usage.ts        ← 30-day usage stats
│   │   │   ├── services/
│   │   │   │   ├── onchain-registry.ts ← STUB interface + no-op impl
│   │   │   │   └── ens-registry.ts     ← STUB interface + no-op impl
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts             ← Privy server auth + API key validation
│   │   │   │   ├── rate-limit.ts       ← Sliding window
│   │   │   │   └── x402.ts             ← x402 payment middleware (Pro audit gate)
│   │   │   └── db/
│   │   │       ├── client.ts           ← MongoDB connection
│   │   │       └── models/
│   │   │           ├── audit.ts
│   │   │           ├── skill.ts
│   │   │           └── user.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   └── skillauditor-app/
│       ├── app/
│       │   ├── layout.tsx              ← PrivyProvider + root layout
│       │   ├── page.tsx                ← Landing / marketing
│       │   └── api/
│       │       ├── auth/session/route.ts  ← Privy JWT → session cookie
│       │       └── proxy/[...path]/route.ts ← Server-side API proxy
│       ├── lib/
│       │   ├── auth.ts                 ← Privy server auth, sa-session cookie
│       │   └── management-client.ts    ← Typed fetch client for /management/*
│       ├── components/providers/
│       │   └── privy-provider.tsx      ← PrivyProvider wrapper
│       └── package.json
```

### Phase 0 Task List

**Monorepo scaffold:**
- [ ] Init repo, `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`
- [ ] Create all app and package directories with package.json files
- [ ] Shared scripts: `build`, `dev`, `test`

**`packages/skill-types` — define all interfaces:**
- [ ] `SkillFrontmatter`, `ParsedSkill`
- [ ] `StaticAnalysisReport`, `SandboxBehaviorReport`, `AuditVerdict`, `AuditReport`
- [ ] `OnchainStamp`, `ENSAuditRecord`
- [ ] `IOnchainRegistry` interface, `IENSRegistry` interface
- [ ] `AuditRecord`, `SkillRecord`, `UserRecord` (MongoDB document types)

**`apps/skillauditor-api` — foundation:**
- [ ] Hono app scaffold, `src/index.ts` mounting management router + v1 placeholder
- [ ] MongoDB client + 3 models (audit, skill, user)
- [ ] Privy auth middleware (`src/middleware/auth.ts`) — verifies `sa-session` cookie or API key
- [ ] Rate limiting middleware (`src/middleware/rate-limit.ts`)
- [ ] x402 middleware (`src/middleware/x402.ts`) — wraps Pro audit route, requires USDC on Base
- [ ] Management routes (all 4 files): users, orgs, api-keys, usage
- [ ] Stub services: `onchain-registry.ts` + `ens-registry.ts` (no-op implementations)
- [ ] `.env.example` with all vars

**`apps/skillauditor-app` — Privy foundation:**
- [ ] Next.js 15 scaffold (App Router, TypeScript, Tailwind)
- [ ] `PrivyProvider` wrapper (`components/providers/privy-provider.tsx`)
- [ ] `lib/auth.ts` — `PrivyClient`, verify token, session cookie pattern
- [ ] `lib/management-client.ts` — typed fetch wrapper for `/management/*`
- [ ] `app/api/auth/session/route.ts` — POST: Privy JWT → upsert user → set `sa-session` cookie
- [ ] `app/api/proxy/[...path]/route.ts` — server-side proxy (keeps API key out of browser)
- [ ] Root layout with Privy login gate

**Announce Foundation Checkpoint** — push `feat/core-pipeline`, tell teammates to branch off now.

---

## Phase 1 — feat/core-pipeline (YOUR BRANCH, after Foundation Checkpoint)

**Master plan coverage:** Parts 1, 7.2, Part 10 Phase 0 P0.1 + P0.2

### Owned Directories (Phase 1 only — foundation already done)
```
packages/
  skill-auditor-core/
apps/
  skillauditor-api/src/
    routes/v1/
    services/audit-pipeline.ts
    services/static-analyzer.ts
    services/sandbox-runner.ts
    services/semantic-judge.ts
    services/world-id.ts
    services/ipfs.ts
```

### Phase 1 Task List

**Ledger API (backend — owned by core-pipeline):**
- [ ] MongoDB model: `ledger_approvals` (approvalId, agentId, actionType, transactionData, status, signature, expiresAt)
- [ ] `routes/v1/ledger/propose.ts` — agent creates pending approval record
- [ ] `routes/v1/ledger/approve.ts` — frontend submits Ledger { r, s, v } signature
- [ ] `routes/v1/ledger/pending.ts` — list pending approvals for authenticated user
- [ ] `routes/v1/skills/index.ts` — GET `/v1/skills` paginated browse endpoint (for explore page)
- [ ] Update `services/audit-pipeline.ts` — after verdict, call `/v1/ledger/propose` instead of auto-broadcasting stamp; poll for Ledger approval before `onchainRegistry.recordStamp()`

**`packages/skill-auditor-core`:**
- [ ] `src/parse.ts` — parse SKILL.md into `ParsedSkill` (YAML frontmatter + body + SHA-256 hash)
- [ ] `src/static-analyzer.ts` — extract URLs, scripts, declared capabilities → `StaticAnalysisReport`
- [ ] `src/mock-tools.ts` — HTTP/file/shell/MCP interceptor layer for sandbox
- [ ] `src/sandbox-runner.ts` — 3-run Claude API session with mock tools → `SandboxBehaviorReport`
- [ ] `src/semantic-judge.ts` — Claude API call (static + behavioral reports only) → `AuditVerdict`
- [ ] `src/pipeline.ts` — orchestrate all 3, return `AuditReport`
- [ ] `src/index.ts` — export public API
- [ ] Tests: vitest, one per module

**`apps/skillauditor-api` v1 routes:**
- [ ] `services/world-id.ts` — `verifyCloudProof()` + nullifier dedup in MongoDB
- [ ] `services/ipfs.ts` — Pinata upload for full audit report, return CID
- [ ] `services/audit-pipeline.ts` — full orchestration: parse → pipeline → MongoDB write → Pinata upload → call onchain stub → call ENS stub
- [ ] `routes/v1/submit.ts` — POST `/v1/submit`: validate World ID proof → trigger audit → return auditId
- [ ] `routes/v1/audit.ts` — GET `/v1/audits/:auditId`: poll status + result
- [ ] `routes/v1/skills.ts` — GET `/v1/skills/:hash`: stamp by content hash
- [ ] `routes/v1/verify.ts` — POST `/v1/verify`: verify skill content against registry

### Key Design Rules
- Semantic Judge receives ONLY `StaticAnalysisReport + SandboxBehaviorReport` — never raw skill content
- All inter-agent schemas validated with `zod`
- `audit-pipeline.ts` calls `onchainRegistry` and `ensRegistry` via their stub interfaces — if stubs are replaced by real implementations, the pipeline doesn't change
- World ID nullifier stored in MongoDB; rate limit: 5 free audits per verified human per day

---

## Phase 1 — feat/onchain-identity (TEAMMATE A)

**Branches off `feat/core-pipeline` after Foundation Checkpoint.**
**Master plan coverage:** Parts 2, 3.2 (AgentKit), 4 (ENS), 7.3, 7.4, Part 10 Phase 0 P0.3 + P0.4 + P0.5

### Owned Directories
```
contracts/
  src/
    SkillRegistry.sol
    SkillSubnameRegistrar.sol
    ISkillRegistry.sol
  test/
    SkillRegistry.t.sol
  script/
    Deploy.s.sol
  foundry.toml
packages/
  skill-registry/
  skill-ens/
apps/
  skillauditor-api/src/services/
    onchain-registry.ts        ← IMPLEMENT the stub (don't change the interface)
    ens-registry.ts            ← IMPLEMENT the stub (don't change the interface)
    agentkit-session.ts        ← NEW file (WorldAgentKit setup)
DEPLOYED-ADDRESSES.md          ← write contract addresses here
```

### Phase 1 Task List

**Contracts:**
- [ ] `SkillRegistry.sol` — `recordStamp()`, `getStamp()`, `isVerified()` (per MASTER-PLAN Part 2.2)
- [ ] Foundry setup, `foundry.toml`, compile + tests
- [ ] Deploy to Base Sepolia: `forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast`
- [ ] `SkillSubnameRegistrar.sol` — registers `{hash8}.skills.auditor.eth` subnames on Base Sepolia
- [ ] Update `DEPLOYED-ADDRESSES.md` with both addresses

**`packages/skill-registry`:**
- [ ] `SkillRegistry` class — `checkStampByHash()`, `isVerified()`, `recordStamp()`
- [ ] vitest tests with mock viem client

**`packages/skill-ens`:**
- [ ] `SkillENS` class — `registerSkillSubname()`, `resolveSkillVerdict()`, `registerAuditorAgent()`
- [ ] Text record schema: `verdict`, `score`, `report`, `audited_at`, `auditor`, `skill_name`
- [ ] vitest tests

**Implement stubs in API:**
- [ ] `services/onchain-registry.ts` — implement `IOnchainRegistry` using `skill-registry` package
- [ ] `services/ens-registry.ts` — implement `IENSRegistry` using `skill-ens` package

**World AgentKit (with Ledger approval gate):**
- [ ] `services/agentkit-session.ts` — `createAuditAgent(worldIdProof)`: CDP wallet + AgentKit session tied to World ID nullifier
- [ ] `writeRegistryStampAction` — calls `/v1/ledger/propose`, polls `ledger_approvals` collection until `status=approved`, then broadcasts using returned signature
- [ ] `registerENSSubnameAction` — same Ledger approval gate for ENS registration
- [ ] CDP wallet persisted in MongoDB keyed by nullifier

**ERC-7730 Clear Signing (Ledger bounty):**
- [ ] `contracts/erc7730/SkillRegistry.json` — ERC-7730 metadata for `recordStamp()`:
  - `verdict` field as enum: `["unsafe","review_required","safe"]`
  - `score` field as raw integer
  - `reportCid` as raw bytes
- [ ] Validate locally: `npx @ledgerhq/clear-signing-erc7730-developer-tools validate contracts/erc7730/SkillRegistry.json`
- [ ] Submit PR to `LedgerHQ/clear-signing-erc7730-registry` after Base Sepolia deploy
- [ ] Update `DEPLOYED-ADDRESSES.md` with addresses (required in ERC-7730 `deployments` array)

### Key Design Rules
- Implement the stub interfaces exactly — do not change signatures (coordinate with core-pipeline if you need a change)
- `DEPLOYED-ADDRESSES.md` is your primary communication channel to other branches — keep it up to date
- AgentKit wallet is the signer for all on-chain writes — no separate private key management
- `writeRegistryStampAction` MUST poll for Ledger approval before broadcasting — never auto-sign
- For the hackathon: Base Sepolia is target; mainnet addresses go in after the hackathon

---

## Phase 1 — feat/frontend-apps (TEAMMATE B)

**Branches off `feat/core-pipeline` after Foundation Checkpoint.**
**Master plan coverage:** Parts 6.3, Part 10 Phase 0 P0.7**
**Note: MiniKit is out of scope — not included here.**

### Owned Directories
```
apps/
  skillauditor-app/
    app/
      explore/                 ← Public skill registry (browse all audited skills)
      skills/[hash]/           ← Public skill detail + test chat
        page.tsx
        test/page.tsx          ← SKILL TESTING CHAT
      dashboard/               ← Authenticated dashboard pages
    components/
      audit/                   ← Audit result UI
      skill/                   ← Skill cards + badges
      chat/                    ← Skill test chat + safety monitor
      ledger/                  ← Ledger DMK components (browser-only)
      ens/                     ← ENS name display
      world-id/                ← IDKit wrapper
    lib/
      ledger/dmk.ts            ← DMK singleton (browser-only, lazy init)
      x402-client.ts           ← x402-fetch wrapper
    (app/api/*, lib/auth.ts, components/providers/* — owned by core-pipeline, do not touch)
```

> Foundation already set up Privy auth, session routing, the proxy route, and the base layout. Teammate B builds ALL user-facing UI on top of that — no auth plumbing needed.

### Phase 1 Task List

**Skill explore + public pages:**
- [ ] `app/explore/page.tsx` — public registry: skill cards grid, filter by verdict/score/category, search by name
- [ ] `app/skills/[hash]/page.tsx` — public skill detail: verdict, score, findings, ENS name, onchain link, "Test this skill" CTA + pending Ledger approvals panel
- [ ] `app/skills/[hash]/test/page.tsx` — **skill testing chat** (sandboxed, no auth required)
- [ ] `app/api/chat/route.ts` — Vercel AI SDK streaming (`streamText`, mock tool set from audit findings)

**Dashboard pages:**
- [ ] `app/dashboard/page.tsx` — audit history table
- [ ] `app/dashboard/submit/page.tsx` — submit form + IDKit World ID widget
- [ ] `app/dashboard/settings/page.tsx` — API key management

**Audit + skill UI components:**
- [ ] `components/audit/audit-result-card.tsx` — verdict badge + score ring + findings list
- [ ] `components/audit/findings-list.tsx` — expandable by severity
- [ ] `components/audit/audit-status-poller.tsx` — polls until complete
- [ ] `components/skill/skill-card.tsx` — card for explore grid (verdict badge, score, ENS name)
- [ ] `components/skill/skill-badge.tsx` — inline embeddable safety badge
- [ ] `components/skill/skill-submit-form.tsx` — textarea + metadata fields
- [ ] `components/ens/ens-name-display.tsx` — `{hash8}.skills.auditor.eth` + Etherscan link
- [ ] `components/world-id/world-id-verifier.tsx` — IDKit component

**Skill test chat components:**
- [ ] `components/chat/skill-chat.tsx` — chat UI (two-panel: messages left, safety monitor right)
- [ ] `components/chat/chat-message.tsx` — message bubble, flags annotated findings inline
- [ ] `components/chat/safety-monitor.tsx` — live tool call log with finding match annotations

**Ledger components (browser-only, "use client"):**
- [ ] `lib/ledger/dmk.ts` — DMK singleton: `getDmk()` lazy init with `webHidTransportFactory`
- [ ] `components/ledger/ledger-connect.tsx` — device discovery + connect (must be inside click handler)
- [ ] `components/ledger/ledger-approve-modal.tsx` — shows pending approval summary, triggers Ledger signing, POSTs signature to `/api/proxy/v1/ledger/approve/:id`
- [ ] `components/ledger/ledger-status.tsx` — device state badge (connected / locked / disconnected)
- [ ] Wire `ledger-approve-modal` into `app/skills/[hash]/page.tsx` — polls for pending approvals related to this skill, shows modal when agent proposes stamp

**Payment:**
- [ ] `lib/x402-client.ts` — x402-fetch for Pro audit, signs EIP-3009 via Ledger `signTypedData()`
- [ ] Wire into `app/dashboard/submit/page.tsx` Pro tier flow

### Key Design Rules
- All API calls via `/api/proxy/[...path]` — never expose keys to browser
- `lib/ledger/dmk.ts` must be browser-only — never imported in server components or API routes
- `ledger-connect.tsx` Ledger discovery MUST be inside a click/user gesture handler (WebHID browser requirement)
- DMK uses RxJS observables — subscribe to `DeviceActionStatus.Pending/Completed/Error`
- `app/api/chat/route.ts` is an exception to the "no api routes" rule — Teammate B owns this one file
- Do not touch `app/api/auth/*`, `app/api/proxy/*`, `lib/auth.ts`, `lib/management-client.ts`, `components/providers/*`

---

## §6 — Integration Contract (Stub Interfaces)

Created by `feat/core-pipeline` in Phase 0. Teammate A implements. Teammate B consumes via API.

### `apps/skillauditor-api/src/services/onchain-registry.ts` (stub)
```typescript
// STUB — implemented by feat/onchain-identity
// Interface locked by feat/core-pipeline. Change requests go in BRANCH-REQUESTS.md

export interface IOnchainRegistry {
  recordStamp(params: {
    skillHash: string;
    verdict: 'safe' | 'review_required' | 'unsafe';
    score: number;
    reportCid: string;
    ensNode?: string;
  }): Promise<{ txHash: string }>;

  isVerified(skillHash: string): Promise<boolean>;
}

export const onchainRegistry: IOnchainRegistry = {
  async recordStamp(params) {
    console.log('[STUB] onchainRegistry.recordStamp', params);
    return { txHash: '0x0000000000000000000000000000000000000000' };
  },
  async isVerified(_hash) { return false; },
};
```

### `apps/skillauditor-api/src/services/ens-registry.ts` (stub)
```typescript
// STUB — implemented by feat/onchain-identity
// Interface locked by feat/core-pipeline. Change requests go in BRANCH-REQUESTS.md

export interface IENSRegistry {
  registerSkillSubname(skillHash: string, data: {
    verdict: string;
    score: number;
    reportCid: string;
    skillName: string;
    auditorAddress: string;
  }): Promise<{ ensName: string }>;

  resolveSkillVerdict(ensName: string): Promise<{
    verdict: string;
    score: number;
    reportCid: string;
  } | null>;
}

export const ensRegistry: IENSRegistry = {
  async registerSkillSubname(skillHash, data) {
    const shortHash = skillHash.slice(2, 10);
    console.log('[STUB] ensRegistry.registerSkillSubname', shortHash, data);
    return { ensName: `${shortHash}.skills.auditor.eth` };
  },
  async resolveSkillVerdict(_ensName) { return null; },
};
```

---

## §7 — Shared Files (Coordinate Before Touching)

| File | Owner | Rule |
|------|-------|------|
| `apps/skillauditor-api/src/index.ts` | `feat/core-pipeline` | Request router mounting via BRANCH-REQUESTS.md |
| `apps/skillauditor-api/package.json` | `feat/core-pipeline` | Request dep additions via BRANCH-REQUESTS.md |
| `DEPLOYED-ADDRESSES.md` | `feat/onchain-identity` | Only Teammate A writes here |
| `apps/skillauditor-api/.env.example` | `feat/core-pipeline` | Each branch documents vars in own ENV-VARS.md |
| Root `package.json` | `feat/core-pipeline` | Set up in Phase 0; no changes without coordination |
| `packages/skill-types/src/index.ts` | `feat/core-pipeline` | All shared types; request additions via BRANCH-REQUESTS.md |

---

## §8 — Merge Order & Integration Checkpoints

### Foundation Checkpoint (you announce this)
- `feat/core-pipeline` has: monorepo scaffold, skill-types, Privy auth, management routes, x402 middleware, MongoDB models, stub services, base app layout
- Teammates branch off: `git checkout feat/core-pipeline && git checkout -b feat/onchain-identity`

### Merge into `staging` in this order:
```
feat/onchain-identity → staging    contracts deployed, stubs implemented, DEPLOYED-ADDRESSES.md filled
feat/core-pipeline → staging       audit pipeline wired to real onchain/ENS services
feat/frontend-apps → staging       UI tested against staging API
```

### Checkpoint Protocol

| Checkpoint | Who announces | What's ready |
|-----------|---------------|-------------|
| **Foundation** | You | Scaffold done; teammates can branch |
| **Stub interfaces locked** | You | Types + stub signatures final; Teammate A can implement |
| **Contracts deployed** | Teammate A | Base Sepolia addresses in DEPLOYED-ADDRESSES.md; stubs implemented |
| **API on staging** | You | `/v1/submit` + pipeline running; Teammate B can test UI |
| **Demo ready** | All | End-to-end: submit → audit → ENS subname → onchain stamp → dashboard shows result |

---

## §9 — Agent Branch Detection Instructions

**When Claude Code or any AI agent is working on this project:**

```bash
# Step 1: always run this first
git branch --show-current
```

| Current Branch | Allowed files | Run tasks from |
|---------------|--------------|----------------|
| `feat/core-pipeline` | Phase 0 foundation files, then Phase 1 core-pipeline section | §3 (Phase 0) then §4 (Phase 1 core-pipeline) |
| `feat/onchain-identity` | `contracts/`, `packages/skill-registry`, `packages/skill-ens`, `apps/skillauditor-api/src/services/onchain-*\|ens-*\|agentkit-*`, `DEPLOYED-ADDRESSES.md` | §5 (Phase 1 onchain-identity) |
| `feat/frontend-apps` | `apps/skillauditor-app/app/dashboard/`, `apps/skillauditor-app/app/p/`, `apps/skillauditor-app/components/audit\|skill\|ens/`, `apps/skillauditor-app/lib/x402-client.ts` | §6 (Phase 1 frontend-apps) |
| `staging` | Read-only verification | Integration testing only |
| `main` | Read-only | Hotfixes only |

**Agent rules:**
- If asked to work outside owned files: STOP and explain the conflict to the user before proceeding
- Before creating any new file: verify path falls within the branch's owned directories
- If on `feat/onchain-identity` and the stub interface needs changing: document in `BRANCH-REQUESTS.md` and stop — do not modify the interface unilaterally

---

## §10 — Branch → Master Plan Cross-Reference

| MASTER-PLAN.md Section | Phase | Branch |
|------------------------|-------|--------|
| Part 1 (Audit Pipeline) | 1 | `feat/core-pipeline` |
| Part 2 (Onchain Registry) | 1 | `feat/onchain-identity` |
| Part 3.1 (World ID verification) | 0 (middleware) + 1 (route) | `feat/core-pipeline` |
| Part 3.2 (World AgentKit) | 1 | `feat/onchain-identity` |
| Part 4 (ENS) | 1 | `feat/onchain-identity` |
| Part 5 (x402 server middleware) | 0 | `feat/core-pipeline` |
| Part 5 (x402 client) | 1 | `feat/frontend-apps` |
| Part 6.2 API — v1 routes | 1 | `feat/core-pipeline` |
| Part 6.2 API — management routes | 0 | `feat/core-pipeline` |
| Part 6.2 API — onchain/ENS services | 1 | `feat/onchain-identity` |
| Part 6.3 (skillauditor-app auth + proxy) | 0 | `feat/core-pipeline` |
| Part 6.3 (skillauditor-app dashboard UI) | 1 | `feat/frontend-apps` |
| Part 7.1 (skill-types) | 0 | `feat/core-pipeline` |
| Part 7.2 (skill-auditor-core) | 1 | `feat/core-pipeline` |
| Part 7.3 (skill-registry) | 1 | `feat/onchain-identity` |
| Part 7.4 (skill-ens) | 1 | `feat/onchain-identity` |
| Part 8 (MongoDB models) | 0 | `feat/core-pipeline` |
| Part 10 Phase 0 — P0.1 (audit pipeline) | 1 | `feat/core-pipeline` |
| Part 10 Phase 0 — P0.2 (World ID) | 1 | `feat/core-pipeline` |
| Part 10 Phase 0 — P0.3 (AgentKit) | 1 | `feat/onchain-identity` |
| Part 10 Phase 0 — P0.4 (onchain registry) | 1 | `feat/onchain-identity` |
| Part 10 Phase 0 — P0.5 (ENS) | 1 | `feat/onchain-identity` |
| Part 10 Phase 0 — P0.7 (dashboard) | 1 | `feat/frontend-apps` |
| Part 3B (Ledger — API backend) | 1 | `feat/core-pipeline` |
| Part 3B (Ledger — ERC-7730 + AgentKit gate) | 1 | `feat/onchain-identity` |
| Part 3B (Ledger — browser DMK + components) | 1 | `feat/frontend-apps` |
| Part 6.3a (skill test chat + explore) | 1 | `feat/frontend-apps` |

> MiniKit (P0.6) removed from scope.

---

*This document must stay in sync with `SKILL-AUDITOR-MASTER-PLAN.md`. Section numbers above refer to that document's section numbering. Both files live in `main` and are readable by all branches.*

*Last updated: 2026-04-03. Changes: Ledger integration added across all three branches (API backend → core-pipeline, ERC-7730 + AgentKit Ledger gate → onchain-identity, browser DMK components → frontend-apps); skill testing chat and public explore registry added to Teammate B's tasks; cross-reference table updated. MiniKit removed from scope (2026-03-30).*
