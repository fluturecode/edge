import { WalrusClient, MAINNET_WALRUS_PACKAGE_CONFIG, TESTNET_WALRUS_PACKAGE_CONFIG } from '@mysten/walrus';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Signer } from '@mysten/sui/cryptography';
import { NETWORK_URLS } from '../utils/constants';
import type { Network } from '../utils/types';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  passId:           string;
  merchant:         string;
  amount:           string;
  amountUSD?:       string;
  status:           'approved' | 'blocked' | 'escalated' | 'error';
  timestamp:        number;
  owner?:           string;
  digest?:          string;
  reason?:          string;
  riskScore?:       number;
  dynamicUserId?:   string;
  idempotencyKey?:  string;
}

export interface AuditBundle {
  version:   string;
  passId:    string;
  entries:   AuditLogEntry[];
  createdAt: number;
  network:   Network;
}

export interface WalrusWriteResult {
  blobId:      string;
  explorerUrl: string;
  isNew:       boolean;
}

// ── Public aggregators ────────────────────────────────────────────────────────

const PUBLIC_AGGREGATORS: Record<Network, string[]> = {
  mainnet: [
    'https://walrus-mainnet.brightlystake.com',
    'https://aggregator.walrus-mainnet.walrus.space',
  ],
  testnet: [
    'https://aggregator.walrus-testnet.walrus.space',
  ],
  devnet: [
    'https://aggregator.walrus-testnet.walrus.space',
  ],
};

// ── WalrusAudit class ──────────────────────────────────────────────────────────

export class WalrusAudit {
  private walrus: WalrusClient;
  private network: Network;

  constructor(network: Network) {
    this.network = network;

    const suiClient = new SuiJsonRpcClient({
      url: NETWORK_URLS[network],
      network: network as 'mainnet' | 'testnet' | 'devnet',
    });

    this.walrus = new WalrusClient({
      network: network === 'mainnet' ? 'mainnet' : 'testnet',
      suiClient,
      packageConfig: network === 'mainnet'
        ? MAINNET_WALRUS_PACKAGE_CONFIG
        : TESTNET_WALRUS_PACKAGE_CONFIG,
    });
  }

  /**
   * Write audit entries to Walrus.
   * Requires a funded Sui keypair as the signer.
   *
   * @example
   * import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
   * const keypair = Ed25519Keypair.fromSecretKey(process.env.SUI_PRIVATE_KEY!);
   * const audit = new WalrusAudit('mainnet');
   * const result = await audit.write(entries, pass.id, keypair);
   */
  async write(
    entries:       AuditLogEntry[],
    passId:        string,
    signer:        Signer,
    epochsToStore: number = 5
  ): Promise<WalrusWriteResult> {
    const bundle: AuditBundle = {
      version:   '1.0.0',
      passId,
      entries,
      createdAt: Date.now(),
      network:   this.network,
    };

    const data = new TextEncoder().encode(JSON.stringify(bundle));

    const result = await this.walrus.writeBlob({
      blob:      data,
      deletable: false,
      epochs:    epochsToStore,
      signer,
    });

    const r = result as any;
    const blobId: string = r.newlyCreated
      ? r.newlyCreated.blobObject.blobId
      : r.alreadyCertified.blobId;

    return {
      blobId,
      explorerUrl: this.explorerUrl(blobId),
      isNew:       Boolean(r.newlyCreated),
    };
  }

  /**
   * Read audit entries from Walrus by blob ID.
   * Uses public aggregators — no wallet or auth needed.
   */
  async read(blobId: string): Promise<AuditLogEntry[]> {
    const aggregators = PUBLIC_AGGREGATORS[this.network];

    for (const aggregator of aggregators) {
      try {
        const response = await fetch(`${aggregator}/v1/blobs/${blobId}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) continue;
        const bundle = await response.json() as AuditBundle;
        return bundle.entries ?? [];
      } catch {
        continue;
      }
    }

    try {
      const data = await this.walrus.readBlob({ blobId });
      const text = new TextDecoder().decode(data);
      const bundle = JSON.parse(text) as AuditBundle;
      return bundle.entries ?? [];
    } catch (error) {
      throw new Error(
        `WalrusAudit.read: failed to read blob ${blobId} from all aggregators. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  explorerUrl(blobId: string): string {
    const net = this.network === 'mainnet' ? 'mainnet' : 'testnet';
    return `https://walruscan.com/${net}/blob/${blobId}`;
  }
}

// ── Static helpers ─────────────────────────────────────────────────────────────

export async function readAuditBlob(
  blobId:  string,
  network: Network = 'mainnet'
): Promise<AuditLogEntry[]> {
  const aggregators = PUBLIC_AGGREGATORS[network];

  for (const aggregator of aggregators) {
    try {
      const response = await fetch(`${aggregator}/v1/blobs/${blobId}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) continue;
      const bundle = await response.json() as AuditBundle;
      return bundle.entries ?? [];
    } catch {
      continue;
    }
  }

  throw new Error(
    `readAuditBlob: failed to read blob ${blobId} from all ${network} aggregators.`
  );
}

export function walrusExplorerUrl(blobId: string, network: Network = 'mainnet'): string {
  return `https://walruscan.com/${network}/blob/${blobId}`;
}
