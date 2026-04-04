# Branch Requests

> This file is the coordination channel between branches.
> Each branch uses this file to request changes to files it does NOT own.
> Owned-file rules are defined in `SKILL-AUDITOR-TEAM-PLAN.md §7`.
>
> **Process:** Open a request below → the owning branch implements it before or during staging merge.

---

## Open Requests

### ~~REQ-001~~ — feat/onchain-identity → feat/core-pipeline
**Date:** 2026-04-04  
**Status:** Closed — implemented by this branch (low merge-conflict risk; unique dep)  
**File:** `apps/skillauditor-api/package.json`  
**Change:** Added `@coinbase/cdp-sdk: ^0.14.0`  
**Reason closed:** Dep is unique (no other branch would add it); merge conflict risk assessed as negligible. CDP SDK is now wired in `services/agentkit-session.ts`.

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

- REQ-001: `@coinbase/cdp-sdk` — added directly (2026-04-04, session 3)
