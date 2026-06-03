# Edge — Complete Project Handoff

## Project Overview

**Edge** is programmable trust infrastructure for autonomous onchain systems, built on Sui for Sui Overflow 2026 (The Agentic Web track).

**One-line pitch:**
> EdgePass is the trust delegation primitive for autonomous onchain systems — an open SDK that lets any app or agent transact within user-defined boundaries on Sui, without wallet interruptions.

**Hackathon:** Sui Overflow 2026 — Agentic Web track
**Submission deadline:** June 21, 2026
**Shortlist announced:** July 8, 2026
**Demo Day:** July 20-21 (virtual, shortlisted teams only)
**Winners announced:** August 27, 2026
**Prize:** $30k first place (50% at announcement, 50% after mainnet deploy — 100% upfront if already on mainnet)

---

## Repo & Links

- **GitHub:** https://github.com/fluturecode/edge
- **Live app:** https://edge-web-git-main-fluturecodes-projects.vercel.app
- **GitHub handle:** fluturecode
- **Walrus live blob:** https://walruscan.com/testnet/blob/aMp7SskBz83OJLg-2RwxPf-8psdURdoVyyDhtYMujT4
- **Contract on Sui testnet:** https://suiscan.xyz/testnet/object/0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d

---

## Contract Details

- **Package ID:** `0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d`
- **Deployer:** `0xe759eaf1a47566836f825b96a8d12e55b858df1be7d86b032f449638a93489c9`
- **Tx Digest:** `64fovgDj7P5DX9mNDTEEmEwVU2cxxJhQvnZq2eos1s84`
- **Network:** Sui testnet
- **Deployed via:** GitHub Actions CI/CD

---

## Tech Stack

- **Frontend:** Next.js 15, TypeScript, Tailwind, pnpm workspaces
- **Fonts:** DM Mono (terminal/mono), Inter (body)
- **Blockchain:** Sui, @mysten/sui@2.17.0 (web app), @mysten/sui@1.30.0 (SDK)
- **Auth:** Google OAuth → zkLogin → Sui wallet (no seed phrase)
- **Storage:** Walrus testnet (HTTP API)
- **Encryption:** Seal (stubbed, Phase 3)
- **Hosting:** Vercel

---

## Monorepo Structure

```
edge/
├── apps/
│   └── web/                         ← Next.js demo app
│       ├── app/
│       │   ├── page.tsx             ← Login (terminal typewriter + boot sequence) ✅
│       │   ├── layout.tsx           ← Navbar + footer tagline animation ✅
│       │   ├── globals.css          ✅
│       │   ├── auth/callback/
│       │   │   └── page.tsx         ← zkLogin callback handler ✅
│       │   └── dashboard/
│       │       ├── page.tsx         ← Dashboard (address, pass card, ecosystem strip, Sui explorer links) ✅
│       │       ├── create/
│       │       │   └── page.tsx     ← EdgePass creation + PTB preview + Walrus policy store ✅
│       │       └── activity/
│       │           └── page.tsx     ← Festival Mode + escalation modal + Walrus audit log ✅
│       ├── components/
│       │   └── navbar.tsx           ← Client navbar (Dashboard + Activity links) ✅
│       └── lib/
│           ├── zklogin.ts           ← getZkLoginAddress, getDecodedJwt ✅
│           ├── walrus.ts            ← Walrus HTTP API (write/read blobs) ✅
│           ├── seal.ts              ← Seal policy encryption (Phase 3) ✅
│           ├── signer.ts            ← getUserAddress, setUserAddress ✅
│           └── edge-sdk.ts          ← SDK bridge (formToPassConfig, etc) ✅
├── packages/
│   └── sdk/                         ← @edge-protocol/sdk
│       └── src/
│           ├── index.ts             ← public exports ✅
│           ├── core/
│           │   ├── EdgePass.ts      ← main SDK class ✅
│           │   ├── PolicyEngine.ts  ← validation logic (pure TS) ✅
│           │   ├── ExecutionEngine.ts ← PTB builder + chain calls ✅
│           │   └── AuditLogger.ts   ← local audit log buffer ✅
│           └── utils/
│               ├── types.ts         ← all TypeScript types ✅
│               └── constants.ts     ← MIST_PER_SUI, NETWORK_URLS, EDGE_PACKAGE_ID ✅
│       └── src/test.ts              ← 6/6 tests passing ✅
└── contracts/
    └── navis/
        ├── sources/
        │   └── edge_pass.move       ← EdgePass Move object ✅ DEPLOYED
        └── Move.toml                ✅
```

---

## Environment Variables

File: `apps/web/.env.local` (never commit)

```
NEXT_PUBLIC_ENOKI_API_KEY=enoki_public_eb0eeeb84f04768cf88a5d264bdf9ee6
NEXT_PUBLIC_GOOGLE_CLIENT_ID=522666980790-20qcuen79borlp62m9vjb3cgugi092n3.apps.googleusercontent.com
NEXT_PUBLIC_SUI_NETWORK=devnet
NEXT_PUBLIC_APP_URL=https://edge-web-git-main-fluturecodes-projects.vercel.app
```

**Google OAuth authorized origins:**
- `http://localhost:3000`
- `https://edge-web-git-main-fluturecodes-projects.vercel.app`

**Google OAuth redirect URIs:**
- `http://localhost:3000/auth/callback`
- `https://edge-web-git-main-fluturecodes-projects.vercel.app/auth/callback`

---

## Design System

