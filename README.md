# Edge

**The Trust Primitive for Autonomous Agents**
EdgePass gives agents your rules, not your keys.

[![Built on Sui](https://img.shields.io/badge/built%20on-Sui-blue)](https://sui.io)
[![Walrus Storage](https://img.shields.io/badge/storage-Walrus-teal)](https://walrus.xyz)
[![npm version](https://img.shields.io/npm/v/@edge-protocol/sdk)](https://npmjs.com/package/@edge-protocol/sdk)
[![npm downloads](https://img.shields.io/npm/dw/@edge-protocol/sdk)](https://npmjs.com/package/@edge-protocol/sdk)
[![Tests](https://img.shields.io/badge/tests-34%20passing-brightgreen)](https://github.com/fluturecode/edge)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Sui Overflow](https://img.shields.io/badge/Sui%20Overflow-2026-blue)](https://overflow.sui.io)

[Live Demo →](https://edge-web-cyan.vercel.app)  ·  [npm →](https://npmjs.com/package/@edge-protocol/sdk)  ·  [Contract →](https://suiscan.xyz/mainnet/object/0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde)  ·  [Docs →](packages/sdk/DOCS.md)

*The best infrastructure is invisible.*

---

## The Problem

Every developer building an autonomous agent hits the same wall:

| Option | Approach | Problem |
|--------|----------|---------|
| A | Give the agent full wallet access | Catastrophic risk — unlimited exposure |
| B | Human approves every transaction | Defeats the purpose of automation |
| C | Build custom policy logic per app | 6–8 weeks of infrastructure before any business logic |

There is no Option D. No standard primitive for saying:

> "This agent can spend up to $300, at these merchants, auto-approve under $50, ask me before anything over $100, and shut down in 48 hours — without ever touching my keys."

**Edge is Option D.**

---

## What Edge Does

Edge is programmable trust infrastructure. Users define boundaries once. Agents execute freely within them. Unsafe actions escalate automatically.

The atomic unit is the **EdgePass** — a Sui Move object encoding a complete trust policy:

```
budget: $300  ·  auto-approve: < $50  ·  escalate: > $100  ·  merchants: [...]  ·  expiry: 48h
```

Without Edge, every developer builds the same infrastructure from scratch:

```
❌ Policy engine        who can the agent pay? how much?
❌ Escalation system    when does the human get notified?
❌ Audit trail          what did the agent do? prove it.
❌ Budget tracker       how much is left?
❌ Expiry system        when does authority end?
❌ Revocation           how do I stop it immediately?
❌ On-chain state       where does the policy live?
```

With Edge:

```bash
pnpm add @edge-protocol/sdk
```
```typescript
const pass = await sdk.create(EdgePass.fromTemplate('festival', { owner }), signer);
const outcome = await sdk.execute(pass, { merchant, amount }, signer);
// ✅ policy enforced  ·  🗂 audit logged  ·  ✓ done
```

10 lines of code. 8 weeks of infrastructure. Gone.

---

## 🤖 Live AI Agent Demo

The real proof: Claude autonomously manages festival purchases within an EdgePass.

```
🧠 Claude:        "Shuttle from parking — $18.50 at Shuttle Express"
⚙️  PolicyEngine:  ✅ auto-approved · under $50 threshold · trusted merchant
⛓  Sui:           execute_transaction · Success

🧠 Claude:        "Drinks for the group — $32 at Hydra Bar"
⚙️  PolicyEngine:  ✅ auto-approved · within policy limits
⛓  Sui:           execute_transaction · Success

🧠 Claude:        "VIP artist meet & greet — $220"
⚙️  PolicyEngine:  ⚠️  escalated · exceeds $150 threshold
👤 User:          approves via modal
⛓  Sui:           execute_transaction · Success

🧠 Claude:        "ShadyTokens.xyz — quick flip"
⚙️  PolicyEngine:  🚫 blocked · merchant not in approved list
⛓  Sui:           never submitted

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 transactions executed autonomously
$188.50 spent · $311.50 remaining
0 wallet interruptions · every action verified on Suiscan
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Every decision cryptographically verified on-chain. Every receipt immutably stored on Walrus.

---

## 📦 SDK Quickstart

```bash
npm install @edge-protocol/sdk
pnpm add @edge-protocol/sdk
yarn add @edge-protocol/sdk
```

### Create a trust boundary

```typescript
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: 'YOUR_KEY' });

// From a template — sensible defaults for common use cases
const pass = await sdk.create(
  EdgePass.fromTemplate('festival', {
    approvedMerchants: ['Shuttle Express', 'Hydra Bar', 'Stage Access VIP'],
    owner: userAddress,
  }),
  signer
);
```

> **Note:** BigInt literal syntax (`32n`) requires TypeScript targeting ES2020+. For ES2019 apps use `BigInt(32) * MIST_PER_SUI`.

### Execute autonomously

```typescript
const outcome = await sdk.execute(pass, {
  merchant: 'Shuttle Express',
  amount:   BigInt(18_500_000_000), // 18.5 SUI in MIST
}, signer);

switch (outcome.status) {
  case 'approved':   console.log('executed:', outcome.digest); break;
  case 'escalated':  await notifyUser(outcome.reason); break;
  case 'blocked':    console.log('policy rejected:', outcome.reason); break;
}
```

### Simulate before executing

```typescript
// Zero network calls — instant plan for the full session
const plan = sdk.simulate(pass, decisions);
console.log(plan.summary);
// { approvedCount: 4, blockedCount: 1, escalatedCount: 1 }
```

### Budget intelligence

```typescript
const status = sdk.budgetStatus(pass);
// { spent, remaining, utilizationPct, isNearLimit, isExhausted }

sdk.isNearLimit(pass)      // true if > 80% spent
sdk.timeRemaining(pass)    // ms until expiry
sdk.isExpiringSoon(pass)   // true if < 1 hour remaining
```

### React hook

```typescript
import { useEdgePass } from '@edge-protocol/sdk/react';

const { pass, execute, simulate, budgetStatus, loading } = useEdgePass({
  passId, network: 'mainnet', enokiApiKey: KEY, signer,
});
```

### Preview without executing

```typescript
const preview = sdk.validate(pass, { merchant, amount });
// { allowed: boolean, requiresEscalation: boolean, reason: string }
```

---

## 📋 Templates

| Template | Budget | Auto ≤ | Escalate ≥ | Max/tx | Expiry |
|----------|--------|--------|------------|--------|--------|
| `festival` | 300 SUI | 50 SUI | 100 SUI | 200 SUI | 48h |
| `gaming` | 50 SUI | 2 SUI | 10 SUI | 10 SUI | 4h |
| `subscription` | 200 SUI | 20 SUI | 50 SUI | 50 SUI | 30d |
| `defi` | 10,000 SUI | 500 SUI | 1,000 SUI | 2,000 SUI | 7d |
| `enterprise` | 50,000 SUI | 1,000 SUI | 5,000 SUI | 10,000 SUI | 30d |

---

## ⚙️ How It Works

```
User creates EdgePass (once)
         │
         ▼
Agent calls sdk.execute() — many times, autonomously
         │
         ├─▶ 🔍 PolicyEngine.validate()
         │         Pure TypeScript · no network · <1ms
         │         ├─ active? expired? merchant in allowlist?
         │         ├─ amount within budget? below maxPerTx?
         │         ├─ amount > escalateThreshold? → ⚠️  escalate
         │         └─ amount ≤ autoThreshold?     → ✅ auto-approve
         │
         ├─▶ ⚡ ExecutionEngine — PTB (atomic)
         │         validate → execute → update spent → emit event
         │         if any step fails → everything reverts · no partial state
         │
         └─▶ 🗂 Walrus — immutable audit receipt
                   cryptographically committed · decentralized · permanent
```

---

## 🔷 Why This Is Only Possible on Sui

**🔐 zkLogin** — Invisible wallet from Google login. No seed phrase, no MetaMask. On Ethereum: weeks of account abstraction. On Sui: one API call.

**⛽ Sponsored Transactions** — Users never pay gas. Protocol-level primitive. On Ethereum: deploy and maintain a Paymaster contract. On Sui: one API key.

**🧱 Programmable Transaction Blocks** — Policy check + execution + state update — one atomic block. If any step fails, everything reverts. Native to Sui.

**📦 Object Model** — EdgePass is a first-class owned object in the user's wallet. An agent executes against it without ever taking ownership. On Ethereum: a contract mapping the developer can modify. On Sui: an object only the owner can touch.

**🗂 Walrus** — Every execution writes an immutable audit receipt to decentralized storage. Built by the same team as Sui. Not IPFS. Not S3. Native.

---

## 🔒 Security Model

Edge has two enforcement layers:

**Layer 1 — TypeScript PolicyEngine** — pre-flight, zero network calls, under 1ms. Fast feedback before any chain interaction. Can be bypassed by a compromised agent — treat as a convenience layer.

**Layer 2 — Sui Move Contract** — on-chain enforcement by the Sui VM. Cannot be bypassed.

```
sdk.validate()  →  TypeScript (instant preview, saves gas on rejections)
sdk.execute()   →  TypeScript + Move contract (atomic, tamper-proof)
```

The Move contract runs five assertions in the Sui VM before recording any spend:

```move
assert!(pass.active, EPassInactive);
assert!(now <= pass.expires_at, EPassExpired);
assert!(is_merchant_approved(pass, &merchant), EMerchantNotApproved);
assert!(pass.spent + amount <= pass.budget, EBudgetExceeded);
assert!(amount <= pass.escalate_threshold, EAmountExceedsEscalationThreshold);
```

---

## 🌐 Use Cases

| Vertical | Template | The agent does |
|----------|----------|----------------|
| 🎪 Consumer / Festival | `festival` | Purchases at approved vendors, escalates big spends |
| 🎮 Gaming | `gaming` | In-game micro-purchases within session budget |
| 📦 Subscriptions | `subscription` | Recurring payments to approved services |
| 📈 DeFi / Trading | `defi` | Trades on approved DEXes within risk parameters |
| 🏢 Enterprise / Payroll | `enterprise` | Vendor payments with compliance audit trail |
| 🤖 AI Agent Platforms | any | Any LLM making autonomous spending decisions |
| 🏦 Institutional | `enterprise` | Fireblocks custody + Edge policy = complete stack |

---

## ⛓ Move Contract

```
Network:   Sui Mainnet ✅
Package:   0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde
```

[View on Suiscan →](https://suiscan.xyz/mainnet/object/0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde)

---

## 🧪 Testing

```bash
cd packages/sdk && pnpm test
```

```
📋 PolicyEngine.validate()     10 tests ✓
📋 PolicyEngine helpers         5 tests ✓
📋 EdgePass.fromTemplate()      7 tests ✓
📋 Constants                    5 tests ✓
📋 Events system                7 tests ✓

34 passed · 0 failed ✅
```

---

## 🚀 Local Development

```bash
# Clone and install
git clone https://github.com/fluturecode/edge.git
cd edge && pnpm install

# Set environment variables
cp apps/web/.env.example apps/web/.env.local
# Add: NEXT_PUBLIC_ENOKI_API_KEY, NEXT_PUBLIC_GOOGLE_CLIENT_ID, ANTHROPIC_API_KEY

# Run the demo app
cd apps/web && pnpm dev
# → http://localhost:3000

# Run SDK tests
cd packages/sdk && pnpm test

# Build SDK
cd packages/sdk && pnpm build
```

---

## 📁 Repository Structure

```
edge/
├── 📱 apps/web/                     Next.js 15 demo app
│   ├── app/
│   │   ├── page.tsx                 Login — terminal typewriter, zkLogin
│   │   ├── auth/callback/           zkLogin callback, Enoki address derivation
│   │   ├── dashboard/               Main dashboard, EdgePass card
│   │   ├── dashboard/create/        EdgePass creation + PTB preview
│   │   └── dashboard/agent/         🤖 AI agent demo — Claude + EdgePass
│   ├── lib/
│   │   ├── signer.ts                zkLogin signer, gas coin resolution
│   │   ├── zklogin.ts               ZK proof generation via Enoki
│   │   ├── walrus.ts                Walrus HTTP API (write/read blobs)
│   │   └── seal.ts                  Seal policy encryption
│   └── app/api/
│       ├── sign/route.ts            Transaction signing + Sui execution
│       ├── zkp/route.ts             ZK proof generation via Enoki
│       └── agent/route.ts           Claude/Gemini API for autonomous decisions
│
├── 📦 packages/sdk/                 @edge-protocol/sdk v0.9.x
│   └── src/
│       ├── core/
│       │   ├── EdgePass.ts          Main API + simulate() + withPolicy()
│       │   ├── PolicyEngine.ts      Validation + budget helpers (34 tests)
│       │   └── ExecutionEngine.ts   PTB builder + chain execution
│       ├── react/
│       │   └── index.ts             useEdgePass, useBudgetStatus, useSimulate
│       └── utils/
│           ├── types.ts             All TypeScript types
│           └── constants.ts         Templates + Package IDs + MIST_PER_SUI
│
└── 📜 contracts/navis/
    └── sources/edge_pass.move       ✅ Deployed to Sui mainnet
```

---

## 🗺 Roadmap

### Phase 1 — Foundation ✅ shipped

- ✅ zkLogin onboarding — invisible wallet from Google
- ✅ EdgePass creation — real Move object on Sui mainnet
- ✅ PolicyEngine — 34 tests, pure TypeScript
- ✅ Events system — `on('approved')`, `on('escalated')`, `on('blocked')`
- ✅ simulate() — predict outcomes before executing
- ✅ Budget helpers — `budgetStatus()`, `isNearLimit()`, `timeRemaining()`
- ✅ React hooks — `useEdgePass`, `useBudgetStatus`, `useSimulate`
- ✅ 🤖 Live AI agent demo — Claude + Gemini making real autonomous decisions
- ✅ 🗂 Walrus audit logs — immutable receipts
- ✅ 🔒 Seal policy encryption
- ✅ Move contract — deployed to Sui mainnet
- ✅ SDK on npm — @edge-protocol/sdk v0.9.x

### Phase 2 — Trust Layer 🔨 in progress

- ⬜ Real Walrus blob storage (blocked on @mysten/sui v2 upgrade)
- ⬜ Rolling time windows — `maxTransactionsPerHour`
- ⬜ On-chain policy signatures — tamper-proof policy commitment
- ⬜ Merchant address verification — verified Sui addresses on-chain
- ⬜ Multi-token support — USDC, USDT, any Sui coin
- ⬜ Tool-use architecture — Claude decides one transaction at a time

### Phase 3 — Protocol & Business 📋 coming

- ⬜ Managed escalation dashboard
- ⬜ Enterprise guardrails — SOC2, SIEM, Fireblocks adapter
- ⬜ Cross-agent coordination — multi-agent quorum execution
- ⬜ Intent-based policies — natural language → on-chain rules
- ⬜ Cross-chain EdgePasses

---

## 💡 The Analogy

Before Stripe, every developer built their own payment processing. After Stripe, you call `stripe.charge()`.

**Edge is `stripe.charge()` for autonomous agent trust.**

---

## 🏗 Open-Core Model

```
PROPRIETARY (future business):
  Managed escalation UI · Enterprise auth · Policy feeds · Compliance exports

OPEN SOURCE (always free):
  TypeScript SDK · Move contracts · Walrus audit parsers · PolicyEngine
```

The SDK, Move contracts, and PolicyEngine are and will always be open source.

---

## 📊 Why It Matters

The agentic economy is already here. Every autonomous agent that touches money needs a trust boundary. Today, every team builds their own. With Edge, every team ships in a day.

---

*The best infrastructure is invisible.*

Built with ♥ by [@fluturecode](https://github.com/fluturecode) for [Sui Overflow 2026](https://overflow.sui.io) — Agentic Web track.

```bash
pnpm add @edge-protocol/sdk
```

[GitHub](https://github.com/fluturecode/edge) · [npm](https://npmjs.com/package/@edge-protocol/sdk) · [Sui](https://sui.io) · MIT License
