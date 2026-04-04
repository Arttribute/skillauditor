# Branch Requests

> This file is the coordination channel between branches.
> Each branch uses this file to request changes to files it does NOT own.
> Owned-file rules are defined in `SKILL-AUDITOR-TEAM-PLAN.md §7`.
>
> **Process:** Open a request below → the owning branch implements it before or during staging merge.

---

## Open Requests

### REQ-001 — feat/onchain-identity → feat/core-pipeline
**Date:** 2026-04-04  
**Status:** Open  
**File:** `apps/skillauditor-api/package.json` (owned by `feat/core-pipeline`)  
**Request:** Add `@coinbase/cdp-sdk` to dependencies

**Why:** `services/agentkit-session.ts` currently falls back to `AUDITOR_AGENT_PRIVATE_KEY` directly.
Wiring the real CDP SDK requires this package so `createAuditAgent()` can call
`CdpClient.evm.createWallet()` and store the managed wallet address.

**Proposed addition:**
```json
"@coinbase/cdp-sdk": "^0.14.0"
```

**Impact:** Enables full AgentKit wallet-per-nullifier for the World AgentKit bounty.
No breaking changes to existing routes.

---

## Retroactive notices (already done — no action needed)

### RETRO-001 — feat/onchain-identity modified `apps/skillauditor-api/package.json`
**Date:** 2026-04-04  
**File:** `apps/skillauditor-api/package.json` (owned by `feat/core-pipeline`)  
**Change:** Added two workspace-internal dependencies:
```json
"@skillauditor/skill-ens": "workspace:*",
"@skillauditor/skill-registry": "workspace:*"
```
**Rationale:** These are workspace packages (no external registry, no lockfile churn beyond
within the monorepo). They reference packages created by this branch and are required for
`services/onchain-registry.ts` and `services/ens-registry.ts` to compile.  
**Merge risk:** Low — workspace refs resolve at build time; no version pinning involved.  
**Action needed by core-pipeline:** None, but be aware when merging to staging.

---

## Closed Requests

_(none yet)_
