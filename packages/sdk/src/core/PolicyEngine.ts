import {
  EdgePassObject,
  TransactionRequest,
  PolicyValidation,
  SimulatedDecision,
  SimulationResult,
  BudgetStatus,
} from '../utils/types';

export class PolicyEngine {

  static validate(
    pass: EdgePassObject,
    request: TransactionRequest
  ): PolicyValidation {

    if (!pass.active) {
      return { allowed: false, requiresEscalation: false, reason: 'EdgePass is inactive' };
    }

    if (Date.now() > pass.expiresAt) {
      return { allowed: false, requiresEscalation: false, reason: 'EdgePass has expired' };
    }

    if (!pass.config.approvedMerchants.includes(request.merchant)) {
      return { allowed: false, requiresEscalation: false, reason: `Merchant "${request.merchant}" is not approved` };
    }

    const remaining = pass.config.budget - pass.spent;
    if (request.amount > remaining) {
      return { allowed: false, requiresEscalation: false, reason: `Insufficient budget. Remaining: ${remaining} MIST` };
    }

    if (pass.config.maxPerTransaction !== undefined && request.amount > pass.config.maxPerTransaction) {
      return { allowed: false, requiresEscalation: false, reason: `Amount exceeds per-transaction limit of ${pass.config.maxPerTransaction} MIST` };
    }

    if (request.amount > pass.config.escalateThreshold) {
      return { allowed: true, requiresEscalation: true, reason: `Amount exceeds escalation threshold of ${pass.config.escalateThreshold} MIST` };
    }

    return { allowed: true, requiresEscalation: false, reason: 'Auto-approved' };
  }

  static simulate(
    pass: EdgePassObject,
    requests: TransactionRequest[]
  ): SimulationResult {
    const decisions: SimulatedDecision[] = [];
    let projectedSpent = pass.spent;

    for (const request of requests) {
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
      } else {
        outcome = 'approved';
        nextSpent = projectedSpent + request.amount;
      }

      decisions.push({
        request,
        outcome,
        reason: validation.reason,
        projectedSpent: nextSpent,
        projectedRemaining: pass.config.budget - nextSpent,
      });

      projectedSpent = nextSpent;
    }

    const approved  = decisions.filter(d => d.outcome === 'approved');
    const blocked   = decisions.filter(d => d.outcome === 'blocked');
    const escalated = decisions.filter(d => d.outcome === 'escalated');
    const totalSpend = approved.reduce((sum, d) => sum + d.request.amount, BigInt(0));
    const remainingBudget = pass.config.budget - pass.spent - totalSpend;
    const utilizationPct = Number((pass.spent + totalSpend) * BigInt(100) / pass.config.budget);

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
    return pass.config.budget - pass.spent;
  }

  static utilizationPct(pass: EdgePassObject): number {
    if (pass.config.budget === BigInt(0)) return 0;
    return Number(pass.spent * BigInt(100) / pass.config.budget);
  }

  static isNearLimit(pass: EdgePassObject, threshold = 0.8): boolean {
    return PolicyEngine.utilizationPct(pass) >= threshold * 100;
  }

  static budgetStatus(pass: EdgePassObject, nearLimitThreshold = 0.8): BudgetStatus {
    const remaining = pass.config.budget - pass.spent;
    const utilizationPct = PolicyEngine.utilizationPct(pass);
    return {
      budget:         pass.config.budget,
      spent:          pass.spent,
      remaining,
      utilizationPct,
      isNearLimit:    utilizationPct >= nearLimitThreshold * 100,
      isExhausted:    remaining === BigInt(0),
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
