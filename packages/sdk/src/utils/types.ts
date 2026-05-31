export interface EdgePassConfig {
  budget: bigint;              // total spend limit in MIST (1 SUI = 1_000_000_000 MIST)
  autoThreshold: bigint;       // auto-approve transactions below this amount
  escalateThreshold: bigint;   // escalate transactions above this amount
  approvedMerchants: string[]; // list of approved merchant addresses or names
  expiryMs: number;            // expiry duration in milliseconds
  owner: string;               // Sui address of the pass owner
}

export interface EdgePassObject {
  id: string;                  // Sui object ID of the on-chain EdgePass
  config: EdgePassConfig;
  spent: bigint;               // total amount spent so far
  active: boolean;
  createdAt: number;
  expiresAt: number;
}

export interface TransactionRequest {
  merchant: string;            // merchant identifier
  amount: bigint;              // amount in MIST
  metadata?: Record<string, string>;
}

export type TransactionOutcome =
  | { status: "approved"; digest: string; auto: true }
  | { status: "escalated"; reason: string; auto: false }
  | { status: "blocked"; reason: string; auto: false };

export interface PolicyValidation {
  allowed: boolean;
  requiresEscalation: boolean;
  reason: string;
}

export type Network = "mainnet" | "testnet" | "devnet";

export interface EdgeSDKConfig {
  network: Network;
  enokiApiKey: string;
  googleClientId?: string;
}