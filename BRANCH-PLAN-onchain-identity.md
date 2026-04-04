# Branch Plan — `feat/onchain-identity`

> This file tracks work specific to the `feat/onchain-identity` branch.  
> **Do NOT modify `SKILL-AUDITOR-MASTER-PLAN.md` or `SKILL-AUDITOR-TEAM-PLAN.md`.**  
> Update this file every time work is executed on this branch.
>
> Cross-reference: Team Plan §5 (Phase 1 — feat/onchain-identity)  
> Master Plan Parts: 2, 3.2, 4, 7.3, 7.4, Part 10 P0.3–P0.5  
> Last updated: 2026-04-04 (session 4 — World AgentKit third-party agent flow implemented)

---

## Owned Directories (never touch anything outside these)

```
contracts/
  src/             ← Solidity contracts (SkillRegistry.sol, SkillSubnameRegistrar.sol)
  test/            ← Foundry tests
  script/          ← Deploy.s.sol
  erc7730/         ← Ledger Clear Signing metadata
packages/
  skill-registry/  ← TypeScript viem wrapper for SkillRegistry.sol
  skill-ens/       ← TypeScript ENS client
apps/
  skillauditor-api/src/services/
    onchain-registry.ts   ← implement IOnchainRegistry stub
    ens-registry.ts       ← implement IENSRegistry stub
    agentkit-session.ts   ← new file (WorldAgentKit)
DEPLOYED-ADDRESSES.md     ← only this branch writes here
```

---

## Full Task Checklist (Team Plan §5 line-by-line)

### Contracts

| Task | File | Status | Notes |
|------|------|--------|-------|
| `SkillRegistry.sol` — `recordStamp()`, `getStamp()`, `isVerified()` | `contracts/src/SkillRegistry.sol` | ✅ Done | Full implementation: stamp struct, access control, events, pagination |
| Foundry setup, `foundry.toml`, compile + tests | `contracts/foundry.toml`, `contracts/test/SkillRegistry.t.sol` | ✅ Done | Unit + fuzz tests; 30+ test cases |
| Deploy to Base Sepolia | `contracts/script/Deploy.s.sol` | ✅ Done | `0x87C3E6C452585806Ef603a9501eb74Ce740Cafcc` |
| `SkillSubnameRegistrar.sol` — registers `{hash8}.skills.auditor.eth` | `contracts/src/SkillSubnameRegistrar.sol` | ✅ Written / ⏳ Deploy blocked | Contract complete; needs ENS addresses to deploy (Blocker 1) |
| Update `DEPLOYED-ADDRESSES.md` with both addresses | `DEPLOYED-ADDRESSES.md` | ⚠️ Partial | SkillRegistry ✅; SkillSubnameRegistrar pending deploy |

### `packages/skill-registry`

| Task | File | Status | Notes |
|------|------|--------|-------|
| `SkillRegistryClient` — `checkStampByHash()`, `isVerified()`, `recordStamp()` | `packages/skill-registry/src/index.ts` | ✅ Done | Also includes `revokeStamp`, `updateEnsNode`, `totalStamped`, `getStampedHashes` |
| vitest tests with mock viem client | `packages/skill-registry/src/index.test.ts` | ✅ Done | 25+ cases; mocks createPublicClient / createWalletClient |

### `packages/skill-ens`

| Task | File | Status | Notes |
|------|------|--------|-------|
| `SkillENSClient` — `registerSkillSubname()`, `resolveSkillVerdict()`, `registerAuditorAgent()` | `packages/skill-ens/src/index.ts` | ✅ Done | Full `IENSRegistry` impl |
| Text record schema: `verdict`, `score`, `report`, `audited_at`, `auditor`, `skill_name` | `packages/skill-ens/src/index.ts` | ✅ Done | Also includes `skill_hash` |
| vitest tests | `packages/skill-ens/src/index.test.ts` | ✅ Done | 20+ cases; covers namehash util, register, resolve, text record update |

### Implement stubs in API

| Task | File | Status | Notes |
|------|------|--------|-------|
| `services/onchain-registry.ts` — implement `IOnchainRegistry` using `skill-registry` | `apps/skillauditor-api/src/services/onchain-registry.ts` | ✅ Done | Delegates to `SkillRegistryClient`; env-gated no-op when keys absent |
| `services/ens-registry.ts` — implement `IENSRegistry` using `skill-ens` | `apps/skillauditor-api/src/services/ens-registry.ts` | ✅ Done | Delegates to `SkillENSClient`; graceful stub fallback when registrar not deployed |

