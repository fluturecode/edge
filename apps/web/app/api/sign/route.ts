import { NextRequest, NextResponse } from 'next/server';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getZkLoginSignature, genAddressSeed } from '@mysten/zklogin';
import { SuiClient } from '@mysten/sui/client';
import { jwtDecode } from 'jwt-decode';

const suiClient = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
const ENOKI_SECRET = process.env.ENOKI_SECRET_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { txBytes, ephemeralKey, zkProof, maxEpoch, idToken, sender } = await req.json();

    if (!txBytes || !ephemeralKey || !zkProof || !maxEpoch || !idToken) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // ── Step 1: Derive addressSeed from JWT ───────────────────────────────────
    const decoded = jwtDecode(idToken) as { sub: string; aud: string | string[] };
    const aud = Array.isArray(decoded.aud) ? decoded.aud[0] : decoded.aud;
    const addressSeed = genAddressSeed(BigInt(0), 'sub', decoded.sub, aud).toString();
    console.log('✓ addressSeed derived:', addressSeed);

    // ── Step 2: Sponsor via Enoki ─────────────────────────────────────────────
    let finalTxBytes = txBytes;
    let sponsorSignature: string | null = null;

    try {
      const sponsorRes = await fetch(
        'https://api.enoki.mystenlabs.com/v1/transaction-blocks/sponsor',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ENOKI_SECRET}`,
          },
          body: JSON.stringify({
            network: 'testnet',
            transactionBlockKindBytes: txBytes,
            sender: sender,
            allowedAddresses: [sender],
          }),
        }
      );

      if (sponsorRes.ok) {
        const sponsorData = await sponsorRes.json();
        finalTxBytes = sponsorData.data.transactionBlockBytes;
        sponsorSignature = sponsorData.data.signature;
        console.log('✓ Enoki sponsorship confirmed · gas covered');
      } else {
        const err = await sponsorRes.text();
        console.warn('⚠ Enoki sponsorship failed — proceeding unsponsored:', err);
      }
    } catch (sponsorErr) {
      console.warn('⚠ Enoki unreachable — proceeding unsponsored:', sponsorErr);
    }

    // ── Step 3: Sign with zkLogin ephemeral key ───────────────────────────────
    const keypair = Ed25519Keypair.fromSecretKey(ephemeralKey);
    const txBytesDecoded = fromBase64(finalTxBytes);
    const { signature: ephemeralSignature } = await keypair.signTransaction(txBytesDecoded);

    const zkSignature = getZkLoginSignature({
      inputs: {
        ...zkProof,
        addressSeed,
      },
      maxEpoch,
      userSignature: ephemeralSignature,
    });

    // ── Step 4: Execute ───────────────────────────────────────────────────────
    const signatures = sponsorSignature
      ? [zkSignature, sponsorSignature]
      : [zkSignature];

    const result = await suiClient.executeTransactionBlock({
      transactionBlock: finalTxBytes,
      signature: signatures,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showEvents: true,
      },
    });

    console.log('✓ transaction confirmed · digest:', result.digest);

    // ── Step 5: Extract created EdgePass object ID ────────────────────────────
    const createdObjects = result.objectChanges?.filter(
      (change) => change.type === 'created'
    ) ?? [];

    const edgePassObject = createdObjects.find(
      (obj) => 'objectType' in obj && obj.objectType?.includes('edge_pass')
    ) ?? createdObjects[0];

    return NextResponse.json({
      digest: result.digest,
      objectId: edgePassObject && 'objectId' in edgePassObject
        ? edgePassObject.objectId
        : null,
      sponsored: !!sponsorSignature,
      effects: result.effects?.status,
    });

  } catch (e) {
    console.error('sign route failed:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
