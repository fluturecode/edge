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

// Error codes for programmatic handling
export const EDGE_ERROR_CODES = {
  NETWORK_FAILURE:    'NETWORK_FAILURE',
  SIGNING_FAILURE:    'SIGNING_FAILURE',
  INVALID_OBJECT_ID:  'INVALID_OBJECT_ID',
  OBJECT_NOT_FOUND:   'OBJECT_NOT_FOUND',
  INVALID_PASS_STATE: 'INVALID_PASS_STATE',
  UNKNOWN:            'UNKNOWN',
} as const;

export type EdgeErrorCode = typeof EDGE_ERROR_CODES[keyof typeof EDGE_ERROR_CODES];

function classifyError(error: unknown): { reason: string; code: EdgeErrorCode } {
  const msg = error instanceof Error ? error.message : String(error);

  if (
    msg.includes('fetch failed') ||
    msg.includes('ConnectTimeout') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('network') ||
    msg.includes('RPC')
  ) {
    return {
      reason: `Sui network unreachable — transaction was NOT submitted. Check your network connection and NETWORK_URLS config. (${msg})`,
      code: EDGE_ERROR_CODES.NETWORK_FAILURE,
    };
  }

  if (
    msg.includes('signature') ||
    msg.includes('signing') ||
    msg.includes('keypair') ||
    msg.includes('Invalid user signature')
  ) {
    return {
      reason: `Transaction signing failed — transaction was NOT submitted. Check your signer credentials. (${msg})`,
      code: EDGE_ERROR_CODES.SIGNING_FAILURE,
    };
  }

  if (msg.includes('not found') || msg.includes('does not exist')) {
    return {
      reason: `EdgePass object not found on chain — it may have been deleted or the ID is incorrect. (${msg})`,
      code: EDGE_ERROR_CODES.OBJECT_NOT_FOUND,
    };
  }

  return {
    reason: `Unexpected error — transaction was NOT submitted. (${msg})`,
    code: EDGE_ERROR_CODES.UNKNOWN,
  };
}

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

    // ── Step 1: Policy validation (pure TS, no network) ───────────────────
    const validation = PolicyEngine.validate(pass, request);

    if (!validation.allowed) {
      return { status: 'blocked', reason: validation.reason, auto: false };
    }

    if (validation.requiresEscalation) {
      return { status: 'escalated', reason: validation.reason, auto: false };
    }

    // ── Step 2: On-chain execution ─────────────────────────────────────────
    try {
      const tx = this.buildPTB(pass, request);
      const result = await signer.signAndExecute(tx);
      return { status: 'approved', digest: result.digest, auto: true };
    } catch (error) {
      // Distinguish infrastructure failures from policy rejections
      // 'error' status means the transaction was NEVER submitted to chain
      // 'blocked' status means the policy rejected it
      const { reason, code } = classifyError(error);
      return { status: 'error', reason, code, auto: false };
    }
  }

  private buildPTB(
    pass: EdgePassObject,
    request: TransactionRequest
  ): Transaction {
    const tx = new Transaction();
    tx.setGasBudget(DEFAULT_GAS_BUDGET);

    const packageId = EDGE_PACKAGE_ID[this.network];
    if (!packageId) {
      throw new Error(
        `EdgePass: no package ID configured for network "${this.network}". ` +
        `Update EDGE_PACKAGE_ID in constants.ts after deploying the Move contract.`
      );
    }

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

  /**
   * Fetch a live EdgePass from Sui.
   *
   * Returns null if the object doesn't exist.
   * Throws EdgePassError if the objectId is invalid or a network error occurs —
   * so callers can distinguish "not found" from "broken".
   */
  async fetchPass(objectId: string): Promise<EdgePassObject | null> {

    // Validate objectId format before hitting the network
    if (!objectId || objectId.length < 10) {
      throw new Error(
        `EdgePass.fetch: invalid objectId "${objectId}". ` +
        `Expected a Sui object ID starting with 0x.`
      );
    }

    if (!objectId.startsWith('0x')) {
      throw new Error(
        `EdgePass.fetch: objectId "${objectId}" must start with 0x.`
      );
    }

    try {
      const obj = await this.client.getObject({
        id: objectId,
        options: { showContent: true },
      });

      // Object exists but has no content — deleted or wrong type
      if (!obj.data?.content) {
        return null;
      }

      if (obj.data.content.dataType !== 'moveObject') {
        throw new Error(
          `EdgePass.fetch: object ${objectId} is not a Move object. ` +
          `Make sure you're passing an EdgePass object ID, not a transaction digest.`
        );
      }

      const fields = obj.data.content.fields as Record<string, any>;

      // Validate required fields exist before accessing
      const requiredFields = ['budget', 'auto_threshold', 'escalate_threshold', 'approved_merchants', 'owner', 'spent', 'active', 'created_at', 'expires_at'];
      for (const field of requiredFields) {
        if (fields[field] === undefined) {
          throw new Error(
            `EdgePass.fetch: object ${objectId} is missing field "${field}". ` +
            `This may not be an EdgePass object, or the contract version has changed.`
          );
        }
      }

      return {
        id: objectId,
        config: {
          budget:            BigInt(fields.budget),
          autoThreshold:     BigInt(fields.auto_threshold),
          escalateThreshold: BigInt(fields.escalate_threshold),
          approvedMerchants: fields.approved_merchants,
          expiryMs:          Number(fields.expires_at) - Number(fields.created_at),
          owner:             fields.owner,
        },
        spent:     BigInt(fields.spent),
        active:    fields.active,
        createdAt: Number(fields.created_at),
        expiresAt: Number(fields.expires_at),
      };

    } catch (error) {
      // Re-throw our own errors as-is
      if (error instanceof Error && error.message.startsWith('EdgePass')) {
        throw error;
      }

      // Wrap network/RPC errors with context
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `EdgePass.fetch: network error fetching object ${objectId}. ` +
        `Check your Sui RPC connection. (${msg})`
      );
    }
  }
}
