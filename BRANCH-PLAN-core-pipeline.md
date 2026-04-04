# Branch Plan — `feat/core-pipeline`

> This file tracks work specific to the `feat/core-pipeline` branch.  
> **Do NOT modify `SKILL-AUDITOR-MASTER-PLAN.md` or `SKILL-AUDITOR-TEAM-PLAN.md`.**  
> Update this file every time work is executed on this branch.
>
> Cross-reference: Team Plan §4 (Phase 0 — Foundation) + §5 (Phase 1 — feat/core-pipeline)  
> Master Plan Parts: 1, 7.2, Part 10 Phase 0 P0.1 + P0.2  
> Last updated: 2026-04-04 (session 4)

---

## Owned Directories

```
apps/
  skillauditor-api/src/
    index.ts                    ← entry point — only this branch mounts routers
    routes/v1/                  ← all v1 API routes
    services/
      audit-pipeline.ts
      static-analyzer.ts
      content-analyst.ts
      sandbox-runner.ts
      verdict-agent.ts
      world-id.ts               ← new: World ID 4.0 verification
      ipfs.ts                   ← new: Pinata IPFS upload
    middleware/
      auth.ts
      rate-limit.ts
      x402.ts                   ← new: x402 payment gate
packages/
  skill-types/                  ← all shared TypeScript interfaces
root package.json, pnpm-workspace.yaml, tsconfig.base.json
BRANCH-PLAN-core-pipeline.md   ← this file
```

---

## Full Task Checklist (Team Plan §5 line-by-line)

### Phase 0 — Foundation

| Task | File | Status |
|------|------|--------|
| Monorepo scaffold | root files | ✅ Done |
| `packages/skill-types` — all interfaces | `packages/skill-types/src/index.ts` | ✅ Done |
| API server (Hono) | `src/index.ts` | ✅ Done |
| MongoDB models (5) | `src/db/models/` | ✅ Done |
| Auth middleware (Privy + API key) | `src/middleware/auth.ts` | ✅ Done |
| Rate limiting middleware | `src/middleware/rate-limit.ts` | ✅ Done |
| Management routes (users, orgs, api-keys, usage) | `src/routes/management/` | ✅ Done |
| Stub services (onchain-registry, ens-registry) | `src/services/` | ✅ Done (now real impls, merged from feat/onchain-identity) |
| `x402.ts` payment middleware | `src/middleware/x402.ts` | ✅ Done (session 4) |

### Phase 1 — Audit Engine + World ID + API backbone

| Task | File | Status | Notes |
|------|------|--------|-------|
| Static analyzer — parse + hash SKILL.md | `services/static-analyzer.ts` | ✅ Done | |
| Content analyst — LLM semantic scan | `services/content-analyst.ts` | ✅ Done | |
| Sandbox runner — mock tool execution | `services/sandbox-runner.ts` | ✅ Done | |
| Verdict agent — final LLM synthesis | `services/verdict-agent.ts` | ✅ Done | |
| Pipeline orchestrator | `services/audit-pipeline.ts` | ✅ Done (IPFS wired, session 4) | |
| `routes/v1/submit.ts` | `routes/v1/submit.ts` | ✅ Done (World ID 4.0, session 4) | Real proof verification; dev bypass when env absent |
| `routes/v1/audits.ts` | `routes/v1/audits.ts` | ✅ Done | |
| `routes/v1/skills.ts` | `routes/v1/skills.ts` | ✅ Done | |
| `routes/v1/verify.ts` | `routes/v1/verify.ts` | ✅ Done | |
| `routes/v1/ledger.ts` stubs | `routes/v1/ledger.ts` | ✅ Done (501 stubs — Blocker 2) | |
| `services/world-id.ts` — World ID 4.0 verify + nullifier dedup | `services/world-id.ts` | ✅ Done (session 4) | Uses RP_ID + RP_SIGNING_KEY; dev bypass when env absent; nullifier rate limit 5 free/1 pro per 24h |
| `services/ipfs.ts` — Pinata upload | `services/ipfs.ts` | ✅ Done (session 4) | reportCid flows into AuditReport + onchain stamp; no-op when PINATA_JWT absent |
| `middleware/x402.ts` — x402 payment gate | `middleware/x402.ts` | ✅ Done (session 4) | Returns 402 with USDC payment details; verifies via facilitator; no-op when TREASURY_ADDRESS absent |
| Wire Ledger approval gate in pipeline | `services/audit-pipeline.ts` | ⏳ Blocked | Blocker 2: Ledger routes still 501 |
| vitest unit tests | various | ⏳ Pending | |

