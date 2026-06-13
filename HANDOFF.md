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
- **First confirmed on-chain EdgePass creation tx:** https://suiscan.xyz/testnet/tx/2wstpGwQgb8v6CDKdAmVjJBAHZ873MPFNMBNfvQutFKF

---

## Contract Details

- **Package ID:** `0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d`
- **Deployer:** `0xe759eaf1a47566836f825b96a8d12e55b858df1be7d86b032f449638a93489c9`
- **Deploy Tx:** `64fovgDj7P5DX9mNDTEEmEwVU2cxxJhQvnZq2eos1s84`
- **Network:** Sui testnet
- **Deployed via:** GitHub Actions CI/CD

---

## Tech Stack

- **Frontend:** Next.js 16, TypeScript, pnpm workspaces
- **Fonts:** DM Mono (terminal/mono), Inter (body)
- **Blockchain:** Sui, @mysten/sui@1.30.0 (SDK), @mysten/sui@2.17.0 (web app)
- **Auth:** Google OAuth → real zkLogin → ZK proof via Enoki → Sui wallet (no seed phrase)
- **Gas:** Enoki sponsored transactions via server-side Next.js API route
- **Storage:** Walrus testnet (HTTP API) — live blobs confirmed
- **Encryption:** Seal (stubbed, Phase 3)
- **Hosting:** Vercel

---

## Monorepo Structure

edge/
├── apps/
│   └── web/
│       ├── app/
│       │   ├── page.tsx                  ← Login + typewriter boot sequence ✅
│       │   ├── layout.tsx                ← Navbar + footer animation ✅
│       │   ├── auth/callback/page.tsx    ← zkLogin callback + ZK proof via Enoki ✅
│       │   └── dashboard/
│       │       ├── page.tsx              ← Dashboard ✅
│       │       ├── create/page.tsx       ← Real on-chain EdgePass creation ✅ LIVE
│       │       └── activity/page.tsx     ← Festival Mode on-chain execution ✅ LIVE
│       ├── app/api/
│       │   ├── sponsor/route.ts          ← Enoki sponsorship server-side ✅
│       │   └── sign/route.ts             ← zkLogin signing + Sui RPC execution ✅
│       ├── components/
│       │   └── navbar.tsx                ✅
│       └── lib/
│           ├── zklogin.ts                ← generateZkProof (Enoki) + signWithZkLogin ✅
│           ├── walrus.ts                 ← Walrus HTTP API ✅
│           ├── seal.ts                   ← Seal policy encryption (stubbed) ✅
│           ├── signer.ts                 ← buildSigner → /api/sign route ✅
│           └── edge-sdk.ts               ← SDK bridge ✅
├── packages/
│   └── sdk/
│       └── src/
│           ├── core/
│           │   ├── EdgePass.ts           ← create() execute() fetch() revoke() ✅
│           │   ├── PolicyEngine.ts       ← pure TS validation, 6/6 tests ✅
│           │   ├── ExecutionEngine.ts    ← PTB builder + Clock (0x6) ✅
│           │   └── AuditLogger.ts        ✅
│           └── utils/
│               ├── types.ts              ✅
│               └── constants.ts          ✅
└── contracts/
    └── navis/
        └── sources/edge_pass.move        ← DEPLOYED testnet ✅

---

## Environment Variables

File: apps/web/.env.local (never commit)

NEXT_PUBLIC_ENOKI_API_KEY=enoki_public_...
ENOKI_SECRET_KEY=enoki_private_...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=522666980790-20qcuen79borlp62m9vjb3cgugi092n3.apps.googleusercontent.com
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_APP_URL=https://edge-web-git-main-fluturecodes-projects.vercel.app

Important: ENOKI_SECRET_KEY is server-side only. Never expose client-side.

Google OAuth authorized origins:
- http://localhost:3000
- https://edge-web-git-main-fluturecodes-projects.vercel.app

