export const MIST_PER_SUI = BigInt(1_000_000_000);

export const NETWORK_URLS: Record<string, string> = {
  mainnet: 'https://fullnode.mainnet.sui.io',
  testnet: 'https://fullnode.testnet.sui.io',
  devnet:  'https://fullnode.devnet.sui.io',
};

export const EDGE_PACKAGE_ID: Record<string, string> = {
  mainnet: '',
  testnet: '0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d',
  devnet:  '',
};

export const DEFAULT_GAS_BUDGET = BigInt(10_000_000);

// ── Templates ─────────────────────────────────────────────────────────────

export const EDGE_TEMPLATES = {
  festival: {
    budget:            BigInt(300)    * MIST_PER_SUI,
    autoThreshold:     BigInt(50)     * MIST_PER_SUI,
    escalateThreshold: BigInt(100)    * MIST_PER_SUI,
    maxPerTransaction: BigInt(200)    * MIST_PER_SUI,
    expiryMs:          48 * 60 * 60 * 1000,
    approvedMerchants: [] as string[],
  },
  gaming: {
    budget:            BigInt(50)     * MIST_PER_SUI,
    autoThreshold:     BigInt(2)      * MIST_PER_SUI,
    escalateThreshold: BigInt(10)     * MIST_PER_SUI,
    maxPerTransaction: BigInt(10)     * MIST_PER_SUI,
    expiryMs:          4 * 60 * 60 * 1000,
    approvedMerchants: [] as string[],
  },
  subscription: {
    budget:            BigInt(200)    * MIST_PER_SUI,
    autoThreshold:     BigInt(20)     * MIST_PER_SUI,
    escalateThreshold: BigInt(50)     * MIST_PER_SUI,
    maxPerTransaction: BigInt(50)     * MIST_PER_SUI,
    expiryMs:          30 * 24 * 60 * 60 * 1000,
    approvedMerchants: [] as string[],
  },
  defi: {
    budget:            BigInt(10_000) * MIST_PER_SUI,
    autoThreshold:     BigInt(500)    * MIST_PER_SUI,
    escalateThreshold: BigInt(1_000)  * MIST_PER_SUI,
    maxPerTransaction: BigInt(2_000)  * MIST_PER_SUI,
    expiryMs:          7 * 24 * 60 * 60 * 1000,
    approvedMerchants: [] as string[],
  },
  enterprise: {
    budget:            BigInt(50_000) * MIST_PER_SUI,
    autoThreshold:     BigInt(1_000)  * MIST_PER_SUI,
    escalateThreshold: BigInt(5_000)  * MIST_PER_SUI,
    maxPerTransaction: BigInt(10_000) * MIST_PER_SUI,
    expiryMs:          30 * 24 * 60 * 60 * 1000,
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
