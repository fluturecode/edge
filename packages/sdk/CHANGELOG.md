# Changelog

All notable changes to `@edge-protocol/sdk` are documented here.

---

## [2.0.0] — 2026-08-19

### Breaking

- **EdgePassV2 is the only creation path.** `sdk.create()` only ever mints v2 passes now. v1 passes remain fetchable, inspectable, and revocable, but there is no way to create one anymore.
- **`EdgePassObjectV2` is flattened — no more nested `.config`.** v1's `pass.config.budget` is now just `pass.budget`.
- **Issuer/agent separation.** The pass is a *shared* Move object (`transfer::share_object`), not owned. An `issuer` grants and revokes but cannot spend; an `agent` spends but cannot revoke or reconfigure anything. `issuer` is SDK-side bookkeeping only — never sent as a transaction argument, the real on-chain issuer is always `create_pass`'s sender.
- **`autoThreshold` → `escalateAbove` is a naming inversion, not a rename.** v1's `escalateThreshold` (the field that actually drove escalation) is gone; `escalateAbove` is the new live field, and it is **not enforced on chain** — it's off-chain routing to a human. `sdk.create()` now throws if a config carries a stray v1 `escalateThreshold`/`autoThreshold` key, specifically to catch silent-failure ports from v1.
- **`maxPerTransaction` is now required and hard-enforced on chain** — it used to be optional and advisory in v1. An amount above it is `blocked`, never `escalated`, and this can't be bypassed by a compromised SDK.
- **`approvedMerchants` moved from display names to addresses.** v1 allowed human-readable strings; v2's Move contract stores `vector<address>`. Use the new `TransactionRequest.merchantLabel` for display strings instead.
- **`sdk.validate()` and `sdk.execute()` now require `EdgePassObjectV2` specifically**, not the `EdgePassObject` union. `sdk.fetch()` still returns either version — narrow with `isV2()` first.
- **New required fields with no v1 equivalent:** `velocityCap` / `velocityWindowMs` — a rolling rate limit enforced on chain (`EVelocityExceeded`). Set `velocityCap: 0` for "unlimited, same as v1's un-rate-limited behavior."

See `DOCS.md` → "v1 → v2 Migration Notes" for the full trap list and the recommended mapping if you're porting an existing v1 integration.

### Added

- **On-chain denials.** A `blocked` outcome can now be recorded as an aborted transaction (`onChainDenials`, default `true`), so the refusal itself is independently verifiable on Suiscan via `outcome.digest`/`outcome.abortCode` — not just a client-side claim.
- **`initialSharedVersion` on `EdgePassObjectV2`.** Required to build a `tx.sharedObjectRef()` reference for `execute()`/`revoke()`; fetched once in `fetchPass()` and cached for the object's lifetime.
- **`ABORT_CODES` / `DenialReason`** — typed Move abort codes (`EPassInactive`, `EPassExpired`, `EMerchantNotApproved`, `EBudgetExceeded`, `EVelocityExceeded`, `EExceedsMaxPerTransaction`, `ENotAgent`, `ENotIssuer`, `EInvalidConfig`).
- **`EDGE_PACKAGE_ID` restructured to `{ v1, v2 }` per network** — v1 and v2 are separate package deployments; `create()`/`execute()` no longer assume a single package per network.

### Fixed

- **On-chain denials were silently never reaching the chain.** Migrating the transport from `@mysten/sui`'s JSON-RPC client (`SuiJsonRpcClient`) to its gRPC client (`SuiGrpcClient`) introduced a client-side pre-flight `simulateTransaction` inside `Transaction.build()`, which fires whenever an object argument needs client-side resolution, or gas price, or gas payment isn't already fully set. If that pre-flight predicted a Move abort, `build()` threw a `SimulationError` **instead of** submitting — so every denial `onChainDenials` was trying to record on-chain never reached it. `extractAbortInfo()`'s regex still matched the thrown error's message, so a `blocked` outcome came back with a real-looking `abortCode` while `digest` was silently `undefined`. Three independent triggers, fixed together:
  - Object argument: `execute()`/`revoke()` now build the pass reference with `tx.sharedObjectRef({ objectId, initialSharedVersion, mutable })` instead of `tx.object(pass.id)` — no client-side resolution needed.
  - Gas payment / gas price: `ExecutionEngine.buildPTB()` deliberately still only sets `gasBudget` — resolving payment/price is the signer's job (it requires knowing which address is actually paying, e.g. a direct wallet vs. a sponsor like Enoki). Any signer wanting a real on-chain denial must call `tx.setGasPrice(...)` and `tx.setGasPayment([...])` itself before submitting.
  - `extractAbortInfo()` is now a discriminated union on `reachedChain` (`true` → real `digest`, usable as a `blocked` outcome; `false` → only a `predictedAbortCode` for diagnostics) — a `blocked` outcome is now structurally impossible to build without a real digest, and a `SimulationError` downgrades to `status: 'error'` instead of a fabricated-looking denial.
