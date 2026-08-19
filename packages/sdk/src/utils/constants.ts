export const MIST_PER_SUI = BigInt(1_000_000_000);

export const NETWORK_URLS: Record<string, string> = {
  mainnet: 'https://fullnode.mainnet.sui.io',
  testnet: 'https://fullnode.testnet.sui.io',
  devnet:  'https://fullnode.devnet.sui.io',
};

// v1 and v2 are separate package deployments — `create_pass`/`execute_transaction`
// (v2-only) and `edge_pass::revoke_pass` (v1-only) need to resolve to different
// package IDs on the same network. An empty string means "not deployed there
// yet"; callers must check before building a moveCall target from it.
//
// mainnet.v2 is empty on purpose — v2 has only been published to testnet so
// far. Until mainnet.v2 is filled in, `sdk.create()` (which only mints v2
// passes) will throw rather than silently target a package ID whose
// `edge_pass_v2` module doesn't exist.
export const EDGE_PACKAGE_ID: Record<string, { v1: string; v2: string }> = {
  mainnet: {
    v1: '0x2ad62ac22e74172cc2e33cbebd7471fb16403831b3bdd1143d51935cefd1bbde',
    v2: '',
  },
  testnet: {
    v1: '0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d',
    v2: '0xe781abc2d83f5400a2863501a40e0ed9c68f5af63c62f050c564bacaf495361a',
  },
  devnet: {
    v1: '',
    v2: '',
  },
};

export const DEFAULT_GAS_BUDGET = BigInt(10_000_000);

// ── Templates ─────────────────────────────────────────────────────────────
//
// v2 templates — no more escalateThreshold. escalateAbove now drives
// off-chain escalation routing directly (renamed from `autoThreshold`
// because v1's `autoThreshold` was dead and this field isn't),
// maxPerTransaction is the hard on-chain ceiling, and each template ships
// a sane velocity default. approvedMerchants are addresses (empty here —
// fill in per deployment).

export const EDGE_TEMPLATES = {
  festival: {
    budget:            BigInt(300)    * MIST_PER_SUI,
    escalateAbove:     BigInt(50)     * MIST_PER_SUI,
    maxPerTransaction: BigInt(200)    * MIST_PER_SUI,
    velocityCap:       20,
    velocityWindowMs:  60 * 60 * 1000,        // 20 actions / hour
    expiryMs:          48 * 60 * 60 * 1000,
    approvedMerchants: [] as string[],
  },
  gaming: {
    budget:            BigInt(50)     * MIST_PER_SUI,
    escalateAbove:     BigInt(2)      * MIST_PER_SUI,
    maxPerTransaction: BigInt(10)     * MIST_PER_SUI,
    velocityCap:       50,
    velocityWindowMs:  10 * 60 * 1000,        // 50 actions / 10 min
    expiryMs:          4 * 60 * 60 * 1000,
    approvedMerchants: [] as string[],
  },
  subscription: {
    budget:            BigInt(200)    * MIST_PER_SUI,
    escalateAbove:     BigInt(20)     * MIST_PER_SUI,
    maxPerTransaction: BigInt(50)     * MIST_PER_SUI,
    velocityCap:       5,
    velocityWindowMs:  24 * 60 * 60 * 1000,   // 5 actions / day
    expiryMs:          30 * 24 * 60 * 60 * 1000,
    approvedMerchants: [] as string[],
  },
  defi: {
    budget:            BigInt(10_000) * MIST_PER_SUI,
    escalateAbove:     BigInt(500)    * MIST_PER_SUI,
    maxPerTransaction: BigInt(2_000)  * MIST_PER_SUI,
    velocityCap:       10,
    velocityWindowMs:  60 * 60 * 1000,        // 10 actions / hour
    expiryMs:          7 * 24 * 60 * 60 * 1000,
    approvedMerchants: [] as string[],
  },
  enterprise: {
    budget:            BigInt(50_000) * MIST_PER_SUI,
    escalateAbove:     BigInt(1_000)  * MIST_PER_SUI,
    maxPerTransaction: BigInt(10_000) * MIST_PER_SUI,
    velocityCap:       100,
    velocityWindowMs:  60 * 60 * 1000,        // 100 actions / hour
    expiryMs:          30 * 24 * 60 * 60 * 1000,
    approvedMerchants: [] as string[],
  },
  // x402 — designed for Coinbase x402 payment protocol integration
  // Edge validates policy (should this agent pay?), x402 moves the money (how does it pay?)
  // Together they form a complete autonomous payment stack.
  x402: {
    budget:            BigInt(1_000)  * MIST_PER_SUI,
    escalateAbove:     BigInt(10)     * MIST_PER_SUI,
    maxPerTransaction: BigInt(200)    * MIST_PER_SUI,
    velocityCap:       30,
    velocityWindowMs:  5 * 60 * 1000,         // 30 actions / 5 min — machine-speed retries
    expiryMs:          24 * 60 * 60 * 1000,
    approvedMerchants: [] as string[],
  },
} as const;

export type EdgePassTemplate = keyof typeof EDGE_TEMPLATES;

// ── Legacy festival constants (kept for backwards compat) ─────────────────

export const FESTIVAL_MERCHANTS = [
  'Shuttle Express',
  'Festival Kitchen',
  'Hydra Bar',
  'Stage Access VIP',
  'Official Merch',
];

export const FESTIVAL_CONFIG = {
  budget:            BigInt(300) * MIST_PER_SUI,
  autoThreshold:     BigInt(50)  * MIST_PER_SUI,
  escalateThreshold: BigInt(100) * MIST_PER_SUI,
  expiryMs:          48 * 60 * 60 * 1000,
};
