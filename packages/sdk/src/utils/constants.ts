export const MIST_PER_SUI = BigInt(1_000_000_000);

export const NETWORK_URLS: Record<string, string> = {
  mainnet: "https://fullnode.mainnet.sui.io",
  testnet: "https://fullnode.testnet.sui.io",
  devnet: "https://fullnode.devnet.sui.io",
};

// Fill these in after deploying the Move contract
export const EDGE_PACKAGE_ID: Record<string, string> = {
  mainnet: "",
  testnet: "",
  devnet: "",
};

export const DEFAULT_GAS_BUDGET = BigInt(10_000_000);

// Festival Mode demo constants
export const FESTIVAL_MERCHANTS = [
  "Shuttle Express",
  "Festival Kitchen", 
  "Hydra Bar",
  "Stage Access VIP",
  "Official Merch",
];

export const FESTIVAL_CONFIG = {
  budget: BigInt(300) * MIST_PER_SUI,
  autoThreshold: BigInt(50) * MIST_PER_SUI,
  escalateThreshold: BigInt(100) * MIST_PER_SUI,
  expiryMs: 48 * 60 * 60 * 1000,
};