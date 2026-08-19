# @edge-protocol/sdk — Full Developer Reference

> Programmable trust infrastructure for autonomous AI agents on Sui.
> Give agents your rules, not your keys.

```bash
pnpm add @edge-protocol/sdk
```

---

## Table of Contents

- [v1 → v2 Migration Notes](#v1--v2-migration-notes)
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

## v1 → v2 Migration Notes

There is no v1 creation path anymore — `sdk.create()` only ever mints v2 passes. v1 passes you already hold remain fetchable, inspectable, and revocable. If you're porting an existing v1 integration, these are the traps, roughly in order of how likely they are to bite silently:

1. **`autoThreshold` → `escalateAbove` is a naming inversion, not a rename.** In v1, `escalateThreshold` was the field that actually drove escalation — `autoThreshold` existed on the type but was dead, never read by `PolicyEngine.validate()`. In v2, `escalateThreshold` is gone and **`escalateAbove` is the live field**. If you port a v1 config by mechanically keeping the field named `autoThreshold`, you get no compile error (the old name no longer exists on `EdgePassConfig`, so TypeScript *will* catch a literal object), but if your v1 value ever flows through an `any`-typed boundary, a spread from a saved config, or JS glue code, it can silently land on nothing (or on a genuinely different field) with no error. `sdk.create()` now throws explicitly if a config carries a stray `escalateThreshold` or `autoThreshold` key, specifically to catch this. The correct mapping: **v1's `escalateThreshold` → v2's `escalateAbove`.** v1's `autoThreshold` has no v2 equivalent — there's nothing to carry over from it.

2. **`maxPerTransaction` is now required and hard-enforced on chain — it used to be optional and advisory.** In v1 it was `bigint | undefined`, checked (if present) by the same off-chain `PolicyEngine` that also decided escalation. In v2 it's required, and the Move contract itself asserts `amount <= max_per_transaction` (`EExceedsMaxPerTransaction`) — an amount above it is `blocked`, never `escalated`, and this can't be bypassed by a compromised SDK. If you're porting a v1 config that never set `maxPerTransaction`, decide the ceiling deliberately — don't default it to something that turns previously-escalating amounts into silent blocks. (`sdk.create()` will reject `escalateAbove > maxPerTransaction` for exactly this reason — nothing would ever be able to escalate.)

3. **`EdgePassObject` is flattened — no more nested `.config`.** v1's `pass.config.budget` is now just `pass.budget` on `EdgePassObjectV2`. A mechanical find-replace of `.config.` → `` across a codebase handles most of this, but watch for spread patterns like `{ ...pass.config, ...overrides }` that assumed the nesting.

4. **`sdk.validate()` and `sdk.execute()` now require `EdgePassObjectV2` specifically**, not the `EdgePassObject` union. `sdk.fetch()` can still return either version, so narrow with `isV2(pass)` before calling them — v1 passes are read-only (fetch/inspect/revoke only) and always were, but this is now enforced by the type system instead of just documentation.

5. **`issuer` is bookkeeping only — it is never sent as a transaction argument.** The real on-chain issuer is always `create_pass`'s sender (`ctx.sender()`). If you pass `issuer: someOtherAddress` expecting the contract to record that address as the issuer, it won't — the SDK keeps it around for templates/display, but the sender that signs `create_pass` is authoritative. `agent` is a real argument and is enforced (`ENotAgent` on every `execute_transaction`).

6. **`approvedMerchants` moved from display names to addresses.** v1 allowed `'Shuttle Express'` as a mechanism (the object comparison is a string in the string). v2's Move contract stores `vector<address>` — a string that isn't a valid Sui address will never match, so a v1 allowlist of human-readable names needs a real address for each entry. Use the new `TransactionRequest.merchantLabel` field for display strings instead.

7. **`velocityCap`/`velocityWindowMs` are new required fields with no v1 equivalent.** Set `velocityCap: 0` for "unlimited, same as v1's un-rate-limited behavior" — `velocityWindowMs` can then be anything (the contract and SDK both skip the window check entirely when the cap is 0).

If you're the one deciding how to migrate an app rather than just the SDK: **the semantics you actually want for v1's "auto-approve under $X, escalate above $Y" model are usually `escalateAbove = Y` plus a `maxPerTransaction` you set deliberately** (not derived from the old config, since v1 never had one) — not `escalateAbove = X`. v1's `autoThreshold` (`X`) was UI-only and was never the enforcement boundary.

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

An EdgePass is a Sui Move object that encodes a complete trust policy. As of v2 it's a **shared** object, not an owned one — rights are expressed through an `issuer` (grants and revokes, cannot spend) and an `agent` (spends, cannot revoke or change anything) rather than through object ownership. v1 passes are still fetchable, inspectable, and revocable but cannot be created anymore.

```
budget: $500  ·  max/tx: $200  ·  escalate: >$150  ·  velocity: 20/hr  ·  merchants: [...]  ·  expiry: 48h
```

### Transaction Outcomes

Every `sdk.execute()` returns one of four outcomes:

```
✅ approved   — executed on-chain, digest available
⚠️  escalated  — exceeds threshold, needs user approval
🚫 blocked    — policy rejected, reason provided
❌ error      — infrastructure failure, tx NOT submitted
```

> **Escalation is notify-only in 2.0.0.** `escalated` is a terminal outcome — `execute()` returns it and stops; nothing is submitted to chain, and there is currently no way to actually execute the transaction after a human approves it. Calling `execute()` again with the same request just returns `escalated` a second time (the check is purely `amount > escalateAbove`, with no notion anywhere of "already approved"). A resolve-after-approval path is planned for 2.1 — deciding whether that approval is asserted (a flag the caller sets) or proven (something cryptographically verifiable, e.g. a signed approval) is a security-sensitive API question that needs its own design, not a rushed addition here. This was never implemented in 1.x either, so it isn't a 2.0.0 regression — just a documented limitation.

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

### `sdk.create(config, signer)` → `Promise<EdgePassObjectV2>`

Mint a new EdgePass as a shared Move object on Sui. There is no v1 creation path anymore — every pass `create()` mints is v2.

```typescript
const pass = await sdk.create({
  agent:              agentAddress,        // spends — cannot revoke or reconfigure
  issuer:             userAddress,         // optional; SDK-side bookkeeping only —
                                            // the real on-chain issuer is always the tx sender
  budget:             500n * MIST_PER_SUI,
  escalateAbove:      150n * MIST_PER_SUI, // off-chain routing to a human — NOT enforced on chain
  maxPerTransaction:  300n * MIST_PER_SUI, // hard ceiling — enforced on chain, required
  velocityCap:        20,                  // max actions per window, 0 = unlimited
  velocityWindowMs:   60 * 60 * 1000,      // required (>0) whenever velocityCap > 0
  approvedMerchants:  ['0xshuttle...', '0xhydrabar...', '0xfestivalkitchen...'], // addresses, not names
  expiryMs:           48 * 60 * 60 * 1000,
}, signer);

console.log(pass.id);        // Sui object ID
console.log(pass.expiresAt); // Unix timestamp
```

**Constraints** (mirrored client-side in `create()`; the contract enforces its own subset via `EInvalidConfig`):
`escalateAbove ≤ maxPerTransaction ≤ budget`, `maxPerTransaction > 0`, `velocityWindowMs > 0` whenever `velocityCap > 0`, `approvedMerchants` non-empty, `expiryMs > 0`.

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent` | `string` | ✅ | Sui address that spends against the pass. Cannot revoke, cannot reconfigure. |
| `issuer` | `string` | ❌ | SDK-side bookkeeping (templates, display) only — **never sent as a transaction argument**. On chain the issuer is always the sender of `create_pass`. |
| `budget` | `bigint` | ✅ | Total spend limit in MIST |
| `escalateAbove` | `bigint` | ✅ | Off-chain escalation routing threshold. **Not enforced on chain.** Named `autoThreshold` before this field's semantics were clarified — see [Migration Notes](#v1--v2-migration-notes). |
| `maxPerTransaction` | `bigint` | ✅ | Hard per-transaction ceiling. Enforced on chain — amounts above this are `blocked`, not escalated. |
| `velocityCap` | `number` | ✅ | Max actions per window. `0` means unlimited. |
| `velocityWindowMs` | `number` | ✅ | Window length in ms. Required (`> 0`) whenever `velocityCap > 0`. |
| `approvedMerchants` | `string[]` | ✅ | Allowlist of settlement destinations, as **addresses** — not display names |
| `expiryMs` | `number` | ✅ | Duration until expiry in ms |

---

### `EdgePass.fromTemplate(template, overrides)` → `EdgePassConfig`

```typescript
const config = EdgePass.fromTemplate('festival', {
  approvedMerchants: ['0xshuttle...', '0xhydrabar...'],
  agent: agentAddress,
});
const pass = await sdk.create(config, signer);
```

---

### `sdk.execute(pass, request, signer)` → `Promise<TransactionOutcome>`

Execute a transaction against an EdgePass. Requires `EdgePassObjectV2` — v1 passes are read-only, so narrow with `isV2()` first if `pass` came from `sdk.fetch()`. Blocked and escalated decisions are validated locally — they never touch the chain, unless `onChainDenials` is enabled (default `true`), in which case a `blocked` outcome is submitted as an aborting transaction so the refusal itself carries a verifiable `digest`/`abortCode`.

```typescript
const outcome = await sdk.execute(pass, {
  merchant: '0xshuttle...',
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
    console.log('blocked:', outcome.reason, outcome.digest, outcome.abortCode);
    break;
  case 'error':
    console.error('infrastructure failure:', outcome.reason);
    break;
}
```

---

### `sdk.validate(pass, request)` → `PolicyValidation`

Preview a single transaction outcome. Zero network calls. Sub-millisecond. Also requires `EdgePassObjectV2`.

```typescript
const preview = sdk.validate(pass, { merchant, amount });
if (!preview.allowed)           return showBlockedUI(preview.reason);
if (preview.requiresEscalation) return showEscalationUI(preview.reason);
const outcome = await sdk.execute(pass, request, signer);
```

---

### `sdk.fetch(objectId)` → `Promise<EdgePassObject | null>`

Fetch a live EdgePass from the Sui network — v1 or v2, whichever the object ID points to. Narrow before doing anything version-specific:

```typescript
import { isV2 } from '@edge-protocol/sdk';

const pass = await sdk.fetch('0x4e2f...8b91');
if (!pass) { console.log('not found'); return; }
if (!isV2(pass)) { console.log('v1 pass — read-only, cannot execute/validate'); return; }
const outcome = await sdk.execute(pass, request, signer); // pass is narrowed to EdgePassObjectV2 here
```

---

### `sdk.revoke(pass, signer)` → `Promise<{ digest: string }>`

Revoke an EdgePass on-chain. Works on either version — v1's `revoke_pass` takes no `Clock`, v2's does; the SDK picks the right call for you.

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
  { merchant: '0xshuttle...',     amount: 45n * MIST_PER_SUI, merchantLabel: 'Shuttle Express' },
  { merchant: '0xfestival...',    amount: 22n * MIST_PER_SUI, merchantLabel: 'Festival Kitchen' },
  { merchant: '0xshadytokens...', amount: 1n,                 merchantLabel: 'ShadyTokens.xyz — not approved' },
  { merchant: '0xstageaccess...', amount: 220n * MIST_PER_SUI, merchantLabel: 'Stage Access VIP' },
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

### `sdk.velocityStatus(pass)` → `VelocityStatus`

v2 only. Accounts for a window roll that would happen if checked "now" — mirrors the roll-forward-before-testing-rate logic in `execute_transaction`.

```typescript
const velocity = sdk.velocityStatus(pass);
// { cap: 20, used: 6, remaining: 14, windowMs: 3_600_000, windowResetsAt: ..., isExhausted: false, isUnlimited: false }

if (velocity.isExhausted) console.log(`Rate limited until ${new Date(velocity.windowResetsAt)}`);
```

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
  merchant: '0xhydrabar...',
  merchantLabel: 'Hydra Bar',
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

Each template also ships a `velocityCap` / `velocityWindowMs` default — see [`constants.ts`](src/utils/constants.ts) for the exact rate limits.

| Template | Budget | Escalate ≥ | Max/tx | Expiry |
|----------|--------|------------|--------|--------|
| `festival` | 300 SUI | 50 SUI | 200 SUI | 48h |
| `gaming` | 50 SUI | 2 SUI | 10 SUI | 4h |
| `subscription` | 200 SUI | 20 SUI | 50 SUI | 30d |
| `defi` | 10,000 SUI | 500 SUI | 2,000 SUI | 7d |
| `enterprise` | 50,000 SUI | 1,000 SUI | 10,000 SUI | 30d |
| `x402` | 1,000 SUI | 10 SUI | 200 SUI | 24h |

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

Requires `EdgePassObjectV2` — this is the v2-only decision engine `sdk.validate()`/`sdk.execute()` delegate to.

**Validation rules (in order — matches the Move contract's assertion order in `execute_transaction`, except escalation, which the contract doesn't know about):**
1. Pass must be active
2. Pass must not be expired
3. Merchant must be in `approvedMerchants`
4. Amount must not exceed `maxPerTransaction` — hard block, not escalation
5. Must be within the velocity window (`velocityCap` / `velocityWindowMs`) — skipped entirely when `velocityCap` is `0`
6. Amount must not exceed remaining budget (`budget - spent`)
7. If amount > `escalateAbove` → escalate (off-chain routing only — the contract doesn't check this)
8. Otherwise → auto-approve

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
  EdgePassObject,     // = EdgePassObjectV1 | EdgePassObjectV2
  EdgePassObjectV1,
  EdgePassObjectV2,
  TransactionRequest,
  TransactionOutcome,
  PolicyValidation,
  SimulatedDecision,
  SimulationResult,
  BudgetStatus,
  VelocityStatus,
  DenialReason,
  Network,
  EdgeSDKConfig,
} from '@edge-protocol/sdk';
import { isV1, isV2, ABORT_CODES } from '@edge-protocol/sdk';
```

### `EdgePassConfig`

The only version `sdk.create()` accepts — there is no v1 creation path anymore.

```typescript
interface EdgePassConfig {
  agent:             string;   // spends — cannot revoke, cannot change anything
  issuer?:           string;   // SDK-side bookkeeping only — never sent on-chain;
                                // the real issuer is always create_pass's sender
  budget:            bigint;
  escalateAbove:     bigint;   // off-chain escalation routing — NOT enforced on chain
  maxPerTransaction: bigint;   // hard ceiling — enforced on chain
  velocityCap:       number;   // max actions per window; 0 = unlimited
  velocityWindowMs:  number;   // required (>0) whenever velocityCap > 0
  approvedMerchants: string[]; // addresses, not display names
  expiryMs:          number;
}
```

### `EdgePassObject` — discriminated union on `version`

v1 objects are read-only (fetch, inspect, revoke) and keep their original owner-based shape. v2 objects are flattened — no nested `config` — and carry the issuer/agent split and velocity fields.

```typescript
interface EdgePassObjectV1 {
  version:            'v1';
  id:                 string;
  owner:              string;
  budget:             bigint;
  autoThreshold:      bigint;   // dead even in v1 — never enforced, display-only
  escalateThreshold:  bigint;   // the field that actually drove escalation in v1
  maxPerTransaction?: bigint;
  approvedMerchants:  string[];
  spent:              bigint;
  active:             boolean;
  createdAt:          number;
  expiresAt:          number;
}

interface EdgePassObjectV2 {
  version:              'v2';
  id:                   string;
  initialSharedVersion: string;  // fixed at share_object time, cached forever —
                                  // required to build tx.sharedObjectRef() for
                                  // execute()/revoke(); see "Critical Architecture
                                  // Notes" in HANDOFF.md for why tx.object(pass.id)
                                  // isn't safe to use instead
  issuer:             string;   // grants/revokes, may not spend
  agent:              string;   // spends, may not revoke or change anything
  budget:             bigint;
  escalateAbove:      bigint;   // NOT enforced on chain — see EdgePassConfig above
  maxPerTransaction:  bigint;   // enforced on chain
  velocityCap:        number;
  velocityUsed:       number;
  windowMs:           number;
  windowStartMs:      number;
  approvedMerchants:  string[];
  spent:              bigint;
  active:             boolean;
  createdAt:          number;
  expiresAt:          number;
}

type EdgePassObject = EdgePassObjectV1 | EdgePassObjectV2;

function isV1(pass: EdgePassObject): pass is EdgePassObjectV1;
function isV2(pass: EdgePassObject): pass is EdgePassObjectV2;
```

`sdk.validate()` and `sdk.execute()` require `EdgePassObjectV2` specifically — narrow with `isV2()` after `sdk.fetch()`, which can return either version.

### `TransactionRequest`

```typescript
interface TransactionRequest {
  merchant:       string;
  amount:         bigint;
  merchantLabel?: string;                  // display only — not enforced; approvedMerchants are addresses
  metadata?:      Record<string, string>;
}
```

### `TransactionOutcome`

```typescript
type TransactionOutcome =
  | { status: 'approved';  digest: string; objectId?: string; auto: true  }
  | { status: 'escalated'; reason: string;                    auto: false } // terminal — see note below
  | { status: 'blocked';   reason: string; digest?: string; abortCode?: number; auto: false }
  | { status: 'error';     reason: string; code?: string;     auto: false };
```

`escalated` has no `digest` field by design — it's a terminal state in 2.0.0, not a pending one. There is no resolve-after-approval call that turns an `escalated` outcome into an `approved` one; a resolve path is planned for 2.1. See [Transaction Outcomes](#transaction-outcomes) above.

`digest`/`abortCode` on `blocked` are only present when `onChainDenials` is enabled (default `true`) and the denial was actually recorded as an aborted transaction — see [Move Contract](#move-contract) for how `abortCode` maps to `ABORT_CODES`.

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

### `VelocityStatus`

Returned by `sdk.velocityStatus(pass)` / `PolicyEngine.velocityStatus(pass)`. `cap === 0` means unlimited — `isUnlimited` is `true` and the usage fields are meaningless.

```typescript
interface VelocityStatus {
  cap:            number;
  used:           number;
  remaining:      number;
  windowMs:       number;
  windowResetsAt: number;
  isExhausted:    boolean;
  isUnlimited:    boolean;
}
```

### `DenialReason` / `ABORT_CODES`

`abortCode` on a `blocked` `TransactionOutcome` is one of these — must match `navis::edge_pass_v2`'s error constants exactly.

```typescript
const ABORT_CODES = {
  EPassInactive:             1,
  EPassExpired:              2,
  EMerchantNotApproved:      3,
  EBudgetExceeded:           4,
  EVelocityExceeded:         5,
  EExceedsMaxPerTransaction: 6,
  ENotAgent:                 7,
  ENotIssuer:                8,
  EInvalidConfig:            9,
} as const;

type DenialReason = keyof typeof ABORT_CODES;
```

---

## Constants

```typescript
import {
  MIST_PER_SUI,      // 1_000_000_000n
  NETWORK_URLS,      // { mainnet, testnet, devnet }
  EDGE_PACKAGE_ID,   // { mainnet: { v1, v2 }, testnet: { v1, v2 }, devnet: { v1, v2 } }
                     // — an empty string means "not deployed there yet"; e.g.
                     //   mainnet.v2 is '' because v2 is testnet-only for now.
  EDGE_TEMPLATES,    // all 6 templates
  DEFAULT_GAS_BUDGET // 10_000_000n
} from '@edge-protocol/sdk';
```

---

## Integration Examples

Merchant addresses below (`0xshuttle...` etc.) are placeholders — `approvedMerchants` takes real Sui addresses, not display names. Keep human-readable labels off chain; use `TransactionRequest.merchantLabel` for UI display only.

### AI Agent with Claude

```typescript
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';
import Anthropic from '@anthropic-ai/sdk';

const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: KEY });
const pass = await sdk.create(
  EdgePass.fromTemplate('festival', {
    approvedMerchants: ['0xshuttle...', '0xhydrabar...', '0xstageaccess...'],
    agent: agentAddress,
    issuer: userAddress,
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
    approvedMerchants: ['0xdeepbook...', '0xcetus...', '0xturbos...'],
    budget: 5_000n * MIST_PER_SUI,
    agent: agentAddress,
    issuer: userAddress,
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
    approvedMerchants: ['0xvendora...', '0xvendorb...'],
    budget:            100_000n * MIST_PER_SUI,
    escalateAbove:      10_000n * MIST_PER_SUI,
    maxPerTransaction:  25_000n * MIST_PER_SUI,
    agent:              treasuryBotAddress,
    issuer:             cfoAddress,
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

| Reason | Cause | `abortCode` (`ABORT_CODES`) |
|--------|-------|------|
| `EdgePass is inactive` | Pass was revoked | `EPassInactive` (1) |
| `EdgePass has expired` | `expiresAt` passed | `EPassExpired` (2) |
| `Merchant "X" is not approved` | Not in allowlist | `EMerchantNotApproved` (3) |
| `Amount exceeds per-transaction limit of N MIST` | Amount > `maxPerTransaction` | `EExceedsMaxPerTransaction` (6) |
| `Velocity cap of N actions per Nms window exceeded` | Rate limit hit | `EVelocityExceeded` (5) |
| `Insufficient budget. Remaining: N MIST` | Remaining < amount | `EBudgetExceeded` (4) |

`Amount exceeds auto threshold` is **not** in this table — that's `requiresEscalation: true` from `sdk.validate()`, not a block. Escalation is off-chain routing; the contract has no assertion for it and never aborts because of it. The `abortCode` column only applies when `onChainDenials` is enabled and the denial actually reached the chain — see [`TransactionOutcome`](#transactionoutcome).

---

## Architecture

```
Issuer creates EdgePass (once) — grants a mandate to an agent
         │
         ▼
Agent calls sdk.execute() — many times, autonomously
         │
         ├─▶ PolicyEngine.validate()
         │         Pure TypeScript · no network · <1ms
         │         8 rules checked in order (see PolicyEngine.validate above)
         │         blocked/escalated never touch Sui — unless onChainDenials
         │         records the denial as an aborted tx (default: on)
         │
         ├─▶ ExecutionEngine.buildPTB()
         │         Programmable Transaction Block
         │         validate → execute → update spent/velocity → emit event
         │         atomic — any failure reverts everything
         │
         └─▶ Walrus audit receipt
                   immutable · decentralized · permanent
```

### Why PTBs matter

The policy check and spend update happen in one atomic block. If any step fails, everything reverts. No partial state. No race conditions.

### Why the object model matters

As of v2, the EdgePass is a **shared** object, not an owned one — rights are expressed through `issuer`/`agent` fields and sender assertions rather than object ownership. This is what lets a human issue a mandate while a *different* key (the agent) spends against it. Neither the agent nor the issuer can widen scope after minting — there's deliberately no `add_merchant`, only `remove_merchant` (issuer-only). No admin key, no contract upgrade can change that.

---

## Move Contract

```
Package:  0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde
Network:  Sui Mainnet ✅
Module:   navis::edge_pass_v2   (navis::edge_pass — v1, read-only going forward)
```

[View on Sui Explorer →](https://suiscan.xyz/mainnet/object/0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde)

### Contract functions

Field names on chain are the Move struct's own — note `auto_threshold` is still the on-chain name for what the SDK exposes as `escalateAbove` (`ExecutionEngine.fetchPass()` does that mapping for you; you only see the raw name if you read the object directly via a Sui explorer or RPC call).

```move
public fun create_pass(
  agent: address, budget: u64, auto_threshold: u64, max_per_transaction: u64,
  velocity_cap: u64, window_ms: u64, approved_merchants: vector<address>,
  expiry_ms: u64, clock: &Clock, ctx: &mut TxContext,
)
// issuer = ctx.sender() — never passed as an argument

public fun execute_transaction(
  pass: &mut EdgePassV2, amount: u64, merchant: address,
  clock: &Clock, ctx: &TxContext,
)
// aborts unless ctx.sender() == pass.agent

public fun revoke_pass(pass: &mut EdgePassV2, clock: &Clock, ctx: &TxContext)
// aborts unless ctx.sender() == pass.issuer — deactivates, does not destroy;
// the object persists as an audit record and every subsequent check fails

public fun remove_merchant(pass: &mut EdgePassV2, merchant: address, ctx: &TxContext)
// issuer-only. There is deliberately no add_merchant — scope can only narrow.
```

v1's `navis::edge_pass::revoke_pass(pass: &mut EdgePass, ctx: &mut TxContext)` still exists on chain (no `Clock` argument) — `sdk.revoke()` picks the right one for you based on `pass.version`.

### On-chain enforcement

Six assertions run inside the Move VM on every `execute_transaction`, in this order:

```move
assert!(pass.active, EPassInactive);
assert!(now <= pass.expires_at_ms, EPassExpired);
assert!(ctx.sender() == pass.agent, ENotAgent);
assert!(pass.approved_merchants.contains(&merchant), EMerchantNotApproved);
assert!(amount <= pass.max_per_transaction, EExceedsMaxPerTransaction);
assert!(pass.velocity_used + 1 <= pass.velocity_cap, EVelocityExceeded); // skipped when velocity_cap == 0
assert!(pass.spent + amount <= pass.budget, EBudgetExceeded);
```

Plus `EInvalidConfig` checks in `create_pass` (budget/max/merchants/expiry/velocity sanity) and `ENotIssuer` in `revoke_pass`/`remove_merchant`. `escalateAbove`/`auto_threshold` is not in this list on purpose — escalation is a routing decision the SDK makes, not something the contract can refuse. A compromised agent cannot bypass any of the above. The chain is the trust boundary.

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
- `approvedMerchants` already requires Sui addresses, not display name strings — enforced by the type, not just convention
- Keep ephemeral zkLogin keys in memory only — never persist to localStorage
- Fetch EdgePass state from chain before critical operations
- If you rely on `blocked` outcomes being provable to a third party, enable `onChainDenials` (the default) and check `outcome.digest`/`outcome.abortCode`

### Shipped in EdgePassV2

The previous version of this doc listed these as future work — they're implemented now:

- ✅ Rolling velocity windows — `velocityCap` / `velocityWindowMs`, enforced on chain (`EVelocityExceeded`)
- ✅ Merchant address verification — `approvedMerchants` is `address[]`, not `String[]`
- ✅ Rate limiting to prevent rapid budget drain — same velocity mechanism above
- ✅ Issuer/agent separation — a compromised agent key can spend but not revoke or reconfigure; a leaked issuer key can revoke but not spend
- ⬜ On-chain policy signatures — still not implemented

---

## Testing

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

*The best infrastructure is invisible.*

Built for Sui Overflow 2026 · MIT License

[npm](https://npmjs.com/package/@edge-protocol/sdk) · [GitHub](https://github.com/fluturecode/edge) · [Live Demo](https://edge-web-cyan.vercel.app)
