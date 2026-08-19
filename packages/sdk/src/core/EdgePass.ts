import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";
import {
  EdgePassConfig,
  EdgePassObject,
  EdgePassObjectV2,
  TransactionRequest,
  TransactionOutcome,
  EdgeSDKConfig,
  SimulationResult,
  BudgetStatus,
  VelocityStatus,
  isV2,
} from "../utils/types";
import { PolicyEngine } from "./PolicyEngine";
import { ExecutionEngine } from "./ExecutionEngine";
import {
  NETWORK_URLS,
  EDGE_PACKAGE_ID,
  DEFAULT_GAS_BUDGET,
  EDGE_TEMPLATES,
  EdgePassTemplate,
} from "../utils/constants";

const SUI_CLOCK_OBJECT_ID = '0x0000000000000000000000000000000000000000000000000000000000000006';

// ── Event types ───────────────────────────────────────────────────────────────

export type EdgePassEventType = 'approved' | 'escalated' | 'blocked';

export type EdgePassEventPayload =
  | { type: 'approved';  outcome: TransactionOutcome & { status: 'approved'  }; pass: EdgePassObjectV2; request: TransactionRequest }
  | { type: 'escalated'; outcome: TransactionOutcome & { status: 'escalated' }; pass: EdgePassObjectV2; request: TransactionRequest }
  | { type: 'blocked';   outcome: TransactionOutcome & { status: 'blocked'   }; pass: EdgePassObjectV2; request: TransactionRequest };

type EventListener<T extends EdgePassEventType> = (
  payload: Extract<EdgePassEventPayload, { type: T }>
) => void | Promise<void>;

// ── EdgePass class ────────────────────────────────────────────────────────────

export class EdgePass {
  // Currently unused elsewhere in this class — create()/execute()/revoke() all
  // delegate actual chain access to the caller-supplied signer or to
  // ExecutionEngine's own client. Kept (and migrated off JSON-RPC along with
  // the rest) rather than removed, in case a future method needs it.
  private client: SuiGrpcClient;
  private engine: ExecutionEngine;
  private config: EdgeSDKConfig;
  // eslint-disable-next-line @typescript-eslint/ban-types
  private listeners: Map<EdgePassEventType, Set<Function>> = new Map();

  constructor(config: EdgeSDKConfig) {
    this.config = config;
    this.client = new SuiGrpcClient({
      network: config.network as 'mainnet' | 'testnet' | 'devnet',
      baseUrl: NETWORK_URLS[config.network],
    });
    this.engine = new ExecutionEngine(config.network, config.onChainDenials ?? true);
  }

  // ── Event system ──────────────────────────────────────────────────────────────

  on<T extends EdgePassEventType>(event: T, listener: EventListener<T>): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off<T extends EdgePassEventType>(event: T, listener: EventListener<T>): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  removeAllListeners(event?: EdgePassEventType): this {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
    return this;
  }

