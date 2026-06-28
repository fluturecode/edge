import { SuiClient } from "@mysten/sui/client";
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
  private client: SuiClient;
  private engine: ExecutionEngine;
  private config: EdgeSDKConfig;
  // eslint-disable-next-line @typescript-eslint/ban-types
  private listeners: Map<EdgePassEventType, Set<Function>> = new Map();

  constructor(config: EdgeSDKConfig) {
    this.config = config;
    this.client = new SuiClient({ url: NETWORK_URLS[config.network] });
    this.engine = new ExecutionEngine(config.network);
  }

  // ── Event system ─────────────────────────────────────────────────────────────

  /**
   * Subscribe to transaction outcomes.
   *
   * @example
   * sdk.on('approved', ({ outcome, pass }) => {
   *   updateBudgetUI(pass);
   *   console.log('executed:', outcome.digest);
   * });
   * sdk.on('escalated', ({ request }) => {
   *   notifyUser(`Approve $${request.amount} at ${request.merchant}?`);
   * });
   * sdk.on('blocked', ({ outcome }) => {
   *   logger.warn('blocked:', outcome.reason);
   * });
   */
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

  /**
   * Higher-order function — wraps any async function with EdgePass policy enforcement.
   * The wrapped function only executes if the transaction is approved.
   * Returns blocked/escalated outcomes without calling the wrapped function.
   *
   * Perfect for wrapping AI tool calls.
   *
   * @example
   * const safePurchase = EdgePass.withPolicy(pass, signer, sdk, async (request) => {
   *   return await purchaseItem(request.merchant, request.amount);
   * });
   *
   * // Now safePurchase enforces EdgePass policy automatically
   * const result = await safePurchase({ merchant: 'Hydra Bar', amount: 32n * MIST_PER_SUI });
   * // result.outcome === 'approved' | 'blocked' | 'escalated'
   */
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
   * Wrap an Edge policy check with Fireblocks settlement.
   *
   * Edge validates policy on Sui mainnet. If approved, Fireblocks executes
   * the settlement and links the Edge digest in the transaction note.
   * Blocked and escalated decisions never reach Fireblocks.
   *
   * Every Fireblocks transaction is traceable back to an immutable Edge
   * approval on Sui mainnet — full audit trail for compliance.
   *
   * @example
   * const safeTx = EdgePass.withFireblocks(pass, signer, sdk, {
   *   settle: async (approved) => {
   *     return await fireblocks.createTransaction({
   *       assetId: 'USDC_BASE',
   *       amount: approved.amountUSD,
   *       source: { type: 'VAULT_ACCOUNT', id: '0' },
   *       destination: { type: 'ONE_TIME_ADDRESS', oneTimeAddress: { address: approved.destinationAddress } },
   *       note: `Edge approved: ${approved.edgeDigest}`,
   *     });
   *   },
   *   onEscalated: async ({ request, reason }) => {
   *     await notifySlack(`Approval required: ${reason}`);
   *   },
   * });
   *
   * const result = await safeTx({
   *   merchant: 'aws-billing.vendor',
   *   amount: BigInt(450) * MIST_PER_SUI,
   *   amountUSD: '450.00',
   *   destinationAddress: '0x...',
   * });
   */
  static withFireblocks<TSettlement>(
    pass: EdgePassObject,
    signer: { signAndExecute: (tx: Transaction) => Promise<{ digest: string }> },
    sdk: EdgePass,
    options: {
      /** Called when Edge approves — execute your Fireblocks settlement here */
      settle: (approved: {
        edgeDigest: string;
        merchant: string;
        amount: bigint;
        amountUSD: string;
        destinationAddress: string;
      }) => Promise<TSettlement>;
      /** Called when Edge escalates — notify human approver */
      onEscalated?: (context: {
        request: TransactionRequest & { amountUSD: string; destinationAddress: string };
        reason: string;
      }) => Promise<void>;
      /** Called when Edge blocks — log or alert */
      onBlocked?: (context: {
        request: TransactionRequest & { amountUSD: string; destinationAddress: string };
        reason: string;
      }) => Promise<void>;
    }
  ): (request: TransactionRequest & { amountUSD: string; destinationAddress: string }) => Promise<{
    outcome: TransactionOutcome;
    settlement?: TSettlement;
    edgeDigest?: string;
  }> {
    return async (request) => {
      const outcome = await sdk.execute(pass, request, signer);

      if (outcome.status === 'approved') {
        const settlement = await options.settle({
          edgeDigest: outcome.digest,
          merchant: request.merchant,
          amount: request.amount,
          amountUSD: request.amountUSD,
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

  /**
   * Mint a new EdgePass on Sui.
   */
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
   */
  async execute(
    pass: EdgePassObject,
    request: TransactionRequest,
    signer: { signAndExecute: (tx: Transaction) => Promise<{ digest: string }> }
  ): Promise<TransactionOutcome> {
    const outcome = await this.engine.execute(pass, request, signer);

    if (outcome.status !== 'error') {
      this.emit({ type: outcome.status, outcome: outcome as any, pass, request });
    }

    return outcome;
  }

  /**
   * Simulate a sequence of transactions against an EdgePass.
   * Zero network calls. Sub-millisecond. Returns predicted outcomes for
   * all decisions including projected budget state after each step.
   *
   * Use this to show an agent its plan before executing, or to build
   * approval UIs that show what will happen before touching the chain.
   *
   * @example
   * const plan = sdk.simulate(pass, [
   *   { merchant: 'Hydra Bar',      amount: 32n * MIST_PER_SUI },
   *   { merchant: 'ShadyTokens.xyz', amount: 1n },
   *   { merchant: 'Stage Access VIP', amount: 220n * MIST_PER_SUI },
   * ]);
   *
   * console.log(plan.summary);
   * // { approvedCount: 1, blockedCount: 1, escalatedCount: 1, totalDecisions: 3 }
   *
   * // Show plan, then execute approved decisions
   * for (const decision of plan.approved) {
   *   await sdk.execute(pass, decision.request, signer);
   * }
   */
  simulate(pass: EdgePassObject, requests: TransactionRequest[]): SimulationResult {
    return PolicyEngine.simulate(pass, requests);
  }

  /**
   * Preview a single transaction outcome without executing.
   * Zero network calls. Sub-millisecond.
   */
  validate(pass: EdgePassObject, request: TransactionRequest) {
    return PolicyEngine.validate(pass, request);
  }

  /**
   * Returns a complete budget status snapshot.
   *
   * @example
   * const status = sdk.budgetStatus(pass);
   * if (status.isExhausted) stopAgent();
   * if (status.isNearLimit) warnUser(`${status.utilizationPct.toFixed(1)}% of budget used`);
   */
  budgetStatus(pass: EdgePassObject, nearLimitThreshold = 0.8): BudgetStatus {
    return PolicyEngine.budgetStatus(pass, nearLimitThreshold);
  }

  /**
   * Returns budget utilization as a percentage (0-100).
   */
  utilizationPct(pass: EdgePassObject): number {
    return PolicyEngine.utilizationPct(pass);
  }

  /**
   * Returns true if budget utilization exceeds the given threshold.
   * Default threshold is 80%.
   */
  isNearLimit(pass: EdgePassObject, threshold = 0.8): boolean {
    return PolicyEngine.isNearLimit(pass, threshold);
  }

  /**
   * Returns the remaining budget in MIST.
   */
  remainingBudget(pass: EdgePassObject): bigint {
    return PolicyEngine.remainingBudget(pass);
  }

  /**
   * Returns time remaining on the pass in milliseconds. 0 if expired.
   */
  timeRemaining(pass: EdgePassObject): number {
    return PolicyEngine.timeRemaining(pass);
  }

  /**
   * Returns true if the pass will expire within the given window.
   * Default window is 1 hour.
   */
  isExpiringSoon(pass: EdgePassObject, withinMs = 60 * 60 * 1000): boolean {
    return PolicyEngine.isExpiringSoon(pass, withinMs);
  }

  /**
   * Returns true if the pass is active and not expired.
   */
  isValid(pass: EdgePassObject): boolean {
    return PolicyEngine.isValid(pass);
  }

  /**
   * Fetch a live EdgePass from Sui.
   * Returns null if not found.
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
}
