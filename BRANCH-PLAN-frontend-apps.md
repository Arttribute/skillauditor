# Branch Plan — feat/frontend-apps

> Maps against `SKILL-AUDITOR-TEAM-PLAN.md` (§ Phase 1 — feat/frontend-apps) and `SKILL-AUDITOR-MASTER-PLAN.md` (Parts 6.3, 6.3a, 3B browser layer, Part 10 Phase 0 P0.7).
> **Last updated: 2026-04-04** — updated each time this branch executes the plan.

---

## Quick Reference

| Branch | `feat/frontend-apps` |
|--------|----------------------|
| Branches off | `feat/core-pipeline` (after Foundation Checkpoint) |
| Merges into | `staging` |
| Master plan sections | 6.3 (app UI), 6.3a (explore + skill test chat), 3B (Ledger browser), Part 10 P0.7 |
| Owned directories | `apps/skillauditor-app/app/`, `apps/skillauditor-app/components/audit\|skill\|chat\|ledger\|ens\|world-id/`, `apps/skillauditor-app/lib/ledger/`, `apps/skillauditor-app/lib/x402-client.ts`, `apps/skillauditor-app/app/api/chat/route.ts` |
| Do NOT touch | `app/api/auth/*`, `app/api/proxy/*`, `lib/auth.ts`, `lib/management-client.ts`, `components/providers/*`, `components/privy-provider.tsx` |

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Complete and on branch |
| 🚧 | In progress (current session) |
| ❌ | Not started |
| ⛔ | Blocked — waiting on teammate or external |

---

## Task Map — Phase 1 (feat/frontend-apps)

### Skill explore + public pages

| # | Task | File | Status | Blocker |
|---|------|------|--------|---------|
| B1 | Public skill registry page | `app/explore/page.tsx` | ✅ | — |
| B2 | Public skill detail page | `app/skills/[hash]/page.tsx` | ✅ | — |
| B3 | Skill testing chat page | `app/skills/[hash]/test/page.tsx` | ✅ | — |
| B4 | Chat API route (Vercel AI SDK) | `app/api/chat/route.ts` | ✅ | — |

### Dashboard pages

| # | Task | File | Status | Blocker |
|---|------|------|--------|---------|
| B5 | Dashboard index | `app/dashboard/page.tsx` | ✅ | — |
| B6 | Submit form page | `app/dashboard/submit/page.tsx` | ✅ | — |
| B7 | API key management page | `app/dashboard/settings/page.tsx` | ✅ | — |

### Audit + skill UI components

| # | Task | File | Status | Blocker |
|---|------|------|--------|---------|
| B8  | Audit result component | `components/audit/audit-result.tsx` | ✅ | — |
| B9  | Submit form component | `components/audit/submit-form.tsx` | ✅ | — |
| B10 | Recent audits component | `components/audit/recent-audits.tsx` | ✅ | — |
| B11 | Audit result page | `app/audits/[auditId]/page.tsx` | ✅ | — |
| B12 | Skill card component | `components/skill/skill-card.tsx` | ✅ | — |
| B13 | Skill badge component | `components/skill/skill-badge.tsx` | ✅ | — |
| B14 | ENS name display component | `components/ens/ens-name-display.tsx` | ✅ | — |
| B15 | World ID verifier component | `components/world-id/world-id-verifier.tsx` | ✅ | — |

### Skill test chat components

| # | Task | File | Status | Blocker |
|---|------|------|--------|---------|
| B16 | Chat UI (two-panel) | `components/chat/skill-chat.tsx` | ✅ | — |
| B17 | Chat message bubble | `components/chat/chat-message.tsx` | ✅ | — |
| B18 | Safety monitor panel | `components/chat/safety-monitor.tsx` | ✅ | — |

### Ledger browser components

| # | Task | File | Status | Blocker |
|---|------|------|--------|---------|
| B19 | DMK singleton | `lib/ledger/dmk.ts` | ✅ | — |
| B20 | Ledger connect component | `components/ledger/ledger-connect.tsx` | ✅ | — |
| B21 | Ledger approve modal | `components/ledger/ledger-approve-modal.tsx` | ✅ | — |
| B22 | Ledger status badge | `components/ledger/ledger-status.tsx` | ✅ | — |
| B23 | Wire approve modal into skill detail | `app/skills/[hash]/page.tsx` | ⛔ | Teammate A: contracts deployed + AgentKit session before real approvals flow |

### Payment

| # | Task | File | Status | Blocker |
|---|------|------|--------|---------|
| B24 | x402 fetch client | `lib/x402-client.ts` | ✅ | — |
| B25 | Wire x402 into submit Pro tier | `app/dashboard/submit/page.tsx` | ⛔ | Teammate A (core-pipeline x402 middleware must be live) |

