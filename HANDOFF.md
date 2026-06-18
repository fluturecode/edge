# Edge — Complete Project Handoff
*Last updated: June 15, 2026 — after Day 3 build session*
*Hours invested: ~25 hours*

---

## Project Overview

**Edge** is programmable trust infrastructure for autonomous onchain systems, built on Sui for Sui Overflow 2026 (The Agentic Web track).

**One-line pitch:**
> EdgePass is the trust delegation primitive for autonomous onchain systems — an open SDK that lets any app or agent transact within user-defined boundaries on Sui, without wallet interruptions.

**Hackathon:** Sui Overflow 2026 — Agentic Web track
**Submission deadline:** June 21, 2026
**Shortlist announced:** July 8, 2026
**Demo Day:** July 20-21 (virtual, shortlisted teams only)
**Winners announced:** August 27, 2026
**Prize:** $30k first (50% at announcement, 50% after mainnet — 100% if already on mainnet)

---

## Repo & Links

- **GitHub:** https://github.com/fluturecode/edge
- **Live app:** https://edge-web-git-main-fluturecodes-projects.vercel.app
- **npm:** https://npmjs.com/package/@edge-protocol/sdk
- **Contract on Sui testnet:** https://suiscan.xyz/testnet/object/0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d
- **Submission:** https://www.deepsurge.xyz/hackathons/b587dc0c-4cb8-4e63-ada5-519df38103bf

---

## What's Working ✅

- **zkLogin** — Google login → real Sui address via Enoki (correct salt derivation)
- **EdgePass creation** — real Move object minted on testnet, verified on Suiscan
- **Festival Mode simulation** — all 5 transaction types, escalation modal
- **AI agent demo** — Claude LLM makes autonomous decisions, executes via PolicyEngine
- **Walrus audit logs** — real blobs on testnet
- **Seal policy encryption** — policies encrypted and stored on Walrus
- **SDK on npm** — `@edge-protocol/sdk@0.5.0` published and installable
- **Move contract** — deployed on Sui testnet
- **GitHub Actions CI/CD** — automated contract deployment
- **34/34 SDK tests passing**

---

## Contract Details

```
Package ID: 0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d
Deployer:   0xe759eaf1a47566836f825b96a8d12e55b858df1be7d86b032f449638a93489c9
Tx Digest:  64fovgDj7P5DX9mNDTEEmEwVU2cxxJhQvnZq2eos1s84
Network:    Sui testnet
```

---

## Tech Stack

- **Frontend:** Next.js 15, TypeScript, pnpm workspaces
- **Fonts:** DM Mono (terminal/mono), Inter (body)
- **Blockchain:** Sui, @mysten/sui@2.17.0 (web app), @mysten/sui@1.30.0 (SDK)
- **Auth:** Google OAuth → Enoki zkLogin → Sui wallet
- **Storage:** Walrus testnet (HTTP API)
- **Encryption:** Seal (wired, policy stored on Walrus)
- **AI:** Claude claude-sonnet-4-6 via Anthropic API
- **Hosting:** Vercel

---

## Environment Variables

File: `apps/web/.env.local` (never commit)

```
NEXT_PUBLIC_ENOKI_API_KEY=enoki_public_eb0eeeb84f04768cf88a5d264bdf9ee6
NEXT_PUBLIC_GOOGLE_CLIENT_ID=522666980790-20qcuen79borlp62m9vjb3cgugi092n3.apps.googleusercontent.com
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_APP_URL=https://edge-web-git-main-fluturecodes-projects.vercel.app
ENOKI_SECRET_KEY=enoki_private_d5807c3cb9c5fb1a2fb2f562380ef30b
ANTHROPIC_API_KEY=<rotated — get from console.anthropic.com>
```

**Also set in Vercel dashboard** (Settings → Environment Variables):
All of the above must be in Vercel for production to work.

---

## Auth Flow (Critical — took hours to debug)

The zkLogin address derivation uses Enoki's salt, NOT `BigInt(0)`.

**Correct flow:**
1. User clicks "Continue with Google" → ephemeral key + randomness generated
2. Google OAuth → JWT returned to `/auth/callback`
3. **Call Enoki `/v1/zklogin` with JWT** → get correct address + salt
4. Generate ZK proof via `/api/zkp` → Enoki ZK prover
5. Store: `edge_id_token`, `edge_sui_address`, `edge_zk_proof`, `edge_ephemeral_key`, `edge_randomness`, `edge_max_epoch`

**Why this matters:** `jwtToAddress(jwt, BigInt(0))` gives a DIFFERENT address than Enoki's salt-derived address. The ZK proof is generated with Enoki's salt. These MUST match or all transactions fail with "Invalid user signature".

**zkLogin address for fluturecode@gmail.com:**
`0x7c06fb216c312ca8088deef35ff34637afafeda40fb40359be9e815c865cc1d0`

**Fund this address for testnet gas:**
```bash
curl -X POST https://faucet.testnet.sui.io/v1/gas \
  -H 'Content-Type: application/json' \
  -d '{"FixedAmountRequest":{"recipient":"0x7c06fb216c312ca8088deef35ff34637afafeda40fb40359be9e815c865cc1d0"}}'
```

---

## Transaction Signing Flow

Currently using **direct execution** (not Enoki sponsorship) due to testnet TTL issues:

