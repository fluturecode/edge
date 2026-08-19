// Walrus integration for EdgePass audit logs
// Reads use public aggregators (no auth needed)
// Writes require a funded wallet — handled server-side post-contract deploy

const WALRUS_AGGREGATOR = 'https://walrus-mainnet.brightlystake.com';
// Writes go through /api/walrus, which has its own publisher list
// (app/api/walrus/route.ts) — this module only reads.

export interface AuditLogEntry {
  passId: string;
  merchant: string;
  amount: number;
  status: 'approved' | 'blocked' | 'escalated';
  timestamp: number;
  owner: string;
  digest?: string;
  txHash?: string;
}

export interface AuditLogBundle {
  entries: AuditLogEntry[];
  passId: string;
  createdAt: number;
  version: string;
}

export async function writeAuditLogs(
  entries: AuditLogEntry[],
  passId: string
): Promise<string | null> {
  try {
    const bundle: AuditLogBundle = {
      entries,
      passId,
      createdAt: Date.now(),
      version: '1.0.0',
    };

    const response = await fetch('/api/walrus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundle),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json() as { newlyCreated?: { blobObject: { blobId: string } }; alreadyCertified?: { blobId: string } };
    const blobId = result.newlyCreated?.blobObject?.blobId || result.alreadyCertified?.blobId;

    if (blobId) {
      console.log('✓ Audit logs written to Walrus:', blobId);
      return blobId;
    }
    return null;
  } catch (e) {
    console.error('Walrus write failed:', e);
    return null;
  }
}

export async function readAuditLogs(blobId: string): Promise<AuditLogEntry[]> {
  try {
    const response = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bundle = await response.json() as AuditLogBundle;
    return bundle.entries || [];
  } catch (e) {
    console.error('Walrus read failed:', e);
    return [];
  }
}

export async function readRawBlob(blobId: string): Promise<string | null> {
  try {
    const response = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (e) {
    console.error('Walrus read failed:', e);
    return null;
  }
}

export function walrusExplorerUrl(blobId: string): string {
  return `https://walruscan.com/mainnet/blob/${blobId}`;
}
