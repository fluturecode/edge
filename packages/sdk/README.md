<div align="center">

# @edge-protocol/sdk

### Programmable Trust for Autonomous AI Agents on Sui

[![npm version](https://img.shields.io/npm/v/@edge-protocol/sdk?style=flat-square&color=FF4D6A)](https://npmjs.com/package/@edge-protocol/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@edge-protocol/sdk?style=flat-square&color=FFB830)](https://npmjs.com/package/@edge-protocol/sdk)
[![Tests](https://img.shields.io/badge/tests-6%2F6_passing-00D4AA?style=flat-square)](src/test.ts)
[![Built on Sui](https://img.shields.io/badge/Built%20on-Sui-4DA2FF?style=flat-square)](https://sui.io)
[![License](https://img.shields.io/badge/license-MIT-B8C8E0?style=flat-square)](LICENSE)

**Give agents your rules, not your keys.**

[Live Demo](https://edge-web-cyan.vercel.app) · [Full Docs](https://github.com/fluturecode/edge/blob/main/packages/sdk/DOCS.md) · [GitHub](https://github.com/fluturecode/edge)

</div>

---

## The Problem

```
Option A: Give the agent full wallet access  →  catastrophic risk
Option B: Human approves every transaction  →  defeats the purpose  
Option C: Build custom policy logic         →  6-8 weeks of work
```

**EdgePass is Option D** — a programmable trust boundary that lets agents transact autonomously within user-defined limits, enforced on-chain via Sui Move.

---

## Install

```bash
npm install @edge-protocol/sdk
# or
pnpm add @edge-protocol/sdk
# or
yarn add @edge-protocol/sdk
```

---

## Quickstart

```typescript
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: 'YOUR_KEY' });

// 1. Create a trust boundary (once)
const pass = await sdk.create(
  EdgePass.fromTemplate('festival', {
    approvedMerchants: ['Shuttle Express', 'Hydra Bar'],
    owner: userAddress,
  }),
  signer
);

// 2. Execute autonomously (many times)
const outcome = await sdk.execute(pass, {
  merchant: 'Shuttle Express',
  amount:   18_500_000_000n, // 18.5 SUI in MIST
}, signer);

switch (outcome.status) {
  case 'approved':   // ✅ executed on-chain, digest on Walrus
  case 'escalated':  // ⚠️ notify user, await approval
  case 'blocked':    // 🚫 policy rejected, reason logged
}
```

---

## Templates

Pre-configured trust boundaries for common use cases:

```typescript
EdgePass.fromTemplate('festival',     { owner })  // $300 · auto <$50 · escalate >$100 · 48h
EdgePass.fromTemplate('gaming',       { owner })  // $50  · auto <$2  · escalate >$10  · 4h
EdgePass.fromTemplate('subscription', { owner })  // $200 · auto <$20 · escalate >$50  · 30d
EdgePass.fromTemplate('defi',         { owner })  // $10k · auto <$500 · escalate >$1k · 7d
EdgePass.fromTemplate('enterprise',   { owner })  // $50k · auto <$1k · escalate >$5k · 30d
```

Override any field:

```typescript
const pass = await sdk.create(
  EdgePass.fromTemplate('defi', {
    budget: 25_000n * MIST_PER_SUI,
    approvedMerchants: ['DeepBook', 'Cetus'],
    owner: userAddress,
  }),
  signer
);
```

---

## Full API

### `new EdgePass(config)`

```typescript
const sdk = new EdgePass({
  network:     'mainnet' | 'testnet' | 'devnet',
  enokiApiKey: string,
});
```

### `sdk.create(config, signer)` → `EdgePassObject`

Mint a new EdgePass on Sui. Returns the EdgePass object with its on-chain ID.

```typescript
const pass = await sdk.create({
  budget:            300n * MIST_PER_SUI,
  autoThreshold:      50n * MIST_PER_SUI,
  escalateThreshold: 100n * MIST_PER_SUI,
  maxPerTransaction: 200n * MIST_PER_SUI, // optional
  approvedMerchants: ['Shuttle Express'],
  expiryMs:          48 * 60 * 60 * 1000,
  owner:             userAddress,
}, signer);

console.log(pass.id); // Sui object ID — verifiable on Suiscan
```

### `sdk.execute(pass, request, signer)` → `TransactionOutcome`

Execute a transaction against the EdgePass. Policy enforced before touching the chain.

```typescript
const outcome = await sdk.execute(pass, {
  merchant: 'Shuttle Express',
  amount:   18_500_000_000n,
}, signer);

// outcome.status  → 'approved' | 'escalated' | 'blocked'
// outcome.digest  → tx digest (if approved)
// outcome.reason  → explanation (if escalated or blocked)
```

### `sdk.validate(pass, request)` → `PolicyValidation`

Preview the outcome without executing. Zero network calls. Use for UI previews.

```typescript
const preview = sdk.validate(pass, { merchant, amount });
// { allowed: boolean, requiresEscalation: boolean, reason: string }
```

### `sdk.revoke(pass, signer)`

Revoke an EdgePass. All future `execute()` calls return `blocked` immediately.

### `sdk.remainingBudget(pass)` → `bigint`

Returns remaining budget in MIST.

### `sdk.isValid(pass)` → `boolean`

Returns `true` if the pass is active and not expired.

### `EdgePass.fromTemplate(template, overrides)` → `EdgePassConfig`

Create a config from a pre-built template.

---

## Policy Validation Rules

PolicyEngine validates in this order:

1. Pass must be active
2. Pass must not be expired
3. Merchant must be in approved list
4. Amount must not exceed remaining budget
5. Amount must not exceed `maxPerTransaction` (if set)
6. If amount > `escalateThreshold` → escalate
7. If amount ≤ `autoThreshold` → auto-approve

---

## Why Sui

Five primitives make this only possible on Sui:

- **zkLogin** — invisible wallet from Google, no seed phrase
- **Sponsored Transactions** — users never pay gas
- **PTBs** — atomic policy + execution + audit in one block
- **Object Model** — EdgePass owned directly by user, not a contract
- **Walrus** — immutable audit receipts, no database needed

---

## Live Demo

Festival Mode: Claude autonomously manages purchases within an EdgePass.

```
🧠 Claude:       "Shuttle from parking — $18.50"
⚙️ PolicyEngine: ✅ auto-approved · trusted merchant
⛓ Sui:          execute_transaction · Success · Suiscan verified

🧠 Claude:       "Artist meet & greet — $149"  
⚙️ PolicyEngine: ⚠️ escalated · exceeds $100 threshold
👤 User:         approves via modal

3 transactions · $54.50 spent · 0 wallet popups
```

[See it live →](https://edge-web-cyan.vercel.app)

---

## Testing

```bash
pnpm test
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

## Move Contract

```
Package:  0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d
Network:  Sui Testnet (Mainnet coming)
```

---

<div align="center">

*The best infrastructure is invisible.*

Built for [Sui Overflow 2026](https://overflow.sui.io) · MIT License

</div>