### World AgentKit — Third-Party Agent Verification (bounty track)

> Implements the World AgentKit bounty requirement: third-party agents present a
> signed credential proving they are backed by a World ID-verified human, without
> needing to embed a ZK proof in every request.

| Task | File | Status | Notes |
|------|------|--------|-------|
| `middleware/world-agentkit.ts` — parse `agentkit` header, validate SIWE message, verify signature, AgentBook lookup | `apps/skillauditor-api/src/middleware/world-agentkit.ts` | ✅ Done | Full flow: `parseAgentkitHeader` → `validateAgentkitMessage` → MongoDB nonce replay guard → `verifyAgentkitSignature` → `createAgentBookVerifier` → attaches `agentHumanId` to context |
| `routes/v1/agent-submit.ts` — `/v1/agent/submit` endpoint for human-backed agents | `apps/skillauditor-api/src/routes/v1/agent-submit.ts` | ✅ Done | Protected by `worldAgentkitMiddleware`. Uses `agentHumanId` as nullifier for rate limiting. Routes through same `proPaymentGate` (x402) as browser submissions. Calls `startAuditPipeline` with `worldIdVerificationLevel: 'orb'`. |
| Wire `/v1/agent/submit` in `index.ts` with `worldAgentkitMiddleware` + `proPaymentGate` | `apps/skillauditor-api/src/index.ts` | ✅ Done | Order: `submitRateLimit` → `worldAgentkitMiddleware` → `proPaymentGate` → route handler |
| Add `@worldcoin/agentkit@^0.1.6` dependency | `apps/skillauditor-api/package.json` | ✅ Done | |
| Add `WORLD_CHAIN_RPC_URL` + `WORLD_AGENTKIT_NETWORK` env vars | `.env.example` | ✅ Done | Dev bypass: leave `WORLD_CHAIN_RPC_URL` unset; send `agentkit: dev:<address>` header |

### CDP AgentKit — Onchain Stamp Signing (Coinbase CDP SDK)

> Note: this is separate from World AgentKit above. `agentkit-session.ts` manages
> CDP wallets for signing `SkillRegistry.recordStamp()` transactions — not for
> verifying incoming agent requests.

| Task | File | Status | Notes |
|------|------|--------|-------|
| `services/agentkit-session.ts` — CDP wallet per World ID nullifier | `apps/skillauditor-api/src/services/agentkit-session.ts` | ✅ Built / ⚠️ Not wired | File is complete; `createAuditAgent` is exported but not yet called from `audit-pipeline.ts` (pipeline calls `onchainRegistry.recordStamp()` directly) |
| `writeRegistryStampAction` — Ledger approval gate then CDP broadcast | `agentkit-session.ts` | ✅ Built / ⏳ Gate blocked | Gate bypasses when `/v1/ledger/propose` returns 501 (Blocker 2) |
| `registerENSSubnameAction` — same gate for ENS registration | `agentkit-session.ts` | ✅ Built / ⏳ Gate blocked | Same bypass behaviour |
| CDP wallet persisted in MongoDB keyed by nullifier | `agentkit-session.ts` (CdpWallet model) | ✅ Done | `mode` field: `cdp` vs `dev` fallback |

### ERC-7730 Clear Signing (Ledger bounty)

| Task | File | Status | Notes |
|------|------|--------|-------|
| `contracts/erc7730/SkillRegistry.json` — metadata for `recordStamp()` | `contracts/erc7730/SkillRegistry.json` | ✅ Done | All 5 write functions; verdict as labeled enum; Nano + Stax screen layouts |
| Validate locally | — | ✅ Done (structural) | npm package not yet published; structural Python check passed 0 errors. Run from source: `github.com/LedgerHQ/clear-signing-erc7730-developer-tools` |
| Submit PR to `LedgerHQ/clear-signing-erc7730-registry` | — | ⏳ Blocked | Needs Basescan contract verification first (Blocker 3) |
| `DEPLOYED-ADDRESSES.md` deployments array in ERC-7730 JSON | `contracts/erc7730/SkillRegistry.json` | ✅ Done | Base Sepolia address already in `deployments` array |

