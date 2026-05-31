export const MIST_PER_SUI = BigInt(1_000_000_000);

export const NETWORK_URLS: Record<string, string> = {
  mainnet: "https://fullnode.mainnet.sui.io",
  testnet: "https://fullnode.testnet.sui.io",
  devnet: "https://fullnode.devnet.sui.io",
};

export const EDGE_PACKAGE_ID = {
  mainnet: "", // filled after mainnet deploy
  testnet: "", // filled after testnet deploy
  devnet: "",  // filled after devnet deploy
};

export const DEFAULT_GAS_BUDGET = BigInt(10_000_000); // 0.01 SUI