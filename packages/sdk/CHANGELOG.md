# Changelog

All notable changes to `@edge-protocol/sdk` are documented here.

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
