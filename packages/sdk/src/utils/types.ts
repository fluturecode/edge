export interface EdgePassConfig {
  budget:             bigint;
  autoThreshold:      bigint;
  escalateThreshold:  bigint;
  maxPerTransaction?: bigint;
  approvedMerchants:  string[];
  expiryMs:           number;
  owner:              string;
}

export interface EdgePassObject {
  id:        string;
  config:    EdgePassConfig;
  spent:     bigint;
  active:    boolean;
  createdAt: number;
  expiresAt: number;
}

export interface TransactionRequest {
  merchant:  string;
  amount:    bigint;
  metadata?: Record<string, string>;
}

/**
 * TransactionOutcome — returned by sdk.execute()
 *
 * approved  — transaction executed on-chain successfully
 * escalated — transaction exceeds threshold, needs human approval
 * blocked   — transaction rejected by policy
 * error     — network or signing failure — transaction was NOT submitted to chain
 */
export type TransactionOutcome =
  | { status: 'approved';  digest: string; objectId?: string; auto: true  }
  | { status: 'escalated'; reason: string;                    auto: false }
  | { status: 'blocked';   reason: string;                    auto: false }
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

export type Network = 'mainnet' | 'testnet' | 'devnet';

export interface EdgeSDKConfig {
  network:         Network;
  enokiApiKey:     string;
  googleClientId?: string;
}
