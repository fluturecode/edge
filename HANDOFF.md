# Edge — Complete Project Handoff

## Project Overview

**Edge** is programmable trust infrastructure for autonomous onchain systems, built on Sui for Sui Overflow 2026 (The Agentic Web track).

**The two-layer product:**
1. `@edge-protocol/sdk` — a TypeScript SDK any developer can install to add trust delegation to their app or agent
2. The demo app — Festival Mode, showing EdgePass in action with real Walrus audit logs

**One-line pitch:**
> EdgePass is the trust delegation primitive for autonomous onchain systems — an open SDK that lets any app or agent transact within user-defined boundaries on Sui, without wallet interruptions.

**Hackathon:** Sui Overflow 2026 — Agentic Web track
**Submission deadline:** June 21, 2026
**Demo Day:** July 20-21 (virtual, shortlisted teams only)
**Prize:** $30k first place (50% upfront, 50% after mainnet deploy)

---

## Repo & Links

- **GitHub:** https://github.com/fluturecode/edge
- **Live app:** https://edge-web-cyan.vercel.app
- **GitHub handle:** fluturecode
- **Walrus live blob:** https://walruscan.com/testnet/blob/aMp7SskBz83OJLg-2RwxPf-8psdURdoVyyDhtYMujT4

---

## Tech Stack

- **Frontend:** Next.js 15, TypeScript, Tailwind, shadcn (Nova preset)
- **Package manager:** pnpm (v10 on new machine)
- **Monorepo:** pnpm workspaces
- **Blockchain:** Sui, @mysten/sui@2.17.0 (web app), @mysten/sui@1.30.0 (SDK)
- **Auth:** Google OAuth → zkLogin → Sui wallet (no seed phrase)
- **Storage:** Walrus testnet (HTTP API — no SDK needed for reads/writes)
- **Encryption:** Seal (stubbed, Phase 3)
- **Hosting:** Vercel

---

## Monorepo Structure

```
edge/
├── apps/
│   └── web/                         ← Next.js demo app
│       ├── app/
│       │   ├── page.tsx             ← Login (terminal typewriter) ✅
│       │   ├── layout.tsx           ← Navbar (EDGE + built on Sui) ✅
│       │   ├── globals.css          ✅
│       │   ├── auth/callback/
│       │   │   └── page.tsx         ← zkLogin callback handler ✅
│       │   └── dashboard/
│       │       ├── page.tsx         ← Dashboard (address, pass card, ecosystem strip) ✅
│       │       ├── create/
│       │       │   └── page.tsx     ← EdgePass creation + PTB preview ✅
│       │       └── activity/
│       │           └── page.tsx     ← Festival Mode + Walrus audit log ✅
│       ├── lib/
│       │   ├── zklogin.ts           ← getZkLoginAddress, getDecodedJwt ✅
│       │   ├── walrus.ts            ← Walrus HTTP API (write/read blobs) ✅
│       │   ├── seal.ts              ← Seal policy encryption (Phase 3) ✅
│       │   ├── edge-sdk.ts          ← SDK bridge (formToPassConfig, etc) ✅
│       │   └── providers/
│       │       └── enoki-provider.tsx ← stub provider ✅
│       └── .env.local               ← env vars (not in git)
├── packages/
│   └── sdk/                         ← @edge-protocol/sdk
│       ├── src/
│       │   ├── index.ts             ← public exports ✅
│       │   ├── core/
│       │   │   ├── EdgePass.ts      ← main SDK class ✅
│       │   │   ├── PolicyEngine.ts  ← validation logic ✅
│       │   │   ├── ExecutionEngine.ts ← PTB builder + chain calls ✅
│       │   │   └── AuditLogger.ts   ← local audit log buffer ✅
│       │   └── utils/
│       │       ├── types.ts         ← all TypeScript types ✅
│       │       └── constants.ts     ← MIST_PER_SUI, NETWORK_URLS, EDGE_PACKAGE_ID ✅
│       ├── src/test.ts              ← 6/6 tests passing ✅
│       ├── package.json             ← name: @edge-protocol/sdk ✅
│       └── tsconfig.json            ← moduleResolution: Bundler ✅
└── contracts/
    └── navis/
        ├── sources/
        │   └── edge_pass.move       ← EdgePass Move object (written, needs deploy) ✅
        └── Move.toml                ✅
```

---

## Environment Variables

File: `apps/web/.env.local` (never commit)