```
signer.ts (browser):
  1. Fetch sender's SUI coins from testnet
  2. Set sender, gas owner, gas budget, gas payment explicitly
  3. Build full tx bytes
  4. POST to /api/sign with fullTxBytes

/api/sign (server):
  1. Receive fullTxBytes
  2. Sign with ephemeral key
  3. getZkLoginSignature with ZK proof
  4. suiClient.executeTransactionBlock with single zkLogin signature
  5. Fetch created objectId from tx effects
  6. Return digest + objectId
```

**Mainnet plan:** Re-enable Enoki sponsorship. Mainnet has longer TTLs and faster response times. The two-step flow (sponsor → sign → execute) should work on mainnet.

---

## Design System

```typescript
const T = {
  bg: '#080C14', bgCard: '#0D1420', border: '#1A2740',
  blue: '#4DA2FF',   // Sui blue
  teal: '#00D4AA',   // Edge signature color
  gold: '#FFB830',   // escalation/warning
  red: '#FF4D6A',    // blocked/error
  white: '#FFFFFF', grey1: '#B8C8E0', grey2: '#5A7090',
};
// Fonts: DM Mono (terminal/addresses), Inter (body/buttons)
```

**Footer animation:**
```css
@keyframes vanish {
  0% { opacity: 0; } 25% { opacity: 0.3; } 50% { opacity: 0.3; }
  80% { opacity: 0; } 88% { opacity: 0; } 100% { opacity: 0; }
}
/* 7s cycle, 30% max opacity */
/* "The best infrastructure is invisible." */
```

---

## SDK Architecture

```typescript
// Three lines of code
const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: '...' });
const pass = await sdk.create(EdgePass.fromTemplate('festival', { owner }), signer);
const outcome = await sdk.execute(pass, { merchant, amount }, signer);
// 'approved' | 'escalated' | 'blocked'
```

**PolicyEngine rules (in order):**
1. Pass must be active
2. Pass must not be expired
3. Merchant must be in approved list
4. Amount must not exceed remaining budget
5. Amount must not exceed maxPerTransaction (if set)
6. If amount > escalateThreshold → escalate
7. If amount ≤ autoThreshold → auto-approve

**Templates:** festival ($300/48h), gaming ($50/4h), subscription ($200/30d), defi ($10k/7d), enterprise ($50k/30d)

---

## AI Agent Demo

Page: `/dashboard/agent`
Route: `/api/agent`

Claude receives the EdgePass policy as system context, reasons about a festival scenario, returns structured JSON purchase decisions. Each decision runs through PolicyEngine. Results stream in live. Escalation modal fires for human approval.

```typescript
// Agent system prompt includes:
// - Budget, thresholds, approved merchants
// - Previous session memory (localStorage)
// Returns: [{ merchant, amount, reasoning }]
```

---

## Walrus Integration

- **HTTP API** (no SDK, browser compatible)
- **Aggregator:** `https://aggregator.walrus-testnet.walrus.space`
- **Publisher:** `https://publisher.walrus-testnet.walrus.space`
- **Live blob:** `aMp7SskBz83OJLg-2RwxPf-8psdURdoVyyDhtYMujT4`
- Audit logs written after Festival Mode simulation and AI agent sessions

---

## Personal Laptop (for contract work)

- **Machine:** 2017 MacBook Air (Intel x86_64)
- **Note:** `sui move build` crashes on Intel — use GitHub Actions
- **Sui wallet alias:** festive-tourmaline
- **Address:** `0xe759eaf1a47566836f825b96a8d12e55b858df1be7d86b032f449638a93489c9`
- **Recovery:** `donkey match coil wait seed begin liar thrive sausage always deal drastic`

---

## What's Left

| Task | Priority | Time |
|------|----------|------|
| Update UI — remove "gas sponsored by Enoki" | High | 10 min |
| Walrus Memory integration | High | 45 min |
| Demo video (YouTube, ≤5 min) | Required | 2 hrs |
| Mainnet deploy | Required for full prize | 2 hrs |
| Re-enable Enoki on mainnet | High | 30 min |
| Agent reputation card | Medium | 1 hr |
| DeepSurge submission | Required | 30 min |

---

## Mainnet Deployment Plan

1. Email grants@sui.io for gas sponsorship
2. Update GitHub Actions workflow: change `testnet` → `mainnet`
3. Fund deployer wallet on mainnet
4. Re-enable `.github/workflows/deploy-contract.yml`
5. Update `EDGE_PACKAGE_ID.mainnet` in `packages/sdk/src/utils/constants.ts`
6. Change `NEXT_PUBLIC_SUI_NETWORK=mainnet` in Vercel
7. Re-enable Enoki sponsorship in `/api/sign/route.ts`
8. Test end to end

---

## New Chat Prompt

> I'm building Edge — programmable trust infrastructure for autonomous agents on Sui, for Sui Overflow 2026 (Agentic Web track). Repo: github.com/fluturecode/edge. Live: edge-web-git-main-fluturecodes-projects.vercel.app. Contract on testnet: 0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d. SDK: @edge-protocol/sdk@0.5.0. AI agent working, zkLogin working, Walrus working. Read HANDOFF.md before continuing.

---

*Built by Elizabeth Eidelson (@fluturecode)*
*Sui Overflow 2026 — Agentic Web track*
