// Demo merchant directory — maps a human-readable label to the Sui address
// that's actually enforced on-chain. `approvedMerchants` and
// `TransactionRequest.merchant` take addresses, never names — see
// packages/sdk/DOCS.md's "Integration Examples" note and the v2 Move
// module's own header comment ("ADDRESSES, NOT STRINGS") in
// contracts/navis/sources/edge_pass_v2.move. `merchantLabel` is the only
// field meant for display strings.
//
// These addresses are throwaway testnet keypairs generated for this demo —
// not real merchants, no history or funds behind them. They only need to be
// valid, stable Sui addresses so approvedMerchants/execute() round-trip
// correctly against edge_pass_v2 on testnet.

export interface Merchant {
  label: string;
  address: string;
}

export const FESTIVAL_MERCHANTS: Merchant[] = [
  { label: 'Shuttle Express', address: '0x1942aee6b5b462759661cdbdf854a3a4ef042da6ea684a222f7351ef8dad81aa' },
  { label: 'Festival Kitchen', address: '0xe3beaefafb1ba65e58a692c59798674b2f5f709d18113a1e4ff63efe1d7978ea' },
  { label: 'Hydra Bar', address: '0x684bc0f8e3e0d0167dba0b5c440d198e2d0ca447d849dafbc0752ada58fbbabc' },
  { label: 'Stage Access VIP', address: '0x37852a51ba0514970f8bc37462623221f9ab725c682a42af13071cb4994f2726' },
  { label: 'Official Merch', address: '0x6ab0a3dee991fc26c75e8899b0481628bd7e88797e176c61a92587edbc625372' },
];

// Deliberately NOT included in FESTIVAL_MERCHANTS / any approvedMerchants
// list — used by the agent demo to show EMerchantNotApproved being enforced.
export const SHADY_TOKENS: Merchant = {
  label: 'ShadyTokens.xyz',
  address: '0x574de772a95f04a4c2280a70da70ad3244b1613d298d2809bba2f3104a1fa15b',
};

export const DEFI_MERCHANTS: Merchant[] = [
  { label: 'DeepBook', address: '0x01632a3a61a9bf9b41fbb435c4c7ac1a0202c218309bfcfd36045fa50bd5437a' },
  { label: 'Cetus', address: '0xbd76851341f5cdde0a1d9a4d023dbcb44a47eb7b2b13d20fd7b625f4c6e89b1c' },
  { label: 'Turbos Finance', address: '0xa64798f1b33368e7491a0089f3b3fa3ce95b4d47dad62cdd448dd264ef34a346' },
  { label: 'Scallop', address: '0x6da7707e802181917b21bb4c950e0ef8629489ef2724357389753d7fe6f6a455' },
];

// Same idea as SHADY_TOKENS, for the DeFi scenario.
export const UNKNOWN_DEX: Merchant = {
  label: 'UnknownDEX.xyz',
  address: '0x83e83759ad6ebb8af178dab6024836c780b51f967d1688c9d8b56a14d18b349b',
};

export function findMerchantByLabel(merchants: Merchant[], label: string): Merchant | undefined {
  return merchants.find(m => m.label === label);
}

export function findMerchantByAddress(merchants: Merchant[], address: string): Merchant | undefined {
  return merchants.find(m => m.address === address);
}

// Resolves an LLM- or fallback-decision-supplied merchant *label* to its
// real address for a given scenario, falling back to the scenario's
// deliberately-unapproved merchant if the label doesn't match anything known
// (e.g. an LLM hallucination) — safer than passing the raw label through to
// the SDK, which would throw building the PTB instead of just blocking.
export function resolveMerchant(
  scenario: 'festival' | 'defi',
  label: string
): Merchant {
  const approved = scenario === 'festival' ? FESTIVAL_MERCHANTS : DEFI_MERCHANTS;
  const unapproved = scenario === 'festival' ? SHADY_TOKENS : UNKNOWN_DEX;
  return (
    findMerchantByLabel(approved, label) ??
    (label === unapproved.label ? unapproved : undefined) ??
    { label, address: unapproved.address }
  );
}
