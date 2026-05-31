import { EdgePass } from "@edge-protocol/sdk";
import type { EdgePassConfig, EdgePassObject, TransactionRequest, Network } from "@edge-protocol/sdk";

const network = (process.env.NEXT_PUBLIC_SUI_NETWORK || "devnet") as Network;

// Singleton SDK instance
let _sdk: EdgePass | null = null;

export function getSDK(): EdgePass {
  if (!_sdk) {
    _sdk = new EdgePass({
      network,
      enokiApiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY!,
    });
  }
  return _sdk;
}

// Converts form values (dollars) to SDK config (MIST)
export function formToPassConfig(
  form: {
    budget: number;
    autoThreshold: number;
    escalateThreshold: number;
    expiry: number;
    merchants: string[];
  },
  owner: string
): EdgePassConfig {
  const MIST = BigInt(1_000_000_000);
  return {
    budget: BigInt(form.budget) * MIST,
    autoThreshold: BigInt(form.autoThreshold) * MIST,
    escalateThreshold: BigInt(form.escalateThreshold) * MIST,
    approvedMerchants: form.merchants,
    expiryMs: form.expiry * 60 * 60 * 1000,
    owner,
  };
}

// Converts dollars to MIST for execute calls
export function dollarsToMist(dollars: number): bigint {
  return BigInt(Math.round(dollars * 1_000_000_000));
}

// Validates a transaction without executing (for UI preview)
export function previewTransaction(
  pass: EdgePassObject,
  merchant: string,
  amount: number
) {
  const sdk = getSDK();
  return sdk.validate(pass, {
    merchant,
    amount: dollarsToMist(amount),
  });
}