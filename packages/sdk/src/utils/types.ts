// ── Config (v2 — the only creatable version) ────────────────────────────────
//
// v1 passes can still be fetched, inspected, and revoked (see EdgePassObjectV1
// below) but there is no v1 creation path in the SDK anymore — new passes are
// always v2.

export interface EdgePassConfig {
  /** Spends against the pass. Cannot revoke, cannot change anything. */
  agent: string;
  /**
   * Grants and revokes, cannot spend. On chain this is always the sender of
   * `create_pass` — this field is for SDK-side bookkeeping (templates,
   * display) only and is never sent as a transaction argument.
   */
  issuer?: string;
  budget: bigint;
  /** Off-chain escalation routing. NOT enforced on chain. */
  autoThreshold: bigint;
  /** Hard per-transaction ceiling. Enforced on chain. */
  maxPerTransaction: bigint;
  /**
   * Max actions per window. 0 means unlimited. A count, not a token amount —
   * despite being u64 on chain, kept as `number` here since it's always a
   * small integer.
   */
  velocityCap: number;
  /** Window length in ms. Required (>0) whenever velocityCap > 0. */
  velocityWindowMs: number;
  /** Settlement destinations, as addresses — not names. */
  approvedMerchants: string[];
  expiryMs: number;
}

// ── EdgePass object — discriminated union on `version` ──────────────────────
//
// Flattened: no nested `config`. v1 objects are read-only — fetch, inspect,
// revoke — and keep their original (owner-based, name-based) shape. v2 objects
// carry the issuer/agent split and velocity fields described in
// edge_pass_v2.move.

export interface EdgePassObjectV1 {
  version: 'v1';
  id: string;
  owner: string;
  budget: bigint;
  autoThreshold: bigint;
  escalateThreshold: bigint;
  maxPerTransaction?: bigint;
  approvedMerchants: string[];
  spent: bigint;
  active: boolean;
  createdAt: number;
  expiresAt: number;
}

export interface EdgePassObjectV2 {
  version: 'v2';
  id: string;
  /** Grants and revokes. May not spend. */
  issuer: string;
  /** Spends. May not revoke, may not change anything. */
  agent: string;
  budget: bigint;
  /** Off-chain escalation routing. NOT enforced on chain. */
  autoThreshold: bigint;
  /** Hard per-transaction ceiling. Enforced on chain. */
  maxPerTransaction: bigint;
  /**
   * Counts, not token amounts — despite being u64 on chain, kept as `number`
   * here since they're always small integers. Convert once at the parse
   * boundary (fetchPass), not on every read.
   */
  velocityCap: number;
  velocityUsed: number;
  windowMs: number;
  windowStartMs: number;
  approvedMerchants: string[];
  spent: bigint;
  active: boolean;
  createdAt: number;
  expiresAt: number;
}

export type EdgePassObject = EdgePassObjectV1 | EdgePassObjectV2;

export function isV1(pass: EdgePassObject): pass is EdgePassObjectV1 {
  return pass.version === 'v1';
}

export function isV2(pass: EdgePassObject): pass is EdgePassObjectV2 {
  return pass.version === 'v2';
}

export interface TransactionRequest {
  merchant:       string;
  amount:         bigint;
  /** Display only — not enforced. approvedMerchants are addresses, not names. */
  merchantLabel?: string;
  metadata?:      Record<string, string>;
}

// ── Abort codes ───────────────────────────────────────────────────────────────
//
// Must match navis::edge_pass_v2's error constants exactly.

export const ABORT_CODES = {
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

export type DenialReason = keyof typeof ABORT_CODES;

/**
 * TransactionOutcome — returned by sdk.execute()
 *
 * approved  — transaction executed on-chain successfully
 * escalated — transaction exceeds threshold, needs human approval
 * blocked   — transaction rejected by policy. Denials may be recorded on
 *             chain (see EdgeSDKConfig.onChainDenials), in which case
 *             `digest` and `abortCode` make the refusal independently
 *             verifiable.
 * error     — network or signing failure — transaction was NOT submitted to chain
 */
export type TransactionOutcome =
  | { status: 'approved';  digest: string; objectId?: string; auto: true  }
  | { status: 'escalated'; reason: string;                    auto: false }
  | { status: 'blocked';   reason: string; digest?: string; abortCode?: number; auto: false }
  | { status: 'error';     reason: string; code?: string;     auto: false };

export interface PolicyValidation {
  allowed:            boolean;
  requiresEscalation: boolean;
  reason:             string;
}

/**
 * SimulatedDecision — result of sdk.simulate() for a single request.
 * Includes the predicted outcome and the projected pass state after execution.
 */
export interface SimulatedDecision {
  request:            TransactionRequest;
  outcome:            'approved' | 'escalated' | 'blocked';
  reason:             string;
  projectedSpent:     bigint;  // pass.spent after this decision executes
  projectedRemaining: bigint;  // budget remaining after this decision
}

/**
 * SimulationResult — full plan returned by sdk.simulate()
 */
export interface SimulationResult {
  decisions:       SimulatedDecision[];
  approved:        SimulatedDecision[];
  blocked:         SimulatedDecision[];
  escalated:       SimulatedDecision[];
  totalSpend:      bigint;   // total of approved decisions only
  remainingBudget: bigint;   // projected remaining after all approved
  utilizationPct:  number;   // 0-100
  summary: {
    approvedCount:  number;
    blockedCount:   number;
    escalatedCount: number;
    totalDecisions: number;
  };
}

/**
 * BudgetStatus — snapshot of pass budget health
 */
export interface BudgetStatus {
  budget:         bigint;
  spent:          bigint;
  remaining:      bigint;
  utilizationPct: number;   // 0-100
  isNearLimit:    boolean;  // true if utilizationPct >= threshold (default 80)
  isExhausted:    boolean;  // true if remaining === 0n
}

/**
 * VelocityStatus — snapshot of pass velocity (rate-limit) health.
 * cap === 0n means unlimited — isUnlimited is true and the other fields
 * describing usage are meaningless.
 */
export interface VelocityStatus {
  cap:            number;
  used:           number;
  remaining:      number;
  windowMs:       number;
  windowResetsAt: number;
  isExhausted:    boolean;
  isUnlimited:    boolean;
}

export type Network = 'mainnet' | 'testnet' | 'devnet';

export interface EdgeSDKConfig {
  network:          Network;
  enokiApiKey:      string;
  googleClientId?:  string;
  /**
   * Whether denials (blocked transactions) are recorded on chain via an
   * aborted transaction, making the refusal independently verifiable.
   * Defaults to true.
   */
  onChainDenials?:  boolean;
}
