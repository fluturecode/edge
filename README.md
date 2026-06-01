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

**[Live Demo](https://edge-web-cyan.vercel.app) · [npm](#sdk-quickstart) · [Sui Overflow 2026](https://overflow.sui.io)**

*Users set the course. Edge handles the journey safely.*

</div>

---

## The Problem

AI agents can't transact autonomously on behalf of users without either constant wallet interruptions or unlimited fund access. There's no programmable trust boundary between the two.

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
```

```typescript
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: '...' });

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
         ├─▶ PolicyEngine validates (pure TS, no network)
         │         ├─ active? expired? merchant approved? budget remaining?
         │         ├─ amount > escalateThreshold? → ⚠️  escalate to user
         │         └─ amount ≤ autoThreshold?     → ✅ auto-approve
         │
         ├─▶ ExecutionEngine builds PTB (atomic)
         │         validate → execute → update spent → emit event
         │
         └─▶ Walrus writes immutable audit log
```

---

## Festival Mode Demo

| Merchant | Amount | Outcome |
|----------|--------|---------|
| 🚌 Shuttle Express | $18.50 | ✅ Auto-approved |
| 🍹 Hydra Bar | $32.00 | ✅ Auto-approved |
| 🎟 Stage Access VIP | $75.00 | ✅ Auto-approved |
| ☠️ ShadyTokens.xyz | $0.01 | 🚫 Blocked — not in allowlist |
| 🎤 Artist Meet & Greet | $149.00 | ⚠️ Escalated — exceeds $100 |

**3 auto-approved · 1 blocked · 1 escalated · 0 wallet popups**

Audit log → [live on Walrus](https://walruscan.com/testnet/blob/aMp7SskBz83OJLg-2RwxPf-8psdURdoVyyDhtYMujT4)

---

## Sui Stack

| Primitive | Role |
|-----------|------|
| 🔐 **zkLogin** | Google login → invisible Sui wallet, no seed phrase |
| ⛽ **Enoki** | Gas sponsorship — users never pay transaction fees |
| 🧱 **PTBs** | Atomic: validate → execute → update → log |
| 📦 **Move Objects** | EdgePass as programmable on-chain state |
| 🐋 **Walrus** | Immutable, decentralized audit logs |
| 🔒 **Seal** | Encrypted trust policies |

---

## Local Development

```bash
git clone https://github.com/fluturecode/edge.git
cd edge && pnpm install

# Set env vars
cp apps/web/.env.example apps/web/.env.local

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

## Roadmap

- [x] zkLogin onboarding
- [x] EdgePass creation UI
- [x] PolicyEngine — 6/6 tests
- [x] Festival Mode simulation
- [x] Walrus audit logs — live on testnet
- [ ] Move contract — testnet deploy
- [ ] Sponsored transactions
- [ ] `@edge-protocol/sdk` on npm
- [ ] Mainnet deployment
- [ ] Seal encrypted policies

---

## Repo Structure

```
edge/
├── apps/web/          # Next.js 15 demo app
├── packages/sdk/      # @edge-protocol/sdk
│   └── src/core/
│       ├── EdgePass.ts         # Main API
│       ├── PolicyEngine.ts     # Validation logic
│       └── ExecutionEngine.ts  # PTB builder
└── contracts/navis/   # Move contract
    └── sources/edge_pass.move
```

---

## Why It Matters

The agentic web needs programmable trust. Without it, agents either interrupt users constantly or operate with no guardrails. Edge is the missing primitive — open SDK, on-chain policy, zero UX friction.

> *The best infrastructure is invisible.*

---

<div align="center">

Built by [@fluturecode](https://github.com/fluturecode) for [Sui Overflow 2026](https://overflow.sui.io) — Agentic Web track.

MIT License

</div>