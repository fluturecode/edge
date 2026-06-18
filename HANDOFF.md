# Edge — Complete Project Handoff v2
*Last updated: June 18, 2026 — end of Day 3 build session (extended)*
*Hours invested: ~42 hours total*

---

## New Chat Prompt

> I'm building Edge for Sui Overflow 2026. Repo: github.com/fluturecode/edge. Live: edge-web-cyan.vercel.app. SDK: @edge-protocol/sdk@0.6.4. Full stack working — zkLogin, real on-chain EdgePass on MAINNET, AI agent demo, Walrus audit logs, 34 tests passing, events system, error handling. Read HANDOFF.md before continuing. Deadline: June 21, 2026.

---

## Project Overview

**Edge** is programmable trust infrastructure for autonomous onchain systems, built on Sui for Sui Overflow 2026 (Agentic Web track).

**Pitch:** EdgePass gives agents your rules, not your keys.
**Tagline:** The best infrastructure is invisible.
**Validated by:** Independent Gemini research across 317 academic papers — all 4 core claims confirmed.

---

## Repo & Links

- **GitHub:** https://github.com/fluturecode/edge
- **Live app:** https://edge-web-cyan.vercel.app
- **npm:** https://npmjs.com/package/@edge-protocol/sdk
- **Testnet contract:** https://suiscan.xyz/testnet/object/0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d
- **Mainnet contract:** https://suiscan.xyz/mainnet/object/0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde

---

## Current Network Status

**APP IS ON MAINNET** ✅

```
NEXT_PUBLIC_SUI_NETWORK=mainnet  (set in Vercel)
Mainnet Package ID: 0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde
Mainnet Tx: 4REcPLezK8gFGyUKJcMnnFXxTTvk8vbxqjU62NMeRJuS
Testnet Package ID: 0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d
```

**Enoki:** Public API key now has mainnet enabled (upgraded plan)
**Walrus:** Writes proxied through /api/walrus server-side route to avoid CORS
- Publisher: https://walrus-mainnet-publisher-1.staketab.org:443
- Aggregator: https://walrus-mainnet.brightlystake.com

---

## SDK Current State

```
@edge-protocol/sdk@0.6.4
✅ 34/34 tests passing
✅ Events system — on/off/removeAllListeners
✅ Error handling — error/blocked/escalated distinction
✅ classifyError — NETWORK_FAILURE, SIGNING_FAILURE, OBJECT_NOT_FOUND codes
✅ fetchPass input validation + required fields check
✅ fetchPass field mapping fixed for mainnet contract (expires_at not expiry_ms)
✅ Config validation in create()
✅ maxPerTransaction support
✅ 5 templates
✅ Consumer import test passes
✅ Root pnpm test/build/dev scripts
✅ DOCS.md — competitive positioning, security model, error status
✅ README — Gemini-enhanced with agent framework examples
✅ 856+ downloads
```

---

## Contract Field Names (IMPORTANT)

The mainnet Move contract stores fields as:
```
budget, auto_threshold, escalate_threshold, approved_merchants,
owner, spent, active, created_at, expires_at
```

Note: `expiry_ms` does NOT exist on-chain. The SDK calculates it as:
`expiryMs = expires_at - created_at`

---

## Critical Auth Fix (Hard-Won)

`jwtToAddress(jwt, BigInt(0))` gives WRONG address. Must call Enoki `/v1/zklogin` GET endpoint with JWT to get the correct salt-derived address.

**zkLogin address:** `0x7c06fb216c312ca8088deef35ff34637afafeda40fb40359be9e815c865cc1d0`
**Mainnet SUI balance:** ~2.86 SUI (funded and ready)

---

## Transaction Signing Flow

Using direct execution (bypassing Enoki sponsorship due to TTL issues):

```
signer.ts (browser):
  1. Fetch sender's SUI coins from mainnet
  2. Set sender, gas owner, gas budget, gas payment
  3. Build full tx bytes
  4. POST to /api/sign with fullTxBytes

/api/sign (server):
  1. Receive fullTxBytes
  2. Sign with ephemeral key + getZkLoginSignature
  3. suiClient.executeTransactionBlock with single zkLogin signature
  4. Fetch created objectId from tx effects
```

---

## Environment Variables (Vercel)

```
NEXT_PUBLIC_ENOKI_API_KEY=enoki_public_eb0eeeb84f04768cf88a5d264bdf9ee6  (mainnet enabled)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=522666980790-20qcuen79borlp62m9vjb3cgugi092n3.apps.googleusercontent.com
NEXT_PUBLIC_SUI_NETWORK=mainnet
NEXT_PUBLIC_APP_URL=https://edge-web-cyan.vercel.app
ENOKI_SECRET_KEY=enoki_private_d5807c3cb9c5fb1a2fb2f562380ef30b
ANTHROPIC_API_KEY=<rotated — get from console.anthropic.com>
```

---

## Known Issues / Pending

