import { EdgePassObject, TransactionRequest, PolicyValidation } from '../utils/types';

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
      return {
        allowed: false,
        requiresEscalation: false,
        reason: 'EdgePass is inactive',
      };
    }

    // Rule 2 — pass must not be expired
    if (Date.now() > pass.expiresAt) {
      return {
        allowed: false,
        requiresEscalation: false,
        reason: 'EdgePass has expired',
      };
    }

    // Rule 3 — merchant must be approved
    if (!pass.config.approvedMerchants.includes(request.merchant)) {
      return {
        allowed: false,
        requiresEscalation: false,
        reason: `Merchant "${request.merchant}" is not approved`,
      };
    }

    // Rule 4 — must not exceed remaining budget
    const remaining = pass.config.budget - pass.spent;
    if (request.amount > remaining) {
      return {
        allowed: false,
        requiresEscalation: false,
        reason: `Insufficient budget. Remaining: ${remaining} MIST`,
      };
    }

    // Rule 5 — must not exceed per-transaction limit (if set)
    if (
      pass.config.maxPerTransaction !== undefined &&
      request.amount > pass.config.maxPerTransaction
    ) {
      return {
        allowed: false,
        requiresEscalation: false,
        reason: `Amount exceeds per-transaction limit of ${pass.config.maxPerTransaction} MIST`,
      };
    }

    // Rule 6 — escalate if above escalation threshold
    if (request.amount > pass.config.escalateThreshold) {
      return {
        allowed: true,
        requiresEscalation: true,
        reason: `Amount exceeds escalation threshold of ${pass.config.escalateThreshold} MIST`,
      };
    }

    // Rule 7 — auto-approve
    return {
      allowed: true,
      requiresEscalation: false,
      reason: 'Auto-approved',
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
}
