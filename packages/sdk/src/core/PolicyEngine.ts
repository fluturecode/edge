import {
  EdgePassObject,
  TransactionRequest,
  PolicyValidation,
  SimulatedDecision,
  SimulationResult,
  BudgetStatus,
} from '../utils/types';

export class PolicyEngine {

  /**
   * Validates a transaction request against an EdgePass policy.
   *
   * Rules (in order):
   * 1. Pass must be active
   * 2. Pass must not be expired
   * 3. Merchant must be in approved list
   * 4. Amount must not exceed remaining budget
   * 5. Amount must not exceed maxPerTransaction (if set)
   * 6. If amount > escalateThreshold → escalate
   * 7. If amount ≤ autoThreshold → auto-approve
   */
  static validate(
    pass: EdgePassObject,
    request: TransactionRequest
  ): PolicyValidation {

    // Rule 1 — pass must be active
    if (!pass.active) {
      return { allowed: false, requiresEscalation: false, reason: 'EdgePass is inactive' };
    }

    // Rule 2 — pass must not be expired
    if (Date.now() > pass.expiresAt) {
      return { allowed: false, requiresEscalation: false, reason: 'EdgePass has expired' };
    }

    // Rule 3 — merchant must be approved
    if (!pass.config.approvedMerchants.includes(request.merchant)) {
      return { allowed: false, requiresEscalation: false, reason: `Merchant "${request.merchant}" is not approved` };
    }

    // Rule 4 — must not exceed remaining budget
    const remaining = pass.config.budget - pass.spent;
    if (request.amount > remaining) {
      return { allowed: false, requiresEscalation: false, reason: `Insufficient budget. Remaining: ${remaining} MIST` };
    }

    // Rule 5 — must not exceed per-transaction limit (if set)
    if (pass.config.maxPerTransaction !== undefined && request.amount > pass.config.maxPerTransaction) {
      return { allowed: false, requiresEscalation: false, reason: `Amount exceeds per-transaction limit of ${pass.config.maxPerTransaction} MIST` };
    }

    // Rule 6 — escalate if above escalation threshold
    if (request.amount > pass.config.escalateThreshold) {
      return { allowed: true, requiresEscalation: true, reason: `Amount exceeds escalation threshold of ${pass.config.escalateThreshold} MIST` };
    }

    // Rule 7 — auto-approve
    return { allowed: true, requiresEscalation: false, reason: 'Auto-approved' };
  }

  /**
   * Simulate a sequence of transactions against an EdgePass.
   * Zero network calls. Returns predicted outcomes for all decisions
   * including projected budget state after each step.
   *
   * @example
   * const plan = sdk.simulate(pass, claudeDecisions);
   * console.log(plan.approved.length);   // decisions that will execute
   * console.log(plan.blocked.length);    // decisions that will be rejected
   * console.log(plan.utilizationPct);    // projected budget usage
   *
   * // Show plan to user, then execute approved decisions
   * for (const decision of plan.approved) {
   *   await sdk.execute(pass, decision.request, signer);
   * }
   */
  static simulate(
    pass: EdgePassObject,
    requests: TransactionRequest[]
  ): SimulationResult {
    const decisions: SimulatedDecision[] = [];
    let projectedSpent = pass.spent;

    for (const request of requests) {
      // Create a projected pass with current projected spent for validation
      const projectedPass: EdgePassObject = {
        ...pass,
        spent: projectedSpent,
      };

      const validation = PolicyEngine.validate(projectedPass, request);

      let outcome: 'approved' | 'escalated' | 'blocked';
      let nextSpent = projectedSpent;

      if (!validation.allowed) {
        outcome = 'blocked';
      } else if (validation.requiresEscalation) {
        outcome = 'escalated';
        // Escalated decisions don't spend budget until approved
      } else {
        outcome = 'approved';
        nextSpent = projectedSpent + request.amount;
      }

      const decision: SimulatedDecision = {
        request,
        outcome,
        reason: validation.reason,
        projectedSpent: nextSpent,
        projectedRemaining: pass.config.budget - nextSpent,
      };

      decisions.push(decision);
      projectedSpent = nextSpent;
    }

    const approved  = decisions.filter(d => d.outcome === 'approved');
    const blocked   = decisions.filter(d => d.outcome === 'blocked');
    const escalated = decisions.filter(d => d.outcome === 'escalated');
    const totalSpend = approved.reduce((sum, d) => sum + d.request.amount, 0n);
    const remainingBudget = pass.config.budget - pass.spent - totalSpend;
    const utilizationPct = Number((pass.spent + totalSpend) * 100n / pass.config.budget);

    return {
      decisions,
      approved,
      blocked,
      escalated,
      totalSpend,
      remainingBudget,
      utilizationPct,
      summary: {
        approvedCount:  approved.length,
        blockedCount:   blocked.length,
        escalatedCount: escalated.length,
        totalDecisions: decisions.length,
      },
    };
  }

  /**
   * Returns true if the pass is active and not expired.
   */
  static isValid(pass: EdgePassObject): boolean {
    return pass.active && Date.now() <= pass.expiresAt;
  }

  /**
   * Returns the remaining budget in MIST.
   */
  static remainingBudget(pass: EdgePassObject): bigint {
    return pass.config.budget - pass.spent;
  }

  /**
   * Returns budget utilization as a percentage (0-100).
   *
   * @example
   * const pct = sdk.utilizationPct(pass);
   * if (pct > 80) warnUser('Running low on budget');
   */
  static utilizationPct(pass: EdgePassObject): number {
    if (pass.config.budget === 0n) return 0;
    return Number(pass.spent * 100n / pass.config.budget);
  }

  /**
   * Returns true if budget utilization exceeds the given threshold.
   * Default threshold is 80%.
   *
   * @example
   * if (sdk.isNearLimit(pass)) notifyUser('Budget nearly exhausted');
   * if (sdk.isNearLimit(pass, 0.5)) notifyUser('Halfway through budget');
   */
  static isNearLimit(pass: EdgePassObject, threshold = 0.8): boolean {
    return PolicyEngine.utilizationPct(pass) >= threshold * 100;
  }

  /**
   * Returns a complete budget status snapshot.
   *
   * @example
   * const status = sdk.budgetStatus(pass);
   * if (status.isExhausted) stopAgent();
   * if (status.isNearLimit) notifyUser(`${status.utilizationPct}% spent`);
   */
  static budgetStatus(pass: EdgePassObject, nearLimitThreshold = 0.8): BudgetStatus {
    const remaining = pass.config.budget - pass.spent;
    const utilizationPct = PolicyEngine.utilizationPct(pass);
    return {
      budget:         pass.config.budget,
      spent:          pass.spent,
      remaining,
      utilizationPct,
      isNearLimit:    utilizationPct >= nearLimitThreshold * 100,
      isExhausted:    remaining === 0n,
    };
  }

  /**
   * Returns the time remaining on the pass in milliseconds.
   * Returns 0 if expired.
   */
  static timeRemaining(pass: EdgePassObject): number {
    return Math.max(0, pass.expiresAt - Date.now());
  }

  /**
   * Returns true if the pass will expire within the given window.
   * Default window is 1 hour.
   *
   * @example
   * if (sdk.isExpiringSoon(pass)) notifyUser('Pass expires in less than 1 hour');
   */
  static isExpiringSoon(pass: EdgePassObject, withinMs = 60 * 60 * 1000): boolean {
    const remaining = PolicyEngine.timeRemaining(pass);
    return remaining > 0 && remaining <= withinMs;
  }
}
