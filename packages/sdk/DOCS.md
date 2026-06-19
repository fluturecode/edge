# @edge-protocol/sdk — Full Developer Reference

> Programmable trust infrastructure for autonomous AI agents on Sui.
> Give agents your rules, not your keys.

```bash
pnpm add @edge-protocol/sdk
```

---

## Table of Contents

- [Core Concepts](#core-concepts)
- [Installation](#installation)
- [EdgePass API](#edgepass-api)
- [Simulation](#simulation)
- [Budget Intelligence](#budget-intelligence)
- [withPolicy](#withpolicy)
- [React Hooks](#react-hooks)
- [Templates](#templates)
- [Events System](#events-system)
- [PolicyEngine](#policyengine)
- [Types](#types)
- [Constants](#constants)
- [Integration Examples](#integration-examples)
- [Error Handling](#error-handling)
- [Architecture](#architecture)
- [Move Contract](#move-contract)
- [Security Model](#security-model)
- [Testing](#testing)

---

## Core Concepts

### The Problem

```
Option A: Give the agent full wallet access  →  catastrophic risk
Option B: Human approves every transaction  →  defeats the purpose
Option C: Build custom policy logic         →  6-8 weeks of work
```

**EdgePass is Option D** — a programmable trust boundary enforced on-chain.

### EdgePass

An EdgePass is a Sui Move object that encodes a complete trust policy. It lives in the user's wallet — not in a contract. An agent executes against it without ever taking ownership.

```
budget: $500  ·  auto-approve: <$75  ·  escalate: >$150  ·  merchants: [...]  ·  expiry: 48h
```

### Transaction Outcomes

Every `sdk.execute()` returns one of four outcomes:

```
✅ approved   — executed on-chain, digest available
⚠️  escalated  — exceeds threshold, needs user approval
🚫 blocked    — policy rejected, reason provided
❌ error      — infrastructure failure, tx NOT submitted
```

### MIST

All amounts are in MIST — Sui's base unit.

```typescript
1 SUI = 1_000_000_000 MIST
import { MIST_PER_SUI } from '@edge-protocol/sdk';
const budget = 500n * MIST_PER_SUI; // 500 SUI
```

---

## Installation

```bash
npm install @edge-protocol/sdk
pnpm add @edge-protocol/sdk
yarn add @edge-protocol/sdk
```

React hook requires React 18+:
```typescript
import { useEdgePass } from '@edge-protocol/sdk/react';
```

---

## EdgePass API

### `new EdgePass(config)`

```typescript
import { EdgePass } from '@edge-protocol/sdk';

const sdk = new EdgePass({
  network:     'mainnet',   // 'mainnet' | 'testnet' | 'devnet'
  enokiApiKey: 'YOUR_KEY',
});
```

---

### `sdk.create(config, signer)` → `Promise<EdgePassObject>`

Mint a new EdgePass as a Move object on Sui.

```typescript
const pass = await sdk.create({
  budget:            500n * MIST_PER_SUI,
  autoThreshold:      75n * MIST_PER_SUI,
  escalateThreshold: 150n * MIST_PER_SUI,
  maxPerTransaction: 300n * MIST_PER_SUI,  // optional
  approvedMerchants: ['Shuttle Express', 'Hydra Bar', 'Festival Kitchen'],
  expiryMs:          48 * 60 * 60 * 1000,
  owner:             userAddress,
}, signer);

console.log(pass.id);        // Sui object ID
console.log(pass.expiresAt); // Unix timestamp
```

**Constraints:** `autoThreshold < escalateThreshold ≤ budget`

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `budget` | `bigint` | ✅ | Total spend limit in MIST |
| `autoThreshold` | `bigint` | ✅ | Auto-approve below this amount |
| `escalateThreshold` | `bigint` | ✅ | Escalate above this amount |
| `maxPerTransaction` | `bigint` | ❌ | Hard cap per single transaction |
| `approvedMerchants` | `string[]` | ✅ | Allowlist of merchant identifiers |
| `expiryMs` | `number` | ✅ | Duration until expiry in ms |
| `owner` | `string` | ✅ | Sui address of the pass owner |

---

### `EdgePass.fromTemplate(template, overrides)` → `EdgePassConfig`

```typescript
const config = EdgePass.fromTemplate('festival', {
  approvedMerchants: ['Shuttle Express', 'Hydra Bar'],
  owner: userAddress,
});
const pass = await sdk.create(config, signer);
```

---

### `sdk.execute(pass, request, signer)` → `Promise<TransactionOutcome>`

Execute a transaction against an EdgePass. Blocked and escalated decisions are validated locally — they never touch the chain.

```typescript
const outcome = await sdk.execute(pass, {
  merchant: 'Shuttle Express',
  amount:   45n * MIST_PER_SUI,
}, signer);

switch (outcome.status) {
  case 'approved':
    console.log('tx digest:', outcome.digest);
    break;
  case 'escalated':
    await sendPushNotification(outcome.reason);
    break;
  case 'blocked':
    console.log('blocked:', outcome.reason);
    break;
  case 'error':
    console.error('infrastructure failure:', outcome.reason);
    break;
}
```

---

### `sdk.validate(pass, request)` → `PolicyValidation`

Preview a single transaction outcome. Zero network calls. Sub-millisecond.

```typescript
const preview = sdk.validate(pass, { merchant, amount });
if (!preview.allowed)           return showBlockedUI(preview.reason);
if (preview.requiresEscalation) return showEscalationUI(preview.reason);
const outcome = await sdk.execute(pass, request, signer);
```

---

### `sdk.fetch(objectId)` → `Promise<EdgePassObject | null>`

Fetch a live EdgePass from the Sui network.

```typescript
const pass = await sdk.fetch('0x4e2f...8b91');
if (!pass) { console.log('not found'); return; }
```

---

### `sdk.revoke(pass, signer)` → `Promise<{ digest: string }>`

Revoke an EdgePass on-chain.

```typescript
const { digest } = await sdk.revoke(pass, signer);
```

---

### `sdk.isValid(pass)` → `boolean`

Returns `true` if the pass is active and not expired.

---

## Simulation

Plan an agent session without executing. Zero network calls. Sub-millisecond.

### `sdk.simulate(pass, requests[])` → `SimulationResult`

```typescript
const plan = sdk.simulate(pass, [
  { merchant: 'Shuttle Express',  amount: 45n * MIST_PER_SUI },
  { merchant: 'Festival Kitchen', amount: 22n * MIST_PER_SUI },
  { merchant: 'ShadyTokens.xyz',  amount: 1n },
  { merchant: 'Stage Access VIP', amount: 220n * MIST_PER_SUI },
]);

console.log(plan.summary);
// { approvedCount: 2, blockedCount: 1, escalatedCount: 1, totalDecisions: 4 }

console.log(plan.utilizationPct);   // projected budget usage after approved decisions
console.log(plan.totalSpend);       // total MIST of approved decisions only
console.log(plan.remainingBudget);  // projected remaining after all approved

// Inspect individual decisions
plan.approved.forEach(d => {
  console.log(d.request.merchant, d.projectedRemaining);
});

// Show plan, then execute
for (const decision of plan.approved) {
  await sdk.execute(pass, decision.request, signer);
}
```

**`SimulationResult`:**

```typescript
interface SimulationResult {
  decisions:       SimulatedDecision[];  // all decisions in order
  approved:        SimulatedDecision[];  // will execute on-chain
  blocked:         SimulatedDecision[];  // rejected by policy
  escalated:       SimulatedDecision[];  // need human approval
  totalSpend:      bigint;               // sum of approved amounts
  remainingBudget: bigint;               // projected remaining
  utilizationPct:  number;               // 0-100
  summary: {
    approvedCount:  number;
    blockedCount:   number;
    escalatedCount: number;
    totalDecisions: number;
  };
}
```

**`SimulatedDecision`:**

```typescript
interface SimulatedDecision {
  request:            TransactionRequest;
  outcome:            'approved' | 'escalated' | 'blocked';
  reason:             string;
  projectedSpent:     bigint;  // pass.spent after this decision
  projectedRemaining: bigint;  // budget remaining after this decision
}
```

---

## Budget Intelligence

### `sdk.budgetStatus(pass, nearLimitThreshold?)` → `BudgetStatus`

```typescript
const status = sdk.budgetStatus(pass);
// {
//   budget:         500000000000n,
//   spent:          218000000000n,
//   remaining:      282000000000n,
//   utilizationPct: 43.6,
//   isNearLimit:    false,   // true when > 80% (configurable)
//   isExhausted:    false,
// }

if (status.isExhausted) stopAgent();
if (status.isNearLimit) warnUser(`${status.utilizationPct.toFixed(1)}% of budget used`);
```

### `sdk.utilizationPct(pass)` → `number`

Budget utilization as 0-100. Use for progress bars.

### `sdk.isNearLimit(pass, threshold?)` → `boolean`

Returns `true` if utilization exceeds threshold (default 80%).

```typescript
sdk.isNearLimit(pass)       // true if > 80% spent
sdk.isNearLimit(pass, 0.5)  // true if > 50% spent
```

### `sdk.remainingBudget(pass)` → `bigint`

Remaining budget in MIST.

### `sdk.timeRemaining(pass)` → `number`

Milliseconds until expiry. Returns 0 if expired.

### `sdk.isExpiringSoon(pass, withinMs?)` → `boolean`

Returns `true` if pass expires within the given window (default 1 hour).

---

## withPolicy

Wrap any async function with EdgePass policy enforcement. The wrapped function only executes if the transaction is approved.

### `EdgePass.withPolicy(pass, signer, sdk, fn)`

```typescript
const safePurchase = EdgePass.withPolicy(pass, signer, sdk, async (request) => {
  // This only runs if EdgePass approves the transaction
  return await purchaseItem(request.merchant, request.amount);
});

const { outcome, result } = await safePurchase({
  merchant: 'Hydra Bar',
  amount: 32n * MIST_PER_SUI,
});

// outcome.status === 'approved' | 'blocked' | 'escalated' | 'error'
// result is undefined if blocked/escalated/error
```

Perfect for wrapping Vercel AI SDK tools:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export const purchaseTool = tool({
  description: 'Purchase within EdgePass policy boundaries',
  parameters: z.object({ merchant: z.string(), amountSUI: z.number() }),
  execute: async ({ merchant, amountSUI }) => {
    const safePurchase = EdgePass.withPolicy(pass, signer, sdk, async (req) => {
      return await processPayment(req);
    });
    const { outcome } = await safePurchase({ merchant, amount: BigInt(Math.floor(amountSUI * 1e9)) });
    if (outcome.status !== 'approved') return { success: false, reason: outcome.reason };
    return { success: true, digest: outcome.digest };
  }
});
```

---

## React Hooks

```typescript
import { useEdgePass, useBudgetStatus, useSimulate } from '@edge-protocol/sdk/react';
```

### `useEdgePass(config)` → `UseEdgePassResult`

Full-featured hook. Fetches pass on mount, exposes execute/simulate/budgetStatus, refreshes after approved transactions.

```typescript
const {
  pass,         // EdgePassObject | null
  loading,      // boolean
  error,        // Error | null
  execute,      // (request) => Promise<TransactionOutcome>
  simulate,     // (requests[]) => SimulationResult | null
  budgetStatus, // BudgetStatus | null
  refresh,      // () => Promise<void> — manually re-fetch
  sdk,          // EdgePass instance
} = useEdgePass({
  passId:       'YOUR_PASS_ID',
  network:      'mainnet',
  enokiApiKey:  'YOUR_KEY',
  signer,                      // optional — needed for execute()
  autoRefresh:  true,          // re-fetch after approved execute (default: true)
  pollInterval: 30_000,        // poll every 30s (default: 0 = disabled)
});
```

### `useBudgetStatus(config)` → `BudgetStatus | null`

Lightweight hook for budget display components.

```typescript
function BudgetBar({ passId }) {
  const status = useBudgetStatus({ passId, network: 'mainnet', enokiApiKey: KEY });
  return <progress value={status?.utilizationPct ?? 0} max={100} />;
}
```

### `useSimulate(config, requests[])` → `SimulationResult | null`

Reactive simulation hook. Re-runs whenever requests change.

```typescript
function AgentPlanPreview({ passId, decisions }) {
  const plan = useSimulate({ passId, network: 'mainnet', enokiApiKey: KEY }, decisions);
  if (!plan) return null;
  return (
    <div>
      <span>{plan.summary.approvedCount} will execute</span>
      <span>{plan.summary.blockedCount} will be blocked</span>
    </div>
  );
}
```

---

## Templates

| Template | Budget | Auto ≤ | Escalate ≥ | Max/tx | Expiry |
|----------|--------|--------|------------|--------|--------|
| `festival` | 300 SUI | 50 SUI | 100 SUI | 200 SUI | 48h |
| `gaming` | 50 SUI | 2 SUI | 10 SUI | 10 SUI | 4h |
| `subscription` | 200 SUI | 20 SUI | 50 SUI | 50 SUI | 30d |
| `defi` | 10,000 SUI | 500 SUI | 1,000 SUI | 2,000 SUI | 7d |
| `enterprise` | 50,000 SUI | 1,000 SUI | 5,000 SUI | 10,000 SUI | 30d |

---

## Events System

Subscribe to transaction outcomes without polling. Chain-able.

```typescript
sdk
  .on('approved', ({ outcome, pass, request }) => {
    updateBudgetUI(pass);
    auditLog.write(outcome.digest);
  })
  .on('escalated', ({ request }) => {
    slack.notify(`Approve $${request.amount} at ${request.merchant}?`);
  })
  .on('blocked', ({ outcome }) => {
    logger.warn(outcome.reason);
  });

await sdk.execute(pass, request, signer);

// Cleanup
sdk.off('approved', handler);
sdk.removeAllListeners();
```

Events fire for `approved`, `escalated`, `blocked` only. Infrastructure errors (`status: 'error'`) do not fire events — check `outcome.status === 'error'` explicitly.

---

## PolicyEngine

Access the validation engine directly.

```typescript
import { PolicyEngine } from '@edge-protocol/sdk';
```

### `PolicyEngine.validate(pass, request)` → `PolicyValidation`

**Validation rules (in order):**
1. Pass must be active
2. Pass must not be expired
3. Merchant must be in `approvedMerchants`
4. Amount must not exceed remaining budget
5. Amount must not exceed `maxPerTransaction` (if set)
6. If amount > `escalateThreshold` → escalate
7. If amount ≤ `autoThreshold` → auto-approve

### `PolicyEngine.simulate(pass, requests[])` → `SimulationResult`

Static version of `sdk.simulate()`.

### `PolicyEngine.isValid(pass)` → `boolean`
### `PolicyEngine.remainingBudget(pass)` → `bigint`
### `PolicyEngine.utilizationPct(pass)` → `number`
### `PolicyEngine.isNearLimit(pass, threshold?)` → `boolean`
### `PolicyEngine.budgetStatus(pass, threshold?)` → `BudgetStatus`
### `PolicyEngine.timeRemaining(pass)` → `number`
### `PolicyEngine.isExpiringSoon(pass, withinMs?)` → `boolean`

---

## Types

```typescript
import type {
  EdgePassConfig,
  EdgePassObject,
  TransactionRequest,
  TransactionOutcome,
  PolicyValidation,
  SimulatedDecision,
  SimulationResult,
  BudgetStatus,
  Network,
  EdgeSDKConfig,
} from '@edge-protocol/sdk';
```

### `EdgePassConfig`

```typescript
interface EdgePassConfig {
  budget:             bigint;
  autoThreshold:      bigint;
  escalateThreshold:  bigint;
  maxPerTransaction?: bigint;
  approvedMerchants:  string[];
  expiryMs:           number;
  owner:              string;
}
```

### `EdgePassObject`

```typescript
interface EdgePassObject {
  id:        string;
  config:    EdgePassConfig;
  spent:     bigint;
  active:    boolean;
  createdAt: number;
  expiresAt: number;
}
```

### `TransactionRequest`

```typescript
interface TransactionRequest {
  merchant:  string;
  amount:    bigint;
  metadata?: Record<string, string>;
}
```

### `TransactionOutcome`

```typescript
type TransactionOutcome =
  | { status: 'approved';  digest: string; objectId?: string; auto: true  }
  | { status: 'escalated'; reason: string;                    auto: false }
  | { status: 'blocked';   reason: string;                    auto: false }
  | { status: 'error';     reason: string; code?: string;     auto: false };
```

### `SimulationResult`

```typescript
interface SimulationResult {
  decisions:       SimulatedDecision[];
  approved:        SimulatedDecision[];
  blocked:         SimulatedDecision[];
  escalated:       SimulatedDecision[];
  totalSpend:      bigint;
  remainingBudget: bigint;
  utilizationPct:  number;
  summary: {
    approvedCount:  number;
    blockedCount:   number;
    escalatedCount: number;
    totalDecisions: number;
  };
}
```

### `SimulatedDecision`

```typescript
interface SimulatedDecision {
  request:            TransactionRequest;
  outcome:            'approved' | 'escalated' | 'blocked';
  reason:             string;
  projectedSpent:     bigint;
  projectedRemaining: bigint;
}
```

### `BudgetStatus`

```typescript
interface BudgetStatus {
  budget:         bigint;
  spent:          bigint;
  remaining:      bigint;
  utilizationPct: number;
  isNearLimit:    boolean;
  isExhausted:    boolean;
}
```

### `PolicyValidation`

```typescript
interface PolicyValidation {
  allowed:            boolean;
  requiresEscalation: boolean;
  reason:             string;
}
```

---

## Constants

```typescript
import {
  MIST_PER_SUI,      // 1_000_000_000n
  NETWORK_URLS,      // { mainnet, testnet, devnet }
  EDGE_PACKAGE_ID,   // { mainnet, testnet, devnet }
  EDGE_TEMPLATES,    // all 5 templates
  DEFAULT_GAS_BUDGET // 10_000_000n
} from '@edge-protocol/sdk';
```

---

## Integration Examples

### AI Agent with Claude

```typescript
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';
import Anthropic from '@anthropic-ai/sdk';

const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: KEY });
const pass = await sdk.create(
  EdgePass.fromTemplate('festival', {
    approvedMerchants: ['Shuttle Express', 'Hydra Bar', 'Stage Access VIP'],
    owner: userAddress,
  }),
  signer
);

const claude = new Anthropic();
const response = await claude.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 500,
  messages: [{ role: 'user', content: 'Plan my festival spending. Return JSON array of { merchant, amount } decisions.' }]
});

const decisions = JSON.parse(response.content[0].text);

// Simulate first — show plan before executing
const plan = sdk.simulate(pass, decisions.map(d => ({
  merchant: d.merchant,
  amount: BigInt(Math.floor(d.amount * 1e9)),
})));

console.log(`Plan: ${plan.summary.approvedCount} approved, ${plan.summary.blockedCount} blocked`);

// Execute approved decisions
for (const decision of plan.approved) {
  const outcome = await sdk.execute(pass, decision.request, signer);
  console.log(outcome.status, outcome.digest);
}
```

### DeFi Trading Agent

```typescript
const pass = await sdk.create(
  EdgePass.fromTemplate('defi', {
    approvedMerchants: ['DeepBook', 'Cetus', 'Turbos'],
    budget: 5_000n * MIST_PER_SUI,
    owner: userAddress,
  }),
  signer
);

async function executeTrade(dex: string, amount: bigint) {
  const preview = sdk.validate(pass, { merchant: dex, amount });
  if (!preview.allowed) { logger.warn(`blocked: ${preview.reason}`); return; }
  if (preview.requiresEscalation) { await riskTeam.requestApproval({ dex, amount }); return; }
  const outcome = await sdk.execute(pass, { merchant: dex, amount }, signer);
  logger.info(`Trade executed: ${outcome.digest}`);
}
```

### Enterprise Treasury Agent

```typescript
const pass = await sdk.create(
  EdgePass.fromTemplate('enterprise', {
    approvedMerchants: ['vendor-a.sui', 'vendor-b.sui'],
    budget:            100_000n * MIST_PER_SUI,
    escalateThreshold:  10_000n * MIST_PER_SUI,
    owner:             cfoAddress,
  }),
  signer
);

for (const payment of scheduledPayments) {
  const outcome = await sdk.execute(pass, { merchant: payment.vendor, amount: payment.amount }, signer);
  if (outcome.status === 'escalated') await cfo.requestApproval(payment);
}
```

---

## Error Handling

```typescript
const outcome = await sdk.execute(pass, request, signer);

switch (outcome.status) {
  case 'approved':   // outcome.digest is the Sui tx hash
  case 'escalated':  // outcome.reason explains why
  case 'blocked':    // outcome.reason explains why
  case 'error':      // infrastructure failure — tx was NOT submitted
                     // outcome.code for programmatic handling
}
```

### Common blocked reasons

| Reason | Cause |
|--------|-------|
| `EdgePass is inactive` | Pass was revoked |
| `EdgePass has expired` | `expiresAt` passed |
| `Merchant "X" is not approved` | Not in allowlist |
| `Insufficient budget` | Remaining < amount |
| `Amount exceeds per-transaction limit` | Amount > `maxPerTransaction` |
| `Amount exceeds escalation threshold` | Amount > `escalateThreshold` — escalated not blocked |

---

## Architecture

```
User creates EdgePass (once)
         │
         ▼
Agent calls sdk.execute() — many times, autonomously
         │
         ├─▶ PolicyEngine.validate()
         │         Pure TypeScript · no network · <1ms
         │         7 rules checked in order
         │         blocked/escalated never touch Sui
         │
         ├─▶ ExecutionEngine.buildPTB()
         │         Programmable Transaction Block
         │         validate → execute → update spent
         │         atomic — any failure reverts everything
         │
         └─▶ Walrus audit receipt
                   immutable · decentralized · permanent
```

### Why PTBs matter

The policy check and spend update happen in one atomic block. If any step fails, everything reverts. No partial state. No race conditions.

### Why the object model matters

The EdgePass is a first-class owned object in the user's wallet. An agent executes against it without ever taking ownership. No admin key, no contract upgrade can change that.

---

## Move Contract

```
Package:  0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde
Network:  Sui Mainnet ✅
```

[View on Sui Explorer →](https://suiscan.xyz/mainnet/object/0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde)

### Contract functions

```move
public entry fun create_pass(
  budget: u64, auto_threshold: u64, escalate_threshold: u64,
  expiry_ms: u64, approved_merchants: vector<String>,
  clock: &Clock, ctx: &mut TxContext,
)

public entry fun execute_transaction(
  pass: &mut EdgePass, amount: u64, merchant: String,
  clock: &Clock, ctx: &mut TxContext,
)

public entry fun revoke_pass(pass: &mut EdgePass, ctx: &mut TxContext)
```

### On-chain enforcement

Five assertions run inside the Move VM on every spend:

```move
assert!(pass.active, EPassInactive);
assert!(now <= pass.expires_at, EPassExpired);
assert!(is_merchant_approved(pass, &merchant), EMerchantNotApproved);
assert!(pass.spent + amount <= pass.budget, EBudgetExceeded);
assert!(amount <= pass.escalate_threshold, EAmountExceedsEscalationThreshold);
```

A compromised agent cannot bypass the contract. The chain is the trust boundary.

---

## Security Model

### Layer 1 — TypeScript PolicyEngine

Fast, zero network calls, under 1ms. Can be bypassed by a compromised agent runtime. Treat as a UX convenience — not a security boundary.

### Layer 2 — Sui Move Contract

On-chain enforcement by the Sui VM. Cannot be bypassed.

```
sdk.validate()  →  TypeScript (instant preview, saves gas on rejections)
sdk.execute()   →  TypeScript + Move contract (atomic, tamper-proof, final)
```

### Production guidelines

- Always execute via the Move contract — the TypeScript layer is a preview
- Use verified Sui addresses in `approvedMerchants` rather than display name strings
- Keep ephemeral zkLogin keys in memory only — never persist to localStorage
- Fetch EdgePass state from chain before critical operations

### Known V2 security improvements

- Rolling time windows — `maxTransactionsPerHour`
- On-chain policy signatures
- Merchant address verification on-chain
- Rate limiting to prevent rapid budget drain

---

## Testing

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

*The best infrastructure is invisible.*

Built for Sui Overflow 2026 · MIT License

[npm](https://npmjs.com/package/@edge-protocol/sdk) · [GitHub](https://github.com/fluturecode/edge) · [Live Demo](https://edge-web-cyan.vercel.app)