---

## Active Blockers

### Blocker 1 — ENS root node / registrar deploy
**Owned by:** external infra  
**Needs:** ENS registry + resolver addresses on Base Sepolia + namehash of `skills.auditor.eth`  
**Workaround in place:** `registerSkillSubname()` returns a deterministically-derived name without on-chain write  
**Unblocked when:** ENS L2 contracts confirmed on Base Sepolia (or decision to use L1 Sepolia ENS)  
**Remaining work once unblocked:** `forge script Deploy.s.sol` with ENS vars → fill `DEPLOYED-ADDRESSES.md`

### Blocker 2 — Ledger API routes (feat/core-pipeline)
**Owned by:** `feat/core-pipeline`  
**Needs:** `/v1/ledger/propose` and `/v1/ledger/pending/:id` implemented (currently 501)  
**Workaround in place:** `agentkit-session.ts` detects 501, logs warning, falls back to direct broadcast  
**Unblocked when:** core-pipeline ledger routes are live on staging

### Blocker 3 — Basescan contract verification (for ERC-7730 PR)
**Owned by:** this branch  
**Needs:** `forge verify-contract` after confirming Basescan API key works  
**Unblocked when:** verification confirmed on [sepolia.basescan.org](https://sepolia.basescan.org/address/0x87c3e6c452585806ef603a9501eb74ce740cafcc)  
**Remaining work once unblocked:** submit PR to `LedgerHQ/clear-signing-erc7730-registry`

---

## Remaining work (not blocked)

| Task | Effort | Priority |
|------|--------|----------|
| ~~Wire full CDP SDK~~ | — | ✅ Done — CDP SDK wired (session 3) |

---

## Merge readiness

| Checkpoint (Team Plan §8) | Status |
|--------------------------|--------|
| Contracts deployed; stubs implemented | ✅ SkillRegistry deployed; ens/onchain stubs replaced |
| `DEPLOYED-ADDRESSES.md` filled | ⚠️ SkillRegistry ✅ — SkillSubnameRegistrar pending |
| `onchain-registry.ts` real impl | ✅ |
| `ens-registry.ts` real impl (with graceful fallback) | ✅ |
| `agentkit-session.ts` present (CDP stamp signing) | ✅ |
| `world-agentkit.ts` middleware present (third-party agent auth) | ✅ |
| `/v1/agent/submit` route live | ✅ |
| ERC-7730 JSON present | ✅ |
| SkillSubnameRegistrar deployed | ⏳ Blocker 1 |
| Ledger approval gate live | ⏳ Blocker 2 |
| vitest tests written | ✅ Both packages |

**Merge-to-staging recommendation:** ready now for core functionality (onchain stamps work end-to-end). ENS subname registration and Ledger gate are gracefully degraded. Merge and iterate on the two blockers from staging.

---

## ENV vars this branch owns

Set in `apps/skillauditor-api/.env`:

```bash
# ── Onchain registry — active now ──────────────────────────────────────────
SKILL_REGISTRY_ADDRESS=0x87C3E6C452585806Ef603a9501eb74Ce740Cafcc
SKILL_REGISTRY_CHAIN_ID=84532
AUDITOR_AGENT_PRIVATE_KEY=<deployer EOA private key>

# ── ENS — fill after SkillSubnameRegistrar deployed (Blocker 1) ────────────
SKILL_SUBNAME_REGISTRAR_ADDRESS=     # TBD
ENS_REGISTRY_ADDRESS=                # TBD — Base Sepolia ENS registry
ENS_RESOLVER_ADDRESS=                # TBD — Base Sepolia public resolver
ENS_ROOT_NODE=                       # TBD — namehash("skills.auditor.eth")

# ── CDP AgentKit (onchain stamp signing) ──────────────────────────────────
CDP_API_KEY_NAME=                    # Coinbase CDP API key name
CDP_API_KEY_PRIVATE_KEY=             # Coinbase CDP API key private key

# ── World AgentKit (third-party agent verification) ────────────────────────
WORLD_CHAIN_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public
WORLD_AGENTKIT_NETWORK=world         # "world-testnet" for testnet AgentBook
```
