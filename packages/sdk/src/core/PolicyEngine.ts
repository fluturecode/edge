import {
  EdgePassObject,
  EdgePassObjectV2,
  TransactionRequest,
  PolicyValidation,
  SimulatedDecision,
  SimulationResult,
  BudgetStatus,
  VelocityStatus,
} from '../utils/types';

// Spending decisions (validate / simulate / velocity) only apply to v2 passes
// — v1 is read-only (fetch, inspect, revoke). Inspection helpers that only
// touch fields common to both versions (budget, spent, active, expiry) still
// accept EdgePassObject so callers can use them on either version.

export class PolicyEngine {

  static validate(
    pass: EdgePassObjectV2,
    request: TransactionRequest
  ): PolicyValidation {

    if (!pass.active) {
      return { allowed: false, requiresEscalation: false, reason: 'EdgePass is inactive' };
    }

    if (Date.now() > pass.expiresAt) {
      return { allowed: false, requiresEscalation: false, reason: 'EdgePass has expired' };
    }

    if (!pass.approvedMerchants.includes(request.merchant)) {
      return { allowed: false, requiresEscalation: false, reason: `Merchant "${request.merchant}" is not approved` };
    }

    if (request.amount > pass.maxPerTransaction) {
      return { allowed: false, requiresEscalation: false, reason: `Amount exceeds per-transaction limit of ${pass.maxPerTransaction} MIST` };
    }

    const velocity = PolicyEngine.velocityStatus(pass);
    if (velocity.isExhausted) {
      return { allowed: false, requiresEscalation: false, reason: `Velocity cap of ${velocity.cap} actions per ${velocity.windowMs}ms window exceeded` };
    }

    const remaining = pass.budget - pass.spent;
    if (request.amount > remaining) {
      return { allowed: false, requiresEscalation: false, reason: `Insufficient budget. Remaining: ${remaining} MIST` };
    }

    if (request.amount > pass.autoThreshold) {
      return { allowed: true, requiresEscalation: true, reason: `Amount exceeds auto threshold of ${pass.autoThreshold} MIST` };
    }

    return { allowed: true, requiresEscalation: false, reason: 'Auto-approved' };
  }

  static simulate(
    pass: EdgePassObjectV2,
    requests: TransactionRequest[]
  ): SimulationResult {
    const decisions: SimulatedDecision[] = [];
    let projectedSpent = pass.spent;
    let projectedVelocityUsed: number = pass.velocityUsed;

    for (const request of requests) {
      const projectedPass: EdgePassObjectV2 = {
        ...pass,
        spent:        projectedSpent,
        velocityUsed: projectedVelocityUsed,
      };

      const validation = PolicyEngine.validate(projectedPass, request);

      let outcome: 'approved' | 'escalated' | 'blocked';
      let nextSpent = projectedSpent;
      let nextVelocityUsed = projectedVelocityUsed;

      if (!validation.allowed) {
        outcome = 'blocked';
      } else if (validation.requiresEscalation) {
        outcome = 'escalated';
      } else {
        outcome = 'approved';
        nextSpent = projectedSpent + request.amount;
        nextVelocityUsed = projectedVelocityUsed + 1;
      }

      decisions.push({
        request,
        outcome,
        reason: validation.reason,
        projectedSpent: nextSpent,
        projectedRemaining: pass.budget - nextSpent,
      });

      projectedSpent = nextSpent;
      projectedVelocityUsed = nextVelocityUsed;
    }

    const approved  = decisions.filter(d => d.outcome === 'approved');
    const blocked   = decisions.filter(d => d.outcome === 'blocked');
    const escalated = decisions.filter(d => d.outcome === 'escalated');
    const totalSpend = approved.reduce((sum, d) => sum + d.request.amount, BigInt(0));
    const remainingBudget = pass.budget - pass.spent - totalSpend;
    const utilizationPct = Number((pass.spent + totalSpend) * BigInt(100) / pass.budget);

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

  static isValid(pass: EdgePassObject): boolean {
    return pass.active && Date.now() <= pass.expiresAt;
  }

  static remainingBudget(pass: EdgePassObject): bigint {
    return pass.budget - pass.spent;
  }

  static utilizationPct(pass: EdgePassObject): number {
    if (pass.budget === BigInt(0)) return 0;
    return Number(pass.spent * BigInt(100) / pass.budget);
  }

  static isNearLimit(pass: EdgePassObject, threshold = 0.8): boolean {
    return PolicyEngine.utilizationPct(pass) >= threshold * 100;
  }

  static budgetStatus(pass: EdgePassObject, nearLimitThreshold = 0.8): BudgetStatus {
    const remaining = pass.budget - pass.spent;
    const utilizationPct = PolicyEngine.utilizationPct(pass);
    return {
      budget:         pass.budget,
      spent:          pass.spent,
      remaining,
      utilizationPct,
      isNearLimit:    utilizationPct >= nearLimitThreshold * 100,
      isExhausted:    remaining === BigInt(0),
    };
  }

  /**
   * Velocity health for a v2 pass, accounting for a window roll that would
   * happen if checked "now" — mirrors the roll-forward-before-testing-rate
   * logic in execute_transaction.
   */
  static velocityStatus(pass: EdgePassObjectV2): VelocityStatus {
    const isUnlimited = pass.velocityCap === 0;
    const now = Date.now();
    const windowElapsed = now >= pass.windowStartMs + pass.windowMs;

    const used = isUnlimited ? 0 : (windowElapsed ? 0 : pass.velocityUsed);
    const remaining = isUnlimited ? 0 : pass.velocityCap - used;
    const windowResetsAt = windowElapsed ? now : pass.windowStartMs + pass.windowMs;

    return {
      cap:            pass.velocityCap,
      used,
      remaining,
      windowMs:       pass.windowMs,
      windowResetsAt,
      isExhausted:    !isUnlimited && used >= pass.velocityCap,
      isUnlimited,
    };
  }

  static timeRemaining(pass: EdgePassObject): number {
    return Math.max(0, pass.expiresAt - Date.now());
  }

  static isExpiringSoon(pass: EdgePassObject, withinMs = 60 * 60 * 1000): boolean {
    const remaining = PolicyEngine.timeRemaining(pass);
    return remaining > 0 && remaining <= withinMs;
  }
}
