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

**Edge is Sui-native by design.** The policy enforcement lives on Sui mainnet where it cannot be tampered with. Your assets stay exactly where they are — on whatever chains your custody provider already manages. Sui is the notary. Your custody layer is the bank.

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
EdgePass.fromTemplate('x402',         { owner })  // $1k   · auto <$10  · escalate >$100 · 24h
```

Example — enterprise treasury agent:

```typescript
EdgePass.fromTemplate('enterprise', {
  approvedMerchants: ['aws-billing.vendor', 'stripe-fees.vendor', 'github-enterprise.vendor'],
  escalateThreshold: BigInt(5_000) * MIST_PER_SUI,
  owner: treasuryAddress,
})
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

for (const decision of plan.approved) {
  await sdk.execute(pass, decision.request, signer);
}
```

---

## 💰 Budget Intelligence

```typescript
const status = sdk.budgetStatus(pass);
// { budget, spent, remaining, utilizationPct, isNearLimit, isExhausted }

sdk.utilizationPct(pass)         // 43.6
sdk.isNearLimit(pass)            // false (default threshold: 80%)
sdk.isNearLimit(pass, 0.5)       // true if > 50% spent
sdk.remainingBudget(pass)        // remaining in MIST
sdk.timeRemaining(pass)          // ms until expiry
sdk.isExpiringSoon(pass)         // true if expires within 1 hour
```

---

## 🤖 Agent Framework Integration

### `withPolicy` — Wrap Any Tool

```typescript
const safePurchase = EdgePass.withPolicy(pass, signer, sdk, async (request) => {
  return await purchaseItem(request.merchant, request.amount);
});

// blocked/escalated never reach your tool logic
const { outcome, result } = await safePurchase({
  merchant: 'Hydra Bar',
  amount: BigInt(32) * MIST_PER_SUI,
});
```

### `withFireblocks` — Edge Policy + Fireblocks Settlement

For teams using Fireblocks as their custody layer. Edge validates policy on Sui mainnet. If approved, your `settle` function executes the Fireblocks transaction. The Edge digest is recorded in the Fireblocks transaction note — full audit trail linking every Fireblocks settlement back to an immutable on-chain Edge approval.

Blocked and escalated decisions never reach Fireblocks.

```typescript
const safeTx = EdgePass.withFireblocks(pass, signer, sdk, {
  settle: async ({ edgeDigest, amountUSD, destinationAddress }) => {
    return await fireblocks.createTransaction({
      assetId: 'USDC_BASE',
      amount: amountUSD,
      source: { type: 'VAULT_ACCOUNT', id: '0' },
      destination: { type: 'ONE_TIME_ADDRESS', oneTimeAddress: { address: destinationAddress } },
      note: `Edge approved: ${edgeDigest}`,
    });
  },
  onEscalated: async ({ request, reason }) => {
    await notifySlack(`Approval required: ${reason}`);
  },
  onBlocked: async ({ request, reason }) => {
    console.log('Blocked by policy:', reason);
  },
});

const result = await safeTx({
  merchant: 'aws-billing.vendor',
  amount: BigInt(450) * MIST_PER_SUI,
  amountUSD: '450.00',
  destinationAddress: '0x...',
});
// approved  → Fireblocks settled, edgeDigest in transaction note
// escalated → onEscalated fired, Fireblocks never called
// blocked   → onBlocked fired, Fireblocks never called
```

The architecture:

```
Agent proposes transaction
         ↓
Edge validates policy (Sui mainnet)     ← approved + digest
         ↓
Fireblocks executes settlement          ← note: "Edge approved: {digest}"
         ↓
Settlement on Base / Solana / Ethereum
```

See [edge-fireblocks](https://github.com/fluturecode/edge-fireblocks) for a full reference implementation with treasury, trading, and enterprise payment scenarios.

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
    autoRefresh: true,
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

Every `sdk.execute()` returns a structured outcome:

```typescript
type TransactionOutcome =
  | { status: 'approved';  digest: string; auto: true;  }
  | { status: 'escalated'; reason: string; auto: false; }
  | { status: 'blocked';   reason: string; auto: false; }
  | { status: 'error';     reason: string; code?: string; auto: false; }
```

---

## 🔔 Events System

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
Edge (policy layer, Sui)  →  x402 (payment rail)  →  Settlement
"is this allowed?"             "move the money"
```

> **Note:** Edge is Sui-native. Your assets don't move to Sui — Edge validates policy there and returns an approval. x402 then handles the payment on whatever chain the merchant accepts.

```typescript
const pass = await sdk.create(
  EdgePass.fromTemplate('x402', {
    approvedMerchants: ['api.example.com', 'data.provider.com'],
    owner: agentAddress,
  }),
  signer
);

const outcome = await sdk.execute(pass, { merchant: endpoint, amount }, signer);

if (outcome.status === 'approved') {
  await fetch(endpoint, {
    headers: { 'X-Payment': await createX402Payment(amount) }
  });
}

if (outcome.status === 'escalated') {
  await notifyUser('Payment requires your approval');
}
// blocked → never reaches x402
```

---

## 🔒 Security Model

Edge has two enforcement layers:

**Layer 1 — TypeScript PolicyEngine** — pre-flight, zero network calls, under 1ms. Blocked and escalated decisions never touch the chain — no gas wasted. Can be bypassed by a compromised agent runtime. Treat as a convenience layer.

**Layer 2 — Sui Move Contract** — on-chain enforcement by the Sui VM. Cannot be bypassed. This is the source of truth.

```
sdk.validate()  →  TypeScript (instant preview, saves gas on rejections)
sdk.execute()   →  TypeScript + Move contract (atomic, tamper-proof, final)
```

The Move contract runs five assertions before recording any spend:

```move
assert!(pass.active, EPassInactive);
assert!(now <= pass.expires_at, EPassExpired);
assert!(is_merchant_approved(pass, &merchant), EMerchantNotApproved);
assert!(pass.spent + amount <= pass.budget, EBudgetExceeded);
assert!(amount <= pass.escalate_threshold, EAmountExceedsEscalationThreshold);
```

If any assertion fails, the entire transaction reverts. **The chain is the trust boundary.**

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
pnpm add @edge-protocol/sdk
yarn add @edge-protocol/sdk
```

React hook (requires React 18+):
```typescript
import { useEdgePass } from '@edge-protocol/sdk/react';
```

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

## Competitive Positioning

Edge is the **policy layer** for the agentic economy. It is not a payment rail or a custody solution.

| Solution | Layer | Open Source | Sui Native | simulate() | withFireblocks() |
|----------|-------|-------------|------------|------------|-----------------|
| **Edge Protocol** | Policy enforcement | ✅ | ✅ | ✅ | ✅ |
| x402 (Coinbase) | Payment rail | ✅ | ❌ | ❌ | ❌ |
| ERC-4337 | Account abstraction | ✅ | ❌ EVM only | ❌ | ❌ |
| Trust Wallet Agent Kit | Wallet interactions | ✅ | Partial | ❌ | ❌ |
| Cobo Agentic Wallet | Custody | ❌ Enterprise | ❌ | ❌ | ❌ |
| Skyfire | Identity + settlement | ❌ | ❌ | ❌ | ❌ |
| Fireblocks | Custody + execution | ❌ Enterprise | ❌ | ❌ | N/A — integrates |

**Edge complements x402 and Fireblocks. It does not compete with them.**

---

*The best infrastructure is invisible.*

MIT License · [GitHub](https://github.com/fluturecode/edge) · [npm](https://npmjs.com/package/@edge-protocol/sdk)
