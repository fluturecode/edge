import { Transaction } from '@mysten/sui/transactions';
import {
  EdgePassObjectV2,
  TransactionRequest,
  TransactionOutcome,
} from '../utils/types';
import { IdempotencyRegistry, globalRegistry, PendingIntent } from './IdempotencyRegistry';
import { ComplianceEngine, ComplianceResult } from '../compliance/ComplianceEngine';
import {
  DynamicIdentityEngine,
  DynamicIdentity,
  IdentityBoundEdgePass,
} from '../compliance/DynamicIdentityBinding';
import { EdgePass } from './EdgePass';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WithFireblocksOptions<TSettlement> {
  /**
   * Unique key for this transaction intent.
   * Same key = safe retry. Prevents double-spend on network failure.
   * Use a stable business identifier: invoice ID, order ID, agent run ID, etc.
   */
  idempotencyKey: string;

  /**
   * Called when Edge approves and compliance passes.
   * Execute your Fireblocks settlement here.
   * Must be idempotent — may be called on retry.
   */
  settle: (approved: {
    edgeDigest:         string;
    merchant:           string;
    amount:             bigint;
    amountUSD:          string;
    destinationAddress: string;
    intent:             PendingIntent;
    complianceResult?:  ComplianceResult;
    auditEntry:         Record<string, unknown>;
  }) => Promise<TSettlement>;

  /**
   * Optional compliance engine for AML/sanctions screening.
   * Runs after Edge approval, before Fireblocks settlement.
   */
  compliance?: ComplianceEngine;

  /**
   * Optional Dynamic identity to verify before execution.
   * If provided, the pass must be identity-bound and the session must be valid.
   */
  dynamicIdentity?: DynamicIdentity;

  /**
   * Optional custom idempotency registry.
   * Defaults to the global in-process registry.
   * Pass a custom registry for persistence across restarts.
   */
  registry?: IdempotencyRegistry;

  /**
   * Max retry attempts before giving up. Default: 3.
   */
  maxRetries?: number;

  /** Called when Edge escalates — notify human approver */
  onEscalated?: (context: {
    request:    TransactionRequest & { amountUSD: string; destinationAddress: string };
    reason:     string;
    auditEntry: Record<string, unknown>;
  }) => Promise<void>;

  /** Called when Edge blocks — log or alert */
  onBlocked?: (context: {
    request:    TransactionRequest & { amountUSD: string; destinationAddress: string };
    reason:     string;
    auditEntry: Record<string, unknown>;
  }) => Promise<void>;

  /** Called when compliance blocks or escalates */
  onComplianceBlock?: (context: {
    request:          TransactionRequest & { amountUSD: string; destinationAddress: string };
    complianceResult: ComplianceResult;
    auditEntry:       Record<string, unknown>;
  }) => Promise<void>;

  /** Called when Fireblocks settlement fails */
  onFailure?: (context: {
    error:      Error;
    retryCount: number;
    intent:     PendingIntent;
    auditEntry: Record<string, unknown>;
  }) => Promise<void>;
}

export interface WithFireblocksResult<TSettlement> {
  outcome:          TransactionOutcome;
  settlement?:      TSettlement;
  edgeDigest?:      string;
  complianceResult?: ComplianceResult;
  intent?:          PendingIntent;
  auditEntry:       Record<string, unknown>;
}

// ── Core function ──────────────────────────────────────────────────────────────