Google OAuth redirect URIs:
- http://localhost:3000/auth/callback
- https://edge-web-git-main-fluturecodes-projects.vercel.app/auth/callback

Enoki portal settings required:
- Public key: ZKLOGIN enabled, DEVNET + TESTNET
- Private key: SPONSORED_TRANSACTIONS enabled, TESTNET
- Allowed move targets:
  - 0x9f4065...::edge_pass::create_pass
  - 0x9f4065...::edge_pass::execute_transaction

---

## Auth Flow (Real zkLogin — fully working as of June 11, 2026)

1. User clicks "Continue with Google"
2. App fetches current Sui epoch dynamically → maxEpoch = currentEpoch + 10
3. Generates ephemeral Ed25519 keypair + randomness
4. Derives zkLogin nonce: generateNonce(keypair.getPublicKey(), maxEpoch, randomness)
5. Stores edge_ephemeral_key, edge_randomness, edge_max_epoch in localStorage
6. Redirects to Google OAuth with nonce baked into JWT
7. Google redirects to /auth/callback with #id_token=... in URL hash
8. Calls Enoki ZKP endpoint → gets ZK proof + addressSeed
9. Calls Enoki address endpoint → gets consistent zkLogin address
10. Stores edge_id_token, edge_zk_proof, edge_sui_address in localStorage
11. Redirects to /dashboard

Key insight: Use Enoki's ZKP endpoint (not Mysten's public prover at prover-dev.mystenlabs.com).
Enoki returns addressSeed in the proof, which is required for signing.
The address Enoki derives must be used — not jwtToAddress(idToken, BigInt(0)).

---

## Transaction Signing Flow

All real signing goes through apps/web/app/api/sign/route.ts:

1. Client builds tx with tx.setSender(address) + tx.build({ client: suiClient })
2. Sends txBytes, ephemeralKey, zkProof, maxEpoch, idToken to /api/sign
3. Server reconstructs keypair from ephemeralKey
4. Signs txBytes with ephemeral keypair → ephemeralSignature
5. Calls genAddressSeed(BigInt(0), 'sub', decoded.sub, aud) → addressSeed
6. Calls getZkLoginSignature({ inputs: { ...zkProof, addressSeed }, maxEpoch, userSignature })
7. Submits to Sui RPC via suiClient.executeTransactionBlock()
8. Returns { digest }

Note: Enoki sponsored transactions expire too quickly on testnet (~2s TTL).
Current workaround: fund zkLogin address with testnet SUI from faucet and submit direct to Sui RPC.
For mainnet: Enoki sponsorship should be reliable. Wire back through /api/sponsor route.

---

## SDK

import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

const sdk = new EdgePass({ network: 'testnet', enokiApiKey: '...' });

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

PolicyEngine rules (in order):
1. Pass must be active
2. Pass must not be expired
3. Merchant must be in approved list
4. Amount must not exceed remaining budget
5. If amount > escalateThreshold → escalate
6. If amount ≤ autoThreshold → auto-approve

Tests: cd packages/sdk && pnpm test → 6/6 passing

Important PTB detail: Both create_pass and execute_transaction require the Sui Clock object.
Pass tx.object('0x6') as the last argument before ctx in both Move calls.

---

## Walrus Integration

- HTTP API — no SDK, no signer for client-side
- Aggregator: https://aggregator.walrus-testnet.walrus.space
- Publisher: https://publisher.walrus-testnet.walrus.space
- Live blob: aMp7SskBz83OJLg-2RwxPf-8psdURdoVyyDhtYMujT4
- Festival Mode blob: Tly_O_M8YpJw-AZqWJ1JRv9xlgZ_W11Er3xoD4BtZlw

Audit logs written after Festival Mode execution completes.
Real transaction digests included in logs with Suiscan links.

---

## Seal Integration

