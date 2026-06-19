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
  VERSION_CONFLICT:   'VERSION_CONFLICT',
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

  // Object version conflict — caller should refetch and retry
  if (
    msg.includes('version') ||
    msg.includes('unavailable for consumption') ||
    msg.includes('Transaction needs to be rebuilt')
  ) {
    return {
      reason: `Object version conflict — transaction was NOT submitted. Refetch the pass and retry. (${msg})`,
      code: EDGE_ERROR_CODES.VERSION_CONFLICT,
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

    // ── Step 1: Policy validation (pure TS, zero network calls) ──────────
    const validation = PolicyEngine.validate(pass, request);

    if (!validation.allowed) {
      return { status: 'blocked', reason: validation.reason, auto: false };
    }

    if (validation.requiresEscalation) {
      return { status: 'escalated', reason: validation.reason, auto: false };
    }

    // ── Step 2: On-chain execution ────────────────────────────────────────
    // Uses objectRef if available (populated by fetchPass) to skip RPC
    // version resolution — saves ~300-400ms per approved transaction.
    // Falls back to tx.object() for passes created locally via sdk.create().
    try {
      const tx = this.buildPTB(pass, request);
      const result = await signer.signAndExecute(tx);
      return { status: 'approved', digest: result.digest, auto: true };
    } catch (error) {
      const { reason, code } = classifyError(error);

      // Version conflict — surface it so caller can refetch and retry
      if (code === EDGE_ERROR_CODES.VERSION_CONFLICT) {
        return { status: 'error', reason, code, auto: false };
      }

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

    // Use objectRef when available — skips RPC round trip to resolve version.
    // objectRef is populated by fetchPass() and contains the exact version + digest
    // from the last on-chain state, making the PTB construction deterministic.
    const passArg = pass.objectRef
      ? tx.objectRef(pass.objectRef)
      : tx.object(pass.id);

    tx.moveCall({
      target: `${packageId}::edge_pass::execute_transaction`,
      arguments: [
        passArg,
        tx.pure.u64(request.amount),
        tx.pure.string(request.merchant),
        tx.object('0x6'), // Sui shared Clock object
      ],
    });

    return tx;
  }

  /**
   * Fetch a live EdgePass from Sui.
   * Populates objectRef for optimized PTB construction on subsequent execute() calls.
   * Returns null if not found.
   * Throws if objectId is invalid or a network error occurs.
   */
  async fetchPass(objectId: string): Promise<EdgePassObject | null> {

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

      if (!obj.data?.content) return null;

      if (obj.data.content.dataType !== 'moveObject') {
        throw new Error(
          `EdgePass.fetch: object ${objectId} is not a Move object. ` +
          `Make sure you're passing an EdgePass object ID, not a transaction digest.`
        );
      }

      const fields = obj.data.content.fields as Record<string, any>;

      const requiredFields = [
        'budget', 'auto_threshold', 'escalate_threshold',
        'approved_merchants', 'owner', 'spent', 'active',
        'created_at', 'expires_at',
      ];
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
        // Populate objectRef for optimized PTB construction
        // This allows execute() to skip the RPC version resolution call
        objectRef: obj.data.version && obj.data.digest ? {
          objectId: objectId,
          version:  obj.data.version,
          digest:   obj.data.digest,
        } : undefined,
      };

    } catch (error) {
      if (error instanceof Error && error.message.startsWith('EdgePass')) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `EdgePass.fetch: network error fetching object ${objectId}. ` +
        `Check your Sui RPC connection. (${msg})`
      );
    }
  }
}
