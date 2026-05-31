import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import {
  EdgePassConfig,
  EdgePassObject,
  TransactionRequest,
  TransactionOutcome,
  EdgeSDKConfig,
} from "../utils/types";
import { PolicyEngine } from "./PolicyEngine";
import { ExecutionEngine } from "./ExecutionEngine";
import { NETWORK_URLS, EDGE_PACKAGE_ID, DEFAULT_GAS_BUDGET } from "../utils/constants";

export class EdgePass {
  private client: SuiClient;
  private engine: ExecutionEngine;
  private config: EdgeSDKConfig;

  constructor(config: EdgeSDKConfig) {
    this.config = config;
    this.client = new SuiClient({ url: NETWORK_URLS[config.network] });
    this.engine = new ExecutionEngine(config.network);
  }

  /**
   * Creates a new EdgePass on-chain.
   * Builds a PTB that mints a Move object with the given config.
   * 
   * Usage:
   * const pass = await sdk.create({
   *   budget: 300n * MIST_PER_SUI,
   *   autoThreshold: 50n * MIST_PER_SUI,
   *   escalateThreshold: 100n * MIST_PER_SUI,
   *   approvedMerchants: ["Shuttle Express", "Hydra Bar"],
   *   expiryMs: 48 * 60 * 60 * 1000,
   *   owner: "0x...",
   * });
   */
  async create(
    passConfig: EdgePassConfig,
    signer: { signAndExecute: (tx: Transaction) => Promise<{ digest: string; objectId?: string }> }
  ): Promise<EdgePassObject> {
    const tx = new Transaction();
    tx.setGasBudget(DEFAULT_GAS_BUDGET);

    const packageId = EDGE_PACKAGE_ID[this.config.network];

    tx.moveCall({
      target: `${packageId}::edge_pass::create_pass`,
      arguments: [
        tx.pure.u64(passConfig.budget),
        tx.pure.u64(passConfig.autoThreshold),
        tx.pure.u64(passConfig.escalateThreshold),
        tx.pure.u64(passConfig.expiryMs),
        tx.pure.vector("string", passConfig.approvedMerchants),
      ],
    });

    const result = await signer.signAndExecute(tx);

    const objectId = result.objectId || "";
    const now = Date.now();

    return {
      id: objectId,
      config: passConfig,
      spent: BigInt(0),
      active: true,
      createdAt: now,
      expiresAt: now + passConfig.expiryMs,
    };
  }

  /**
   * Executes a transaction against an EdgePass.
   * Runs policy validation first — if blocked or escalated,
   * returns without hitting the chain.
   * 
   * Usage:
   * const outcome = await sdk.execute(pass, {
   *   merchant: "Shuttle Express",
   *   amount: 18_500_000_000n,
   * }, signer);
   */
  async execute(
    pass: EdgePassObject,
    request: TransactionRequest,
    signer: { signAndExecute: (tx: Transaction) => Promise<{ digest: string }> }
  ): Promise<TransactionOutcome> {
    return this.engine.execute(pass, request, signer);
  }

  /**
   * Validates a transaction against an EdgePass without executing.
   * Useful for UI preview — show the user what will happen before they confirm.
   */
  validate(pass: EdgePassObject, request: TransactionRequest) {
    return PolicyEngine.validate(pass, request);
  }

  /**
   * Fetches a live EdgePass from the Sui network by object ID.
   */
  async fetch(objectId: string): Promise<EdgePassObject | null> {
    return this.engine.fetchPass(objectId);
  }

  /**
   * Revokes an EdgePass on-chain.
   * After revocation, all future execute() calls will return blocked.
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
   * Returns remaining budget for a pass.
   */
  remainingBudget(pass: EdgePassObject): bigint {
    return PolicyEngine.remainingBudget(pass);
  }

  /**
   * Checks if a pass is still valid.
   */
  isValid(pass: EdgePassObject): boolean {
    return PolicyEngine.isValid(pass);
  }
}