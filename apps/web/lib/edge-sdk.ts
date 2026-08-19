import { EdgePass, isV2 } from "@edge-protocol/sdk";
import type { EdgePassConfig, EdgePassObject, Network, PolicyValidation } from "@edge-protocol/sdk";

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
//
// v1 -> v2 note: v2 requires a hard `maxPerTransaction` ceiling that the old
// form never collected; until the UI grows that field, cap it at the full
// budget so nothing that used to reach "escalate" now gets silently blocked
// instead. `agent` doubles as `issuer` here since this app has the same
// wallet create and spend against its own pass.
export function formToPassConfig(
  form: {
    budget: number;
    escalateAbove: number;
    expiry: number;
    merchants: string[];
  },
  agent: string
): EdgePassConfig {
  const MIST = BigInt(1_000_000_000);
  const budget = BigInt(form.budget) * MIST;
  return {
    agent,
    issuer: agent,
    budget,
    escalateAbove: BigInt(form.escalateAbove) * MIST,
    maxPerTransaction: budget,
    velocityCap: 0,
    velocityWindowMs: 0,
    approvedMerchants: form.merchants,
    expiryMs: form.expiry * 60 * 60 * 1000,
  };
}

// Converts dollars to MIST for execute calls
export function dollarsToMist(dollars: number): bigint {
  return BigInt(Math.round(dollars * 1_000_000_000));
}

// Validates a transaction without executing (for UI preview).
// v1 passes are read-only and were never validatable by PolicyEngine either
// (v1's validate() is gone) — only v2 passes can be previewed.
export function previewTransaction(
  pass: EdgePassObject,
  merchant: string,
  amount: number
): PolicyValidation {
  if (!isV2(pass)) {
    return { allowed: false, requiresEscalation: false, reason: 'Preview is only supported for v2 passes' };
  }
  const sdk = getSDK();
  return sdk.validate(pass, {
    merchant,
    amount: dollarsToMist(amount),
  });
}