```typescript
const T = {
  bg: '#080C14',           // near-black background
  bgCard: '#0D1420',       // card background
  border: '#1A2740',
  blue: '#4DA2FF',         // Sui blue
  teal: '#00D4AA',         // Edge signature color
  gold: '#FFB830',         // escalation/warning
  red: '#FF4D6A',          // blocked/error
  white: '#FFFFFF',
  grey1: '#B8C8E0',
  grey2: '#5A7090',
};
// Fonts: DM Mono (numbers/addresses/terminal), Inter (body/buttons)
```

**Footer animation:**
```css
@keyframes vanish {
  0% { opacity: 0; }
  25% { opacity: 0.3; }
  50% { opacity: 0.3; }
  80% { opacity: 0; }
  88% { opacity: 0; }
  100% { opacity: 0; }
}
/* 7s cycle, 30% max opacity — "The best infrastructure is invisible." */
```

---

## Auth Flow

1. User clicks "Continue with Google" on `page.tsx`
2. Redirected to Google OAuth with nonce
3. Google redirects to `/auth/callback` with `#id_token=...` in URL hash
4. `getZkLoginAddress(token)` calls `jwtToAddress(token, BigInt(0))`
5. Deterministic Sui address derived — same Google = same address always
6. Address stored in localStorage via `setUserAddress()`
7. User redirected to `/dashboard`

---

## SDK

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

**Tests:** `cd packages/sdk && pnpm test` → 6/6 passing

---

## Walrus Integration

- **HTTP API** — no SDK, no signer for client-side
- **Aggregator:** `https://aggregator.walrus-testnet.walrus.space`
- **Publisher:** `https://publisher.walrus-testnet.walrus.space`
- **Live blob:** `aMp7SskBz83OJLg-2RwxPf-8psdURdoVyyDhtYMujT4`

Audit logs written after Festival Mode simulation completes.

---

## Seal Integration

- File: `apps/web/lib/seal.ts`
- Status: **Stubbed** — serializes policy to JSON, stores on Walrus
- Phase 3: Wire real Seal encryption after key server deployment

---

## GitHub Actions

- File: `.github/workflows/deploy-contract.yml`
- Status: **Disabled** after successful deployment
- Re-enable only when redeploying contract
- Uses `SUI_PRIVATE_KEY` GitHub secret

**To re-enable:** GitHub → Actions → Deploy Move Contract → Enable workflow

---

## Judging Criteria

| Criteria | Weight | Our Status |
|----------|--------|------------|
| Real-World Application | 50% | Strong — SDK + use case + Walrus |
| Product & UX | 20% | Strong — terminal hero, clean demo |
| Technical Implementation | 20% | Strong — contract deployed, Walrus live |
| Presentation & Vision | 10% | Strong — demo script ready |

---

## What's Next (in priority order)

1. **Wire real EdgePass creation** — replace localStorage mock with `sdk.create()` via zkLogin signer
2. **Wire sponsored transactions** — Enoki API route so gas is truly free
3. **npm publish** — `cd packages/sdk && pnpm publish`
4. **AI agent demo** — LLM calling `sdk.execute()` autonomously (~50 lines)
5. **Demo video** — ≤5 min, YouTube, required for submission
6. **Mainnet deploy** — contact grants@sui.io for sponsorship
7. **Submit on DeepSurge** — https://www.deepsurge.xyz/hackathons/b587dc0c-4cb8-4e63-ada5-519df38103bf

---

## Submission Checklist

- [x] Public GitHub repo
- [x] Live app on Vercel
- [x] Move contract on testnet
- [x] Walrus audit logs working
- [x] README complete
- [ ] `@edge-protocol/sdk` on npm
- [ ] Real on-chain EdgePass creation
- [ ] Demo video (YouTube, ≤5 min)
- [ ] DeepSurge submission
- [ ] KYC completed for prize
- **Deadline: June 21, 2026**

---

## Mainnet Sponsorship

Email grants@sui.io:
> Subject: Sui Overflow 2026 — Mainnet sponsorship for Edge (Agentic Web)
>
> Building Edge — programmable trust infrastructure for autonomous agents on Sui. Open SDK + Move contract deployed on testnet. Need mainnet gas coverage for deployment. Submitting June 21st.

---

## Airdrop/Ecosystem Farming

On-chain activity with deployer address earns ecosystem points:
- **Deployer:** `0xe759eaf1a47566836f825b96a8d12e55b858df1be7d86b032f449638a93489c9`
- Walrus blobs written ✅
- Contract deployed ✅

Packages installed (ecosystem presence):
- `@mysten/sui` ✅
- `@mysten/zklogin` ✅
- `@mysten/walrus` ✅
- `@mysten/seal` ✅

Tag on social: `@SuiNetwork` `@WalrusProtocol`

---

## Personal Laptop (for contract work)

- **Machine:** 2017 MacBook Air (Intel x86_64)
- **Sui wallet alias:** festive-tourmaline
- **Address:** `0xe759eaf1a47566836f825b96a8d12e55b858df1be7d86b032f449638a93489c9`
- **Recovery phrase:** `donkey match coil wait seed begin liar thrive sausage always deal drastic`
- **Note:** Sui CLI crashes on `sui move build` due to Intel malloc bug — use GitHub Actions for all contract work

---

## New Chat Prompt

> I'm building Edge — programmable trust infrastructure for autonomous onchain systems on Sui, for Sui Overflow 2026 (Agentic Web track). Repo: github.com/fluturecode/edge. Live: edge-web-git-main-fluturecodes-projects.vercel.app. Contract on testnet: 0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d. I have a full handoff doc — please read it before we continue.

Then paste the entire contents of this file.

---

*Last updated: June 3, 2026 — after Day 2 build session*
*Hours invested: ~15.5 hours*
