# @edge-protocol/sdk

[![npm version](https://img.shields.io/npm/v/@edge-protocol/sdk)](https://npmjs.com/package/@edge-protocol/sdk)
[![npm downloads](https://img.shields.io/npm/dw/@edge-protocol/sdk)](https://npmjs.com/package/@edge-protocol/sdk)
[![Tests](https://img.shields.io/badge/tests-34%20passing-brightgreen)](https://github.com/fluturecode/edge)
[![Built on Sui](https://img.shields.io/badge/built%20on-Sui-blue)](https://sui.io)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Give agents your rules, not your keys.

[Live Demo](https://edge-web-cyan.vercel.app) · [Full Docs](DOCS.md) · [GitHub](https://github.com/fluturecode/edge)

---

As autonomous agents begin managing real assets onchain, they need a trust layer that governs how they interact with them. Raw private keys are a security nightmare. Requiring human approval for every transaction defeats the purpose of automation.

EdgePass is the policy layer — scoped, programmatic spend authority issued directly to agent runtimes, with cryptographic guardrails enforced by the Sui VM. Not a payment rail. Not a wallet. The boundary between what an agent can do and what it cannot.

---

## ⚡ Quickstart — 3 Lines of Code

```typescript
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: 'YOUR_KEY' });
const pass = await sdk.create(EdgePass.fromTemplate('festival', { owner: userAddress }), signer);
const outcome = await sdk.execute(pass, { merchant: 'Hydra Bar', amount: BigInt(32) * MIST_PER_SUI }, signer);

console.log(outcome.status); // 'approved' | 'escalated' | 'blocked'
```

> **Note:** BigInt literal syntax (`32n`) requires TypeScript targeting ES2020+. For ES2019 apps use `BigInt(32) * MIST_PER_SUI` instead.

---

## 🛠 The 5-Dimensional Trust Primitive

Every EdgePass is a native Sui Move object encoding five distinct governance dimensions:

| Dimension | What it controls |
|-----------|-----------------|
| BUDGET | Maximum global spending ceiling |
| VELOCITY | Auto-approve threshold before escalation fires |
| SCOPE | Explicit allowlist of approved merchants / contracts |
| TIME | Hard cryptographic expiration date |
| ESCALATION | Programmatic fallback when a limit is exceeded |

---

## 📋 Templates

Pre-configured for common use cases — override any field:

```typescript
EdgePass.fromTemplate('festival',     { owner })  // $300  · auto <$50  · escalate >$100 · 48h
EdgePass.fromTemplate('gaming',       { owner })  // $50   · auto <$2   · escalate >$10  · 4h
EdgePass.fromTemplate('subscription', { owner })  // $200  · auto <$20  · escalate >$50  · 30d
EdgePass.fromTemplate('defi',         { owner })  // $10k  · auto <$500 · escalate >$1k  · 7d
EdgePass.fromTemplate('enterprise',   { owner })  // $50k  · auto <$1k  · escalate >$5k  · 30d
EdgePass.fromTemplate('x402',         { owner })  // $1k   · auto <$10  · escalate >$100 · 24h · x402 payments
```

Example — brand licensing agent:

```typescript
EdgePass.fromTemplate('enterprise', {
  approvedMerchants: ['nike-licensing.sui', 'brand-registry.sui'],
  escalateThreshold: BigInt(10_000) * MIST_PER_SUI,
  owner: cfoAddress,
})
// Enforce IP usage terms autonomously — no lawyers, no monitoring, no surprises
```

---

## 🔮 Simulate Before You Execute

Plan an agent's session without touching the chain. Zero network calls.

```typescript
const plan = sdk.simulate(pass, [
  { merchant: 'Shuttle Express',  amount: BigInt(45) * MIST_PER_SUI },
  { merchant: 'ShadyTokens.xyz',  amount: BigInt(1) },
  { merchant: 'Stage Access VIP', amount: BigInt(220) * MIST_PER_SUI },
]);

console.log(plan.summary);
// { approvedCount: 1, blockedCount: 1, escalatedCount: 1, totalDecisions: 3 }

console.log(plan.utilizationPct); // projected budget usage after approved decisions
console.log(plan.remainingBudget); // projected remaining in MIST

// Show plan to user, then execute approved decisions
for (const decision of plan.approved) {
  await sdk.execute(pass, decision.request, signer);
}
```

---

## 💰 Budget Intelligence

```typescript
const status = sdk.budgetStatus(pass);
// {
//   budget: 500000000000n,
//   spent: 218000000000n,
//   remaining: 282000000000n,
//   utilizationPct: 43.6,
//   isNearLimit: false,   // true when > 80%
//   isExhausted: false,
// }

sdk.utilizationPct(pass)         // 43.6
sdk.isNearLimit(pass)            // false (default threshold: 80%)
sdk.isNearLimit(pass, 0.5)       // true if > 50% spent
sdk.remainingBudget(pass)        // 282000000000n MIST
sdk.timeRemaining(pass)          // ms until expiry
sdk.isExpiringSoon(pass)         // true if expires within 1 hour
```

---

## 🤖 Agent Framework Integration

### Vercel AI SDK / Mastra

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

export const autonomousPurchaseTool = tool({
  description: 'Purchase assets or services autonomously within policy boundaries.',
  parameters: z.object({
    merchant:  z.string(),
    amountSUI: z.number(),
  }),
  execute: async ({ merchant, amountSUI }) => {
    const outcome = await sdk.execute(currentPass, {
      merchant,
      amount: BigInt(Math.floor(amountSUI * 1e9)),
    }, agentSigner);

    if (outcome.status === 'blocked')   return { success: false, error: `Blocked: ${outcome.reason}` };
    if (outcome.status === 'escalated') return { success: false, error: `Escalated: ${outcome.reason}` };

    return { success: true, digest: outcome.digest };
  }
});
```

### `withPolicy` — Wrap Any Tool

```typescript
const safePurchase = EdgePass.withPolicy(pass, signer, sdk, async (request) => {
  return await purchaseItem(request.merchant, request.amount);
});

// safePurchase enforces EdgePass policy automatically
// blocked/escalated never reach your tool logic
const { outcome, result } = await safePurchase({
  merchant: 'Hydra Bar',
  amount: BigInt(32) * MIST_PER_SUI,
});
```

### Native Agent System Prompt

```typescript
const systemPrompt = `
You are an autonomous agent operating with bounded financial authority via Edge Protocol.

When a financial tool returns 'escalated': do NOT retry the operation.
Inform the user that manual approval is required and await confirmation.

When a tool returns 'blocked': the transaction violates policy.
Explain the constraint to the user and suggest an alternative within limits.

When a tool returns 'approved': proceed normally.
The transaction was executed on-chain and logged to Walrus.
`;
```

---

## ⚛️ React Hook

```typescript
import { useEdgePass } from '@edge-protocol/sdk/react';

function AgentDashboard({ passId, signer }) {
  const { pass, execute, simulate, budgetStatus, loading } = useEdgePass({
    passId,
    network: 'mainnet',
    enokiApiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY!,
    signer,
    autoRefresh: true, // re-fetch after every approved execute
  });

  if (loading) return <Spinner />;
  if (!pass)   return <div>Pass not found</div>;

  return (
    <div>
      <progress value={budgetStatus?.utilizationPct} max={100} />
      <button onClick={() => execute({ merchant: 'Hydra Bar', amount: BigInt(32) * MIST_PER_SUI })}>
        Purchase
      </button>
    </div>
  );
}
```

Three hooks available:
- `useEdgePass` — full featured: fetch, execute, simulate, budgetStatus, refresh
- `useBudgetStatus` — lightweight budget display
- `useSimulate` — reactive simulation when requests change

---

## 📊 Execution Results

Every `sdk.execute()` returns a structured outcome — not a flat string:

```typescript
type TransactionOutcome =
  | { status: 'approved';  digest: string; auto: true;  }
  | { status: 'escalated'; reason: string; auto: false; }
  | { status: 'blocked';   reason: string; auto: false; }
  | { status: 'error';     reason: string; code?: string; auto: false; }

// Approved
{ status: 'approved', digest: '4REcPLezK8gF...', auto: true }

// Blocked
{ status: 'blocked', reason: 'Merchant "ShadyTokens.xyz" is not approved', auto: false }

// Escalated
{ status: 'escalated', reason: 'Amount exceeds $100 escalation threshold', auto: false }
```

---

## 🔔 Events System

React to decisions without polling:

```typescript
sdk
  .on('approved', ({ outcome, pass, request }) => {
    updateBudgetUI(pass);
    console.log('executed:', outcome.digest);
  })
  .on('escalated', ({ outcome, request }) => {
    sendPushNotification(`Approve $${request.amount} at ${request.merchant}?`);
  })
  .on('blocked', ({ outcome }) => {
    logger.warn('blocked:', outcome.reason);
  });

await sdk.execute(pass, request, signer);
```

---

## 🔌 Pluggable Escalation Handlers

Route escalation alerts to Slack, Telegram, or your dashboard:

```typescript
sdk.on('escalated', async ({ outcome, request }) => {
  await fetch('https://hooks.slack.com/your-webhook', {
    method: 'POST',
    body: JSON.stringify({
      text: `⚠️ Agent escalation: $${request.amount} at ${request.merchant}\n${outcome.reason}`,
    }),
  });
});
```

---

## 🔍 Preview Without Executing

```typescript
const preview = sdk.validate(pass, { merchant, amount });
// { allowed: boolean, requiresEscalation: boolean, reason: string }

if (!preview.allowed)           showBlockedUI(preview.reason);
if (preview.requiresEscalation) showEscalationModal(preview.reason);
```

---

## 🔗 x402 Integration

Edge and x402 are complementary layers in the autonomous payment stack.

x402 answers: *how does money move from agent to merchant?*
Edge answers: *should this agent be allowed to spend this money at all?*

```
Edge (policy layer)  →  x402 (payment rail)  →  Settlement
"is this allowed?"       "move the money"
```

```typescript
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

// 1. Create a trust boundary scoped for x402 payments
const pass = await sdk.create(
  EdgePass.fromTemplate('x402', {
    approvedMerchants: ['api.example.com', 'data.provider.com'],
    owner: agentAddress,
  }),
  signer
);

// 2. Edge validates policy before x402 moves money
const outcome = await sdk.execute(pass, {
  merchant: endpoint,
  amount: BigInt(Math.floor(amountUSD * 1e9)),
}, signer);

if (outcome.status === 'approved') {
  // 3. x402 handles the actual payment
  await fetch(endpoint, {
    headers: { 'X-Payment': await createX402Payment(amount) }
  });
}

if (outcome.status === 'escalated') {
  await notifyUser('Payment requires your approval');
}

// blocked → never reaches x402, policy rejected it
```

---

## 🔒 Security Model

Edge has two enforcement layers:

**Layer 1 — TypeScript PolicyEngine** — pre-flight, zero network calls, under 1ms. Can be bypassed by a compromised agent runtime. Treat as a UX convenience and performance optimization — not a security boundary.

**Layer 2 — Sui Move Contract** — on-chain enforcement by the Sui VM. Cannot be bypassed. The EdgePass object validates all policy dimensions independently at the protocol level. This is the source of truth.

```
sdk.validate()  →  TypeScript (instant preview, saves gas on rejections)
sdk.execute()   →  TypeScript + Move contract (atomic, tamper-proof, final)
```

The Move contract runs five assertions inside the Sui VM before recording any spend:

```move
assert!(pass.active, EPassInactive);
assert!(now <= pass.expires_at, EPassExpired);
assert!(is_merchant_approved(pass, &merchant), EMerchantNotApproved);
assert!(pass.spent + amount <= pass.budget, EBudgetExceeded);
assert!(amount <= pass.escalate_threshold, EAmountExceedsEscalationThreshold);
```

If any assertion fails, the entire transaction reverts. A compromised agent cannot bypass the contract. **The chain is the trust boundary.**

---

## 🧪 Testing

```bash
pnpm test
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

## ⛓ Move Contract

```
Package:  0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde
Network:  Sui Mainnet ✅
```

[View on Suiscan →](https://suiscan.xyz/mainnet/object/0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde)

---

## 📦 Install

```bash
npm install @edge-protocol/sdk
# or
pnpm add @edge-protocol/sdk
# or
yarn add @edge-protocol/sdk
```

React hook (requires React 18+):
```typescript
import { useEdgePass } from '@edge-protocol/sdk/react';
```

See [CHANGELOG.md](CHANGELOG.md) for version history.

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

---

*The best infrastructure is invisible.*

Built for Sui Overflow 2026 · MIT License

[GitHub](https://github.com/fluturecode/edge) · [npm](https://npmjs.com/package/@edge-protocol/sdk)
