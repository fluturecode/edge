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
- [Templates](#templates)
- [PolicyEngine](#policyengine)
- [Types](#types)
- [Constants](#constants)
- [Integration Examples](#integration-examples)
- [Error Handling](#error-handling)
- [Architecture](#architecture)
- [Move Contract](#move-contract)
- [Competitive Positioning](#competitive-positioning)
- [Security Model](#security-model)
- [Testing](#testing)
- [Links](#links)

---

## Core Concepts

### The Problem

Every developer building an autonomous agent faces the same unsolved problem:

```
Option A: Give the agent full wallet access  →  catastrophic risk
Option B: Human approves every transaction  →  defeats the purpose
Option C: Build custom policy logic         →  6-8 weeks of work
```

**EdgePass is Option D** — a programmable trust boundary enforced on-chain.

### EdgePass

An EdgePass is a Sui Move object that encodes a complete trust policy. It lives in the user's wallet — not in a contract. An agent executes against it without ever taking ownership.

```
budget: $300  ·  auto-approve: <$50  ·  escalate: >$100  ·  merchants: [...]  ·  expiry: 48h
```

### Transaction Outcomes

Every `sdk.execute()` returns one of three outcomes:

```
✅ approved   — executed on-chain, digest available
⚠️  escalated  — exceeds threshold, needs user approval
🚫 blocked    — policy rejected, reason provided
```

### MIST

All amounts are in MIST — Sui's base unit.

```typescript
1 SUI = 1_000_000_000 MIST

import { MIST_PER_SUI } from '@edge-protocol/sdk';

const budget = 300n * MIST_PER_SUI; // 300 SUI
const amount = 18_500_000_000n;      // 18.5 SUI
```

---

## Installation

```bash
npm install @edge-protocol/sdk
# or
pnpm add @edge-protocol/sdk
# or
yarn add @edge-protocol/sdk
```

### Requirements

- Node.js 18+
- TypeScript 5.0+ (recommended)
- A Sui network (testnet or mainnet)
- An Enoki API key for gas sponsorship

---

## EdgePass API

### `new EdgePass(config)`

Initialize the SDK client.

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
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

const pass = await sdk.create({
  budget:            300n * MIST_PER_SUI,   // total spend limit
  autoThreshold:      50n * MIST_PER_SUI,   // auto-approve below this
  escalateThreshold: 100n * MIST_PER_SUI,   // escalate above this
  maxPerTransaction: 200n * MIST_PER_SUI,   // optional hard cap per tx
  approvedMerchants: ['Shuttle Express', 'Hydra Bar'],
  expiryMs:          48 * 60 * 60 * 1000,   // 48 hours
  owner:             userAddress,
}, signer);

console.log(pass.id);        // Sui object ID — verifiable on Suiscan
console.log(pass.expiresAt); // Unix timestamp
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `budget` | `bigint` | ✅ | Total spend limit in MIST |
| `autoThreshold` | `bigint` | ✅ | Auto-approve below this amount |
| `escalateThreshold` | `bigint` | ✅ | Escalate above this amount |
| `maxPerTransaction` | `bigint` | ❌ | Hard cap per single transaction |
| `approvedMerchants` | `string[]` | ✅ | Allowlist of merchant identifiers |
| `expiryMs` | `number` | ✅ | Duration until expiry in milliseconds |
| `owner` | `string` | ✅ | Sui address of the pass owner |

**Constraint:** `autoThreshold < escalateThreshold < budget`

---

### `EdgePass.fromTemplate(template, overrides)` → `EdgePassConfig`

Create a config from a pre-built template. Override any field.

```typescript
// Use a template as-is
const config = EdgePass.fromTemplate('festival', { owner: userAddress });

// Override specific fields
const config = EdgePass.fromTemplate('defi', {
  budget: 25_000n * MIST_PER_SUI,
  approvedMerchants: ['DeepBook', 'Cetus', 'Turbos'],
  owner: userAddress,
});

const pass = await sdk.create(config, signer);
```

---

### `sdk.execute(pass, request, signer)` → `Promise<TransactionOutcome>`

Execute a transaction against an EdgePass. Policy is validated before touching the chain — blocked and escalated transactions never reach Sui.

```typescript
const outcome = await sdk.execute(pass, {
  merchant: 'Shuttle Express',
  amount:   18_500_000_000n, // 18.5 SUI in MIST
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
}
```

---

### `sdk.validate(pass, request)` → `PolicyValidation`

Preview the outcome without executing. Zero network calls. Sub-millisecond.

```typescript
const preview = sdk.validate(pass, {
  merchant: 'Shuttle Express',
  amount:   18_500_000_000n,
});

if (!preview.allowed) {
  showBlockedUI(preview.reason);
  return;
}

if (preview.requiresEscalation) {
  showEscalationUI(preview.reason);
  return;
}

const outcome = await sdk.execute(pass, request, signer);
```

---

### `sdk.revoke(pass, signer)` → `Promise<{ digest: string }>`

Revoke an EdgePass on-chain. All future `execute()` calls return `blocked` immediately.

```typescript
const { digest } = await sdk.revoke(pass, signer);
console.log('revoked:', digest);
```

---

### `sdk.fetch(objectId)` → `Promise<EdgePassObject | null>`

Fetch a live EdgePass from the Sui network.

```typescript
const pass = await sdk.fetch('0x4e2f...8b91');
if (!pass) { console.log('EdgePass not found'); return; }
const remaining = sdk.remainingBudget(pass);
```

---

### `sdk.remainingBudget(pass)` → `bigint`

Returns remaining budget in MIST.

```typescript
const remaining = sdk.remainingBudget(pass);
const remainingSUI = Number(remaining) / Number(MIST_PER_SUI);
console.log(`$${remainingSUI.toFixed(2)} remaining`);
```

---

### `sdk.isValid(pass)` → `boolean`

Returns `true` if the pass is active and not expired.

```typescript
if (!sdk.isValid(pass)) {
  pass = await sdk.create(config, signer);
}
```

---

### `sdk.on(event, listener)` → `this`

Subscribe to transaction outcomes. Fires automatically after every `sdk.execute()` call. Returns the SDK instance for chaining.

```typescript
sdk
  .on('approved', ({ outcome, pass, request }) => {
    console.log('executed:', outcome.digest);
    updateBudgetUI(pass);
  })
  .on('escalated', ({ outcome, request }) => {
    notifyUser(`Approve $${request.amount} at ${request.merchant}?`);
  })
  .on('blocked', ({ outcome, request }) => {
    logger.warn(`blocked: ${outcome.reason}`);
  });

await sdk.execute(pass, request, signer);
```

**Event payload:**

```typescript
{ type: 'approved',  outcome: { status: 'approved',  digest: string, auto: true  }, pass, request }
{ type: 'escalated', outcome: { status: 'escalated', reason: string, auto: false }, pass, request }
{ type: 'blocked',   outcome: { status: 'blocked',   reason: string, auto: false }, pass, request }
```

---

### `sdk.off(event, listener)` → `this`

Remove a specific listener.

```typescript
const onApproved = ({ outcome }) => console.log(outcome.digest);
sdk.on('approved', onApproved);
sdk.off('approved', onApproved);
```

---

### `sdk.removeAllListeners(event?)` → `this`

Remove all listeners for an event, or all events if none specified.

```typescript
sdk.removeAllListeners('approved'); // remove all approved listeners
sdk.removeAllListeners();           // remove all listeners
```

---

## Templates

Pre-configured trust boundaries for common use cases. Every template is a starting point — override any field.

```typescript
import { EdgePass, EDGE_TEMPLATES } from '@edge-protocol/sdk';

EdgePass.fromTemplate('festival',     { owner })  // $300  / 48h
EdgePass.fromTemplate('gaming',       { owner })  // $50   / 4h session
EdgePass.fromTemplate('subscription', { owner })  // $200  / 30 days
EdgePass.fromTemplate('defi',         { owner })  // $10k  / 7 days
EdgePass.fromTemplate('enterprise',   { owner })  // $50k  / 30 days
```

### Template defaults

| Template | Budget | Auto ≤ | Escalate ≥ | Max/tx | Expiry |
|----------|--------|--------|------------|--------|--------|
| `festival` | 300 SUI | 50 SUI | 100 SUI | 200 SUI | 48h |
| `gaming` | 50 SUI | 2 SUI | 10 SUI | 10 SUI | 4h |
| `subscription` | 200 SUI | 20 SUI | 50 SUI | 50 SUI | 30d |
| `defi` | 10,000 SUI | 500 SUI | 1,000 SUI | 2,000 SUI | 7d |
| `enterprise` | 50,000 SUI | 1,000 SUI | 5,000 SUI | 10,000 SUI | 30d |

---

## PolicyEngine

Access the policy engine directly for custom validation flows.

```typescript
import { PolicyEngine } from '@edge-protocol/sdk';
```

### `PolicyEngine.validate(pass, request)` → `PolicyValidation`

```typescript
const validation = PolicyEngine.validate(pass, {
  merchant: 'Shuttle Express',
  amount:   18_500_000_000n,
});
// validation.allowed · validation.requiresEscalation · validation.reason
```

**Validation rules (in order):**

1. Pass must be active
2. Pass must not be expired
3. Merchant must be in `approvedMerchants`
4. Amount must not exceed remaining budget
5. Amount must not exceed `maxPerTransaction` (if set)
6. If amount > `escalateThreshold` → escalate
7. If amount ≤ `autoThreshold` → auto-approve

### `PolicyEngine.isValid(pass)` → `boolean`

### `PolicyEngine.remainingBudget(pass)` → `bigint`

---

## Types

```typescript
import type {
  EdgePassConfig,
  EdgePassObject,
  TransactionRequest,
  TransactionOutcome,
  PolicyValidation,
  Network,
  EdgeSDKConfig,
  EdgePassTemplate,
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
  // error = infrastructure failure — transaction NOT submitted to chain
```

### `PolicyValidation`

```typescript
interface PolicyValidation {
  allowed:            boolean;
  requiresEscalation: boolean;
  reason:             string;
}
```

### `Network`

```typescript
type Network = 'mainnet' | 'testnet' | 'devnet';
```

### `EdgePassTemplate`

```typescript
type EdgePassTemplate = 'festival' | 'gaming' | 'subscription' | 'defi' | 'enterprise';
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

### AI Agent with EdgePass

```typescript
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';
import Anthropic from '@anthropic-ai/sdk';

const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: KEY });
const claude = new Anthropic();

const pass = await sdk.create(
  EdgePass.fromTemplate('festival', {
    approvedMerchants: ['Shuttle Express', 'Hydra Bar', 'Stage Access VIP'],
    owner: userAddress,
  }),
  signer
);

async function agentLoop(scenario: string) {
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{ role: 'user', content: `Festival scenario: "${scenario}". Return JSON: { merchant: string, amount: number }` }]
  });

  const { merchant, amount } = JSON.parse(response.content[0].text);
  const outcome = await sdk.execute(pass, {
    merchant,
    amount: BigInt(Math.floor(amount * 1e9)),
  }, signer);

  if (outcome.status === 'escalated') await notifyUser(`Approve $${amount} at ${merchant}?`);
  return outcome;
}
```

---

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

---

### Enterprise Payroll Agent

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

### Subscription Manager

```typescript
const pass = await sdk.create(
  EdgePass.fromTemplate('subscription', {
    approvedMerchants: ['netflix.sui', 'spotify.sui', 'github.sui'],
    owner: userAddress,
  }),
  signer
);

async function processRenewals(subscriptions: Subscription[]) {
  for (const sub of subscriptions) {
    if (!sdk.isValid(pass)) {
      pass = await sdk.create(EdgePass.fromTemplate('subscription', { owner: userAddress }), signer);
    }
    await sdk.execute(pass, { merchant: sub.merchant, amount: sub.amount }, signer);
  }
}
```

---

## Error Handling

```typescript
try {
  const outcome = await sdk.execute(pass, request, signer);
  switch (outcome.status) {
    case 'approved':   break; // outcome.digest is the Sui tx hash
    case 'escalated':  break; // outcome.reason explains why
    case 'blocked':    break; // outcome.reason explains why
  }
} catch (error) {
  console.error('SDK error:', error);
}
```

### Common reasons

| Reason | Cause |
|--------|-------|
| `EdgePass is inactive` | Pass was revoked |
| `EdgePass has expired` | `expiresAt` timestamp passed |
| `Merchant "X" is not approved` | Merchant not in allowlist |
| `Insufficient budget` | Remaining budget < amount |
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
         │         validate → execute → update spent → emit event
         │         atomic — any failure reverts everything
         │
         └─▶ Walrus audit receipt
                   immutable · decentralized · permanent
```

### Why PTBs matter

PTBs are Sui's killer feature. The policy check and the spend update happen in one atomic block. If any step fails, everything reverts. No partial state. No race conditions.

### Why the object model matters

The EdgePass is a first-class owned object in the user's wallet. An agent executes against it without ever taking ownership. No contract upgrade, no admin key, no reentrancy attack can change that.

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

`execute_transaction` validates every spend at the protocol level before recording it. Five assertions run inside the Move VM — if any fails, the entire transaction reverts:

```move
assert!(pass.active, EPassInactive);
assert!(now <= pass.expires_at, EPassExpired);
assert!(is_merchant_approved(pass, &merchant), EMerchantNotApproved);
assert!(pass.spent + amount <= pass.budget, EBudgetExceeded);
assert!(amount <= pass.escalate_threshold, EAmountExceedsEscalationThreshold);
```

This means policy enforcement is not client-side. A compromised agent cannot bypass the contract. The chain is the trust boundary.

---

## Competitive Positioning

Edge is the **policy layer** for the agentic economy. It is not a payment rail.

| Solution | Layer | Open Source | Sui Native | 3-line SDK |
|----------|-------|-------------|------------|------------|
| **Edge Protocol** | Policy enforcement | ✅ | ✅ | ✅ |
| x402 (Coinbase) | Payment rail | ✅ | ❌ | ❌ |
| ERC-4337 | Account abstraction | ✅ | ❌ EVM only | ❌ |
| Trust Wallet Agent Kit | Wallet interactions | ✅ | Partial | ❌ |
| Cobo Agentic Wallet | Custody | ❌ Enterprise | ❌ | ❌ |
| Nevermined | Metering + monetization | Partial | ❌ | ❌ |
| Skyfire | Identity + settlement | ❌ | ❌ | ❌ |

**Edge complements x402, it does not compete with it.**

x402 answers: *how does money move from agent to merchant?*
Edge answers: *should this agent be allowed to spend this money at all?*

Together they form a complete stack:

```
Edge (policy layer)  →  x402 (payment rail)  →  Settlement
"is this allowed?"       "move the money"
```

---

## Security Model

Edge has two enforcement layers:

### Layer 1 — TypeScript PolicyEngine (pre-flight)

Fast, zero network calls, under 1ms. Can be bypassed by a compromised agent runtime. Treat as a UX convenience and performance optimization — not a security boundary.

### Layer 2 — Sui Move Contract (source of truth)

On-chain enforcement by the Sui VM. Cannot be bypassed. The EdgePass object validates budget, expiry, and merchant allowlist independently at the protocol level.

**For production deployments:** Always execute via the Move contract. The TypeScript layer is a preview — the chain is the guarantee.

### The Two-Layer Pattern

```
sdk.validate()  →  TypeScript (instant preview, saves gas on rejections)
sdk.execute()   →  TypeScript + Move contract (atomic, tamper-proof, final)
```

### Production Guidelines

- Fetch EdgePass state from chain before executing — never trust locally cached config
- Use on-chain clock (Sui Clock `0x6`) for expiry verification in high-security deployments
- Use verified Sui addresses in `approvedMerchants` rather than display name strings
- Keep ephemeral zkLogin keys in memory only — never persist to localStorage

### Known V2 Security Improvements

- Rolling time windows — `maxTransactionsPerHour`
- On-chain policy signatures — cryptographic commitment prevents client-side tampering
- Merchant address verification — verified Sui addresses on-chain
- Rate limiting — prevent rapid budget drain attacks

---

## Testing

```bash
cd packages/sdk && pnpm test
```

```
📋 PolicyEngine.validate()
  ✓ auto-approves under $50
  ✓ auto-approves at exactly $50
  ✓ escalates above $100
  ✓ escalates at exactly $101
  ✓ blocks unlisted merchant
  ✓ blocks when budget exceeded
  ✓ blocks when expired
  ✓ blocks when inactive
  ✓ blocks when maxPerTransaction exceeded
  ✓ allows when maxPerTransaction is undefined

📋 PolicyEngine helpers
  ✓ isValid returns true for active pass
  ✓ isValid returns false for expired pass
  ✓ isValid returns false for inactive pass
  ✓ remainingBudget calculates correctly
  ✓ remainingBudget returns full budget when nothing spent

📋 EdgePass.fromTemplate()
  ✓ festival template has correct defaults
  ✓ gaming template has correct expiry
  ✓ defi template has correct budget
  ✓ enterprise template has correct budget
  ✓ fromTemplate allows budget override
  ✓ fromTemplate allows merchant override
  ✓ fromTemplate preserves owner

📋 Constants
  ✓ MIST_PER_SUI is 1_000_000_000
  ✓ all 5 templates exist
  ✓ all templates have required fields
  ✓ all templates have autoThreshold < escalateThreshold
  ✓ all templates have escalateThreshold < budget

📋 Events system
  ✓ on() returns sdk instance for chaining
  ✓ fires approved event on auto-approve
  ✓ fires blocked event on policy rejection
  ✓ fires escalated event above threshold
  ✓ off() removes listener
  ✓ removeAllListeners() clears all events
  ✓ multiple listeners fire for same event

34 passed · 0 failed ✅
```

---

## Links

- **npm:** [npmjs.com/package/@edge-protocol/sdk](https://npmjs.com/package/@edge-protocol/sdk)
- **GitHub:** [github.com/fluturecode/edge](https://github.com/fluturecode/edge)
- **Live Demo:** [edge-web-cyan.vercel.app](https://edge-web-cyan.vercel.app)
- **Contract on Mainnet:** [suiscan.xyz/mainnet/object/0x2ad62ac...](https://suiscan.xyz/mainnet/object/0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde)

---

*The best infrastructure is invisible.*

Built for [Sui Overflow 2026](https://overflow.sui.io) · MIT License
