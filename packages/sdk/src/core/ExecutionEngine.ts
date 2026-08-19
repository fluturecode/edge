import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SimulationError } from "@mysten/sui/client";
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
 *
 * A `digest` is what makes a `blocked` outcome an on-chain, independently
 * verifiable denial — without one, nothing was actually submitted. The
 * clearest case of this: @mysten/sui's gRPC `Transaction.build()` runs a
 * client-side pre-flight `simulateTransaction` (a real dry-run, Move call
 * included) whenever anything about the transaction still needs resolving —
 * an object argument like the old `tx.object(pass.id)`, but also, separately,
 * an incompletely-specified gas section (price/budget/payment all need to be
 * set, not just budget) — and throws a `SimulationError` *instead of*
 * submitting if that simulation predicts a Move abort. That error's message
 * can still regex-match an abort code even though the chain never saw the
 * transaction, which is exactly how this used to silently defeat
 * `onChainDenials` — two of three denials "looked" recorded on-chain because
 * the regex matched, while `digest` was quietly `undefined` on both. Fixing
 * the object argument (see buildPTB's sharedObjectRef) is necessary but not
 * sufficient on its own — the signer also has to fully specify gas itself
 * (see buildPTB's gas comment) for a transaction to skip this gate for real.
 *
 * The return type makes the distinction structural rather than "digest
 * happens to be undefined": callers only get a `digest` (and can build a
 * `blocked` outcome) in the `reachedChain: true` branch. The `false` branch
 * carries a `predictedAbortCode` instead, purely for diagnostics — it must
 * never be reported as `abortCode` on a `blocked` outcome.
 */
function extractAbortInfo(
  error: unknown
): { reachedChain: true; digest: string; abortCode?: number } | { reachedChain: false; predictedAbortCode?: number } {
  const msg = error instanceof Error ? error.message : String(error);
  const regexMatch = msg.match(/MoveAbort\([^)]*\)\s*,?\s*(\d+)\)/) ?? msg.match(/abort[_ ]code[:\s]+(\d+)/i);
  const regexAbortCode = regexMatch ? Number(regexMatch[1]) : undefined;

  // A SimulationError specifically means "predicted an abort, never
  // submitted" — no digest exists by construction, no matter what the
  // message text looks like. Prefer its structured executionError (a real
  // abort code, not a regex guess) over the fallback below when present.
  if (error instanceof SimulationError) {
    const moveAbort = error.executionError?.MoveAbort;
    return {
      reachedChain: false,
      predictedAbortCode: moveAbort ? Number(moveAbort.abortCode) : regexAbortCode,
    };
  }

  const digest = (error as { digest?: string })?.digest;
  if (!digest) {
    return { reachedChain: false, predictedAbortCode: regexAbortCode };
  }

  return { reachedChain: true, digest, abortCode: regexAbortCode };
}

export class ExecutionEngine {
  private client: SuiGrpcClient;
  private network: Network;
  private onChainDenials: boolean;

  // objectId -> digest of the most recent successful write (execute/create/
  // revoke) this engine made, not yet consumed by a fetchPass() of that same
  // object. Read-after-write consistency isn't guaranteed by a single
  // getObject() call right after a write on any transport — a fullnode's
  // object/state view can lag its own ledger by a checkpoint or more. Rather
  // than block every write (which would add latency callers who never
  // re-fetch shouldn't have to pay for), fetchPass() checks this map and, if
  // an entry exists for the object it's about to read, waits for that
  // specific write to be visible first — then clears the entry, so later
  // fetches of the same object don't keep re-waiting.
  private pendingWrites: Map<string, string> = new Map();

  constructor(network: Network, onChainDenials = true) {
    this.network = network;
    this.onChainDenials = onChainDenials;
    this.client = new SuiGrpcClient({
      network: network as 'mainnet' | 'testnet' | 'devnet',
      baseUrl: NETWORK_URLS[network],
    });
  }

