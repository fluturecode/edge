# Edge — Complete Project Handoff v4
*Last updated: August 19, 2026 — EdgePassV2 migration*
*Hours invested: ~60 hours total (pre-v4 update)*

---

## New Chat Prompt

> I'm building Edge Protocol — programmable trust infrastructure for autonomous AI agents on Sui. Repo: github.com/fluturecode/edge. Live: edge-web-cyan.vercel.app. SDK: @edge-protocol/sdk@2.0.0 (EdgePassV2 — issuer/agent separation, velocity limits, on-chain denials; testnet only — see Network Status). Submitted to Sui Overflow 2026 on June 21. Read HANDOFF.md before continuing.

---

## Project Overview

**Edge** is programmable trust infrastructure for autonomous AI agents, built on Sui for Sui Overflow 2026 (Agentic Web track).

**Pitch:** EdgePass gives agents your rules, not your keys.
**Tagline:** The best infrastructure is invisible.
**Status:** SUBMITTED ✅

---

## Repo & Links

- **GitHub:** https://github.com/fluturecode/edge
- **Live app:** https://edge-web-cyan.vercel.app
- **npm:** https://npmjs.com/package/@edge-protocol/sdk
- **Mainnet contract:** https://suiscan.xyz/mainnet/object/0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde
- **Testnet contract:** https://suiscan.xyz/testnet/object/0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d

---

## Network Status

**v2 (`edge_pass_v2`, the only creation path) is TESTNET ONLY.** `apps/web` only ever creates/reads v2 passes, so it must run with `NEXT_PUBLIC_SUI_NETWORK=testnet` — pointing it at mainnet makes `assertV2Available()` throw before signing. v1 (`edge_pass`) remains on mainnet, fetch/inspect/revoke only, no creation path.

```
v1 — mainnet Package ID: 0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde
v1 — mainnet Deploy Tx:   4REcPLezK8gFGyUKJcMnnFXxTTvk8vbxqjU62NMeRJuS
v1 — testnet Package ID:  0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d
v2 — testnet Package ID:  0xe781abc2d83f5400a2863501a40e0ed9c68f5af63c62f050c564bacaf495361a
v2 — mainnet Package ID:  (none — not published yet)
```

These mirror `packages/sdk/src/utils/constants.ts`'s `EDGE_PACKAGE_ID` and `apps/web/lib/sui-client.ts`'s `V2_PACKAGE_IDS`, both keyed `{ network: { v1, v2 } }` and derived from `SUI_NETWORK` so package ID and network can't drift apart.

---

## SDK v2.0.0 — Full API Surface