- **`sdk.fetch()` read-after-write staleness.** A fetch immediately following the SDK's own `create()`/`execute()`/`revoke()` write could race a fullnode that hadn't applied that write yet, returning stale pre-transaction state. `fetchPass()` now tracks the digest of the engine's own last write per object and waits for that specific transaction's effects to be visible before reading it — one-shot, so later fetches of the same object don't keep re-waiting.
- **`test.ts`'s async runner.** The runner never awaited async test functions, so all 7 event-system tests (and 2 new `create()`-validation tests) were reporting "passed" without their assertions ever running. Runner is now properly async — 39/39 genuinely verified.

### Verified

- Live e2e run against Sui testnet (`packages/sdk/src/e2e.testnet.ts`, not the Move test suite, not mocks) exercising `create()` → one approved `execute()` → `fetch()` (read-after-write check) → three back-to-back on-chain denials (merchant not approved, exceeds max per transaction, budget exceeded), zero artificial delay between calls. See the README for the resulting testnet package ID and one digest per outcome, each independently checkable on Suiscan.

### Known Limitations

- **Escalation is notify-only.** `execute()` returns `escalated` as a terminal state — nothing is submitted to chain, and there is no path to actually execute the transaction after a human approves it. Calling `execute()` again with the same request just returns `escalated` a second time. Not a 2.0.0 regression — this was never implemented in 1.x either. A resolve-after-approval path is planned for 2.1; whether approval should be asserted (a flag the caller sets) or proven (e.g. a signed approval) is a security-sensitive API decision that needs its own design rather than a rushed addition here.

---

## [1.0.0] — 2026-07-01

Enterprise hardening release. No breaking changes to the public `EdgePass`/`PolicyEngine` API surface from `[0.8.0]`.

### Added

- **`@mysten/sui` upgraded to v2.20.1** — `SuiClient` → `SuiJsonRpcClient` (`@mysten/sui/jsonRpc`); `@mysten/zklogin` dropped as a separate dependency, now bundled natively in `@mysten/sui/zklogin`.
- **`@mysten/walrus` v1.2.3** — unlocks real, decentralized on-chain audit storage.
- **`WalrusAudit`** — immutable, content-addressed audit logs written directly to Walrus mainnet, with a Walrus blob ID per write.
- **`IdempotencyRegistry` + `createWithFireblocks()`** — hardened replacement for `withFireblocks()`. Two-phase commit: if Fireblocks settlement times out after Sui approves, retry with the same `idempotencyKey` with no double-spend and no lost transactions.
- **`ComplianceEngine`** — the 6th governance dimension. AML / sanctions / risk screening between Edge approval and settlement, with pluggable providers (Fireblocks native, Chainalysis, or custom).
- **`DynamicIdentityBinding`** — binds an EdgePass to a Dynamic enterprise identity via JWT verification, so an intercepted pass can't be used outside its authorized session.
- **`withFireblocks()` HOF** — wraps any async settlement call with EdgePass policy enforcement, plus a Fireblocks settlement card in the demo app. (Superseded within this same release by `createWithFireblocks()` above — kept for non-idempotent call sites.)
- **`x402` template** — `EDGE_TEMPLATES.x402`, alongside integration docs for pairing Edge (policy layer) with x402 (payment rail).

---

## [0.8.0] — 2026-06-20

### Added

- **`sdk.simulate(pass, requests[])`** — predict outcomes for a sequence of transactions without executing. Zero network calls. Returns `SimulationResult` with approved, blocked, and escalated decisions plus projected budget state after each step. Use to show agents their plan before touching the chain.