export function createWithFireblocks<TSettlement>(
  pass:    EdgePassObjectV2,
  signer:  { signAndExecute: (tx: Transaction) => Promise<{ digest: string }> },
  sdk:     EdgePass,
  options: WithFireblocksOptions<TSettlement>
): (
  request: TransactionRequest & { amountUSD: string; destinationAddress: string }
) => Promise<WithFireblocksResult<TSettlement>> {

  const registry   = options.registry  ?? globalRegistry;
  const maxRetries = options.maxRetries ?? 3;

  return async (request) => {
    const baseAudit: Record<string, unknown> = {
      idempotencyKey:     options.idempotencyKey,
      merchant:           request.merchant,
      amount:             request.amount.toString(),
      amountUSD:          request.amountUSD,
      destinationAddress: request.destinationAddress,
      edgePassId:         pass.id,
      initiatedAt:        new Date().toISOString(),
    };

    // ── Step 0: Dynamic identity verification ──────────────────────────────
    if (options.dynamicIdentity) {
      if (!DynamicIdentityEngine.isBound(pass)) {
        throw new Error(
          'withFireblocks: dynamicIdentity provided but EdgePass is not identity-bound. ' +
          'Call DynamicIdentityEngine.bind(pass, identity) before executing.'
        );
      }

      try {
        DynamicIdentityEngine.verify(
          pass as IdentityBoundEdgePass,
          options.dynamicIdentity
        );
        baseAudit.dynamicUserId   = options.dynamicIdentity.userId;
        baseAudit.dynamicWallet   = options.dynamicIdentity.walletAddress;
        baseAudit.dynamicOrgId    = options.dynamicIdentity.orgId;
        baseAudit.identityVerified = true;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const auditEntry = { ...baseAudit, blocked: true, blockReason: reason, phase: 'IDENTITY_CHECK' };

        const outcome: TransactionOutcome = {
          status: 'blocked',
          reason,
          auto:   false,
        };

        return { outcome, auditEntry };
      }
    }

    // ── Step 1: Idempotency check ──────────────────────────────────────────
    // If already settled, return early — no duplicate execution
    if (registry.isSettled(options.idempotencyKey)) {
      const existing = registry.get(options.idempotencyKey)!;
      const auditEntry = {
        ...baseAudit,
        phase:         'IDEMPOTENCY_SHORT_CIRCUIT',
        existingDigest: existing.edgeDigest,
        settledAt:     existing.createdAt,
      };

      return {
        outcome: { status: 'approved', digest: existing.edgeDigest, auto: true },
        settlement:  existing.settlementResult as TSettlement,
        edgeDigest:  existing.edgeDigest,
        intent:      existing,
        auditEntry,
      };
    }

    // Check retry limit
    const existingIntent = registry.get(options.idempotencyKey);
    if (existingIntent && existingIntent.retryCount >= maxRetries) {
      const auditEntry = {
        ...baseAudit,
        phase:      'MAX_RETRIES_EXCEEDED',
        retryCount: existingIntent.retryCount,
        lastError:  existingIntent.lastError,
      };

      return {
        outcome: {
          status: 'error',
          reason: `Max retries (${maxRetries}) exceeded for intent "${options.idempotencyKey}". Last error: ${existingIntent.lastError}`,
          auto:   false,
        },
        intent:     existingIntent,
        auditEntry,
      };
    }

    // ── Step 2: Edge policy validation on Sui ──────────────────────────────
    const outcome = await sdk.execute(pass, request, signer);
    baseAudit.edgeStatus = outcome.status;

    if (outcome.status === 'escalated') {
      const auditEntry = { ...baseAudit, phase: 'EDGE_ESCALATED', reason: outcome.reason };
      await options.onEscalated?.({ request, reason: outcome.reason, auditEntry });
      return { outcome, auditEntry };
    }

    if (outcome.status === 'blocked') {
      const auditEntry = { ...baseAudit, phase: 'EDGE_BLOCKED', reason: outcome.reason };
      await options.onBlocked?.({ request, reason: outcome.reason, auditEntry });
      return { outcome, auditEntry };
    }

    if (outcome.status === 'error') {
      const auditEntry = { ...baseAudit, phase: 'EDGE_ERROR', reason: outcome.reason };
      return { outcome, auditEntry };
    }

    // ── Step 3: Register intent (Phase 1 — PENDING) ────────────────────────
    const intent = registry.register({
      idempotencyKey:     options.idempotencyKey,
      edgeDigest:         outcome.digest,
      merchant:           request.merchant,
      amount:             request.amount,
      amountUSD:          request.amountUSD,
      destinationAddress: request.destinationAddress,
    });

    baseAudit.edgeDigest = outcome.digest;
    baseAudit.phase      = 'PENDING';

    // ── Step 4: Compliance screening (6th dimension) ───────────────────────
    let complianceResult: ComplianceResult | undefined;

    if (options.compliance) {
      complianceResult = await options.compliance.screen(
        request.destinationAddress,
        request.amount,
        { merchant: request.merchant, amountUSD: request.amountUSD }
      );

      baseAudit.complianceScore = complianceResult.riskScore;
      baseAudit.complianceLevel = complianceResult.riskLevel;

      if (!complianceResult.allowed) {
        // Compliance blocked — transition intent to FAILED
        registry.failed(options.idempotencyKey, complianceResult.reason);

        const auditEntry = {
          ...baseAudit,
          phase:            'COMPLIANCE_BLOCKED',
          complianceReason: complianceResult.reason,
          riskSignals:      complianceResult.signals,
        };

        await options.onComplianceBlock?.({ request, complianceResult, auditEntry });

        return {
          outcome: { status: 'blocked', reason: complianceResult.reason, auto: false },
          complianceResult,
          intent,
          auditEntry,
        };
      }

      if (complianceResult.requiresReview) {
        // Compliance escalation — treat as escalated, don't settle
        registry.failed(options.idempotencyKey, `Compliance review required: ${complianceResult.reason}`);

        const auditEntry = {
          ...baseAudit,
          phase:            'COMPLIANCE_ESCALATED',
          complianceReason: complianceResult.reason,
          riskSignals:      complianceResult.signals,
        };

        await options.onEscalated?.({ request, reason: complianceResult.reason, auditEntry });

        return {
          outcome: { status: 'escalated', reason: complianceResult.reason, auto: false },
          complianceResult,
          intent,
          auditEntry,
        };
      }
    }

    // ── Step 5: Fireblocks settlement (Phase 2 — SETTLING) ────────────────
    registry.settling(options.idempotencyKey);
    baseAudit.phase = 'SETTLING';

    // Build identity audit entry if bound
    const identityAudit = DynamicIdentityEngine.isBound(pass)
      ? DynamicIdentityEngine.auditEntry(
          pass as IdentityBoundEdgePass,
          outcome.digest,
          { merchant: request.merchant, amount: request.amount, amountUSD: request.amountUSD }
        )
      : {};

    const auditEntry = {
      ...baseAudit,
      ...identityAudit,
      complianceResult: complianceResult
        ? { score: complianceResult.riskScore, level: complianceResult.riskLevel }
        : undefined,
    };

    try {
      const settlement = await options.settle({
        edgeDigest:         outcome.digest,
        merchant:           request.merchant,
        amount:             request.amount,
        amountUSD:          request.amountUSD,
        destinationAddress: request.destinationAddress,
        intent,
        complianceResult,
        auditEntry,
      });

      // ── Phase 3: SETTLED ───────────────────────────────────────────────
      const settledIntent = registry.settled(options.idempotencyKey, settlement);

      return {
        outcome,
        settlement,
        edgeDigest:      outcome.digest,
        complianceResult,
        intent:          settledIntent,
        auditEntry:      { ...auditEntry, phase: 'SETTLED', settledAt: new Date().toISOString() },
      };

    } catch (error) {
      // ── Phase 3: FAILED ────────────────────────────────────────────────
      const errorMsg = error instanceof Error ? error.message : String(error);
      const failedIntent = registry.failed(options.idempotencyKey, errorMsg);

      const failureAudit = {
        ...auditEntry,
        phase:      'FAILED',
        error:      errorMsg,
        retryCount: failedIntent.retryCount,
        failedAt:   new Date().toISOString(),
      };

      await options.onFailure?.({
        error:      error instanceof Error ? error : new Error(errorMsg),
        retryCount: failedIntent.retryCount,
        intent:     failedIntent,
        auditEntry: failureAudit,
      });

      return {
        outcome: {
          status: 'error',
          reason: `Fireblocks settlement failed (attempt ${failedIntent.retryCount}/${maxRetries}): ${errorMsg}. ` +
                  `Edge approved on Sui (digest: ${outcome.digest}). ` +
                  `Retry with the same idempotencyKey "${options.idempotencyKey}" to resume settlement.`,
          auto: false,
        },
        edgeDigest:      outcome.digest,
        complianceResult,
        intent:          failedIntent,
        auditEntry:      failureAudit,
      };
    }
  };
}
