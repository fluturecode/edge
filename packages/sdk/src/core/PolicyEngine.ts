import { EdgePassObject, TransactionRequest, PolicyValidation } from "../utils/types";

export class PolicyEngine {

  static validate(
    pass: EdgePassObject,
    request: TransactionRequest
  ): PolicyValidation {

    if (!pass.active) {
      return { allowed: false, requiresEscalation: false, reason: "EdgePass is inactive" };
    }

    if (Date.now() > pass.expiresAt) {
      return { allowed: false, requiresEscalation: false, reason: "EdgePass has expired" };
    }

    const merchantApproved = pass.config.approvedMerchants.includes(request.merchant);
    if (!merchantApproved) {
      return { allowed: false, requiresEscalation: false, reason: `Merchant "${request.merchant}" is not approved` };
    }

    const remaining = pass.config.budget - pass.spent;
    if (request.amount > remaining) {
      return { allowed: false, requiresEscalation: false, reason: `Insufficient budget. Remaining: ${remaining} MIST` };
    }

    if (request.amount > pass.config.escalateThreshold) {
      return { allowed: true, requiresEscalation: true, reason: `Amount exceeds escalation threshold of ${pass.config.escalateThreshold} MIST` };
    }

    return { allowed: true, requiresEscalation: false, reason: "Auto-approved" };
  }

  static isValid(pass: EdgePassObject): boolean {
    return pass.active && Date.now() <= pass.expiresAt;
  }

  static remainingBudget(pass: EdgePassObject): bigint {
    return pass.config.budget - pass.spent;
  }
}