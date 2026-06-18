<div align="center">

# @edge-protocol/sdk

### Bounded Financial Authority for Autonomous AI Agents on Sui

[![npm version](https://img.shields.io/npm/v/@edge-protocol/sdk?style=flat-square&color=FF4D6A)](https://npmjs.com/package/@edge-protocol/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@edge-protocol/sdk?style=flat-square&color=FFB830)](https://npmjs.com/package/@edge-protocol/sdk)
[![Tests](https://img.shields.io/badge/tests-34%2F34_passing-00D4AA?style=flat-square)](src/test.ts)
[![Built on Sui](https://img.shields.io/badge/Built%20on-Sui-4DA2FF?style=flat-square)](https://sui.io)
[![License](https://img.shields.io/badge/license-MIT-B8C8E0?style=flat-square)](LICENSE)

**Give agents your rules, not your keys.**

[Live Demo](https://edge-web-cyan.vercel.app) · [Full Docs](https://github.com/fluturecode/edge/blob/main/packages/sdk/DOCS.md) · [GitHub](https://github.com/fluturecode/edge)

</div>

---

Giving an AI agent raw private keys is a security nightmare. Requiring human approval for every transaction defeats the purpose of automation. Edge provides an **on-chain policy layer** that issues scoped, programmatic spend authority (`EdgePass`) directly to agent runtimes — with cryptographic guardrails enforced by the Sui VM.

---

## ⚡ Quickstart — 3 Lines of Code

```typescript
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: 'YOUR_KEY' });

// 1. Issue a 5-dimensional spend authorization (once)
const pass = await sdk.create(EdgePass.fromTemplate('festival', { owner: userAddress }), signer);

// 2. Agent executes autonomously within policy boundaries (many times)
const outcome = await sdk.execute(pass, { merchant: 'Shuttle Express', amount: 18n * MIST_PER_SUI }, signer);

console.log(outcome.status); // 'approved' | 'escalated' | 'blocked'
```

---

## 🛠 The 5-Dimensional Trust Primitive

Every EdgePass is a native Sui Move object encoding five distinct governance dimensions:

| Dimension | What it controls |
|-----------|-----------------|
| **BUDGET** | Maximum global spending ceiling |
| **VELOCITY** | Auto-approve threshold before escalation fires |
| **SCOPE** | Explicit allowlist of approved merchants / contracts |
| **TIME** | Hard cryptographic expiration date |
| **ESCALATION** | Programmatic fallback when a limit is exceeded |

---

## 📋 Templates

Pre-configured for common use cases — override any field:

```typescript
EdgePass.fromTemplate('festival',     { owner })  // $300 · auto <$50 · escalate >$100 · 48h
EdgePass.fromTemplate('gaming',       { owner })  // $50  · auto <$2  · escalate >$10  · 4h
EdgePass.fromTemplate('subscription', { owner })  // $200 · auto <$20 · escalate >$50  · 30d
EdgePass.fromTemplate('defi',         { owner })  // $10k · auto <$500 · escalate >$1k · 7d
EdgePass.fromTemplate('enterprise',   { owner })  // $50k · auto <$1k · escalate >$5k · 30d
```

---

## 🤖 Agent Framework Integration

### Vercel AI SDK / Mastra

Integrate Edge directly into your agent's tool declaration to enforce policy boundaries before any transaction touches the network:

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

export const autonomousPurchaseTool = tool({
  description: 'Purchase assets or services autonomously within policy boundaries.',
  parameters: z.object({
    merchant:   z.string(),
    amountSUI:  z.number(),
  }),
  execute: async ({ merchant, amountSUI }) => {
    // Edge validates BEFORE the transaction touches the network
    const outcome = await sdk.execute(currentPass, {
      merchant,
      amount: BigInt(Math.floor(amountSUI * 1e9)),
    }, agentSigner);

    if (outcome.status === 'blocked') {
      return { success: false, error: `Blocked by EdgePass policy: ${outcome.reason}` };
    }

    if (outcome.status === 'escalated') {
      return { success: false, error: `Paused — human approval required: ${outcome.reason}` };
    }

    return { success: true, digest: outcome.digest };
  }
});
```

### Native Agent System Prompt

Include this in your LLM initialization to teach the agent how to handle EdgePass responses:

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

## 📊 Execution Results

Every `sdk.execute()` returns a structured outcome — not a flat string:

```typescript
type TransactionOutcome =
  | { status: 'approved';  digest: string; auto: true;  }
  | { status: 'escalated'; reason: string; auto: false; }
  | { status: 'blocked';   reason: string; auto: false; }

// Example approved outcome
{
  status:  'approved',
  digest:  '0xabc123...txdigest',
  auto:    true,
}

// Example blocked outcome
{
  status: 'blocked',
  reason: 'Merchant "ShadyTokens.xyz" is not approved',
  auto:   false,
}
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

// Events fire automatically on execute
await sdk.execute(pass, request, signer);
```

---

## 🔌 Pluggable Escalation Handlers

Route escalation alerts to dashboards, Slack, or Telegram:

```typescript
sdk.on('escalated', async ({ outcome, request }) => {
  // Slack webhook
  await fetch('https://hooks.slack.com/your-webhook', {
    method: 'POST',
    body: JSON.stringify({
      text: `⚠️ Agent escalation: $${request.amount} at ${request.merchant}\n${outcome.reason}`,
    }),
  });
});
```

---

## 📜 Cryptographic Audit Trail

Every execution writes an immutable receipt to Walrus — decentralized, tamper-evident, permanent. No database. No server. Cryptographically committed.

```typescript
// After execution, the Walrus blob ID is available
const outcome = await sdk.execute(pass, request, signer);
// audit receipt automatically written to Walrus
// verifiable at walruscan.com/testnet/blob/{blobId}
```

---

## 🔍 Preview Without Executing

Zero network calls. Sub-millisecond. Use for UI previews:

```typescript
const preview = sdk.validate(pass, { merchant, amount });
// { allowed: boolean, requiresEscalation: boolean, reason: string }

if (!preview.allowed) showBlockedUI(preview.reason);
if (preview.requiresEscalation) showEscalationModal(preview.reason);
```

---

## 🔒 Security Model

Edge has two enforcement layers:

**Layer 1 — TypeScript PolicyEngine** — pre-flight, zero network calls, under 1ms. Can be bypassed by a compromised agent. Treat as a UX convenience, not a security boundary.

**Layer 2 — Sui Move Contract** — on-chain enforcement by the Sui VM. Cannot be bypassed. The EdgePass object validates all policy dimensions independently. This is the source of truth.

```
sdk.validate()  →  TypeScript (instant preview, saves gas)
sdk.execute()   →  TypeScript + Move contract (atomic, tamper-proof)
```

For production: always execute via the Move contract. The TypeScript layer is a preview — the chain is the guarantee.

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
Package:  0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d
Network:  Sui Testnet (Mainnet coming)
```

---

## 📦 Install

```bash
npm install @edge-protocol/sdk
# or
pnpm add @edge-protocol/sdk
# or
yarn add @edge-protocol/sdk
```

---

<div align="center">

*The best infrastructure is invisible.*

Built for [Sui Overflow 2026](https://overflow.sui.io) · MIT License

[![GitHub](https://img.shields.io/badge/GitHub-fluturecode%2Fedge-181717?style=flat-square&logo=github)](https://github.com/fluturecode/edge)
[![npm](https://img.shields.io/badge/npm-%40edge--protocol%2Fsdk-CB3837?style=flat-square&logo=npm)](https://npmjs.com/package/@edge-protocol/sdk)

</div>
