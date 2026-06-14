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

export class EdgePass {
  private client: SuiClient;
  private engine: ExecutionEngine;
  private config: EdgeSDKConfig;

  constructor(config: EdgeSDKConfig) {
    this.config = config;
    this.client = new SuiClient({ url: NETWORK_URLS[config.network] });
    this.engine = new ExecutionEngine(config.network);
  }

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

  async create(
    passConfig: EdgePassConfig,
    signer: { signAndExecute: (tx: Transaction, kindBytes: string) => Promise<{ digest: string; objectId?: string | null }> }
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
        tx.pure.vector('string', passConfig.approvedMerchants),
        tx.sharedObjectRef({
          objectId: SUI_CLOCK_OBJECT_ID,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    // All arguments statically known — no RPC needed, instant build
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