- File: apps/web/lib/seal.ts
- Status: Stubbed — serializes policy to JSON, stores on Walrus
- Phase 3: Wire real Seal encryption after key server deployment

---

## Design System

const T = {
  bg: '#080C14',
  bgCard: '#0D1420',
  border: '#1A2740',
  blue: '#4DA2FF',
  teal: '#00D4AA',
  gold: '#FFB830',
  red: '#FF4D6A',
  white: '#FFFFFF',
  grey1: '#B8C8E0',
  grey2: '#5A7090',
};
Fonts: DM Mono (numbers/addresses/terminal), Inter (body/buttons)

Footer animation: vanish keyframe, 7s cycle, 30% max opacity
"The best infrastructure is invisible."

---

## GitHub Actions

- File: .github/workflows/deploy-contract.yml
- Status: Disabled after successful deployment
- Re-enable only when redeploying contract
- Uses SUI_PRIVATE_KEY GitHub secret

---

## Judging Criteria

| Criteria | Weight | Status |
|----------|--------|--------|
| Real-World Application | 50% | Strong — open SDK, real txs, Walrus |
| Product & UX | 20% | Strong — terminal hero, clean demo |
| Technical Implementation | 20% | Strong — contract deployed, zkLogin real, on-chain |
| Presentation & Vision | 10% | Strong — demo script ready |

---

## What's Next (in priority order)

1. AI agent demo — LLM calling sdk.execute() autonomously (~50 lines, ~1-2 hrs)
2. npm publish — cd packages/sdk && pnpm publish (~30 min)
3. Demo video — ≤5 min, YouTube, required for submission (~2-3 hrs)
4. DeepSurge submission — https://www.deepsurge.xyz/hackathons/b587dc0c-4cb8-4e63-ada5-519df38103bf
5. KYC for prize
6. Mainnet deploy — contact grants@sui.io

---

## Submission Checklist

- [x] Public GitHub repo
- [x] Live app on Vercel
- [x] Move contract on testnet
- [x] Real on-chain EdgePass creation ✅ June 11
- [x] Festival Mode on-chain execution ✅ June 11
- [x] Walrus audit logs with real digests ✅ June 11
- [x] zkLogin real ZK proof ✅ June 11
- [ ] @edge-protocol/sdk on npm
- [ ] AI agent demo
- [ ] Demo video (YouTube, ≤5 min)
- [ ] DeepSurge submission
- [ ] KYC completed for prize
- Deadline: June 21, 2026

---

## Mainnet Sponsorship

Email grants@sui.io:
Subject: Sui Overflow 2026 — Mainnet sponsorship for Edge (Agentic Web)

Building Edge — programmable trust infrastructure for autonomous agents on Sui.
Open SDK + Move contract deployed and working on testnet.
Real zkLogin, Enoki sponsorship, Walrus audit logs all confirmed.
Need mainnet gas coverage for deployment. Submitting June 21st.

---

## Personal Laptop (for contract work)

- Machine: 2017 MacBook Air (Intel x86_64)
- Sui wallet alias: festive-tourmaline
- Address: 0xe759eaf1a47566836f825b96a8d12e55b858df1be7d86b032f449638a93489c9
- Recovery phrase: donkey match coil wait seed begin liar thrive sausage always deal drastic
- Note: Sui CLI crashes on sui move build due to Intel malloc bug — use GitHub Actions

---

## New Chat Prompt

I'm building Edge — programmable trust infrastructure for autonomous onchain systems on Sui, for Sui Overflow 2026 (Agentic Web track). Repo: github.com/fluturecode/edge. Live: edge-web-git-main-fluturecodes-projects.vercel.app. Contract on testnet: 0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d. I have a full handoff doc — please read it before we continue.

Then paste the entire contents of this file.

---

Last updated: June 12, 2026 — after Day 3 build session
Hours invested: ~24 hours
Status: Real on-chain EdgePass creation + Festival Mode execution confirmed on Sui testnet