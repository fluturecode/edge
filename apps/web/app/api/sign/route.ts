import { NextRequest, NextResponse } from 'next/server';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getZkLoginSignature } from '@mysten/zklogin';
import { SuiClient } from '@mysten/sui/client';

const suiClient = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const { kindBytes, fullTxBytes, ephemeralKey, zkProof, maxEpoch, idToken, sender } = await req.json();
    console.log(`[${Date.now()-t0}ms] received request`);

    if (!kindBytes || !ephemeralKey || !zkProof || !maxEpoch || !idToken) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const addressSeed = zkProof.addressSeed;
    const keypair = Ed25519Keypair.fromSecretKey(ephemeralKey);

    // ── Try Enoki sponsorship first ────────────────────────────────────────
    const sponsorRes = await fetch(
      'https://api.enoki.mystenlabs.com/v1/transaction-blocks/sponsor',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ENOKI_SECRET_KEY}`,
        },
        body: JSON.stringify({
          network: 'testnet',
          transactionBlockKindBytes: kindBytes,
          sender,
          allowedAddresses: [sender],
        }),
      }
    );

    const sponsorJson = await sponsorRes.json();
    console.log(`[${Date.now()-t0}ms] sponsor status: ${sponsorRes.status}`);

    if (sponsorRes.ok && sponsorJson?.data?.bytes) {
      const sponsoredTxBytes = sponsorJson.data.bytes;
      const sponsorDigest = sponsorJson.data.digest;

      const { signature: eph } = await keypair.signTransaction(fromBase64(sponsoredTxBytes));
      const zkSig = getZkLoginSignature({ inputs: { ...zkProof, addressSeed }, maxEpoch, userSignature: eph });

      const executeRes = await fetch(
        `https://api.enoki.mystenlabs.com/v1/transaction-blocks/sponsor/${sponsorDigest}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.ENOKI_SECRET_KEY}` },
          body: JSON.stringify({ signature: zkSig }),
        }
      );

      const executeJson = await executeRes.json();
      console.log(`[${Date.now()-t0}ms] enoki execute: ${executeRes.status}`);

      if (executeRes.ok) {
        const digest = executeJson?.data?.digest;
        console.log(`[${Date.now()-t0}ms] ✓ sponsored: ${digest}`);
        const objectId = await fetchObjectId(digest);
        return NextResponse.json({ digest, objectId, sponsored: true });
      }

      console.warn(`[${Date.now()-t0}ms] Enoki execute failed, falling back to direct...`);
    }

    // ── Fallback: direct execution with sender's own gas ──────────────────
    if (!fullTxBytes) {
      return NextResponse.json({ error: 'No fullTxBytes provided for direct execution' }, { status: 400 });
    }

    console.log(`[${Date.now()-t0}ms] executing directly with sender gas...`);

    const txBytesDecoded = fromBase64(fullTxBytes);
    const { signature: eph } = await keypair.signTransaction(txBytesDecoded);
    const zkSig = getZkLoginSignature({ inputs: { ...zkProof, addressSeed }, maxEpoch, userSignature: eph });

    const result = await suiClient.executeTransactionBlock({
      transactionBlock: fullTxBytes,
      signature: [zkSig],
      options: { showEffects: true, showObjectChanges: true },
    });

    console.log(`[${Date.now()-t0}ms] ✓ direct: ${result.digest}`);
    const objectId = await fetchObjectId(result.digest);
    return NextResponse.json({ digest: result.digest, objectId, sponsored: false });

  } catch (e) {
    console.error('sign route failed:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

async function fetchObjectId(digest: string): Promise<string | null> {
  try {
    await new Promise(r => setTimeout(r, 2000));
    const tx = await suiClient.getTransactionBlock({
      digest,
      options: { showObjectChanges: true },
    });
    const created = tx.objectChanges?.find(
      c => c.type === 'created' && 'objectType' in c && c.objectType?.includes('edge_pass')
    );
    return created && 'objectId' in created ? created.objectId : null;
  } catch (e) {
    console.error('fetchObjectId failed:', e);
    return null;
  }
}