```
NEXT_PUBLIC_ENOKI_API_KEY=enoki_public_eb0eeeb84f04768cf88a5d264bdf9ee6
NEXT_PUBLIC_GOOGLE_CLIENT_ID=522666980790-20qcuen79borlp62m9vjb3cgugi092n3.apps.googleusercontent.com
NEXT_PUBLIC_SUI_NETWORK=devnet
NEXT_PUBLIC_APP_URL=https://edge-web-cyan.vercel.app
```

**Enoki portal:** https://enoki.mystenlabs.com
- App: Fluturecode
- Networks: DEVNET, TESTNET (need MAINNET — contact grants@sui.io)

**Google OAuth:**
- Project: edge
- Client ID: 522666980790-20qcuen79borlp62m9vjb3cgugi092n3.apps.googleusercontent.com
- Authorized origins: http://localhost:3000, https://edge-web-cyan.vercel.app
- Redirect URIs: http://localhost:3000/auth/callback, https://edge-web-cyan.vercel.app/auth/callback

---

## Design System

```typescript
const T = {
  bg: '#080C14',           // near-black background
  bgCard: '#0D1420',       // card background
  bgCardHover: '#111B2E',
  border: '#1A2740',
  borderHover: '#243550',
  blue: '#4DA2FF',         // Sui blue — ecosystem signal
  blueDim: 'rgba(77,162,255,0.12)',
  blueBorder: 'rgba(77,162,255,0.3)',
  teal: '#00D4AA',         // Edge signature color
  tealDim: 'rgba(0,212,170,0.1)',
  tealBorder: 'rgba(0,212,170,0.3)',
  gold: '#FFB830',         // escalation/warning
  goldDim: 'rgba(255,184,48,0.1)',
  goldBorder: 'rgba(255,184,48,0.3)',
  red: '#FF4D6A',          // blocked/error
  redDim: 'rgba(255,77,106,0.1)',
  white: '#FFFFFF',
  grey1: '#B8C8E0',
  grey2: '#5A7090',
  grey3: '#1E2D42',
};
```

**Fonts:**
- `DM Mono, monospace` — all numbers, addresses, labels, terminal text, navbar
- `Inter, sans-serif` — body copy, buttons, descriptions

**Color semantics:**
- Teal = approved / active / safe
- Gold = escalation / warning
- Red = blocked / error
- Blue = Sui ecosystem / addresses / info

**Mobile:** Use `clamp()` for padding/font-size. `.nav-built-on` class hides on mobile.

---

## Auth Flow

1. User clicks "Continue with Google" on `page.tsx`
2. Redirected to Google OAuth with nonce
3. Google redirects to `/auth/callback` with `#id_token=...` in URL hash
4. Callback extracts token, stores in `localStorage('edge_id_token')`
5. `getZkLoginAddress(token)` calls `jwtToAddress(token, BigInt(0))`
6. Returns deterministic Sui address — same Google = same address always
7. User redirected to `/dashboard`

---

## SDK Architecture

```typescript
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: '...' });

const pass = await sdk.create({
  budget: 300n * MIST_PER_SUI,
  autoThreshold: 50n * MIST_PER_SUI,
  escalateThreshold: 100n * MIST_PER_SUI,
  approvedMerchants: ['Shuttle Express', 'Hydra Bar'],
  expiryMs: 48 * 60 * 60 * 1000,
  owner: '0x...',
}, signer);

const outcome = await sdk.execute(pass, {
  merchant: 'Shuttle Express',
  amount: 18_500_000_000n,
}, signer);
// outcome.status === 'approved' | 'blocked' | 'escalated'
```

**PolicyEngine rules (in order):**
1. Pass must be active
2. Pass must not be expired
3. Merchant must be in approved list
4. Amount must not exceed remaining budget
5. If amount > escalateThreshold → escalate
6. If amount ≤ autoThreshold → auto-approve

**Tests:** 6/6 passing (`cd packages/sdk && pnpm test`)

---

## Walrus Integration

- **HTTP API** — no SDK, no signer needed for client-side
- **Aggregator:** `https://aggregator.walrus-testnet.walrus.space`
- **Publisher:** `https://publisher.walrus-testnet.walrus.space`
- **Live blob:** `aMp7SskBz83OJLg-2RwxPf-8psdURdoVyyDhtYMujT4`
- **Explorer:** https://walruscan.com/testnet/blob/[blobId]