**EdgePassV2 (current, the only creation path)** — issuer/agent separation: `issuer` grants/revokes, `agent` spends, neither can do the other's job. `escalateAbove` replaces v1's `escalateThreshold` (see "v1 → v2 gotcha" below — do not confuse with v1's dead `autoThreshold`). `maxPerTransaction` is now required and hard-enforced on chain. New `velocityCap`/`velocityWindowMs` rolling rate limit, enforced on chain. `approvedMerchants` is addresses now, not display names. v1 passes remain fetchable/inspectable/revocable but there's no v1 creation path anymore.

**Core:**
- `sdk.create(config, signer)` — mint EdgePassV2 on Sui. Config: `{ agent, issuer?, budget, escalateAbove, maxPerTransaction, velocityCap, velocityWindowMs, approvedMerchants, expiryMs }`
- `sdk.execute(pass, request, signer)` — requires `EdgePassObjectV2`; returns approved/blocked/escalated/error. `blocked` can carry `digest`/`abortCode` if `onChainDenials` (default on) recorded the denial as an aborted tx
- `sdk.validate(pass, request)` — requires `EdgePassObjectV2`; zero network, <1ms preview
- `sdk.simulate(pass, requests[])` — predict full session, zero network
- `sdk.fetch(objectId)` — get live pass from chain, `EdgePassObjectV1 | EdgePassObjectV2` — narrow with `isV2()` before execute/validate
- `sdk.revoke(pass, signer)` — revoke on-chain, works on either version

**Budget & velocity helpers:**
- `sdk.velocityStatus(pass)` — cap/used/remaining/windowResetsAt/isExhausted/isUnlimited
- `sdk.budgetStatus(pass)` — full snapshot
- `sdk.utilizationPct(pass)` — 0-100
- `sdk.isNearLimit(pass, threshold?)` — default 80%
- `sdk.remainingBudget(pass)` — MIST
- `sdk.timeRemaining(pass)` — ms
- `sdk.isExpiringSoon(pass, withinMs?)` — default 1hr

**Static:**
- `EdgePass.fromTemplate(template, overrides)` — 6 templates (added `x402`), `overrides` now needs `{ agent: string }`
- `EdgePass.withPolicy(pass, signer, sdk, fn)` — HOF for AI tools

**Events:**
- `sdk.on/off/removeAllListeners('approved'|'escalated'|'blocked')`

**React hooks (`@edge-protocol/sdk/react`):**
- `useEdgePass` — full featured
- `useBudgetStatus` — lightweight
- `useSimulate` — reactive

**v1.0.0 enterprise hardening (see `packages/sdk/README.md` "What's New"):** `createWithFireblocks()` idempotency, `ComplianceEngine` (6th dimension), `DynamicIdentityBinding`, real `WalrusAudit` mainnet storage.

**39 passing tests** (was 34 before EdgePassV2 — added `maxPerTransaction`/velocity coverage and 2 tests asserting `create()` throws on a stray v1 `escalateThreshold`/`autoThreshold` key).

**v1 → v2 gotcha, if you're touching config code:** v1's `escalateThreshold` (the field that actually drove escalation) maps to v2's `escalateAbove`. v1's `autoThreshold` was dead in v1 (never enforced) and has no v2 equivalent — don't carry it over. Full writeup: `packages/sdk/DOCS.md` → "v1 → v2 Migration Notes".

---

## Critical Architecture Notes

**Gotcha: gRPC pre-flight simulate sends on-chain denials back to "never reached chain."** Symptom, all three triggers below: an `execute()` call that should produce a real, verifiable `blocked` outcome (a Move abort) instead comes back with `digest: undefined`. It still *looks* like an on-chain denial — `status: 'blocked'` and a regex-matched `abortCode` are both populated — but `onChainDenials` recorded nothing, because nothing was ever submitted. This one symptom has three independent triggers; any single one is sufficient to reproduce it, and fixing only some of them still leaves the bug live:

1. **Unresolved object arguments.** v2 passes are shared objects (`transfer::share_object` in `edge_pass_v2`), not owned. `tx.object(pass.id)` on a shared object still produces a valid input, but has to client-side resolve the object first.
2. **Missing gas payment.** `ExecutionEngine.buildPTB()` only calls `tx.setGasBudget(...)` — it deliberately never sets `tx.setGasPayment(...)` itself.
3. **Missing gas price.** Same deliberate omission — `buildPTB()` never calls `tx.setGasPrice(...)`.

Root cause, shared by all three: `@mysten/sui`'s gRPC `Transaction.build()` calls `needsTransactionResolution()` before submitting, which checks *both* object and gas inputs — it fires whenever an object argument needs resolving, **or** gas price, **or** gas payment isn't already set (gas budget alone isn't enough). When it fires, `build()` runs a client-side pre-flight `simulateTransaction` — a real dry run, Move call included — and if that dry run predicts a Move abort, `build()` throws a `SimulationError` **instead of** submitting. `ExecutionEngine.execute()`'s `blocked` branch used to catch that thrown error and still return `blocked` with the regex-matched `abortCode`, which is how this silently defeated the entire `onChainDenials` feature.

Fix, one per trigger — all three needed together, since any one left unaddressed still trips `needsTransactionResolution()`:

- **Object argument** — use `tx.sharedObjectRef({ objectId, initialSharedVersion, mutable })` instead of `tx.object(pass.id)`. `objectId`/`initialSharedVersion`/`mutable` are all supplied up front, so `build()` has nothing to resolve and skips the gate entirely, whether or not the transaction is actually going to abort on chain. `initialSharedVersion` is fixed at the moment the object is shared and never changes afterward (unlike its current `version`, which changes on every mutation) — it's part of a shared object's identity, so it's fetched once in `ExecutionEngine.fetchPass()` and cached on `EdgePassObjectV2` indefinitely. v1 passes are still `transfer::transfer`'d to `owner` — genuinely owned, not shared — so `tx.object(pass.id)` remains correct (and the only option) for v1's `revoke_pass`; this fix is v2-only.
- **Gas payment / gas price** — resolving these means knowing which address (and which client) is actually paying for gas, and that's the signer's call, not the engine's: a direct wallet pays from its own coins (see `apps/web/lib/signer.ts`), a sponsored signer (Enoki) pays from a completely different address the engine has no business assuming. So `ExecutionEngine.buildPTB()` deliberately leaves both unset, and **any signer implementation that wants a real, verifiable on-chain denial must call `tx.setGasPrice(...)` and `tx.setGasPayment([...])` itself** before building/submitting. `packages/sdk/src/e2e.testnet.ts`'s `resolveGasForSender` shows a direct-wallet version of this (including carrying the gas coin's new version forward from each transaction's own effects, since firing transactions back to back with no delay hits the same read-after-write staleness on the gas coin that it does on the pass — see the next section).

Confirmed fixed (all three triggers addressed) by running the live testnet e2e (`packages/sdk/src/e2e.testnet.ts`) — see the SDK README for the resulting package ID and one digest per outcome, each resolvable on Suiscan.

Still never use `tx.objectRef()` for the pass — that snapshots a specific version+digest and causes version conflicts with Enoki sponsorship. That guidance is unrelated to (and unaffected by) the above; `tx.sharedObjectRef()` and `tx.objectRef()` are different APIs for different object ownership models.

**Sequential execution** — 2s settle delay between approved txs. Prevents Sui object version conflicts. Note: `sdk.fetch()` no longer needs this delay for its own read-after-write correctness — `ExecutionEngine` now tracks the digest of its own last write per object and has `fetchPass()` wait on that specific transaction's effects before reading (see `ExecutionEngine.registerWrite`/`waitForReadConsistency`), verified by the live e2e running create → execute → fetch → three denials back to back with zero artificial delay. This settle delay is still relevant for a caller doing its own rapid-fire sequential *writes* against a shared object outside the SDK's tracking (e.g. two different signer instances racing each other) — it just isn't needed to avoid *stale reads* through `sdk.fetch()` anymore.

**zkLogin salt** — must fetch from Enoki `/v1/zklogin` GET. Never hardcode `BigInt(0)` — gives wrong address. This is the most common zkLogin bug.

**Two-layer enforcement:**
- Layer 1: TypeScript PolicyEngine — <1ms, zero network, blocked/escalated never touch chain (unless `onChainDenials` records the denial)
- Layer 2: Move contract (`edge_pass_v2`) — six assertions in Sui VM, cannot be bypassed: active, expired, `ENotAgent` (sender must be `pass.agent`), merchant approved, `maxPerTransaction`, velocity cap, budget

**Blocked/escalated** validated locally by default — never submitted to chain unless `onChainDenials` is on (default `true` as of v2), in which case `blocked` submits an aborting tx so the denial is independently verifiable.

---

## Contract Field Names

**v2 (`edge_pass_v2`, current):**
```
budget, auto_threshold, max_per_transaction, velocity_cap, velocity_used,
window_ms, window_start_ms, approved_merchants, issuer, agent, spent,
active, created_at_ms, expires_at_ms
```
Note: on chain the field is still `auto_threshold` — the SDK maps it to `escalateAbove` on the TS object (`ExecutionEngine.fetchPass()`). If you're reading the object directly via RPC/explorer instead of through the SDK, you'll see `auto_threshold`, not `escalateAbove`.

**v1 (`edge_pass`, read-only going forward):**
```
budget, auto_threshold, escalate_threshold, approved_merchants,
owner, spent, active, created_at, expires_at
```

Note: `expiry_ms` does NOT exist on-chain in either version. SDK calculates: `expiryMs = expires_at(_ms) - created_at(_ms)`.

---

## App Architecture

**Agent page flow:**
1. Collect all decisions from Claude/Gemini (streaming in background)
2. Stream with 120ms delay between cards — smooth progressive UI
3. Blocked → instant local validation, never touches chain
4. Escalated → Promise-based modal blocks execution until human resolves
5. Approved → `sdk.execute()` sequentially with 2s settle

**API routes:**
- `/api/sign` — Enoki transaction signing
- `/api/agent` — edge runtime, collect-then-stream 120ms delay, Claude + Gemini
- `/api/walrus` — mock Walrus proxy
- `/api/zkp` — ZK proof generation

**Current Gemini model:** `gemini-2.5-flash`

---

## What's Real vs Mocked

**Real:**
- Move contracts with verifiable digests — `edge_pass_v2` for new passes on **testnet** (mainnet has no v2 package yet), `edge_pass` (v1) remains on **mainnet** for existing passes
- zkLogin wallet derivation (salt fix applied)
- Enoki gas sponsorship
- Claude + Gemini inference
- Seal policy serialization fires in console
- SDK on npm with 3,500+ weekly downloads
- `@mysten/sui` v2 upgrade — done, both `apps/web` and `packages/sdk` are on `^2.20.1`
- Walrus writes — `apps/web/app/api/walrus/route.ts` writes to real public mainnet publishers (`walrus-mainnet-publisher.nami.cloud`, `staketab.org`) first; only falls back to a `local-{timestamp}` mock blob ID if every publisher is unreachable. The SDK also ships its own `WalrusAudit` class for direct mainnet writes/reads (`packages/sdk/src/audit/WalrusAudit.ts`) — the app doesn't use it yet, it still goes through its own `lib/walrus.ts` + `/api/walrus` proxy

**Mocked:**
- Seal encryption and network storage — `lib/seal.ts` only `JSON.stringify`s the policy today; there is no encryption step at all, not just no network storage. Both are still console-only, pending key server deployment (unrelated to the v2 upgrade, this was never blocked on `@mysten/sui`)

**Worth knowing, not mocked:** `apps/web` never sets `onChainDenials` in its `new EdgePass({...})` calls, so the SDK's default (`true`) applies — `blocked` outcomes from the agent demo are already being recorded on-chain as aborted transactions, not just decided client-side. If a future demo wants to show *unverifiable* client-side-only blocking for contrast, that now needs an explicit `onChainDenials: false`.

---

## Environment Variables

```
NEXT_PUBLIC_ENOKI_API_KEY — enoki public key (mainnet + testnet enabled)
NEXT_PUBLIC_GOOGLE_CLIENT_ID — Google OAuth client ID
NEXT_PUBLIC_SUI_NETWORK=testnet — v2 (the only pass type apps/web creates/executes) doesn't exist on mainnet yet; setting this to mainnet makes create()/execute() throw
NEXT_PUBLIC_APP_URL=https://edge-web-cyan.vercel.app
ENOKI_SECRET_KEY — enoki private key (rotate after use)
ANTHROPIC_API_KEY — from console.anthropic.com
GOOGLE_API_KEY — paid tier required, gemini-2.5-flash
```

---

## Identity & Addresses

- **zkLogin address:** `0x7c06fb216c312ca8088deef35ff34637afafeda40fb40359be9e815c865cc1d0`
- **Deployer address:** `0xe759eaf1a47566836f825b96a8d12e55b858df1be7d86b032f449638a93489c9`
- **GitHub:** fluturecode

---

## v2.0.0 Roadmap

1. ✅ Upgrade `@mysten/sui` to v2 — unlocks `@mysten/walrus` + `@mysten/seal` network storage
2. ✅ Real Walrus blob storage — `apps/web`'s `/api/walrus` writes to real publishers now (mock is fallback-only); SDK's `WalrusAudit` gives full decentralized audit trail, not yet wired into the app
3. ⬜ Retry logic in ExecutionEngine on VERSION_CONFLICT — still not implemented, checked in `ExecutionEngine.ts`
4. ✅ Rolling rate-limit window in PolicyEngine — shipped as `velocityCap`/`velocityWindowMs` in EdgePassV2, not the originally-planned `maxTransactionsPerHour` shape but the same purpose
5. ⚠️ Publish v2.0.0 — `package.json` is at `2.0.0` and `packages/sdk/CHANGELOG.md`'s latest entry matches it (`[2.0.0] — 2026-08-19`). Confirm on npm whether `2.0.0` is actually published before telling anyone it is.

---

## Post-Hackathon Priorities

- Apply for Sui Foundation ecosystem grant
- Write zkLogin salt bug blog post — gets indexed, drives organic downloads
- Post in Sui Discord + Mysten Labs Discord
- DM Mastra + Vercel AI SDK teams about `withPolicy()`
- v1.0.0 with real Walrus — that's the real public launch moment

---

## Key Files

```
apps/web/app/page.tsx                    — terminal typewriter login
apps/web/app/auth/callback/page.tsx      — zkLogin callback
apps/web/app/dashboard/page.tsx          — dashboard
apps/web/app/dashboard/create/page.tsx   — EdgePass creation
apps/web/app/dashboard/agent/page.tsx    — AI agent demo
apps/web/lib/signer.ts                   — zkLogin signer, gas coin resolution
apps/web/lib/walrus.ts                   — Walrus HTTP API (real publishers, mock fallback)
apps/web/lib/seal.ts                     — Seal policy serialization (plaintext — not yet encrypted)
apps/web/app/api/sign/route.ts           — transaction signing
apps/web/app/api/walrus/route.ts         — Walrus write proxy (real publishers, mock fallback)
apps/web/app/api/zkp/route.ts            — ZK proof via Enoki
apps/web/app/api/agent/route.ts          — Claude/Gemini API (edge runtime)
packages/sdk/src/core/EdgePass.ts        — main API + events + simulate + withPolicy + v1 legacy-key guard
packages/sdk/src/core/PolicyEngine.ts    — v2 validation + budget/velocity helpers
packages/sdk/src/core/ExecutionEngine.ts — PTB builder + v1/v2 fetch + on-chain denials
packages/sdk/src/compliance/            — ComplianceEngine (6th dimension) + DynamicIdentityBinding
packages/sdk/src/audit/WalrusAudit.ts    — real Walrus mainnet audit storage (not yet used by apps/web)
packages/sdk/src/react/index.ts          — useEdgePass, useBudgetStatus, useSimulate
packages/sdk/src/utils/types.ts          — all TypeScript types (v1 read-only + v2 create/spend)
packages/sdk/src/utils/constants.ts      — templates + Package IDs + MIST_PER_SUI
packages/sdk/src/test.ts                 — 39 comprehensive tests (async-aware runner as of the v2 migration)
packages/sdk/CHANGELOG.md               — version history (currently behind package.json — see Roadmap)
packages/sdk/DOCS.md                     — full developer reference, incl. "v1 → v2 Migration Notes"
contracts/navis/sources/edge_pass_v2.move — current Move contract
packages/sdk/README.md                   — SDK README
README.md                                — root repo README
```

---

## Design System

```typescript
bg: '#080C14', bgCard: '#0D1420', border: '#1A2740'
blue: '#4DA2FF', teal: '#00D4AA', gold: '#FFB830', red: '#FF4D6A'
purple: '#A78BFA', green: '#34D399'
white: '#FFFFFF', grey1: '#B8C8E0', grey2: '#5A7090'
Fonts: DM Mono (terminal), Inter (body)
```

---

## My Preferences

- Complete files over diffs
- Correct architecture over quick fixes
- Honest about what's real vs mocked
- No excessive comments in code
- Sequential execution is correct for Sui object model — don't try to parallelize
- `tx.object(pass.id)` not `tx.objectRef()` — learned this the hard way

---

*Built by Elizabeth Eidelson (@fluturecode)*
*Sui Overflow 2026 — Agentic Web track — SUBMITTED ✅*
*The best infrastructure is invisible.*
