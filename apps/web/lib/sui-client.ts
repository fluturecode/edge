import { SuiGrpcClient } from '@mysten/sui/grpc';
import type { Network } from '@edge-protocol/sdk';

// Single source of truth for which Sui network this app talks to. Every
// other module (lib/edge-sdk.ts, lib/signer.ts, the API routes, page.tsx's
// epoch fetch) imports SUI_NETWORK/getSuiClient from here instead of each
// re-reading the env var and constructing its own client — that's what let
// dashboard/create and dashboard/agent drift to a hardcoded 'mainnet' while
// .env.local said testnet.
export const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK || 'devnet') as Network;

// grpc-web baseUrls — JSON-RPC on these same public fullnodes now returns
// "deprecated, migrate to gRPC or GraphQL" for every method, on both mainnet
// and testnet. Mirrors packages/sdk/src/utils/constants.ts's NETWORK_URLS
// (not part of the SDK's public exports, so duplicated here). These are
// rate-limited public fullnodes meant for development/public-good access —
// point production traffic at a dedicated gRPC or GraphQL provider instead
// before relying on this for real load.
const NETWORK_URLS: Record<Network, string> = {
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  testnet: 'https://fullnode.testnet.sui.io:443',
  devnet: 'https://fullnode.devnet.sui.io:443',
};

// Mirrors packages/sdk/src/utils/constants.ts's EDGE_PACKAGE_ID (v2 column
// only — this app only ever creates/reads v2 passes). Not part of the SDK's
// public exports, so duplicated here — kept in the same module as
// SUI_NETWORK, and derived from it below, so package ID and network can
// never drift apart (e.g. a pass minted on testnet getting labeled or linked
// with mainnet's package ID, or vice versa).
const V2_PACKAGE_IDS: Record<Network, string> = {
  mainnet: '', // edge_pass_v2 has only been published to testnet so far
  testnet: '0xe781abc2d83f5400a2863501a40e0ed9c68f5af63c62f050c564bacaf495361a',
  devnet: '',
};

// Empty string means "not deployed on SUI_NETWORK yet" — every call site
// that builds a moveCall target from this must check it first (assertV2Available
// does that for the two create()/execute() entry points).
export const SUI_PACKAGE_ID_V2 = V2_PACKAGE_IDS[SUI_NETWORK];

// Without this check, sdk.create()/sdk.execute() on a network with no v2
// package throws deep inside ExecutionEngine.buildPTB, after the user has
// already sat through a signing flow. Checking here lets callers fail fast
// with a clear message instead.
export function assertV2Available(network: Network): void {
  if (!V2_PACKAGE_IDS[network]) {
    const deployedOn = Object.entries(V2_PACKAGE_IDS).filter(([, id]) => id).map(([n]) => n);
    throw new Error(
      `EdgePassV2 isn't deployed on ${network} yet — only ${deployedOn.join(', ')}. ` +
      `Set NEXT_PUBLIC_SUI_NETWORK to switch networks.`
    );
  }
}

// Every suiscan.xyz link in the app should go through this — building one
// with a hardcoded network segment is how a testnet tx/object ends up linked
// under /mainnet/ (a dead link, or worse, someone else's object). Defaults to
// the app's current network, but takes an explicit one for links to a pass
// created earlier under a different NEXT_PUBLIC_SUI_NETWORK (e.g. one still
// sitting in a user's localStorage) — that pass's own recorded network is the
// right one to link against, not necessarily whatever the app is on now.
export function suiscanUrl(kind: 'tx' | 'object', id: string, network: Network = SUI_NETWORK): string {
  return `https://suiscan.xyz/${network}/${kind}/${id}`;
}

let _client: SuiGrpcClient | null = null;

// One shared client, works from both the browser (grpc-web transport rides
// on fetch) and Next.js route handlers.
export function getSuiClient(): SuiGrpcClient {
  if (!_client) {
    _client = new SuiGrpcClient({ network: SUI_NETWORK, baseUrl: NETWORK_URLS[SUI_NETWORK] });
  }
  return _client;
}
