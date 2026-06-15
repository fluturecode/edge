<div align="center">

```
◎ EDGE  ·  built on Sui
```

# Edge — The Trust Primitive for Autonomous Agents

[![Built on Sui](https://img.shields.io/badge/Built%20on-Sui-4DA2FF?style=flat-square)](https://sui.io)
[![Walrus](https://img.shields.io/badge/Storage-Walrus-00D4AA?style=flat-square)](https://walrus.xyz)
[![npm](https://img.shields.io/badge/npm-%40edge--protocol%2Fsdk-FF4D6A?style=flat-square)](https://npmjs.com/package/@edge-protocol/sdk)
[![Tests](https://img.shields.io/badge/tests-6%2F6%20passing-00D4AA?style=flat-square)](#testing)
[![License: MIT](https://img.shields.io/badge/License-MIT-FFB830?style=flat-square)](LICENSE)
[![Sui Overflow 2026](https://img.shields.io/badge/Sui%20Overflow-2026-4DA2FF?style=flat-square)](https://overflow.sui.io)

**[Live Demo](https://edge-web-git-main-fluturecodes-projects.vercel.app) · [npm](https://npmjs.com/package/@edge-protocol/sdk) · [Contract](https://suiscan.xyz/testnet/object/0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d)**

*Edge doesn't restrict what agents can do. It defines what they're allowed to do — and gets out of the way.*

</div>

---

## The Problem

Every developer building an autonomous agent faces the same unsolved problem:

```
Option A: Give the agent full wallet access  →  catastrophic risk
Option B: Human approves every transaction  →  defeats the purpose
Option C: Build custom policy logic per app →  6-8 weeks of infrastructure
```

There is no Option D. No standard primitive for saying:

> *"This agent can spend up to $300, at these merchants, auto-approve under $50, escalate above $100, and shut down in 48 hours — without ever touching my keys."*

**Edge is Option D.**

---

## What Edge Does

Edge makes autonomous agents first-class financial actors — safely.

Without Edge, every developer building an agent on Sui builds the same infrastructure from scratch:

```
❌ Policy engine        (is this merchant approved? is the budget sufficient?)
❌ Escalation system    (when does the human get notified?)
❌ Audit trail          (what did the agent do? prove it.)
❌ Budget tracker       (how much is left?)
❌ Expiry system        (when does authority end?)
❌ Revocation           (how do I stop it?)
❌ On-chain state       (where does the policy live?)
```

That's 6-8 weeks before writing a single line of business logic.

With Edge:

```bash
pnpm add @edge-protocol/sdk
```

```typescript
const pass = await sdk.create(
  EdgePass.fromTemplate('festival', {
    approvedMerchants: ['Shuttle Express', 'Hydra Bar'],
    owner: userAddress,
  }),
  signer
);

const outcome = await sdk.execute(pass, { merchant, amount }, signer);
// policy enforced · audit logged · done
```

**10 lines of code. 8 weeks of infrastructure. Gone.**

---

## Live Demo — AI Agent in Action

The canonical demo: a user creates an EdgePass for a music festival, then Claude autonomously makes purchasing decisions within the policy boundaries.

```
Claude reasons: "I need shuttle transport — $18.50 at Shuttle Express"
PolicyEngine:   ✅ auto-approved · under $50 threshold
Chain:          execute_transaction · Success · Suiscan verified

Claude reasons: "Drinks for the group — $32 at Hydra Bar"  
PolicyEngine:   ✅ auto-approved · trusted merchant
Chain:          execute_transaction · Success

Claude reasons: "VIP artist meet & greet — $149"
PolicyEngine:   ⚠️ escalated · exceeds $100 threshold
User:           approves via modal

3 transactions executed autonomously · $54.50 spent · 0 wallet popups
```

Every transaction cryptographically verified on Suiscan. Every decision logged on Walrus.

---

## The Five Dimensions

Every EdgePass encodes five trust dimensions:

```
1. BUDGET      — total spend limit
2. VELOCITY    — auto-approve threshold / escalation threshold  
3. SCOPE       — approved merchants / contracts / counterparties
4. TIME        — expiry duration
5. ESCALATION  — what triggers human approval
```

No existing primitive captures all five. EdgePass does. In one Move object. On Sui.

---

## SDK Quickstart

```bash
npm install @edge-protocol/sdk
# or pnpm add @edge-protocol/sdk
```

### From a template

```typescript
import { EdgePass } from '@edge-protocol/sdk';

const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: '...' });

const pass = await sdk.create(
  EdgePass.fromTemplate('festival', {
    approvedMerchants: ['Shuttle Express', 'Hydra Bar'],
    owner: userAddress,
  }),
  signer
);

const outcome = await sdk.execute(pass, {
  merchant: 'Shuttle Express',
  amount:   18_500_000_000n, // in MIST
}, signer);

// outcome.status → 'approved' | 'escalated' | 'blocked'
```

### From scratch

```typescript
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

const pass = await sdk.create({
  budget:            300n * MIST_PER_SUI,
  autoThreshold:      50n * MIST_PER_SUI,
  escalateThreshold: 100n * MIST_PER_SUI,
  approvedMerchants: ['Shuttle Express', 'Hydra Bar'],
  expiryMs:          48 * 60 * 60 * 1000,
  owner:             userAddress,
}, signer);
```

---

## Templates

```typescript
EdgePass.fromTemplate('festival',     { owner })  // $300 / 48h
EdgePass.fromTemplate('gaming',       { owner })  // $50  / 4h session
EdgePass.fromTemplate('subscription', { owner })  // $200 / 30 days
EdgePass.fromTemplate('defi',         { owner })  // $10k / 7 days
EdgePass.fromTemplate('enterprise',   { owner })  // $50k / 30 days
```

---

## Why This Is Only Possible on Sui

Five primitives. All native to Sui. None exist anywhere else.

**zkLogin** — Invisible wallet from Google login. No seed phrase, no MetaMask. One API call.

**Sponsored Transactions** — Users never pay gas. Protocol-level primitive. One API key.

**PTBs** — Policy check + execution + state update + event emission in one atomic block. If any step fails, everything reverts. No race conditions.

**Object Model** — The EdgePass is a first-class owned object in the user's wallet. An agent can execute against it without ever taking ownership. Trust enforced at the protocol level, not application code.

**Walrus** — Every execution writes an immutable audit receipt to decentralized storage. No database. No server. Cryptographically committed. Built by the same team as Sui.

> *You could build a worse version of Edge on Ethereum in months. On Sui it took 48 hours.*

---

## How It Works

```
User creates EdgePass (once)
         │
         ▼
Agent calls sdk.execute() (autonomously, many times)
         │
         ├─▶ PolicyEngine.validate() — pure TS, no network, <1ms
         │         ├─ active? expired? merchant approved? budget ok?
         │         ├─ amount > escalateThreshold? → ⚠️  escalate
         │         └─ amount ≤ autoThreshold?     → ✅ auto-approve
         │
         ├─▶ ExecutionEngine builds PTB (atomic)
         │         validate → execute → update spent → emit event
         │
         └─▶ Walrus writes immutable audit receipt
```

---

## Use Cases

| Vertical | Template | What the agent does |
|----------|----------|---------------------|
| 🎪 **Consumer** | `festival` | Purchases at approved vendors, escalates big spends |
| 🎮 **Gaming** | `gaming` | In-game micro-purchases within session budget |
| 📦 **Subscriptions** | `subscription` | Recurring payments to approved services |
| 📈 **DeFi** | `defi` | Trades on approved DEXes within risk parameters |
| 🏢 **Enterprise** | `enterprise` | Vendor payments with compliance audit trail |
| 🤖 **AI Agents** | any | Any LLM making autonomous spending decisions |

---

## Move Contract

Deployed to Sui testnet:

```
Package:  0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d
Deployer: 0xe759eaf1a47566836f825b96a8d12e55b858df1be7d86b032f449638a93489c9
Digest:   64fovgDj7P5DX9mNDTEEmEwVU2cxxJhQvnZq2eos1s84
```

[View on Sui Explorer →](https://suiscan.xyz/testnet/object/0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d)

---

## SDK Roadmap

```
v0.1 — Core: create, execute, validate, revoke          ✅ shipped
v0.2 — Templates: festival, gaming, defi, enterprise    ✅ shipped
v0.3 — Events: on('approved'), on('escalated')          🔨 next
v0.4 — Delegation: sub-passes, nested hierarchies
v0.5 — Multi-token: USDC, USDT, any Sui coin
v1.0 — The standard trust primitive for Sui agents
```

---

## Local Development

```bash
git clone https://github.com/fluturecode/edge.git
cd edge && pnpm install

# Copy env vars
cp apps/web/.env.example apps/web/.env.local

# Run demo app
cd apps/web && pnpm dev  # → localhost:3000

# Run SDK tests
cd packages/sdk && pnpm test
```

```
✓ auto-approves under threshold
✓ escalates above threshold
✓ blocks unlisted merchant
✓ blocks when budget exceeded
✓ blocks when expired
✓ blocks when inactive
6/6 passing ✅
```

---

## Repo Structure

```
edge/
├── apps/web/          # Next.js 15 demo app
│   ├── app/
│   │   ├── page.tsx              # Login — terminal typewriter, zkLogin
│   │   ├── auth/callback/        # zkLogin callback, Enoki address derivation
│   │   ├── dashboard/            # Main dashboard, EdgePass card
│   │   ├── dashboard/create/     # EdgePass creation, PTB preview, terminal log
│   │   ├── dashboard/activity/   # Festival Mode simulation
│   │   └── dashboard/agent/      # AI agent demo — Claude + EdgePass
│   ├── lib/
│   │   ├── signer.ts             # zkLogin signer, gas coin resolution
│   │   ├── zklogin.ts            # ZK proof generation
│   │   ├── walrus.ts             # Walrus HTTP API
│   │   └── seal.ts               # Seal policy encryption
│   └── app/api/
│       ├── sign/route.ts         # Transaction signing + execution
│       ├── zkp/route.ts          # ZK proof via Enoki
│       └── agent/route.ts        # Claude API for autonomous decisions
├── packages/sdk/      # @edge-protocol/sdk
│   └── src/
│       ├── core/
│       │   ├── EdgePass.ts       # Main API + fromTemplate()
│       │   ├── PolicyEngine.ts   # Validation (pure TS, 6/6 tests)
│       │   └── ExecutionEngine.ts
│       └── utils/
│           ├── types.ts
│           └── constants.ts      # Templates + Package IDs
└── contracts/navis/
    └── sources/edge_pass.move    # Deployed Move contract
```

---

## Why It Matters

The agentic economy is already here. AI agents are completing millions of payments monthly and that number is growing exponentially. Every one of those agents needs a trust boundary.

Without Edge, every team builds their own. With Edge, every team ships in a day.

> *The best infrastructure is invisible.*

---

<div align="center">

Built by [@fluturecode](https://github.com/fluturecode) for [Sui Overflow 2026](https://overflow.sui.io) — Agentic Web track.

MIT License · `pnpm add @edge-protocol/sdk`

</div>
