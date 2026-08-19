# @edge-protocol/sdk

[![npm version](https://img.shields.io/npm/v/@edge-protocol/sdk)](https://npmjs.com/package/@edge-protocol/sdk)
[![npm downloads](https://img.shields.io/npm/dw/@edge-protocol/sdk)](https://npmjs.com/package/@edge-protocol/sdk)
[![Tests](https://img.shields.io/badge/tests-39%20passing-brightgreen)](https://github.com/fluturecode/edge)
[![Built on Sui](https://img.shields.io/badge/built%20on-Sui-blue)](https://sui.io)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Give agents your rules, not your keys.

[Live Demo](https://edge-web-cyan.vercel.app) · [Full Docs](DOCS.md) · [GitHub](https://github.com/fluturecode/edge)

---

As autonomous agents begin managing real assets onchain, they need a trust layer that governs how they interact with them. Raw private keys are a security nightmare. Requiring human approval for every transaction defeats the purpose of automation.

EdgePass is the policy layer — scoped, programmatic spend authority issued directly to agent runtimes, with cryptographic guardrails enforced by the Sui VM. Not a payment rail. Not a wallet. The boundary between what an agent can do and what it cannot.

**Edge is Sui-native by design.** The policy enforcement lives on Sui mainnet where it cannot be tampered with. Your assets stay exactly where they are — on whatever chains your custody provider already manages. Sui is the notary. Your custody layer is the bank.

---

## What's New in v1.0.0

**Upgraded to `@mysten/sui` v2.20.1 and `@mysten/walrus` v1.2.3.**

**EdgePassV2 — issuer/agent separation.** The pass is shared, not owned: an `issuer` grants and revokes but cannot spend, an `agent` spends but cannot revoke or change anything, and neither can do the other's job. Scope can only narrow after minting — there's no `add_merchant`, by design, not even for the issuer. Adds a rolling `velocityCap` / `velocityWindowMs` rate limit (a budget caps *how much*, not *how fast*) and a hard, on-chain-enforced `maxPerTransaction` ceiling. Denials can optionally be recorded on chain as an aborted transaction (`onChainDenials`, default `true`), so a `blocked` outcome is independently verifiable on Suiscan, not just a client-side claim. v1 passes remain fetchable, inspectable, and revocable — there is no v1 creation path anymore.

Four more enterprise hardening upgrades:

**1. Two-Phase Commit / Idempotency** — `createWithFireblocks()` replaces `withFireblocks()` with a full idempotency registry. If Fireblocks times out after Sui approves, retry with the same `idempotencyKey` — no double-spend, no lost transactions.

**2. Compliance Engine — The 6th Dimension** — AML, sanctions, and risk screening between Edge approval and Fireblocks settlement. Pluggable providers: Fireblocks native, Chainalysis, or custom.

**3. Dynamic Identity Binding** — Bind EdgePasses to Dynamic enterprise identities via JWT verification. An intercepted EdgePass cannot be used outside the authorized Dynamic session. Bridges Dynamic (who?) → Edge (what?) → Fireblocks (how?).

**4. Real Walrus Audit Storage** — Immutable, content-addressed audit logs on Walrus mainnet. Every transaction outcome — approved, blocked, escalated — gets a permanent on-chain record with a Walrus blob ID.

---

## ⚡ Quickstart — 3 Lines of Code

```typescript
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: 'YOUR_KEY' });
const pass = await sdk.create(EdgePass.fromTemplate('festival', { agent: agentAddress }), signer);
const outcome = await sdk.execute(pass, { merchant: '0xhydrabar...', amount: BigInt(32) * MIST_PER_SUI }, signer);

console.log(outcome.status); // 'approved' | 'escalated' | 'blocked'
```

> **Note:** BigInt literal syntax (`32n`) requires TypeScript targeting ES2020+. For ES2019 apps use `BigInt(32) * MIST_PER_SUI` instead.

---

## 🛠 The 6-Dimensional Trust Primitive

Every EdgePass encodes six governance dimensions — five enforced on-chain by the Sui Move contract, one enforced by the compliance layer:

| Dimension | What it controls |
|-----------|-----------------|
| BUDGET | Maximum global spending ceiling, and a hard per-transaction ceiling (`maxPerTransaction`) |
| VELOCITY | Rolling rate limit — max actions per window (`velocityCap` / `velocityWindowMs`), enforced on chain |
| SCOPE | Explicit allowlist of approved merchant addresses — can only narrow after minting, never widen |
| TIME | Hard cryptographic expiration date |
| ESCALATION | Off-chain routing to a human above `escalateAbove` — not a refusal, the contract doesn't enforce it |
| COMPLIANCE | AML / sanctions / risk screening before settlement |

---

## 🔒 Enterprise: `createWithFireblocks()`

The hardened replacement for `withFireblocks()`. Adds idempotency, compliance screening, Dynamic identity verification, and structured audit trails.

```typescript
import {
  createWithFireblocks,
  ComplianceEngine,
  createFireblocksComplianceProvider,
  DynamicIdentityEngine,
  parseDynamicJWT,
  WalrusAudit,
} from '@edge-protocol/sdk';

// Parse Dynamic identity
const identity = await parseDynamicJWT(userToken);
const boundPass = DynamicIdentityEngine.bind(pass, identity);

// Compliance engine
const compliance = new ComplianceEngine({
  escalateThreshold: 30,
  blockThreshold: 70,
  providers: [createFireblocksComplianceProvider(screeningFn)],
});

// Hardened execution
const safeTx = createWithFireblocks(boundPass, signer, sdk, {
  idempotencyKey: `invoice_${invoiceId}`,   // safe retry on network failure
  compliance,
  dynamicIdentity: identity,

  settle: async ({ edgeDigest, auditEntry }) => {
    return await fireblocks.createTransaction({
      note: `Edge approved: ${edgeDigest}`,
    });
  },

  onFailure: async ({ retryCount, intent }) => {
    // Retry with same idempotencyKey — budget won't double-count
  },
});

const result = await safeTx({
  merchant: 'aws-billing.vendor',
  amount: BigInt(450) * MIST_PER_SUI,
  amountUSD: '450.00',
  destinationAddress: '0x...',
});
```

---

## 🗄 Walrus Audit Storage

Every transaction outcome gets an immutable audit record on Walrus mainnet.

```typescript
import { WalrusAudit } from '@edge-protocol/sdk';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const keypair = Ed25519Keypair.fromSecretKey(process.env.SUI_PRIVATE_KEY!);
const audit = new WalrusAudit('mainnet');

const result = await audit.write([{
  passId: pass.id,
  merchant: 'aws-billing.vendor',
  amount: '450000000000',
  status: 'approved',
  timestamp: Date.now(),
  digest: edgeDigest,
}], pass.id, keypair);

console.log('Blob ID:', result.blobId);
console.log('Explorer:', result.explorerUrl);

// Read back — no wallet needed
const entries = await audit.read(result.blobId);
```

---

## 📋 Templates

Pre-configured for common use cases — override any field:

```typescript
EdgePass.fromTemplate('festival',     { agent })  // $300  · escalate >$50  · max/tx $200  · 48h
EdgePass.fromTemplate('gaming',       { agent })  // $50   · escalate >$2   · max/tx $10   · 4h
EdgePass.fromTemplate('subscription', { agent })  // $200  · escalate >$20  · max/tx $50   · 30d
EdgePass.fromTemplate('defi',         { agent })  // $10k  · escalate >$500 · max/tx $2k   · 7d
EdgePass.fromTemplate('enterprise',   { agent })  // $50k  · escalate >$1k  · max/tx $10k  · 30d
EdgePass.fromTemplate('x402',         { agent })  // $1k   · escalate >$10  · max/tx $200  · 24h
```

---

## 🔮 Simulate Before You Execute

Plan an agent's session without touching the chain. Zero network calls.

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

---

## 🔒 Security Model

Edge has two enforcement layers:

**Layer 1 — TypeScript PolicyEngine** — pre-flight, zero network calls, under 1ms. Blocked and escalated decisions never touch the chain — no gas wasted.

**Layer 2 — Sui Move Contract** — on-chain enforcement by the Sui VM. Cannot be bypassed. This is the source of truth.

```
sdk.validate()  →  TypeScript (instant preview, saves gas on rejections)
sdk.execute()   →  TypeScript + Move contract (atomic, tamper-proof, final)
```

---

## 🧪 Testing

```bash
pnpm test
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

| Solution | Layer | Open Source | Sui Native | simulate() | withFireblocks() | Compliance | Walrus Audit |
|----------|-------|-------------|------------|------------|-----------------|------------|--------------|
| **Edge Protocol** | Policy enforcement | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| x402 (Coinbase) | Payment rail | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| ERC-4337 | Account abstraction | ✅ | ❌ EVM only | ❌ | ❌ | ❌ | ❌ |
| Cobo Agentic Wallet | Custody | ❌ Enterprise | ❌ | ❌ | ❌ | Partial | ❌ |
| Skyfire | Identity + settlement | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Fireblocks | Custody + execution | ❌ Enterprise | ❌ | ❌ | N/A — integrates | ✅ | ❌ |

**Edge complements x402 and Fireblocks. It does not compete with them.**

---

*The best infrastructure is invisible.*

MIT License · [GitHub](https://github.com/fluturecode/edge) · [npm](https://npmjs.com/package/@edge-protocol/sdk)
