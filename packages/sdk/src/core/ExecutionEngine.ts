import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import {
  EdgePassObject,
  EdgePassObjectV2,
  TransactionRequest,
  TransactionOutcome,
  Network,
} from "../utils/types";
import { PolicyEngine } from "./PolicyEngine";
import { NETWORK_URLS, EDGE_PACKAGE_ID, DEFAULT_GAS_BUDGET } from "../utils/constants";

const SUI_CLOCK_OBJECT_ID = '0x0000000000000000000000000000000000000000000000000000000000000006';

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

/**
 * Best-effort extraction of the Move abort code and transaction digest from a
 * failed on-chain denial. Depends on the signer surfacing the underlying RPC
 * error text (e.g. "MoveAbort(..., 4) ... in command 0") and/or a `digest`
 * property on the thrown error — both are common but not guaranteed across
 * signer implementations, so either field may come back undefined.
 */
function extractAbortInfo(error: unknown): { digest?: string; abortCode?: number } {
  const msg = error instanceof Error ? error.message : String(error);
  const digest = (error as { digest?: string })?.digest;

  const abortMatch = msg.match(/MoveAbort\([^)]*\)\s*,?\s*(\d+)\)/) ?? msg.match(/abort[_ ]code[:\s]+(\d+)/i);
  const abortCode = abortMatch ? Number(abortMatch[1]) : undefined;

  return { digest, abortCode };
}

export class ExecutionEngine {
  private client: SuiJsonRpcClient;
  private network: Network;
  private onChainDenials: boolean;

  constructor(network: Network, onChainDenials = true) {
    this.network = network;
    this.onChainDenials = onChainDenials;
    this.client = new SuiJsonRpcClient({
      url: NETWORK_URLS[network],
      network: network as 'mainnet' | 'testnet' | 'devnet',
    });
  }

  async execute(
    pass: EdgePassObjectV2,
    request: TransactionRequest,
    signer: { signAndExecute: (tx: Transaction) => Promise<{ digest: string }> }
  ): Promise<TransactionOutcome> {

    // ── Step 1: Policy validation (pure TS, no network) ───────────────────
    const validation = PolicyEngine.validate(pass, request);

    if (!validation.allowed) {
      if (!this.onChainDenials) {
        return { status: 'blocked', reason: validation.reason, auto: false };
      }

      // Submit anyway — the Move module will abort, and the abort is a
      // verifiable on-chain record of the denial.
      try {
        const tx = this.buildPTB(pass, request);
        const result = await signer.signAndExecute(tx);
        return { status: 'blocked', reason: validation.reason, digest: result.digest, auto: false };
      } catch (error) {
        const { digest, abortCode } = extractAbortInfo(error);
        return { status: 'blocked', reason: validation.reason, digest, abortCode, auto: false };
      }
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
      const { reason, code } = classifyError(error);
      return { status: 'error', reason, code, auto: false };
    }
  }

  private buildPTB(
    pass: EdgePassObjectV2,
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
      target: `${packageId}::edge_pass_v2::execute_transaction`,
      arguments: [
        tx.object(pass.id),
        tx.pure.u64(request.amount),
        tx.pure.address(request.merchant),
        tx.sharedObjectRef({
          objectId:             SUI_CLOCK_OBJECT_ID,
          initialSharedVersion: 1,
          mutable:              false,
        }),
      ],
    });

    return tx;
  }

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

      if (!obj.data?.content) {
        return null;
      }

      if (obj.data.content.dataType !== 'moveObject') {
        throw new Error(
          `EdgePass.fetch: object ${objectId} is not a Move object. ` +
          `Make sure you're passing an EdgePass object ID, not a transaction digest.`
        );
      }

      const content = obj.data.content as { type?: string; fields: Record<string, any> };
      const fields = content.fields;
      const isV2 = content.type?.includes('::edge_pass_v2::') ?? ('issuer' in fields && 'agent' in fields);

      if (isV2) {
        const requiredFields = [
          'budget', 'auto_threshold', 'max_per_transaction',
          'velocity_cap', 'velocity_used', 'window_ms', 'window_start_ms',
          'approved_merchants', 'issuer', 'agent', 'spent', 'active',
          'created_at_ms', 'expires_at_ms',
        ];

        for (const field of requiredFields) {
          if (fields[field] === undefined) {
            throw new Error(
              `EdgePass.fetch: object ${objectId} is missing field "${field}". ` +
              `This may not be an EdgePassV2 object, or the contract version has changed.`
            );
          }
        }

        return {
          version:          'v2',
          id:               objectId,
          issuer:           fields.issuer,
          agent:            fields.agent,
          budget:           BigInt(fields.budget),
          autoThreshold:    BigInt(fields.auto_threshold),
          maxPerTransaction: BigInt(fields.max_per_transaction),
          velocityCap:      Number(fields.velocity_cap),
          velocityUsed:     Number(fields.velocity_used),
          windowMs:         Number(fields.window_ms),
          windowStartMs:    Number(fields.window_start_ms),
          approvedMerchants: fields.approved_merchants,
          spent:            BigInt(fields.spent),
          active:           fields.active,
          createdAt:        Number(fields.created_at_ms),
          expiresAt:        Number(fields.expires_at_ms),
        };
      }

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
        version:           'v1',
        id:                objectId,
        owner:             fields.owner,
        budget:            BigInt(fields.budget),
        autoThreshold:     BigInt(fields.auto_threshold),
        escalateThreshold: BigInt(fields.escalate_threshold),
        maxPerTransaction: fields.max_per_transaction !== undefined ? BigInt(fields.max_per_transaction) : undefined,
        approvedMerchants: fields.approved_merchants,
        spent:             BigInt(fields.spent),
        active:            fields.active,
        createdAt:         Number(fields.created_at),
        expiresAt:         Number(fields.expires_at),
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