---

## Blocking Dependencies

### Waiting on `feat/onchain-identity` (Teammate A)

| What we need | Why | Impact |
|--------------|-----|--------|
| `DEPLOYED-ADDRESSES.md` filled with Base Sepolia addresses | ENS name display needs real contract address for Etherscan links | B14 partial — renders stub ENS name; link will be real once addresses land |
| AgentKit session + `/v1/ledger/propose` live | Ledger approve modal polls for pending approvals; no real approvals until contracts run | B23 partial — modal renders but approval list will be empty |
| `SkillRegistry.sol` deployed | Skill detail "onchain stamp" section shows stamp data | B2 partial — stamp panel renders with null data until onchain |

### Waiting on `feat/core-pipeline` (You)

| What we need | Why | Impact |
|--------------|-----|--------|
| `x402.ts` middleware live on API | x402-client Pro tier payment gate needs server to demand payment | B25 blocked — x402 client implemented, wiring into submit page deferred |
| `services/world-id.ts` real verify | World ID verifier posts proof to `/v1/submit`; dev placeholder in use | B15 functional — IDKit posts correctly; server side is the stub |

---

## Master Plan Cross-Reference

| Master Plan Section | Branch Task(s) |
|---------------------|----------------|
| Part 6.3 (skillauditor-app dashboard UI) | B5, B6, B7, B8, B9, B10, B11 |
| Part 6.3a (skill test chat + explore registry) | B1, B2, B3, B4, B16, B17, B18 |
| Part 3B (Ledger browser DMK + components) | B19, B20, B21, B22, B23 |
| Part 5 (x402 client side) | B24, B25 |
| Part 3.1 World ID (frontend gate) | B15 |
| Part 4 ENS (display layer) | B12, B13, B14 |
| Part 10 Phase 0 P0.7 | B5, B6 |

---

## Key Design Rules (from Team Plan)

- All API calls via `/api/proxy/[...path]` — never expose keys to browser
- `lib/ledger/dmk.ts` must be browser-only — never imported in server components or API routes
- Ledger device discovery must be inside a click/user gesture handler (WebHID browser requirement)
- DMK uses RxJS observables — subscribe to `DeviceActionStatus.Pending/Completed/Error`
- `app/api/chat/route.ts` is the ONE exception to "no api routes" rule — Teammate B owns this file
- Do not touch `app/api/auth/*`, `app/api/proxy/*`, `lib/auth.ts`, `lib/management-client.ts`, `components/providers/*`

---

## Session Log

### 2026-04-04 (Session 1)

**Implemented this session:**
- B1 `app/explore/page.tsx` — public skill grid with verdict/score/search filters
- B2 `app/skills/[hash]/page.tsx` — skill detail with verdict, score, findings, ENS, onchain stamp panel, pending Ledger approvals panel
- B3 `app/skills/[hash]/test/page.tsx` — skill testing chat page
- B4 `app/api/chat/route.ts` — Vercel AI SDK `streamText` with mock tool set derived from audit findings
- B7 `app/dashboard/settings/page.tsx` — API key management UI
- B12 `components/skill/skill-card.tsx` — verdict badge, score, ENS name, link to detail
- B13 `components/skill/skill-badge.tsx` — embeddable inline safety badge
- B14 `components/ens/ens-name-display.tsx` — renders `{hash8}.skills.auditor.eth` with Etherscan link
- B15 `components/world-id/world-id-verifier.tsx` — IDKit wrapper, posts proof to `/v1/submit`
- B16 `components/chat/skill-chat.tsx` — two-panel: messages left, safety monitor right
- B17 `components/chat/chat-message.tsx` — message bubble with inline finding annotations
- B18 `components/chat/safety-monitor.tsx` — live tool call log with finding match annotations
- B19 `lib/ledger/dmk.ts` — DMK singleton with WebHID transport, RxJS observable
- B20 `components/ledger/ledger-connect.tsx` — device discovery inside click handler
- B21 `components/ledger/ledger-approve-modal.tsx` — polls pending approvals, triggers Ledger signing
- B22 `components/ledger/ledger-status.tsx` — device state badge
- B24 `lib/x402-client.ts` — x402 fetch wrapper, EIP-3009 signing via Ledger signTypedData

**Stopped at:**
- B23: Wire Ledger approve modal into skill page — blocked on Teammate A (AgentKit + contracts)
- B25: Wire x402 into submit Pro tier — blocked on core-pipeline x402 middleware being live

**Next session:** Once `feat/onchain-identity` is merged to staging:
1. Update `lib/ledger/dmk.ts` with real contract ABI from `packages/skill-registry`
2. Wire B23 — approve modal polls real pending approvals on skill detail page
3. Wire B25 — Pro tier submit uses x402-client when API demands payment
