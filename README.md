<div align="center">

<br />

<img src="https://img.shields.io/badge/◎_EDGE-000000?style=for-the-badge&logoColor=00D4AA" alt="Edge" />

<br />
<br />

# The Trust Primitive for Autonomous Agents

<p align="center">
  <strong>EdgePass gives agents your rules, not your keys.</strong>
</p>

<br />

[![Built on Sui](https://img.shields.io/badge/Built%20on-Sui-4DA2FF?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMCIgY3k9IjEwIiByPSI5IiBzdHJva2U9IiM0REEyRkYiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==)](https://sui.io)
[![Walrus Storage](https://img.shields.io/badge/🗂_Storage-Walrus-00D4AA?style=flat-square)](https://walrus.xyz)
[![npm version](https://img.shields.io/npm/v/@edge-protocol/sdk?style=flat-square&color=FF4D6A&label=npm)](https://npmjs.com/package/@edge-protocol/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@edge-protocol/sdk?style=flat-square&color=FFB830)](https://npmjs.com/package/@edge-protocol/sdk)
[![Tests](https://img.shields.io/badge/tests-6%2F6_passing-00D4AA?style=flat-square)](packages/sdk/src/test.ts)
[![License](https://img.shields.io/badge/license-MIT-B8C8E0?style=flat-square)](LICENSE)
[![Sui Overflow](https://img.shields.io/badge/Sui_Overflow-2026_🏆-4DA2FF?style=flat-square)](https://overflow.sui.io)

<br />

[**Live Demo →**](https://edge-web-git-main-fluturecodes-projects.vercel.app) &nbsp;·&nbsp; [**npm →**](https://npmjs.com/package/@edge-protocol/sdk) &nbsp;·&nbsp; [**Contract →**](https://suiscan.xyz/testnet/object/0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d) &nbsp;·&nbsp; [**Docs →**](packages/sdk/DOCS.md)

<br />

---

*The best infrastructure is invisible.*

---

</div>

<br />

## The Problem

Every developer building an autonomous agent hits the same wall:

| Option | Approach | Problem |
|--------|----------|---------|
| **A** | Give the agent full wallet access | Catastrophic risk — unlimited exposure |
| **B** | Human approves every transaction | Defeats the purpose of automation |
| **C** | Build custom policy logic per app | 6–8 weeks of infrastructure before any business logic |

There is no **Option D**. No standard primitive for saying:

> *"This agent can spend up to $300, at these merchants, auto-approve under $50, ask me before anything over $100, and shut down in 48 hours — without ever touching my keys."*

**Edge is Option D.**

<br />

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

**10 lines of code. 8 weeks of infrastructure. Gone.**

<br />

## 🤖 Live AI Agent Demo

The real proof: Claude autonomously manages festival purchases within an EdgePass.

```
🧠 Claude:        "Shuttle from parking — $18.50 at Shuttle Express"
⚙️  PolicyEngine:  ✅ auto-approved · under $50 threshold · trusted merchant
⛓  Sui:           execute_transaction · Success · checkpoint #348722271

🧠 Claude:        "Drinks for the group — $32 at Hydra Bar"
⚙️  PolicyEngine:  ✅ auto-approved · within policy limits
⛓  Sui:           execute_transaction · Success

🧠 Claude:        "VIP artist meet & greet — $149"
⚙️  PolicyEngine:  ⚠️  escalated · exceeds $100 threshold
👤 User:          approves via modal (Face ID in production)
⛓  Sui:           execute_transaction · Success

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3 transactions executed autonomously
$54.50 spent · $245.50 remaining
0 wallet popups · every action verified on Suiscan
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Every decision cryptographically verified on-chain. Every receipt immutably stored on Walrus.

<br />

## 📦 SDK Quickstart

```bash
npm install @edge-protocol/sdk
# or
pnpm add @edge-protocol/sdk
# or
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

// Or from scratch — full control
const pass = await sdk.create({
  budget:            300n * MIST_PER_SUI,
  autoThreshold:      50n * MIST_PER_SUI,
  escalateThreshold: 100n * MIST_PER_SUI,
  approvedMerchants: ['Shuttle Express', 'Hydra Bar'],
  expiryMs:          48 * 60 * 60 * 1000,
  owner:             userAddress,
}, signer);
```

### Execute autonomously

```typescript
const outcome = await sdk.execute(pass, {
  merchant: 'Shuttle Express',
  amount:   18_500_000_000n, // 18.5 SUI in MIST
}, signer);

switch (outcome.status) {
  case 'approved':
    console.log('executed:', outcome.digest);
    // audit log written to Walrus automatically
    break;
  case 'escalated':
    await notifyUser(outcome.reason);
    break;
  case 'blocked':
    console.log('policy rejected:', outcome.reason);
    break;
}
```

### Preview before executing

```typescript
// Zero network calls — pure TypeScript, sub-millisecond
const preview = sdk.validate(pass, { merchant, amount });
// { allowed: boolean, requiresEscalation: boolean, reason: string }
```

### Revoke instantly

```typescript
await sdk.revoke(pass, signer);
// all future execute() calls return 'blocked'
```

<br />

## 📋 Templates

Pre-configured trust boundaries for the most common use cases:

| Template | Budget | Auto ≤ | Escalate ≥ | Max/tx | Expiry |
|----------|--------|--------|------------|--------|--------|
| `festival` | 300 SUI | 50 SUI | 100 SUI | 200 SUI | 48h |
| `gaming` | 50 SUI | 2 SUI | 10 SUI | 10 SUI | 4h |
| `subscription` | 200 SUI | 20 SUI | 50 SUI | 50 SUI | 30d |
| `defi` | 10,000 SUI | 500 SUI | 1,000 SUI | 2,000 SUI | 7d |
| `enterprise` | 50,000 SUI | 1,000 SUI | 5,000 SUI | 10,000 SUI | 30d |

Every template is a starting point — override any field:

```typescript
const pass = await sdk.create(
  EdgePass.fromTemplate('defi', {
    budget: 25_000n * MIST_PER_SUI,
    approvedMerchants: ['DeepBook', 'Cetus', 'Turbos'],
    owner: userAddress,
  }),
  signer
);
```

<br />

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

<br />

## 🔷 Why This Is Only Possible on Sui

Five primitives. All native to Sui. None exist anywhere else.

```
🔐 zkLogin
   Invisible wallet from Google login. No seed phrase, no MetaMask.
   On Ethereum: weeks of account abstraction infrastructure.
   On Sui: one API call.

⛽ Sponsored Transactions
   Users never pay gas. Protocol-level primitive.
   On Ethereum: deploy and maintain a Paymaster contract.
   On Sui: one API key.

🧱 Programmable Transaction Blocks
   Policy check + execution + state update + audit event — one atomic block.
   If any step fails, everything reverts. No race conditions. No partial state.
   Native to Sui. Doesn't exist anywhere else.

📦 Object Model
   EdgePass is a first-class owned object in the user's wallet.
   An agent executes against it without ever taking ownership.
   Trust enforced at the protocol level, not application code.
   On Ethereum: a contract mapping the developer can modify.
   On Sui: an object only the owner can touch.

🗂 Walrus
   Every execution writes an immutable audit receipt to decentralized storage.
   Built by the same team as Sui. Byzantine fault-tolerant. Erasure-coded.
   Not IPFS. Not S3. Native.
```

> *You could build a worse version of Edge on Ethereum in months. On Sui it took 48 hours — because every primitive was already there.*

<br />

## 🌐 Use Cases

The same three lines work across every vertical:

| Vertical | Template | The agent does |
|----------|----------|----------------|
| 🎪 **Consumer / Festival** | `festival` | Purchases at approved vendors, escalates big spends |
| 🎮 **Gaming** | `gaming` | In-game micro-purchases within session budget |
| 📦 **Subscriptions** | `subscription` | Recurring payments to approved services |
| 📈 **DeFi / Trading** | `defi` | Trades on approved DEXes within risk parameters |
| 🏢 **Enterprise / Payroll** | `enterprise` | Vendor payments with compliance audit trail |
| 🤖 **AI Agent Platforms** | any | Any LLM making autonomous spending decisions |
| 🏦 **Institutional** | enterprise | Fireblocks custody + Edge policy = complete stack |

<br />

## ⛓ Move Contract

```
📍 Network:    Sui Testnet (Mainnet pending)
📦 Package:    0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d
🔑 Deployer:   0xe759eaf1a47566836f825b96a8d12e55b858df1be7d86b032f449638a93489c9
🧾 Tx Digest:  64fovgDj7P5DX9mNDTEEmEwVU2cxxJhQvnZq2eos1s84
```

[View on Sui Explorer →](https://suiscan.xyz/testnet/object/0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d)

<br />

## 🧪 Testing

```bash
cd packages/sdk && pnpm test
```

```
✓ auto-approves transactions under threshold
✓ escalates transactions above threshold
✓ blocks merchants not in approved list
✓ blocks when remaining budget is exceeded
✓ blocks when EdgePass has expired
✓ blocks when EdgePass is inactive

Test Suites: 1 passed
Tests:       6 passed, 6 total ✅
```

<br />

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

<br />

## 📁 Repository Structure

```
edge/
├── 📱 apps/web/                     Next.js 15 demo app
│   ├── app/
│   │   ├── page.tsx                 Login — terminal typewriter, zkLogin
│   │   ├── auth/callback/           zkLogin callback, Enoki address derivation
│   │   ├── dashboard/               Main dashboard, EdgePass card
│   │   ├── dashboard/create/        EdgePass creation + PTB preview + terminal log
│   │   ├── dashboard/activity/      Festival Mode simulation + Walrus audit
│   │   └── dashboard/agent/         🤖 AI agent demo — Claude + EdgePass
│   ├── lib/
│   │   ├── signer.ts                zkLogin signer, gas coin resolution
│   │   ├── zklogin.ts               ZK proof generation via Enoki
│   │   ├── walrus.ts                Walrus HTTP API (write/read blobs)
│   │   └── seal.ts                  Seal policy encryption
│   └── app/api/
│       ├── sign/route.ts            Transaction signing + Sui execution
│       ├── zkp/route.ts             ZK proof generation via Enoki
│       └── agent/route.ts           Claude API for autonomous decisions
│
├── 📦 packages/sdk/                 @edge-protocol/sdk
│   └── src/
│       ├── core/
│       │   ├── EdgePass.ts          Main API + fromTemplate()
│       │   ├── PolicyEngine.ts      Validation logic (pure TS, 6/6 tests)
│       │   └── ExecutionEngine.ts   PTB builder + chain execution
│       └── utils/
│           ├── types.ts             All TypeScript types
│           └── constants.ts         Templates + Package IDs + MIST_PER_SUI
│
└── 📜 contracts/navis/
    └── sources/edge_pass.move       ✅ Deployed to Sui testnet
```

<br />

## 🗺 Roadmap

**Phase 1 — Foundation** ✅ *shipped*
- [x] zkLogin onboarding — invisible wallet from Google
- [x] EdgePass creation — real Move object on-chain
- [x] PolicyEngine — 6/6 tests, pure TypeScript
- [x] Festival Mode simulation — all 5 transaction types
- [x] 🤖 AI agent demo — Claude making real autonomous decisions
- [x] 🗂 Walrus audit logs — live blobs on testnet
- [x] 🔒 Seal policy encryption
- [x] Move contract — deployed to Sui testnet
- [x] SDK on npm — `@edge-protocol/sdk`
- [x] CI/CD — GitHub Actions contract deployment

**Phase 2 — Trust Layer** 🔨 *in progress*
- [ ] Agent reputation system — on-chain scoring across sessions
- [ ] Composable delegation — org hierarchy trust trees
- [ ] Multi-token support — USDC, USDT, any Sui coin
- [ ] Events — `on('approved')`, `on('escalated')`, `on('blocked')`
- [ ] Mainnet deployment

**Phase 3 — Protocol** 📋 *coming*
- [ ] Cross-agent coordination — multi-agent quorum execution
- [ ] Intent-based policies — natural language → on-chain rules
- [ ] Edge Protocol DAO — community governance
- [ ] Cross-chain EdgePasses

<br />

## 💡 The Analogy

> *Before Stripe, every developer built their own payment processing. After Stripe, you call `stripe.charge()`.*
>
> *Edge is `stripe.charge()` for autonomous agent trust.*

<br />

## 📊 Why It Matters

The agentic economy is already here:

- **140M+** autonomous agent payments completed in 9 months
- **$43M+** in agent-managed transaction volume
- **Growing exponentially** as AI adoption accelerates

Every one of those agents needs a trust boundary. Today, every team builds their own. With Edge, every team ships in a day.

<br />

---

<div align="center">

*The best infrastructure is invisible.*

<br />

Built with ♥ by [**@fluturecode**](https://github.com/fluturecode) for [**Sui Overflow 2026**](https://overflow.sui.io) — Agentic Web track.

<br />

`pnpm add @edge-protocol/sdk`

<br />

[![GitHub](https://img.shields.io/badge/GitHub-fluturecode%2Fedge-181717?style=flat-square&logo=github)](https://github.com/fluturecode/edge)
[![npm](https://img.shields.io/badge/npm-%40edge--protocol%2Fsdk-CB3837?style=flat-square&logo=npm)](https://npmjs.com/package/@edge-protocol/sdk)
[![Sui](https://img.shields.io/badge/Sui-Testnet-4DA2FF?style=flat-square)](https://suiscan.xyz/testnet/object/0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d)

MIT License

</div>
>
