import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";
import {
  EdgePassConfig,
  EdgePassObject,
  TransactionRequest,
  TransactionOutcome,
  EdgeSDKConfig,
  SimulationResult,
  BudgetStatus,
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
  | { type: 'approved';  outcome: TransactionOutcome & { status: 'approved'  }; pass: EdgePassObject; request: TransactionRequest }
  | { type: 'escalated'; outcome: TransactionOutcome & { status: 'escalated' }; pass: EdgePassObject; request: TransactionRequest }
  | { type: 'blocked';   outcome: TransactionOutcome & { status: 'blocked'   }; pass: EdgePassObject; request: TransactionRequest };

type EventListener<T extends EdgePassEventType> = (
  payload: Extract<EdgePassEventPayload, { type: T }>
) => void | Promise<void>;

// ── EdgePass class ────────────────────────────────────────────────────────────

export class EdgePass {
  private client: SuiJsonRpcClient;
  private engine: ExecutionEngine;
  private config: EdgeSDKConfig;
  // eslint-disable-next-line @typescript-eslint/ban-types
  private listeners: Map<EdgePassEventType, Set<Function>> = new Map();

  constructor(config: EdgeSDKConfig) {
    this.config = config;
    this.client = new SuiJsonRpcClient({
      url: NETWORK_URLS[config.network],
      network: config.network as 'mainnet' | 'testnet' | 'devnet',
    });
    this.engine = new ExecutionEngine(config.network);
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
    overrides: Partial<EdgePassConfig> & { owner: string }
  ): EdgePassConfig {
    const base = EDGE_TEMPLATES[template];
    return {
      ...base,
      ...overrides,
      approvedMerchants: overrides.approvedMerchants ?? base.approvedMerchants,
    };
  }

  static withPolicy<T>(
    pass: EdgePassObject,
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
    pass: EdgePassObject,
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
  ): Promise<EdgePassObject> {

    if (passConfig.autoThreshold >= passConfig.escalateThreshold) {
      throw new Error(`EdgePass.create: autoThreshold (${passConfig.autoThreshold}) must be less than escalateThreshold (${passConfig.escalateThreshold})`);
    }
    if (passConfig.escalateThreshold > passConfig.budget) {
      throw new Error(`EdgePass.create: escalateThreshold (${passConfig.escalateThreshold}) must be less than budget (${passConfig.budget})`);
    }
    if (passConfig.maxPerTransaction !== undefined && passConfig.maxPerTransaction < passConfig.escalateThreshold) {
      throw new Error(`EdgePass.create: maxPerTransaction (${passConfig.maxPerTransaction}) should be >= escalateThreshold (${passConfig.escalateThreshold}) to avoid unexpected blocking`);
    }
    if (passConfig.approvedMerchants.length === 0) throw new Error('EdgePass.create: approvedMerchants cannot be empty');
    if (passConfig.expiryMs <= 0) throw new Error('EdgePass.create: expiryMs must be greater than 0');
    if (passConfig.budget <= BigInt(0)) throw new Error('EdgePass.create: budget must be greater than 0');

    const tx = new Transaction();
    tx.setGasBudget(DEFAULT_GAS_BUDGET);

    const packageId = EDGE_PACKAGE_ID[this.config.network];
    if (!packageId) throw new Error(`EdgePass.create: no package ID configured for network "${this.config.network}".`);

    tx.moveCall({
      target: `${packageId}::edge_pass::create_pass`,
      arguments: [
        tx.pure.u64(passConfig.budget),
        tx.pure.u64(passConfig.autoThreshold),
        tx.pure.u64(passConfig.escalateThreshold),
        tx.pure.u64(passConfig.expiryMs),
        tx.pure.vector('string', passConfig.approvedMerchants),
        tx.sharedObjectRef({
          objectId:             SUI_CLOCK_OBJECT_ID,
          initialSharedVersion: 1,
          mutable:              false,
        }),
      ],
    });

    const kindBytes = toBase64(await tx.build({ onlyTransactionKind: true }));
    const result = await signer.signAndExecute(tx, kindBytes);

    const now = Date.now();
    return {
      id:        result.objectId || result.digest,
      config:    passConfig,
      spent:     BigInt(0),
      active:    true,
      createdAt: now,
      expiresAt: now + passConfig.expiryMs,
    };
  }

  async execute(
    pass:    EdgePassObject,
    request: TransactionRequest,
    signer:  { signAndExecute: (tx: Transaction) => Promise<{ digest: string }> }
  ): Promise<TransactionOutcome> {
    const outcome = await this.engine.execute(pass, request, signer);

    if (outcome.status !== 'error') {
      this.emit({ type: outcome.status, outcome: outcome as any, pass, request });
    }

    return outcome;
  }

  simulate(pass: EdgePassObject, requests: TransactionRequest[]): SimulationResult {
    return PolicyEngine.simulate(pass, requests);
  }

  validate(pass: EdgePassObject, request: TransactionRequest) {
    return PolicyEngine.validate(pass, request);
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
    const packageId = EDGE_PACKAGE_ID[this.config.network];
    tx.moveCall({
      target:    `${packageId}::edge_pass::revoke_pass`,
      arguments: [tx.object(pass.id)],
    });
    return signer.signAndExecute(tx);
  }
}