Audit logs written after Festival Mode simulation completes. Format:
```json
{
  "passId": "0x...",
  "entries": [...transactions],
  "createdAt": 1234567890,
  "version": "1.0.0"
}
```

---

## Seal Integration

- File: `apps/web/lib/seal.ts`
- Status: **Stubbed** — serializes policy to JSON, stores on Walrus
- Phase 3: Wire real Seal encryption after key server deployment
- The `storeEncryptedPolicy()` function already writes to Walrus
- Full encryption: only pass owner can decrypt their policy

---

## Move Contract

File: `contracts/navis/sources/edge_pass.move`

**Status: Written, needs deployment (blocked by MDM on work laptop)**
**Deploy from:** home wifi or phone hotspot

```bash
sui client switch --env testnet
sui client faucet  # get testnet SUI
# go to https://faucet.sui.io if CLI faucet fails
cd contracts/navis
sui move build
sui client publish --gas-budget 100000000
```

After deploy:
1. Copy Package ID from output
2. Update `packages/sdk/src/utils/constants.ts` → `EDGE_PACKAGE_ID.testnet`
3. Update `packages/sdk/src/utils/constants.ts` → `EDGE_PACKAGE_ID.mainnet` after mainnet deploy

**Move.toml:**
```toml
[package]
name = "navis"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/testnet" }

[addresses]
navis = "0x0"
```

---

## What's Next (in order)

1. **Deploy Move contract to testnet** (need off MDM — home wifi/hotspot)
   - `sui move build && sui client publish`
   - Copy Package ID to constants.ts

2. **Wire real EdgePass creation**
   - Replace localStorage mock in create page with `sdk.create()`
   - Store real Sui object ID

3. **Wire sponsored transactions via Enoki**
   - API route: `apps/web/app/api/sponsor/route.ts`
   - Enoki pays gas so users never need SUI

4. **Wire real transaction execution**
   - Replace simulation with `sdk.execute()`
   - Real tx digests appear in activity feed

5. **Wire Seal encryption**
   - Full policy encryption after key server deployment

6. **npm publish**
   - `cd packages/sdk && pnpm publish`
   - Update README with real npm link

7. **Mainnet deploy**
   - Get sponsorship: grants@sui.io
   - Update EDGE_PACKAGE_ID.mainnet

8. **Demo video** (≤5 min, YouTube)
   - Login → create pass → run simulation → show Walrus blob

9. **Submit on DeepSurge**
   - https://www.deepsurge.xyz/hackathons/b587dc0c-4cb8-4e63-ada5-519df38103bf

---

## Submission Checklist

- [ ] Working app on testnet or mainnet
- [ ] EdgePass Move contract deployed (Package ID)
- [ ] `@edge-protocol/sdk` on npm
- [ ] Festival Mode demo end to end with real transactions
- [ ] Walrus audit logs working ✅
- [ ] README complete ✅
- [ ] Demo video (YouTube, ≤5 min)
- [ ] DeepSurge submission
- [ ] KYC completed for prize
- **Deadline: June 21, 2026**

---

## Mainnet Sponsorship

Email grants@sui.io:
> Subject: Sui Overflow 2026 — Mainnet sponsorship for Edge (Agentic Web)
> 
> Building Edge — programmable trust infrastructure for autonomous agents on Sui. Open SDK + Move contract. Need mainnet gas coverage for deployment and demo. Submitting June 21st.

Also post in Sui Discord #overflow-2026 channel.

---

## Airdrop/Ecosystem Farming

On-chain activity with these addresses earns ecosystem points:
- Sui wallet: `0x1369d25e738bb9a63038a6bfc96e3c99c9a476780359e0a2e886543c3ce75634`
- Walrus blobs already written ✅
- Deploy contract → more on-chain activity
- Use Enoki sponsored tx → Enoki activity

Packages installed (ecosystem presence):
- `@mysten/sui` ✅
- `@mysten/zklogin` ✅
- `@mysten/walrus` ✅
- `@mysten/seal` ✅
- `@mysten/enoki` ✅

---

## To Start A New Chat

Paste this into a new Claude chat:

> I'm building Edge — programmable trust infrastructure for autonomous onchain systems on Sui, for Sui Overflow 2026 (Agentic Web track). Repo: github.com/fluturecode/edge. Live: edge-web-cyan.vercel.app. I have a full handoff doc — please read it before we continue.

Then paste the entire contents of this file.

---

*Last updated: June 1, 2026 — after Day 1 build session*