  private emit(payload: EdgePassEventPayload): void {
    const listeners = this.listeners.get(payload.type);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (e) {
        console.error(`EdgePass event listener error (${payload.type}):`, e);
      }
    }
  }

  // ── Static helpers ────────────────────────────────────────────────────────────

  static fromTemplate(
    template: EdgePassTemplate,
    overrides: Partial<EdgePassConfig> & { agent: string }
  ): EdgePassConfig {
    const base = EDGE_TEMPLATES[template];
    return {
      ...base,
      ...overrides,
      approvedMerchants: overrides.approvedMerchants ?? base.approvedMerchants,
    };
  }

  static withPolicy<T>(
    pass: EdgePassObjectV2,
    signer: { signAndExecute: (tx: Transaction) => Promise<{ digest: string }> },
    sdk: EdgePass,
    fn: (request: TransactionRequest) => Promise<T>
  ): (request: TransactionRequest) => Promise<{ outcome: TransactionOutcome; result?: T }> {
    return async (request: TransactionRequest) => {
      const outcome = await sdk.execute(pass, request, signer);

      if (outcome.status === 'blocked' || outcome.status === 'escalated' || outcome.status === 'error') {
        return { outcome };
      }

      const result = await fn(request);
      return { outcome, result };
    };
  }

  /**
   * @deprecated Use createWithFireblocks() from '@edge-protocol/sdk' instead.
   * Adds idempotency, compliance screening, Dynamic identity binding,
   * and structured audit trails. This method is kept for backwards
   * compatibility but will be removed in v2.0.0.
   */
  static withFireblocks<TSettlement>(
    pass: EdgePassObjectV2,
    signer: { signAndExecute: (tx: Transaction) => Promise<{ digest: string }> },
    sdk: EdgePass,
    options: {
      settle: (approved: {
        edgeDigest:         string;
        merchant:           string;
        amount:             bigint;
        amountUSD:          string;
        destinationAddress: string;
      }) => Promise<TSettlement>;
      onEscalated?: (context: {
        request: TransactionRequest & { amountUSD: string; destinationAddress: string };
        reason:  string;
      }) => Promise<void>;
      onBlocked?: (context: {
        request: TransactionRequest & { amountUSD: string; destinationAddress: string };
        reason:  string;
      }) => Promise<void>;
    }
  ): (request: TransactionRequest & { amountUSD: string; destinationAddress: string }) => Promise<{
    outcome:      TransactionOutcome;
    settlement?:  TSettlement;
    edgeDigest?:  string;
  }> {
    return async (request) => {
      const outcome = await sdk.execute(pass, request, signer);

      if (outcome.status === 'approved') {
        const settlement = await options.settle({
          edgeDigest:         outcome.digest,
          merchant:           request.merchant,
          amount:             request.amount,
          amountUSD:          request.amountUSD,
          destinationAddress: request.destinationAddress,
        });
        return { outcome, settlement, edgeDigest: outcome.digest };
      }

      if (outcome.status === 'escalated') {
        await options.onEscalated?.({ request, reason: outcome.reason });
        return { outcome };
      }

      if (outcome.status === 'blocked') {
        await options.onBlocked?.({ request, reason: outcome.reason });
        return { outcome };
      }

      return { outcome };
    };
  }

  // ── Core API ──────────────────────────────────────────────────────────────────

  async create(
    passConfig: EdgePassConfig,
    signer: { signAndExecute: (tx: Transaction, kindBytes: string) => Promise<{ digest: string; objectId?: string | null }> }
  ): Promise<EdgePassObjectV2> {

    // Catches a v1 config object (or anything spread from one) carrying the
    // old field names through untyped/JS call sites — TypeScript's structural
    // typing won't flag an extra property, and `escalateThreshold`/legacy
    // `autoThreshold` silently landing here is exactly the kind of
    // same-name-different-meaning trap that motivated renaming the field to
    // `escalateAbove` in the first place. Fail loudly instead of minting a
    // pass with a misconfigured (or accidentally default `undefined`)
    // escalation threshold.
    const legacyKeys = ['escalateThreshold', 'autoThreshold'].filter(k => k in passConfig);
    if (legacyKeys.length > 0) {
      throw new Error(
        `EdgePass.create: config has v1 field(s) [${legacyKeys.join(', ')}] that no longer exist on EdgePassConfig. ` +
        `Use \`escalateAbove\` instead — v1's \`escalateThreshold\` is what actually drove escalation and maps ` +
        `directly to it; v1's \`autoThreshold\` was display-only and never enforced, so there is nothing to carry over from it.`
      );
    }

    // Mirrors the EInvalidConfig assertions in edge_pass_v2::create_pass,
    // plus a couple of SDK-side sanity checks (escalateAbove/maxPerTransaction
    // ordering) that the contract doesn't need to enforce but that would
    // otherwise silently misconfigure escalation routing.
    if (!passConfig.agent) throw new Error('EdgePass.create: agent is required');
    if (passConfig.budget <= BigInt(0)) throw new Error('EdgePass.create: budget must be greater than 0');
    if (passConfig.maxPerTransaction <= BigInt(0)) throw new Error('EdgePass.create: maxPerTransaction must be greater than 0');
    if (passConfig.escalateAbove > passConfig.maxPerTransaction) {
      throw new Error(`EdgePass.create: escalateAbove (${passConfig.escalateAbove}) should be <= maxPerTransaction (${passConfig.maxPerTransaction}) or nothing will ever escalate`);
    }
    if (passConfig.maxPerTransaction > passConfig.budget) {
      throw new Error(`EdgePass.create: maxPerTransaction (${passConfig.maxPerTransaction}) should be <= budget (${passConfig.budget})`);
    }
    if (passConfig.velocityCap > 0 && passConfig.velocityWindowMs <= 0) {
      throw new Error('EdgePass.create: velocityWindowMs must be greater than 0 when velocityCap is set');
    }
    if (passConfig.approvedMerchants.length === 0) throw new Error('EdgePass.create: approvedMerchants cannot be empty');
    if (passConfig.expiryMs <= 0) throw new Error('EdgePass.create: expiryMs must be greater than 0');

    const tx = new Transaction();
    tx.setGasBudget(DEFAULT_GAS_BUDGET);

    const packageId = EDGE_PACKAGE_ID[this.config.network]?.v2;
    if (!packageId) {
      throw new Error(
        `EdgePass.create: no v2 package ID configured for network "${this.config.network}". ` +
        `edge_pass_v2 has not been deployed there yet — update EDGE_PACKAGE_ID[network].v2 in constants.ts after publishing.`
      );
    }

    tx.moveCall({
      target: `${packageId}::edge_pass_v2::create_pass`,
      arguments: [
        tx.pure.address(passConfig.agent),
        tx.pure.u64(passConfig.budget),
        tx.pure.u64(passConfig.escalateAbove),
        tx.pure.u64(passConfig.maxPerTransaction),
        tx.pure.u64(passConfig.velocityCap),
        tx.pure.u64(passConfig.velocityWindowMs),
        tx.pure.vector('address', passConfig.approvedMerchants),
        tx.pure.u64(passConfig.expiryMs),
        tx.sharedObjectRef({
          objectId:             SUI_CLOCK_OBJECT_ID,
          initialSharedVersion: 1,
          mutable:              false,
        }),
      ],
    });

    const kindBytes = toBase64(await tx.build({ onlyTransactionKind: true }));
    const result = await signer.signAndExecute(tx, kindBytes);

    // Prefer refetching the real on-chain object — it's the only reliable
    // source for `issuer` (the tx sender, which the SDK never sends as an
    // argument) and for `initialSharedVersion` (only knowable once the
    // object actually exists on chain). Fall back to a locally-constructed
    // approximation if the object ID wasn't returned or the refetch fails.
    if (result.objectId) {
      // The object was just created in this exact transaction — tell the
      // engine so the fetch() below waits for read-after-write consistency
      // instead of racing a fullnode that hasn't applied the write yet.
      this.engine.registerWrite(result.objectId, result.digest);
      const fetched = await this.fetch(result.objectId);
      if (fetched && fetched.version === 'v2') return fetched;
    }

    // No objectId (or the refetch above failed) — approximate locally.
    // initialSharedVersion isn't knowable without a real chain read, so this
    // approximation is unusable with execute()/revoke() until the caller
    // fetches the real object; buildPTB() throws a clear error rather than
    // silently building a broken tx if that's attempted first.
    const now = Date.now();
    return {
      version:              'v2',
      id:                   result.objectId || result.digest,
      initialSharedVersion: '',
      issuer:               passConfig.issuer ?? '',
      agent:                passConfig.agent,
      budget:               passConfig.budget,
      escalateAbove:        passConfig.escalateAbove,
      maxPerTransaction:    passConfig.maxPerTransaction,
      velocityCap:          passConfig.velocityCap,
      velocityUsed:         0,
      windowMs:             passConfig.velocityWindowMs,
      windowStartMs:        now,
      approvedMerchants:    passConfig.approvedMerchants,
      spent:                BigInt(0),
      active:               true,
      createdAt:            now,
      expiresAt:            now + passConfig.expiryMs,
    };
  }

  async execute(
    pass:    EdgePassObjectV2,
    request: TransactionRequest,
    signer:  { signAndExecute: (tx: Transaction) => Promise<{ digest: string }> }
  ): Promise<TransactionOutcome> {
    const outcome = await this.engine.execute(pass, request, signer);

    if (outcome.status !== 'error') {
      this.emit({ type: outcome.status, outcome: outcome as any, pass, request });
    }

    return outcome;
  }

  simulate(pass: EdgePassObjectV2, requests: TransactionRequest[]): SimulationResult {
    return PolicyEngine.simulate(pass, requests);
  }

  validate(pass: EdgePassObjectV2, request: TransactionRequest) {
    return PolicyEngine.validate(pass, request);
  }

  velocityStatus(pass: EdgePassObjectV2): VelocityStatus {
    return PolicyEngine.velocityStatus(pass);
  }

  budgetStatus(pass: EdgePassObject, nearLimitThreshold = 0.8): BudgetStatus {
    return PolicyEngine.budgetStatus(pass, nearLimitThreshold);
  }

  utilizationPct(pass: EdgePassObject): number {
    return PolicyEngine.utilizationPct(pass);
  }

  isNearLimit(pass: EdgePassObject, threshold = 0.8): boolean {
    return PolicyEngine.isNearLimit(pass, threshold);
  }

  remainingBudget(pass: EdgePassObject): bigint {
    return PolicyEngine.remainingBudget(pass);
  }

  timeRemaining(pass: EdgePassObject): number {
    return PolicyEngine.timeRemaining(pass);
  }

  isExpiringSoon(pass: EdgePassObject, withinMs = 60 * 60 * 1000): boolean {
    return PolicyEngine.isExpiringSoon(pass, withinMs);
  }

  isValid(pass: EdgePassObject): boolean {
    return PolicyEngine.isValid(pass);
  }

  async fetch(objectId: string): Promise<EdgePassObject | null> {
    return this.engine.fetchPass(objectId);
  }

  async revoke(
    pass:   EdgePassObject,
    signer: { signAndExecute: (tx: Transaction) => Promise<{ digest: string }> }
  ): Promise<{ digest: string }> {
    const tx = new Transaction();
    tx.setGasBudget(DEFAULT_GAS_BUDGET);

    if (isV2(pass)) {
      const packageId = EDGE_PACKAGE_ID[this.config.network]?.v2;
      if (!packageId) {
        throw new Error(
          `EdgePass.revoke: no v2 package ID configured for network "${this.config.network}". ` +
          `edge_pass_v2 has not been deployed there yet.`
        );
      }
      if (!pass.initialSharedVersion) {
        throw new Error(
          `EdgePass.revoke: pass ${pass.id} is missing initialSharedVersion — re-fetch it via ` +
          `sdk.fetch() before calling revoke().`
        );
      }
      // v2's revoke_pass takes a Clock — v1's does not. edge_pass_v2 is a
      // shared object, so it's referenced with sharedObjectRef (not
      // tx.object()) for the same reason as execute() — see ExecutionEngine
      // and HANDOFF.md.
      tx.moveCall({
        target: `${packageId}::edge_pass_v2::revoke_pass`,
        arguments: [
          tx.sharedObjectRef({
            objectId:             pass.id,
            initialSharedVersion: pass.initialSharedVersion,
            mutable:              true,
          }),
          tx.sharedObjectRef({
            objectId:             SUI_CLOCK_OBJECT_ID,
            initialSharedVersion: 1,
            mutable:              false,
          }),
        ],
      });
    } else {
      const packageId = EDGE_PACKAGE_ID[this.config.network]?.v1;
      if (!packageId) {
        throw new Error(
          `EdgePass.revoke: no v1 package ID configured for network "${this.config.network}".`
        );
      }
      // v1 passes are OWNED objects (transfer::transfer to `owner`), not
      // shared — there's no initialSharedVersion for an owned object, and
      // tx.object() is the correct (and only) way to reference one here.
      tx.moveCall({
        target:    `${packageId}::edge_pass::revoke_pass`,
        arguments: [tx.object(pass.id)],
      });
    }

    const result = await signer.signAndExecute(tx);
    // Same read-after-write hazard as execute()/create() — a subsequent
    // sdk.fetch(pass.id) (e.g. to confirm `active: false`) shouldn't race
    // the fullnode.
    this.engine.registerWrite(pass.id, result.digest);
    return result;
  }
}
