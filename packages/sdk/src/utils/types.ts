export interface EdgePassConfig {
  budget:             bigint;
  autoThreshold:      bigint;
  escalateThreshold:  bigint;
  maxPerTransaction?: bigint;
  approvedMerchants:  string[];
  expiryMs:           number;
  owner:              string;
}

export interface EdgePassObject {
  id:        string;
  config:    EdgePassConfig;
  spent:     bigint;
  active:    boolean;
  createdAt: number;
  expiresAt: number;
  // Object reference for optimized PTB construction — avoids extra RPC round trip
  // Populated by sdk.fetch(), undefined when created locally via sdk.create()
  objectRef?: {
    objectId: string;
    version:  string;
    digest:   string;
  };
}

export interface TransactionRequest {
  merchant:  string;
  amount:    bigint;
  metadata?: Record<string, string>;
}

/**
 * TransactionOutcome — returned by sdk.execute()
 *
 * approved  — transaction executed on-chain successfully
 * escalated — transaction exceeds threshold, needs human approval
 * blocked   — transaction rejected by policy
 * error     — network or signing failure — transaction was NOT submitted to chain
 */
export type TransactionOutcome =
  | { status: 'approved';  digest: string; objectId?: string; auto: true  }
  | { status: 'escalated'; reason: string;                    auto: false }
  | { status: 'blocked';   reason: string;                    auto: false }
  | { status: 'error';     reason: string; code?: string;     auto: false };

export interface PolicyValidation {
  allowed:            boolean;
  requiresEscalation: boolean;
  reason:             string;
}

export type Network = 'mainnet' | 'testnet' | 'devnet';

export interface EdgeSDKConfig {
  network:        Network;
  enokiApiKey:    string;
  googleClientId?: string;
}
