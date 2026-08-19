// ── Types ─────────────────────────────────────────────────────────────────────

export interface EdgePassPolicy {
  passId: string;
  owner: string;
  approvedMerchants: string[];
  budget: number;
  autoThreshold: number;
  escalateThreshold: number;
  createdAt: number;
}

// ── Encrypt EdgePass policy ───────────────────────────────────────────────────

export async function encryptPolicy(
  policy: EdgePassPolicy
): Promise<string | null> {
  try {
    // Serializes to plaintext JSON — no encryption happens here despite the
    // function name. Real Seal encryption is not implemented yet; it's
    // pending key server deployment (Phase 3), at which point this should
    // actually encrypt before returning.
    const data = JSON.stringify(policy);
    console.log('✓ Policy serialized for Seal:', policy.passId);
    return data;
  } catch (e) {
    console.error('Seal encrypt failed:', e);
    return null;
  }
}

// ── Decrypt EdgePass policy ───────────────────────────────────────────────────

export async function decryptPolicy(
  data: string
): Promise<EdgePassPolicy | null> {
  try {
    return JSON.parse(data) as EdgePassPolicy;
  } catch (e) {
    console.error('Seal decrypt failed:', e);
    return null;
  }
}

// ── Store encrypted policy on Walrus ─────────────────────────────────────────

export async function storeEncryptedPolicy(
  policy: EdgePassPolicy
): Promise<string | null> {
  try {
    const encrypted = await encryptPolicy(policy);
    if (!encrypted) return null;

    const response = await fetch(
      'https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=3',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: encrypted,
      }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json() as {
      newlyCreated?: { blobObject: { blobId: string } };
      alreadyCertified?: { blobId: string };
    };

    const blobId = result.newlyCreated?.blobObject?.blobId
      || result.alreadyCertified?.blobId;

    if (blobId) {
      console.log('✓ Policy stored on Walrus:', blobId);
      return blobId;
    }
    return null;
  } catch (e) {
    console.error('Seal + Walrus store failed:', e);
    return null;
  }
}