# Edge

**The Trust Primitive for Autonomous Agents**
EdgePass gives agents your rules, not your keys.

[![Built on Sui](https://img.shields.io/badge/built%20on-Sui-blue)](https://sui.io)
[![Walrus Storage](https://img.shields.io/badge/storage-Walrus-teal)](https://walrus.xyz)
[![npm version](https://img.shields.io/npm/v/@edge-protocol/sdk)](https://npmjs.com/package/@edge-protocol/sdk)
[![npm downloads](https://img.shields.io/npm/dw/@edge-protocol/sdk)](https://npmjs.com/package/@edge-protocol/sdk)
[![Tests](https://img.shields.io/badge/tests-39%20passing-brightgreen)](https://github.com/fluturecode/edge)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Sui Overflow](https://img.shields.io/badge/Sui%20Overflow-2026-blue)](https://overflow.sui.io)

[Live Demo →](https://edge-web-cyan.vercel.app)  ·  [npm →](https://npmjs.com/package/@edge-protocol/sdk)  ·  [Contract →](https://suiscan.xyz/mainnet/object/0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde)  ·  [Docs →](packages/sdk/DOCS.md)

*The best infrastructure is invisible.*

---

> ## ⚠️ Network status — read this before you mint anything
>
> **`edge_pass_v2` is deployed to Sui testnet only.** Mainnet cannot mint v2 passes yet — `sdk.create()` on mainnet throws rather than silently targeting a package that doesn't have the module. Use `network: 'testnet'` until v2 ships to mainnet.
>
> **New passes are always v2.** There is no v1 creation path in the 2.x SDK — `sdk.create()` only ever mints v2.
>
> **v1 passes are read-only in the 2.x SDK.** If you already hold a v1 pass (minted on mainnet before this release), you can still `fetch()`, inspect, and `revoke()` it — you cannot create a new one or spend against one.
>
> **`edge_pass.move` (v1) stays in this repo permanently.** It's not dead code left over from before v2 — real v1 passes exist on Sui mainnet today, and the SDK's `fetch()`/`revoke()` need that module's functions to keep working for them, indefinitely.

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
const pass = await sdk.create(EdgePass.fromTemplate('festival', { agent }), signer);
const outcome = await sdk.execute(pass, { merchant, amount }, signer);
// ✅ policy enforced  ·  🗂 audit logged  ·  ✓ done
```

10 lines of code. 8 weeks of infrastructure. Gone.

---

## 🤖 Live AI Agent Demo

The real proof: an AI agent autonomously manages festival purchases within an EdgePass. Claude and Gemini both supported — model agnostic by design.

```
🧠 Agent:         "Shuttle from parking — $18.50 at Shuttle Express"
⚙️  PolicyEngine:  ✅ auto-approved · under $75 threshold · trusted merchant
⛓  Sui:           execute_transaction · Success · digest verifiable on Suiscan

🧠 Agent:         "Drinks for the group — $45 at Hydra Bar"
⚙️  PolicyEngine:  ✅ auto-approved · within policy limits
⛓  Sui:           execute_transaction · Success

🧠 Agent:         "VIP stage access — $220"
⚙️  PolicyEngine:  ⚠️  escalated · exceeds $150 threshold · agent paused
👤 User:          reviews and approves via modal
⛓  Sui:           execute_transaction · Success

🧠 Agent:         "ShadyTokens.xyz — quick flip"
⚙️  PolicyEngine:  🚫 blocked · merchant not in approved list · <1ms · never submitted

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 transactions executed autonomously
$188.50 spent · $311.50 remaining
0 wallet interruptions · every action verified on Suiscan
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 📦 SDK Quickstart

```bash
npm install @edge-protocol/sdk
pnpm add @edge-protocol/sdk
yarn add @edge-protocol/sdk
```

> **Note:** BigInt literal syntax (`32n`) requires TypeScript targeting ES2020+. For ES2019 apps use `BigInt(32) * MIST_PER_SUI`.

### Create a trust boundary

```typescript
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: 'YOUR_KEY' });

const pass = await sdk.create(
  EdgePass.fromTemplate('festival', {
    approvedMerchants: ['0xshuttle...', '0xhydrabar...', '0xstageaccess...'],
    agent: agentAddress,   // spends against the pass — this key signs execute()
    issuer: userAddress,   // grants/revokes — bookkeeping only, never sent on-chain
  }),
  signer
);
```

### Execute autonomously

```typescript
const outcome = await sdk.execute(pass, {
  merchant:      '0xshuttle...',        // address — must be in approvedMerchants
  merchantLabel: 'Shuttle Express',     // display only, not enforced
  amount:        BigInt(18_500_000_000), // 18.5 SUI in MIST
}, signer);

switch (outcome.status) {
  case 'approved':   console.log('executed:', outcome.digest); break;
  case 'escalated':  await notifyUser(outcome.reason); break;
  case 'blocked':    console.log('policy rejected:', outcome.reason); break;
}
```

### Simulate before executing

```typescript
// Zero network calls — predict the full session instantly
const plan = sdk.simulate(pass, decisions);
console.log(plan.summary);
// { approvedCount: 4, blockedCount: 1, escalatedCount: 1 }

// Show plan, then execute approved decisions
for (const decision of plan.approved) {
  await sdk.execute(pass, decision.request, signer);
}
```

### Budget intelligence

```typescript
const status = sdk.budgetStatus(pass);
// { spent, remaining, utilizationPct, isNearLimit, isExhausted }

sdk.isNearLimit(pass)      // true if > 80% spent
sdk.timeRemaining(pass)    // ms until expiry
sdk.isExpiringSoon(pass)   // true if < 1 hour remaining
```

### Wrap any AI tool with policy enforcement

```typescript
const safePurchase = EdgePass.withPolicy(pass, signer, sdk, async (request) => {
  return await processPayment(request);
});
// blocked/escalated never reach your tool logic
const { outcome, result } = await safePurchase({ merchant, amount });
```

### React hook

```typescript
import { useEdgePass } from '@edge-protocol/sdk/react';

const { pass, execute, simulate, budgetStatus, loading } = useEdgePass({
  passId, network: 'mainnet', enokiApiKey: KEY, signer,
  autoRefresh: true, // re-fetch after every approved execute
});
```

### Preview without executing

```typescript
const preview = sdk.validate(pass, { merchant, amount });
// { allowed: boolean, requiresEscalation: boolean, reason: string }
```

---

## 📋 Templates

| Template | Budget | Escalate ≥ | Max/tx | Expiry |
|----------|--------|------------|--------|--------|
| `festival` | 300 SUI | 50 SUI | 200 SUI | 48h |
| `gaming` | 50 SUI | 2 SUI | 10 SUI | 4h |
| `subscription` | 200 SUI | 20 SUI | 50 SUI | 30d |
| `defi` | 10,000 SUI | 500 SUI | 2,000 SUI | 7d |
| `enterprise` | 50,000 SUI | 1,000 SUI | 10,000 SUI | 30d |

---

## ⚙️ How It Works

```
User creates EdgePass (once)
         │
         ▼
Agent calls sdk.execute() — many times, autonomously
         │
         ├─▶ 🔍 Layer 1 — TypeScript PolicyEngine
         │         Pure TypeScript · no network · <1ms
         │         ├─ active? expired? merchant in allowlist?
         │         ├─ amount within budget? below maxPerTx? within velocity cap?
         │         ├─ amount > escalateAbove? → ⚠️  escalate (agent pauses)
         │         └─ amount ≤ escalateAbove? → ✅ auto-approve
         │         blocked/escalated NEVER touch the chain
         │
         ├─▶ ⚡ Layer 2 — Sui Move Contract (PTB, atomic)
         │         validate → execute → update spent → emit event
         │         if any assertion fails → everything reverts · no partial state
         │         cannot be bypassed · the chain is the source of truth
         │
         └─▶ 🗂 Walrus — immutable audit receipt
                   cryptographically committed · decentralized · permanent
```

### The Two-Layer Security Model

This is Edge's most important architectural decision:

```
Layer 1 — TypeScript PolicyEngine    <1ms · zero network · developer convenience
Layer 2 — Sui Move Contract          atomic · tamper-proof · cannot be bypassed

Blocked/Escalated → Layer 1 catches them · never submitted to chain · no gas wasted
Approved          → Layer 1 + Layer 2 · both must pass · atomic execution
```

**Layer 1 can be bypassed** by a compromised agent runtime. Treat it as a UX convenience and gas optimization — not a security boundary.

**Layer 2 cannot be bypassed.** The Move contract validates the same five rules independently. A compromised SDK, a compromised agent, a compromised developer machine — none of these can circumvent the contract. The chain enforces the policy.

---

## ⚠️ zkLogin Salt Derivation Fix

Most zkLogin implementations call `jwtToAddress(jwt, BigInt(0))` — hardcoding the salt as zero. This silently derives the wrong wallet address. Users can log in but their transactions fail or go to the wrong address.

The correct pattern: fetch the unique salt from Enoki before deriving the address.

Edge fixes this. Your users will have the correct wallet address derived from their Google identity.

---

## 🔷 Why This Is Only Possible on Sui

**🔐 zkLogin** — Invisible wallet from Google login. No seed phrase, no MetaMask. On Ethereum: weeks of account abstraction. On Sui: one API call.

**⛽ Sponsored Transactions** — Users never pay gas. Protocol-level primitive. On Ethereum: deploy and maintain a Paymaster contract. On Sui: one API key.

**🧱 Programmable Transaction Blocks** — Policy check + execution + state update — one atomic block. If any step fails, everything reverts. No partial state. No race conditions. Native to Sui.

**📦 Object Model** — EdgePass is a first-class owned object in the user's wallet. An agent executes against it without ever taking ownership. On Ethereum: a contract mapping the developer can modify. On Sui: an object only the owner can touch.

**🗂 Walrus** — Decentralized audit storage built by the same team as Sui. Byzantine fault-tolerant. Erasure-coded. Not IPFS. Not S3. Native.

> You could build a worse version of Edge on Ethereum in months. On Sui it took 10 days — because every primitive was already there.

---

## 🔒 Security Model

```
sdk.validate()  →  TypeScript (instant preview, saves gas on rejections)
sdk.execute()   →  TypeScript + Move contract (atomic, tamper-proof, final)
```

The Move contract runs six assertions, in order, in the Sui VM before recording any spend:

```move
assert!(pass.active, EPassInactive);
assert!(now <= pass.expires_at_ms, EPassExpired);
assert!(ctx.sender() == pass.agent, ENotAgent);
assert!(pass.approved_merchants.contains(&merchant), EMerchantNotApproved);
assert!(amount <= pass.max_per_transaction, EExceedsMaxPerTransaction);
assert!(pass.velocity_used + 1 <= pass.velocity_cap, EVelocityExceeded);  // skipped when velocity_cap == 0
assert!(pass.spent + amount <= pass.budget, EBudgetExceeded);
```

Notice `escalateAbove` isn't in that list — escalation is an off-chain routing decision the SDK's `PolicyEngine` makes, not a refusal the contract can enforce. The chain only knows hard yes/no answers: active, in-scope, under the per-transaction ceiling, under the velocity cap, under budget. If any assertion fails, the entire transaction reverts. A compromised agent cannot bypass the contract. **The chain is the trust boundary.**

---

## Competitive Positioning

Edge is the **policy layer** for the agentic economy. It is not a payment rail.

| Solution | Layer | Open Source | Sui Native | simulate() | 3-line SDK |
|----------|-------|-------------|------------|------------|------------|
| **Edge Protocol** | Policy enforcement | ✅ | ✅ | ✅ | ✅ |
| x402 (Coinbase) | Payment rail | ✅ | ❌ | ❌ | ❌ |
| ERC-4337 | Account abstraction | ✅ | ❌ EVM only | ❌ | ❌ |
| Trust Wallet Agent Kit | Wallet interactions | ✅ | Partial | ❌ | ❌ |
| Cobo Agentic Wallet | Custody | ❌ Enterprise | ❌ | ❌ | ❌ |
| Skyfire | Identity + settlement | ❌ | ❌ | ❌ | ❌ |

**Edge complements x402, it does not compete with it.**

x402 answers: *how does money move from agent to merchant?*
Edge answers: *should this agent be allowed to spend this money at all?*

```
Edge (policy layer)  →  x402 (payment rail)  →  Settlement
"is this allowed?"       "move the money"
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
📋 PolicyEngine.validate()          11 tests ✓
📋 PolicyEngine helpers              7 tests ✓
📋 EdgePass.fromTemplate()           7 tests ✓
📋 EdgePass.create() validation      2 tests ✓
📋 Constants                         5 tests ✓
📋 Events system                     7 tests ✓

39 passed · 0 failed ✅
```

---

## 🚀 Local Development

```bash
git clone https://github.com/fluturecode/edge.git
cd edge && pnpm install

cp apps/web/.env.example apps/web/.env.local
# Add: NEXT_PUBLIC_ENOKI_API_KEY, NEXT_PUBLIC_GOOGLE_CLIENT_ID, ANTHROPIC_API_KEY, GOOGLE_API_KEY

cd apps/web && pnpm dev       # → http://localhost:3000
cd packages/sdk && pnpm test  # → 39 passing
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
│   │   └── dashboard/agent/         🤖 AI agent demo — Claude + Gemini
│   ├── lib/
│   │   ├── signer.ts                zkLogin signer, gas coin resolution
│   │   ├── zklogin.ts               ZK proof generation via Enoki
│   │   ├── walrus.ts                Walrus HTTP API (write/read blobs)
│   │   └── seal.ts                  Seal policy serialization — not yet encrypted, see Roadmap
│   └── app/api/
│       ├── sign/route.ts            Transaction signing + Sui execution
│       ├── zkp/route.ts             ZK proof generation via Enoki
│       └── agent/route.ts           Claude/Gemini API for autonomous decisions
│
├── 📦 packages/sdk/                 @edge-protocol/sdk v2.0.0
│   └── src/
│       ├── core/
│       │   ├── EdgePass.ts             Main API + events + simulate() + withPolicy()
│       │   ├── PolicyEngine.ts         Validation + budget/velocity helpers (37 tests)
│       │   ├── ExecutionEngine.ts      PTB builder + chain execution + fetch (v1 + v2)
│       │   ├── IdempotencyRegistry.ts  Two-phase commit for createWithFireblocks()
│       │   └── withFireblocks.ts       Hardened Fireblocks settlement HOF
│       ├── compliance/
│       │   ├── ComplianceEngine.ts         AML / sanctions / risk screening (6th dimension)
│       │   └── DynamicIdentityBinding.ts   Binds passes to Dynamic enterprise identities
│       ├── audit/
│       │   └── WalrusAudit.ts           Real Walrus mainnet audit log storage
│       ├── react/
│       │   └── index.ts             useEdgePass, useBudgetStatus, useSimulate
│       └── utils/
│           ├── types.ts             All TypeScript types (v1 read-only + v2 create/spend)
│           └── constants.ts         Templates + Package IDs + MIST_PER_SUI
│
└── 📜 contracts/navis/
    └── sources/
        ├── edge_pass.move           v1 — deployed, read-only going forward
        └── edge_pass_v2.move        ✅ current — issuer/agent split, velocity limits
```

---

## 🗺 Roadmap

### Phase 1 — Foundation ✅ shipped

- ✅ zkLogin onboarding — invisible wallet from Google (salt derivation fixed)
- ✅ EdgePass creation — real Move object on Sui mainnet
- ✅ PolicyEngine — pure TypeScript, zero network
- ✅ Two-layer enforcement — TypeScript preview + Move contract source of truth
- ✅ Human-in-the-loop escalation — agent pauses, awaits human approval via modal
- ✅ Events system — `on('approved')`, `on('escalated')`, `on('blocked')`
- ✅ simulate() — predict full session outcomes before touching the chain
- ✅ Budget helpers — `budgetStatus()`, `isNearLimit()`, `timeRemaining()`
- ✅ withPolicy() — wrap any AI tool with on-chain enforcement in one line
- ✅ React hooks — `useEdgePass`, `useBudgetStatus`, `useSimulate`
- ✅ 🤖 Live AI agent demo — Claude + Gemini, real autonomous decisions
- ✅ Seal policy serialization — `lib/seal.ts` turns the policy into a JSON string today; it is **plaintext, not encrypted**. Real Seal encryption and network storage are both still pending key server deployment
- ✅ Move contract — deployed to Sui mainnet
- ✅ SDK on npm — @edge-protocol/sdk

### Phase 2 — Trust Layer ✅ shipped

- ✅ **EdgePassV2** — issuer/agent separation: a human grants and revokes, an agent spends, neither can do the other's job
- ✅ Merchant scope can only narrow, never widen, after minting — not even the issuer can add merchants back
- ✅ Rolling velocity windows — `velocityCap` / `velocityWindowMs`, replaces the old `maxTransactionsPerHour` idea with an on-chain-enforced rate limit
- ✅ Hard per-transaction ceiling (`maxPerTransaction`) — required and enforced on chain, not just advisory
- ✅ On-chain denials — a `blocked` outcome can be recorded as an aborted transaction, so the refusal itself is independently verifiable on Suiscan
- ✅ Approved merchants moved from display names to addresses — enforceable, not just cosmetic
- ✅ Upgraded to `@mysten/sui` v2 + `@mysten/walrus` v1 — unblocked real Walrus storage
- ✅ Real Walrus blob storage — the demo app writes to public mainnet publishers with a local mock fallback only if every publisher is unreachable
- ✅ Two-Phase Commit / Idempotency — `createWithFireblocks()` with retry-safe `idempotencyKey`
- ✅ Compliance Engine (6th dimension) — AML / sanctions / risk screening, pluggable providers
- ✅ Dynamic Identity Binding — bind a pass to a Dynamic enterprise session via JWT

### Phase 3 — Protocol & Business 📋 coming

- ⬜ Managed escalation dashboard — proprietary SaaS approval UI
- ⬜ On-chain policy signatures — tamper-proof policy commitment
- ⬜ Multi-token support — USDC, USDT, any Sui coin
- ⬜ Tool-use architecture — agent decides one transaction at a time, sees results
- ⬜ Enterprise guardrails — SOC2, SIEM
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
