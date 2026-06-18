import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { toBase64 } from "@mysten/sui/utils";
import {
  EdgePassConfig,
  EdgePassObject,
  TransactionRequest,
  TransactionOutcome,
  EdgeSDKConfig,
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

// Sui Clock object ID — shared object, always the same address
const SUI_CLOCK_OBJECT_ID = '0x0000000000000000000000000000000000000000000000000000000000000006';

// ── Event types ───────────────────────────────────────────────────────────────

// Note: 'error' is NOT an event type — infrastructure errors don't fire events
// Only policy outcomes (approved/escalated/blocked) fire events
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
  private client: SuiClient;
  private engine: ExecutionEngine;
  private config: EdgeSDKConfig;
  private listeners: Map<EdgePassEventType, Set<Function>> = new Map();

  constructor(config: EdgeSDKConfig) {
    this.config = config;
    this.client = new SuiClient({ url: NETWORK_URLS[config.network] });
    this.engine = new ExecutionEngine(config.network);
  }

  // ── Event system ────────────────────────────────────────────────────────────

  /**
   * Subscribe to transaction outcomes.
   * Note: 'error' status (network/signing failures) does NOT fire events.
   * Check outcome.status === 'error' in your execute() handler instead.
   *
   * @example
   * sdk.on('approved', ({ outcome, pass }) => {
   *   console.log('executed:', outcome.digest);
   * });
   * sdk.on('escalated', ({ outcome, request }) => {
   *   notifyUser(`Approve $${request.amount} at ${request.merchant}?`);
   * });
   * sdk.on('blocked', ({ outcome }) => {
   *   logger.warn('blocked:', outcome.reason);
   * });
   */
  on<T extends EdgePassEventType>(event: T, listener: EventListener<T>): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return this;
  }

  /**
   * Unsubscribe a specific listener.
   */
  off<T extends EdgePassEventType>(event: T, listener: EventListener<T>): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  /**
   * Remove all listeners for an event (or all events if none specified).
   */
  removeAllListeners(event?: EdgePassEventType): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
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

  // ── Static helpers ──────────────────────────────────────────────────────────

  /**
   * Creates an EdgePassConfig from a template with optional overrides.
   *
   * @example
   * const config = EdgePass.fromTemplate('festival', {
   *   approvedMerchants: ['Shuttle Express', 'Hydra Bar'],
   *   owner: userAddress,
   * });
   */
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

  // ── Core API ────────────────────────────────────────────────────────────────

  /**
   * Mint a new EdgePass on Sui.
   */
  async create(
    passConfig: EdgePassConfig,
    signer: { signAndExecute: (tx: Transaction, kindBytes: string) => Promise<{ digest: string; objectId?: string | null }> }
  ): Promise<EdgePassObject> {

    // ── Config validation ─────────────────────────────────────────────────
    if (passConfig.autoThreshold >= passConfig.escalateThreshold) {
      throw new Error(
        `EdgePass.create: autoThreshold (${passConfig.autoThreshold}) must be less than escalateThreshold (${passConfig.escalateThreshold})`
      );
    }
    if (passConfig.escalateThreshold > passConfig.budget) {
      throw new Error(
        `EdgePass.create: escalateThreshold (${passConfig.escalateThreshold}) must be less than budget (${passConfig.budget})`
      );
    }
    if (passConfig.maxPerTransaction !== undefined &&
        passConfig.maxPerTransaction < passConfig.escalateThreshold) {
      throw new Error(
        `EdgePass.create: maxPerTransaction (${passConfig.maxPerTransaction}) should be >= escalateThreshold (${passConfig.escalateThreshold}) to avoid unexpected blocking`
      );
    }
    if (passConfig.approvedMerchants.length === 0) {
      throw new Error('EdgePass.create: approvedMerchants cannot be empty');
    }
    if (passConfig.expiryMs <= 0) {
      throw new Error('EdgePass.create: expiryMs must be greater than 0');
    }
    if (passConfig.budget <= BigInt(0)) {
      throw new Error('EdgePass.create: budget must be greater than 0');
    }
    // ─────────────────────────────────────────────────────────────────────

    const tx = new Transaction();
    tx.setGasBudget(DEFAULT_GAS_BUDGET);

    const packageId = EDGE_PACKAGE_ID[this.config.network];
    if (!packageId) {
      throw new Error(
        `EdgePass.create: no package ID configured for network "${this.config.network}". ` +
        `Update EDGE_PACKAGE_ID in constants.ts after deploying the Move contract.`
      );
    }

    tx.moveCall({
      target: `${packageId}::edge_pass::create_pass`,
      arguments: [
        tx.pure.u64(passConfig.budget),
        tx.pure.u64(passConfig.autoThreshold),
        tx.pure.u64(passConfig.escalateThreshold),
        tx.pure.u64(passConfig.expiryMs),
        tx.pure.vector('string', passConfig.approvedMerchants),
        tx.sharedObjectRef({
          objectId: SUI_CLOCK_OBJECT_ID,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    const kindBytes = toBase64(await tx.build({ onlyTransactionKind: true }));
    const result = await signer.signAndExecute(tx, kindBytes);

    const now = Date.now();
    return {
      id: result.objectId || result.digest,
      config: passConfig,
      spent: BigInt(0),
      active: true,
      createdAt: now,
      expiresAt: now + passConfig.expiryMs,
    };
  }

  /**
   * Execute a transaction against an EdgePass.
   *
   * Returns one of four statuses:
   * - 'approved'  — executed on-chain successfully
   * - 'escalated' — exceeds threshold, needs human approval
   * - 'blocked'   — policy rejected the transaction
   * - 'error'     — network/signing failure, transaction NOT submitted
   *
   * Events fire for approved/escalated/blocked only.
   * Check outcome.status === 'error' separately for infrastructure failures.
   *
   * @example
   * sdk.on('approved', ({ outcome }) => console.log('tx:', outcome.digest));
   * const outcome = await sdk.execute(pass, { merchant, amount }, signer);
   * if (outcome.status === 'error') handleInfrastructureFailure(outcome.reason);
   */
  async execute(
    pass: EdgePassObject,
    request: TransactionRequest,
    signer: { signAndExecute: (tx: Transaction) => Promise<{ digest: string }> }
  ): Promise<TransactionOutcome> {
    const outcome = await this.engine.execute(pass, request, signer);

    // Fire events for policy outcomes only
    // 'error' status = infrastructure failure, not a policy decision
    if (outcome.status !== 'error') {
      this.emit({
        type:    outcome.status,
        outcome: outcome as any,
        pass,
        request,
      });
    }

    return outcome;
  }

  /**
   * Preview outcome without executing. Zero network calls.
   */
  validate(pass: EdgePassObject, request: TransactionRequest) {
    return PolicyEngine.validate(pass, request);
  }

  /**
   * Fetch a live EdgePass from Sui.
   * Returns null if not found.
   * Throws if objectId is invalid or a network error occurs.
   */
  async fetch(objectId: string): Promise<EdgePassObject | null> {
    return this.engine.fetchPass(objectId);
  }

  /**
   * Revoke an EdgePass on-chain.
   */
  async revoke(
    pass: EdgePassObject,
    signer: { signAndExecute: (tx: Transaction) => Promise<{ digest: string }> }
  ): Promise<{ digest: string }> {
    const tx = new Transaction();
    tx.setGasBudget(DEFAULT_GAS_BUDGET);
    const packageId = EDGE_PACKAGE_ID[this.config.network];
    tx.moveCall({
      target: `${packageId}::edge_pass::revoke_pass`,
      arguments: [tx.object(pass.id)],
    });
    return signer.signAndExecute(tx);
  }

  /**
   * Returns remaining budget in MIST.
   */
  remainingBudget(pass: EdgePassObject): bigint {
    return PolicyEngine.remainingBudget(pass);
  }

  /**
   * Returns true if the pass is active and not expired.
   */
  isValid(pass: EdgePassObject): boolean {
    return PolicyEngine.isValid(pass);
  }
}