- **`sdk.budgetStatus(pass)`** — returns a complete `BudgetStatus` snapshot: spent, remaining, utilization percentage, `isNearLimit`, `isExhausted`.

- **`sdk.utilizationPct(pass)`** — budget utilization as 0-100 number. Use for progress bars and budget warnings.

- **`sdk.isNearLimit(pass, threshold?)`** — returns true if utilization exceeds threshold (default 80%). Use to warn agents before they exhaust budget.

- **`sdk.timeRemaining(pass)`** — milliseconds until pass expires. Returns 0 if expired.

- **`sdk.isExpiringSoon(pass, withinMs?)`** — returns true if pass expires within the given window (default 1 hour).

- **`EdgePass.withPolicy(pass, signer, sdk, fn)`** — higher-order function that wraps any async tool call with EdgePass policy enforcement. The wrapped function only executes if the transaction is approved. Perfect for Vercel AI SDK / Mastra tool definitions.

- **New types exported:** `SimulatedDecision`, `SimulationResult`, `BudgetStatus`

### Changed

- `PolicyEngine.simulate()` is now a static method on `PolicyEngine` and also exposed as `sdk.simulate()` on the `EdgePass` class for convenience.
- All budget and time helpers are now available both as static `PolicyEngine` methods and instance `sdk` methods.

---

## [0.7.1] — 2026-06-19

### Fixed

- Reverted `tx.objectRef()` optimization from v0.7.0. While theoretically faster, storing object version at fetch time caused version conflicts when Enoki gas sponsorship updated the object between fetch and execution. `tx.object(pass.id)` resolves version at signing time which is the correct and safe pattern.

---

## [0.7.0] — 2026-06-19 — YANKED

Version yanked due to object version conflict regression. Use 0.7.1 instead.

---

## [0.6.6] — 2026-06-18

### Changed

- Updated README with mainnet contract address and live transaction digests
- Stronger competitive positioning and security model documentation

---

## [0.6.0] — 2026-06-17

### Added

- **Error status as a distinct fourth outcome** — infrastructure failures (`status: 'error'`) are now clearly distinguished from policy rejections (`status: 'blocked'`). A network failure no longer pretends to be a policy decision.
- **`classifyError()`** — internal error classifier that maps RPC/network/signing errors to typed `EdgeErrorCode` values for programmatic handling.
- **`fetchPass()` validation** — validates objectId format before hitting the RPC. Throws with a clear message for malformed IDs rather than a cryptic RPC error.
- **Config validation on `create()`** — prevents impossible EdgePass configurations (e.g. autoThreshold >= escalateThreshold) at creation time rather than at execution time.

---

## [0.5.0] — 2026-06-16

### Added

- **Events system** — `sdk.on('approved')`, `sdk.on('escalated')`, `sdk.on('blocked')`. React to transaction outcomes without polling. Chain-able.
- `sdk.off()` and `sdk.removeAllListeners()` for cleanup.
- 34 comprehensive tests — PolicyEngine, fromTemplate, constants, events system.

### Changed

- Events fire for policy outcomes only (`approved`, `escalated`, `blocked`). Infrastructure errors (`status: 'error'`) do not fire events — check `outcome.status === 'error'` explicitly.

---

## [0.4.7] — 2026-06-15

### Added

- Comprehensive `DOCS.md` — full API reference, examples, types, architecture.
- `maxPerTransaction` field on `EdgePassConfig` — optional per-transaction cap independent of escalation threshold.

---

## [0.4.6] — 2026-06-14

### Added

- 27 comprehensive tests — PolicyEngine validation, `fromTemplate()`, constants.
- `EDGE_TEMPLATES` constants for festival, gaming, subscription, defi, enterprise.
- `EdgePass.fromTemplate()` static helper.

---

## [0.4.0] — 2026-06-13

### Added

- Initial public release.
- `EdgePass` class with `create()`, `execute()`, `validate()`, `fetch()`, `revoke()`.
- `PolicyEngine` with 7-rule validation chain.
- `ExecutionEngine` with on-chain PTB construction.
- Mainnet + testnet support.
- zkLogin compatible signer interface.