  /**
   * Records that `digest` mutated `objectId`, so the next fetchPass() of
   * that object waits for read-after-write consistency instead of racing a
   * fullnode that hasn't applied the write yet. Called by EdgePass.create()
   * and EdgePass.revoke() (which build/submit their own transactions rather
   * than going through execute()) in addition to this class's own execute().
   */
  registerWrite(objectId: string, digest: string): void {
    this.pendingWrites.set(objectId, digest);
  }

  /**
   * Waits for `objectId` to be readable at (or past) the version written by
   * transaction `digest`, using the transaction's own effects as the source
   * of truth for which version to wait for.
   *
   * Preferred path: `waitForTransaction` is this client's own bounded,
   * checkpoint-aware poll (a schedule + timeout, not a single racy read) for
   * the transaction becoming available — the closest thing this transport
   * offers to "wait for checkpoint". Once it resolves, `effects.changedObjects`
   * gives the exact version this transaction wrote for our object, which is a
   * far stronger signal than "some time has passed" — so we poll `getObject`
   * against that specific target rather than guessing.
   *
   * Fallback: if effects didn't turn up a version for this object (e.g. this
   * digest didn't touch it, or `waitForTransaction` itself timed out), fall
   * through to a bounded poll anyway rather than giving up immediately.
   */
  private async waitForReadConsistency(
    digest: string,
    objectId: string,
    timeoutMs = 15_000
  ): Promise<void> {
    let targetVersion: bigint | undefined;

    try {
      const txResult = await this.client.waitForTransaction({
        digest,
        include: { effects: true },
        timeout: timeoutMs,
      });
      const tx = txResult.Transaction ?? txResult.FailedTransaction;
      const changed = tx?.effects?.changedObjects.find(o => o.objectId === objectId);
      if (changed?.outputVersion) targetVersion = BigInt(changed.outputVersion);
    } catch {
      // waitForTransaction itself timed out, or the digest never resolved —
      // fall through to the blind bounded poll below.
    }

    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const res = await this.client.getObject({ objectId, include: {} });
        if (targetVersion === undefined || BigInt(res.object.version) >= targetVersion) return;
      } catch {
        // Not found yet / transient — keep polling until the deadline.
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    // Deadline exceeded — give up silently. The caller's next read may still
    // be stale, but we've bounded the wait instead of hanging indefinitely.
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
        const abortInfo = extractAbortInfo(error);
        if (!abortInfo.reachedChain) {
          // No digest means this never became a real, independently
          // verifiable on-chain record (see extractAbortInfo's doc comment
          // for why that's structurally impossible to confuse with a real
          // denial here). Reporting `blocked` anyway would look exactly like
          // a verified on-chain denial to a caller checking outcome.digest —
          // surface it as `error` instead.
          const { reason, code } = classifyError(error);
          const hint = abortInfo.predictedAbortCode !== undefined
            ? ` A client-side simulation predicted Move abort code ${abortInfo.predictedAbortCode}, but the transaction was never submitted, so this cannot be treated as a verified on-chain denial.`
            : '';
          return { status: 'error', reason: reason + hint, code, auto: false };
        }
        return { status: 'blocked', reason: validation.reason, digest: abortInfo.digest, abortCode: abortInfo.abortCode, auto: false };
      }
    }

    if (validation.requiresEscalation) {
      return { status: 'escalated', reason: validation.reason, auto: false };
    }

    // ── Step 2: On-chain execution ─────────────────────────────────────────
    try {
      const tx = this.buildPTB(pass, request);
      const result = await signer.signAndExecute(tx);
      this.registerWrite(pass.id, result.digest);
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

    const packageId = EDGE_PACKAGE_ID[this.network]?.v2;
    if (!packageId) {
      throw new Error(
        `EdgePass: no v2 package ID configured for network "${this.network}". ` +
        `Update EDGE_PACKAGE_ID[network].v2 in constants.ts after deploying edge_pass_v2.`
      );
    }

    if (!pass.initialSharedVersion) {
      throw new Error(
        `EdgePass: pass ${pass.id} is missing initialSharedVersion — re-fetch it via ` +
        `sdk.fetch() before calling execute(). A pass object built by hand (rather than ` +
        `returned from fetch()/create()) won't have this field populated.`
      );
    }

    // NOTE on gas: this only sets the budget, not price or payment coins —
    // that's deliberate. Resolving those requires knowing which address (and
    // which client) is actually going to pay for gas, and that's the
    // signer's call, not this engine's: a direct wallet signer pays from its
    // own coins (see apps/web/lib/signer.ts), while a sponsored signer (e.g.
    // Enoki) pays from a completely different address this engine has no
    // business assuming. See buildPTB's doc comment on the class / HANDOFF.md
    // for why an under-specified gas section can still trigger gRPC's
    // pre-flight resolve-and-simulate step even after this fix, and why the
    // signer — not the engine — needs to fully specify gas to avoid it.
    tx.moveCall({
      target: `${packageId}::edge_pass_v2::execute_transaction`,
      arguments: [
        tx.sharedObjectRef({
          objectId:             pass.id,
          initialSharedVersion: pass.initialSharedVersion,
          mutable:              true,
        }),
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

    // If a write we made (execute/create/revoke) hasn't been confirmed
    // readable yet, wait for it before reading — otherwise this fetch can
    // race the fullnode and return pre-transaction state. One-shot: cleared
    // as soon as we've waited for it once, so later fetches of the same
    // object don't keep re-waiting.
    const pendingDigest = this.pendingWrites.get(objectId);
    if (pendingDigest) {
      this.pendingWrites.delete(objectId);
      await this.waitForReadConsistency(pendingDigest, objectId);
    }

    try {
      // Unlike the old JSON-RPC getObject (which returned a response with no
      // `.data` for a missing object), the gRPC client throws instead — catch
      // that specific case here so sdk.fetch()'s "null means not found"
      // contract is unchanged for callers.
      let object: {
        type: string;
        json: Record<string, any> | null;
        owner: { $kind: string; Shared?: { initialSharedVersion: string } };
      };
      try {
        const res = await this.client.getObject({
          objectId,
          include: { json: true },
        });
        object = res.object;
      } catch (fetchError) {
        const msg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        if (msg.includes('not found')) {
          return null;
        }
        throw fetchError;
      }

      // A package (or anything else without Move struct content) comes back
      // with type: "package" and json: null rather than a moveObject flag.
      if (!object.json) {
        throw new Error(
          `EdgePass.fetch: object ${objectId} is not a Move object. ` +
          `Make sure you're passing an EdgePass object ID, not a transaction digest.`
        );
      }

      const fields = object.json;
      const isV2 = object.type?.includes('::edge_pass_v2::') ?? ('issuer' in fields && 'agent' in fields);

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

        // initialSharedVersion is fixed at the object's creation and never
        // changes afterward — unlike `version` above, it's safe to cache
        // indefinitely. edge_pass_v2 passes are always created via
        // transfer::share_object (see edge_pass_v2.move), so a missing
        // Shared owner here means this isn't really an EdgePassV2 pass —
        // fail loudly rather than silently omit a field every v2 call site
        // (execute, revoke) now depends on to build a correct transaction.
        const initialSharedVersion = object.owner?.Shared?.initialSharedVersion;
        if (object.owner?.$kind !== 'Shared' || !initialSharedVersion) {
          throw new Error(
            `EdgePass.fetch: object ${objectId} looks like an EdgePassV2 but isn't a shared ` +
            `object (owner kind: "${object.owner?.$kind}"). edge_pass_v2 passes are always ` +
            `created via transfer::share_object — this may not be a real EdgePassV2 pass.`
          );
        }

        return {
          version:          'v2',
          id:               objectId,
          initialSharedVersion,
          issuer:           fields.issuer,
          agent:            fields.agent,
          budget:           BigInt(fields.budget),
          escalateAbove:    BigInt(fields.auto_threshold),
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
