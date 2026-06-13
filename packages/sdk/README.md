<div align="center">

```
◎ EDGE  ·  built on Sui
```

# Edge — Programmable Trust for Autonomous Systems

[![Built on Sui](https://img.shields.io/badge/Built%20on-Sui-4DA2FF?style=flat-square)](https://sui.io)
[![Walrus](https://img.shields.io/badge/Storage-Walrus-00D4AA?style=flat-square)](https://walrus.xyz)
[![npm](https://img.shields.io/badge/npm-%40edge--protocol%2Fsdk-FF4D6A?style=flat-square)](https://npmjs.com/package/@edge-protocol/sdk)
[![Tests](https://img.shields.io/badge/tests-6%2F6%20passing-00D4AA?style=flat-square)](#testing)
[![License: MIT](https://img.shields.io/badge/License-MIT-FFB830?style=flat-square)](LICENSE)
[![Sui Overflow 2026](https://img.shields.io/badge/Sui%20Overflow-2026%20🏆-4DA2FF?style=flat-square)](https://overflow.sui.io)

**[Live Demo](https://edge-web-git-main-fluturecodes-projects.vercel.app) · [Sui Overflow 2026](https://overflow.sui.io)**

*Users set the course. Edge handles the journey safely.*

</div>

---

## The Problem

AI agents cannot transact autonomously on behalf of users without either constant wallet interruptions or unlimited fund access. There is no programmable trust boundary between the two.

**Edge fixes this.**

---

## What is Edge?

Edge is a **trust delegation primitive** for autonomous onchain systems. Users define boundaries once — budget, merchants, thresholds, expiry. Apps and agents execute freely within them. Unsafe actions escalate automatically.

The atomic unit is the **EdgePass** — a Sui Move object encoding a complete trust policy:

```
budget: $300  ·  auto-approve: < $50  ·  escalate: > $100  ·  merchants: [...]  ·  expiry: 48h
```

---

## SDK Quickstart

```bash
npm install @edge-protocol/sdk
# or
yarn add @edge-protocol/sdk
# or
pnpm add @edge-protocol/sdk
```

```typescript
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

const sdk = new EdgePass({ network: 'testnet', enokiApiKey: '...' });

// 1. Create a trust boundary
const pass = await sdk.create({
  budget:            300n * MIST_PER_SUI,
  autoThreshold:      50n * MIST_PER_SUI,
  escalateThreshold: 100n * MIST_PER_SUI,
  approvedMerchants: ['Shuttle Express', 'Hydra Bar'],
  expiryMs:          48 * 60 * 60 * 1000,
  owner:             userAddress,
}, signer);

// 2. Execute autonomously — policy enforced on every call
const outcome = await sdk.execute(pass, {
  merchant: 'Shuttle Express',
  amount:   18_500_000_000n,
}, signer);

// outcome.status → 'approved' | 'escalated' | 'blocked'
```

---

## How It Works

```
User creates EdgePass (once)
         │
         ▼
Agent calls sdk.execute() (many times)
         │
         ├── PolicyEngine validates (pure TS, no network)
         │         ├── active? expired? merchant approved? budget remaining?
         │         ├── amount > escalateThreshold? → ⚠️  escalate to user
         │         └── amount ≤ autoThreshold?     → ✅ auto-approve
         │
         ├── ExecutionEngine builds PTB (atomic)
         │         validate → execute → update spent → emit event
         │
         └── Walrus writes immutable audit log
```

---

## Festival Mode Demo

| Merchant | Amount | Outcome |
|----------|--------|---------|
| 🚌 Shuttle Express | $18.50 | ✅ Auto-approved · on-chain tx confirmed |
| 🍹 Hydra Bar | $32.00 | ✅ Auto-approved · on-chain tx confirmed |
| 🎟 Stage Access VIP | $75.00 | ✅ Auto-approved · on-chain tx confirmed |
| ☠️ ShadyTokens.xyz | $0.01 | 🚫 Blocked — not in allowlist |
| 🎤 Artist Meet & Greet | $149.00 | ⚠️ Escalated — exceeds $100 threshold |

**3 auto-approved · 1 blocked · 1 escalated · 0 wallet popups**

All approved transactions confirmed on Sui testnet with real digests.  
Audit log live on Walrus: [view blob](https://walruscan.com/testnet/blob/aMp7SskBz83OJLg-2RwxPf-8psdURdoVyyDhtYMujT4)

---

## Sui Primitives Used

| Primitive | Role |
|-----------|------|
| 🔐 **zkLogin** | Google login → invisible Sui wallet, no seed phrase, real ZK proof |
| ⛽ **Enoki** | Gas sponsorship — users never pay transaction fees |
| 🧱 **PTBs** | Atomic: validate → execute → update → log in one transaction |
| 📦 **Move Objects** | EdgePass as owned, programmable on-chain state |
| 🗂 **Walrus** | Immutable, decentralized audit logs with real tx digests |
| 🔒 **Seal** | Encrypted trust policies (Phase 3) |

---

## Move Contract

**Deployed to Sui testnet:**

```
Package ID:  0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d
Deploy Tx:   64fovgDj7P5DX9mNDTEEmEwVU2cxxJhQvnZq2eos1s84
First Pass:  2wstpGwQgb8v6CDKdAmVjJBAHZ873MPFNMBNfvQutFKF
```

[View on Sui Explorer →](https://suiscan.xyz/testnet/object/0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d)

---

## Local Development

```bash
git clone https://github.com/fluturecode/edge.git
cd edge && pnpm install

# Set env vars
cp apps/web/.env.example apps/web/.env.local
# Add NEXT_PUBLIC_ENOKI_API_KEY, ENOKI_SECRET_KEY, NEXT_PUBLIC_GOOGLE_CLIENT_ID

# Run
cd apps/web && pnpm dev  # → localhost:3000

# Test SDK
cd packages/sdk && pnpm test
```

```
✓ auto-approves under $50
✓ escalates above $100
✓ blocks unlisted merchant
✓ blocks when budget exceeded
✓ blocks when expired
✓ blocks when inactive
6/6 passing ✅
```

---

## Confirmed On-Chain Activity

| Action | Tx Digest | Status |
|--------|-----------|--------|
| EdgePass created | [2wstpGwQ...](https://suiscan.xyz/testnet/tx/2wstpGwQgb8v6CDKdAmVjJBAHZ873MPFNMBNfvQutFKF) | ✅ Confirmed |
| Shuttle Express $18.50 | on-chain | ✅ Confirmed |
| Hydra Bar $32.00 | on-chain | ✅ Confirmed |
| Stage Access VIP $75.00 | on-chain | ✅ Confirmed |
| Walrus audit log | [Tly_O_M8...](https://walruscan.com/testnet/blob/Tly_O_M8YpJw-AZqWJ1JRv9xlgZ_W11Er3xoD4BtZlw) | ✅ Live |

---

## Repo Structure

```
edge/
├── apps/web/               # Next.js 16 demo app
│   ├── app/api/
│   │   ├── sponsor/        # Enoki sponsorship (server-side)
│   │   └── sign/           # zkLogin signing + Sui RPC
│   └── lib/
│       ├── zklogin.ts      # ZK proof via Enoki
│       ├── signer.ts       # buildSigner
│       └── walrus.ts       # Audit log storage
├── packages/sdk/           # @edge-protocol/sdk
│   └── src/core/
│       ├── EdgePass.ts         # Main API
│       ├── PolicyEngine.ts     # Validation logic
│       └── ExecutionEngine.ts  # PTB builder
└── contracts/navis/        # Move contract
    └── sources/edge_pass.move
```

---

## Roadmap

- [x] zkLogin onboarding — real ZK proof via Enoki
- [x] EdgePass creation — real on-chain Move object
- [x] PolicyEngine — 6/6 tests passing
- [x] Festival Mode — real on-chain execution
- [x] Walrus audit logs — live on testnet with real digests
- [x] Move contract — testnet deployed
- [x] GitHub Actions CI/CD pipeline
- [ ] AI agent demo
- [ ] `@edge-protocol/sdk` on npm
- [ ] Mainnet deployment
- [ ] Seal full encryption

---

## Why It Matters

The agentic web needs programmable trust. Without it, agents either interrupt users constantly or operate with no guardrails. Edge is the missing primitive — open SDK, on-chain policy, zero UX friction.

> *The best infrastructure is invisible.*

---

<div align="center">

Built by [@fluturecode](https://github.com/fluturecode) for [Sui Overflow 2026](https://overflow.sui.io) — Agentic Web track.

MIT License

</div>
