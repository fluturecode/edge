# Edge — Complete Project Handoff v3
*Last updated: June 22, 2026 — post-submission*
*Hours invested: ~60 hours total*

---

## New Chat Prompt

> I'm building Edge Protocol — programmable trust infrastructure for autonomous AI agents on Sui. Repo: github.com/fluturecode/edge. Live: edge-web-cyan.vercel.app. SDK: @edge-protocol/sdk@0.9.2. Submitted to Sui Overflow 2026 on June 21. Read HANDOFF.md before continuing.

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

**APP IS ON MAINNET** ✅

```
Mainnet Package ID: 0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde
Mainnet Deploy Tx: 4REcPLezK8gFGyUKJcMnnFXxTTvk8vbxqjU62NMeRJuS
Testnet Package ID: 0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d
```

---

## SDK v0.9.2 — Full API Surface

**Core:**
- `sdk.create(config, signer)` — mint EdgePass on Sui
- `sdk.execute(pass, request, signer)` — returns approved/blocked/escalated/error
- `sdk.validate(pass, request)` — zero network, <1ms preview
- `sdk.simulate(pass, requests[])` — predict full session, zero network
- `sdk.fetch(objectId)` — get live pass from chain
- `sdk.revoke(pass, signer)` — revoke on-chain

**Budget helpers:**
- `sdk.budgetStatus(pass)` — full snapshot
- `sdk.utilizationPct(pass)` — 0-100
- `sdk.isNearLimit(pass, threshold?)` — default 80%
- `sdk.remainingBudget(pass)` — MIST
- `sdk.timeRemaining(pass)` — ms
- `sdk.isExpiringSoon(pass, withinMs?)` — default 1hr

**Static:**
- `EdgePass.fromTemplate(template, overrides)` — 5 templates
- `EdgePass.withPolicy(pass, signer, sdk, fn)` — HOF for AI tools

**Events:**
- `sdk.on/off/removeAllListeners('approved'|'escalated'|'blocked')`

**React hooks (`@edge-protocol/sdk/react`):**
- `useEdgePass` — full featured
- `useBudgetStatus` — lightweight
- `useSimulate` — reactive

**34 passing tests.**

---

## Critical Architecture Notes

**`tx.object(pass.id)` is CORRECT** — resolves version at signing time. Never use `tx.objectRef()` — causes version conflicts with Enoki sponsorship.

**Sequential execution** — 2s settle delay between approved txs. Prevents Sui object version conflicts.

**zkLogin salt** — must fetch from Enoki `/v1/zklogin` GET. Never hardcode `BigInt(0)` — gives wrong address. This is the most common zkLogin bug.

**Two-layer enforcement:**
- Layer 1: TypeScript PolicyEngine — <1ms, zero network, blocked/escalated never touch chain
- Layer 2: Move contract — five assertions in Sui VM, cannot be bypassed

**Blocked/escalated** validated locally — never submitted to chain, no gas wasted.

---

## Contract Field Names

```
budget, auto_threshold, escalate_threshold, approved_merchants,
owner, spent, active, created_at, expires_at
```

Note: `expiry_ms` does NOT exist on-chain. SDK calculates: `expiryMs = expires_at - created_at`

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
- Move contract on Sui mainnet with verifiable digests
- zkLogin wallet derivation (salt fix applied)
- Enoki gas sponsorship
- Claude + Gemini inference
- Seal policy serialization fires in console
- SDK on npm with 3,500+ weekly downloads

**Mocked:**
- Walrus audit blob IDs — `local-{timestamp}` — blocked on `@mysten/sui` v2 upgrade
- `@mysten/walrus` requires `@mysten/sui@^2.x`, app is on `1.30.x`

---

## Environment Variables

```
NEXT_PUBLIC_ENOKI_API_KEY — enoki public key (mainnet enabled)
NEXT_PUBLIC_GOOGLE_CLIENT_ID — Google OAuth client ID
NEXT_PUBLIC_SUI_NETWORK=mainnet
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

## v1.0.0 Roadmap

1. Upgrade `@mysten/sui` to v2 — unlocks `@mysten/walrus` + `@mysten/seal` network storage
2. Real Walrus blob storage — full decentralized audit trail
3. Retry logic in ExecutionEngine on VERSION_CONFLICT
4. `maxTransactionsPerHour` rolling window in PolicyEngine
5. Publish v1.0.0

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
apps/web/lib/walrus.ts                   — Walrus HTTP API (mock proxy)
apps/web/lib/seal.ts                     — Seal policy encryption
apps/web/app/api/sign/route.ts           — transaction signing
apps/web/app/api/walrus/route.ts         — Walrus write proxy
apps/web/app/api/zkp/route.ts            — ZK proof via Enoki
apps/web/app/api/agent/route.ts          — Claude/Gemini API (edge runtime)
packages/sdk/src/core/EdgePass.ts        — main API + events + simulate + withPolicy
packages/sdk/src/core/PolicyEngine.ts    — validation + budget helpers (34 tests)
packages/sdk/src/core/ExecutionEngine.ts — PTB builder + error handling
packages/sdk/src/react/index.ts          — useEdgePass, useBudgetStatus, useSimulate
packages/sdk/src/utils/types.ts          — all TypeScript types
packages/sdk/src/utils/constants.ts      — templates + Package IDs + MIST_PER_SUI
packages/sdk/src/test.ts                 — 34 comprehensive tests
packages/sdk/CHANGELOG.md               — version history
packages/sdk/DOCS.md                     — full developer reference
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