**Walrus CORS fix** — just deployed, needs testing:
- Walrus writes now go through `/api/walrus` server-side proxy
- Previously was calling Staketab publisher directly from browser (CORS blocked)
- Should be fixed in latest deploy

**Dashboard shows "testnet"** — may be localStorage cache:
- Clear localStorage and login fresh to see mainnet
- `localStorage.clear()` in DevTools console

**GitHub Actions** — disable after mainnet deploy:
- Go to Actions → Deploy Move Contract → Disable workflow

---

## What's Left Before June 21

| Priority | Task | Status |
|----------|------|--------|
| 🔴 REQUIRED | Demo video (YouTube, ≤5 min) | PENDING |
| 🔴 REQUIRED | DeepSurge submission | PENDING |
| 🟡 HIGH | Verify Walrus works on mainnet after CORS fix | PENDING |
| 🟡 HIGH | Clear localStorage + test full mainnet flow | PENDING |
| 🟡 HIGH | Disable GitHub Actions | PENDING |
| 🟡 HIGH | Update HANDOFF.md in repo | PENDING |
| 🟢 NICE | Update README mainnet contract link | PENDING |

---

## Video Script (5 min)

```
0:00-0:20  Hook — "$2.3B in agent assets, no middle ground between key sharing and popups"
0:20-1:00  The Primitive — create EdgePass on MAINNET, show Suiscan confirmation
1:00-1:30  The Flex — 3 lines of code in VS Code
1:30-3:30  Agent Demo — Claude reasoning, transactions, escalation modal, Walrus log
3:30-4:00  Vision — PDR layer, Sui primitives, competitive positioning
4:00-4:30  Numbers — 856 downloads, before this video
4:30-5:00  Close — footer animation, "The best infrastructure is invisible."
```

---

## Competitive Positioning (Gemini Validated)

- **Claim 1:** Only open-source npm package with 5D policy enforcement — ✅ VALIDATED
- **Claim 2:** First trust delegation primitive on Sui — ✅ VALIDATED
- **Claim 3:** TS engine + on-chain enforcement + Walrus + 3-outcome escalation is unique — ✅ VALIDATED
- **Claim 4:** Complementary to x402, not competitive — ✅ VALIDATED

Academic reference: arxiv.org/html/2601.04583v1

---

## Key Files

```
apps/web/app/page.tsx                    — terminal typewriter login
apps/web/app/auth/callback/page.tsx      — zkLogin callback
apps/web/app/dashboard/page.tsx          — dashboard
apps/web/app/dashboard/create/page.tsx   — EdgePass creation
apps/web/app/dashboard/activity/page.tsx — Festival Mode simulation
apps/web/app/dashboard/agent/page.tsx    — AI agent demo
apps/web/lib/signer.ts                   — zkLogin signer, gas coin resolution
apps/web/lib/walrus.ts                   — Walrus HTTP API (proxied)
apps/web/app/api/sign/route.ts           — transaction signing
apps/web/app/api/walrus/route.ts         — Walrus write proxy (NEW — fixes CORS)
apps/web/app/api/zkp/route.ts            — ZK proof via Enoki
apps/web/app/api/agent/route.ts          — Claude API for autonomous decisions
packages/sdk/src/core/EdgePass.ts        — main API + events + config validation
packages/sdk/src/core/PolicyEngine.ts    — validation logic (34 tests)
packages/sdk/src/core/ExecutionEngine.ts — PTB builder + error handling
packages/sdk/src/utils/types.ts          — all TypeScript types incl. error status
packages/sdk/src/utils/constants.ts      — templates + Package IDs (both networks)
packages/sdk/src/test.ts                 — 34 comprehensive tests
packages/sdk/DOCS.md                     — full developer reference
packages/sdk/README.md                   — Gemini-enhanced SDK README
```

---

## Personal Laptop

- 2017 MacBook Air (Intel) — sui move build crashes, use GitHub Actions
- Sui wallet alias: festive-tourmaline
- Deployer address: 0xe759eaf1a47566836f825b96a8d12e55b858df1be7d86b032f449638a93489c9
- zkLogin address: 0x7c06fb216c312ca8088deef35ff34637afafeda40fb40359be9e815c865cc1d0
- Recovery: donkey match coil wait seed begin liar thrive sausage always deal drastic
- GitHub Secret: SUI_PRIVATE_KEY=suiprivkey1qzewudzvd8avu8clh994qslcpdkpy8lfsfypd5ul9t5d9jgzhxnpvskxv2h

---

## Design System

```typescript
bg: '#080C14', bgCard: '#0D1420', border: '#1A2740'
blue: '#4DA2FF', teal: '#00D4AA', gold: '#FFB830', red: '#FF4D6A'
Fonts: DM Mono (terminal), Inter (body)
Footer: vanish 7s animation — "The best infrastructure is invisible."
```

---

*Built by Elizabeth Eidelson (@fluturecode)*
*Sui Overflow 2026 — Agentic Web track*
*The best infrastructure is invisible.*