---

## Active Blockers

### Blocker 2 — Ledger approval gate (owned by this branch, needs Teammate A's AgentKit)
**Context:** `audit-pipeline.ts` calls `onchainRegistry.recordStamp()` directly. The real flow should be:  
1. Pipeline triggers `ledger/propose` to request Ledger hardware approval  
2. Waits for `ledger/pending/:id` to return `status=approved`  
3. Then broadcasts the stamp  
**Why blocked:** The `/v1/ledger/propose` and `/v1/ledger/pending/:id` routes are 501 stubs — the real implementation requires Teammate A's AgentKit session (`agentkit-session.ts`) to be integrated. Teammate A's branch (`feat/onchain-identity`) has `agentkit-session.ts` implemented and merged.  
**Workaround in place:** `audit-pipeline.ts` calls `recordStamp()` directly, bypassing the Ledger gate.  
**Action to unblock:** Wire `agentkit-session.ts` into the ledger routes (POST/GET), then update `audit-pipeline.ts` to poll the gate. This is low-effort once `feat/onchain-identity` is confirmed merged to staging.

---

## ENV vars this branch owns

Set in `apps/skillauditor-api/.env`:

```bash
# ── World ID 4.0 ──────────────────────────────────────────────────────────────
WORLD_RP_ID=rp_...                  # from developer.worldcoin.org (replaces WORLD_APP_ID)
WORLD_RP_SIGNING_KEY=...            # backend only — never expose to frontend
WORLD_ACTION=submit-skill-for-audit # the IDKit action string

# ── IPFS (Pinata) ─────────────────────────────────────────────────────────────
PINATA_JWT=...                      # from app.pinata.cloud

# ── x402 payments ─────────────────────────────────────────────────────────────
SKILLAUDITOR_TREASURY_ADDRESS=0x... # wallet that receives Pro audit USDC payments
# USDC on Base is a known constant (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
# x402 facilitator default: https://x402.org/facilitate

# ── Already set (Phase 0 + feat/onchain-identity merge) ──────────────────────
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
ANTHROPIC_API_KEY=...
MONGODB_URI=...
SKILL_REGISTRY_ADDRESS=0x87C3E6C452585806Ef603a9501eb74Ce740Cafcc
SKILL_REGISTRY_CHAIN_ID=84532
AUDITOR_AGENT_PRIVATE_KEY=...
BASE_RPC_URL=...
CDP_API_KEY_NAME=...
CDP_API_KEY_PRIVATE_KEY=...
```

---

## World ID 4.0 — implementation notes

**Why RP_ID not APP_ID:**  
World ID 4.0 renamed `app_id` → `rp_id` (Relying Party). New verify endpoint:  
`POST https://developer.world.org/api/v4/verify/{rp_id}`

**Why RP_SIGNING_KEY:**  
Prevents proof phishing — your backend signs a signal/challenge before the user's World App generates the proof. The signal binds the proof to a specific session so it cannot be replayed on another app's endpoint.

**Dev bypass:**  
When `WORLD_RP_ID` is not set, `verifyWorldIDProof` returns a synthetic dev result with  
`nullifier_hash = dev_{skillHash}`. The submit route warns in logs but continues. This allows  
the pipeline to run without a World App during development.

**Nullifier rate limiting:**  
5 free audits per nullifier per 24 hours (MongoDB count query against `Audit` collection).  
1 Pro audit per nullifier per 24 hours. Enforced in `services/world-id.ts:checkNullifierRateLimit`.

---

## Merge readiness

| Checkpoint | Status |
|-----------|--------|
| 4-stage audit pipeline | ✅ |
| v1 routes (submit, audits, skills, verify, ledger) | ✅ |
| World ID 4.0 real verification | ✅ (dev bypass when creds absent) |
| IPFS report upload | ✅ (no-op when PINATA_JWT absent) |
| x402 payment middleware | ✅ (no-op when TREASURY_ADDRESS absent) |
| Ledger approval gate | ⏳ Blocked — direct stamp broadcast as fallback |
| Unit tests | ⏳ Pending |

**Merge-to-staging recommendation:** Ready for staging merge. All critical paths have graceful  
fallbacks when env vars are absent. Ledger gate and tests can follow in the next session.
