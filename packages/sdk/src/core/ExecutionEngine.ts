import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import {
  EdgePassObject,
  TransactionRequest,
  TransactionOutcome,
  Network,
} from "../utils/types";
import { PolicyEngine } from "./PolicyEngine";
import { NETWORK_URLS, EDGE_PACKAGE_ID, DEFAULT_GAS_BUDGET } from "../utils/constants";

export class ExecutionEngine {
  private client: SuiClient;
  private network: Network;

  constructor(network: Network) {
    this.network = network;
    this.client = new SuiClient({ url: NETWORK_URLS[network] });
  }

  async execute(
    pass: EdgePassObject,
    request: TransactionRequest,
    signer: { signAndExecute: (tx: Transaction) => Promise<{ digest: string }> }
  ): Promise<TransactionOutcome> {
    const validation = PolicyEngine.validate(pass, request);
    if (!validation.allowed) {
      return { status: "blocked", reason: validation.reason, auto: false };
    }
    if (validation.requiresEscalation) {
      return { status: "escalated", reason: validation.reason, auto: false };
    }
    try {
      const tx = this.buildPTB(pass, request);
      const result = await signer.signAndExecute(tx);
      return { status: "approved", digest: result.digest, auto: true };
    } catch (error) {
      return {
        status: "blocked",
        reason: `Execution failed: ${error instanceof Error ? error.message : "unknown error"}`,
        auto: false,
      };
    }
  }

  private buildPTB(
    pass: EdgePassObject,
    request: TransactionRequest
  ): Transaction {
    const tx = new Transaction();
    tx.setGasBudget(DEFAULT_GAS_BUDGET);
    const packageId = EDGE_PACKAGE_ID[this.network];

    tx.moveCall({
      target: `${packageId}::edge_pass::execute_transaction`,
      arguments: [
        tx.object(pass.id),
        tx.pure.u64(request.amount),
        tx.pure.string(request.merchant),
        tx.object('0x6'), // Sui shared Clock object
      ],
    });

    return tx;
  }

  async fetchPass(objectId: string): Promise<EdgePassObject | null> {
    try {
      const obj = await this.client.getObject({
        id: objectId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
        return null;
      }

      const fields = obj.data.content.fields as Record<string, any>;

      return {
        id: objectId,
        config: {
          budget: BigInt(fields.budget),
          autoThreshold: BigInt(fields.auto_threshold),
          escalateThreshold: BigInt(fields.escalate_threshold),
          approvedMerchants: fields.approved_merchants,
          expiryMs: Number(fields.expiry_ms),
          owner: fields.owner,
        },
        spent: BigInt(fields.spent),
        active: fields.active,
        createdAt: Number(fields.created_at),
        expiresAt: Number(fields.expires_at),
      };
    } catch {
      return null;
    }
  }
}