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
        tx.object('0x6'), // Sui shared Clock object
      ],
    });

    const result = await signer.signAndExecute(tx);
    await new Promise(r => setTimeout(r, 2000));

    // Fetch the created object ID from the transaction effects
    let objectId = result.objectId || "";
    if (!objectId && result.digest) {
      try {
        const txResult = await this.client.getTransactionBlock({
          digest: result.digest,
          options: { showObjectChanges: true },
        });
        const created = txResult.objectChanges?.find(
          (c) => c.type === "created" && c.objectType?.includes("edge_pass::EdgePass")
        );
        if (created && created.type === "created") {
          objectId = created.objectId;
        }
      } catch (e) {
        console.error("Could not fetch object ID from tx:", e);
      }
    }

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

  async execute(
    pass: EdgePassObject,
    request: TransactionRequest,
    signer: { signAndExecute: (tx: Transaction) => Promise<{ digest: string }> }
  ): Promise<TransactionOutcome> {
    return this.engine.execute(pass, request, signer);
  }

  validate(pass: EdgePassObject, request: TransactionRequest) {
    return PolicyEngine.validate(pass, request);
  }

  async fetch(objectId: string): Promise<EdgePassObject | null> {
    return this.engine.fetchPass(objectId);
  }

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

  remainingBudget(pass: EdgePassObject): bigint {
    return PolicyEngine.remainingBudget(pass);
  }

  isValid(pass: EdgePassObject): boolean {
    return PolicyEngine.isValid(pass);
  }
}