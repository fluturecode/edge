import { NextRequest, NextResponse } from 'next/server';
import { fromBase64 } from '@mysten/sui/utils';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getZkLoginSignature } from '@mysten/zklogin';
import { SuiClient } from '@mysten/sui/client';

const suiClient = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
const ENOKI_SECRET = process.env.ENOKI_SECRET_KEY!;

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const { kindBytes, ephemeralKey, zkProof, maxEpoch, idToken, sender } = await req.json();
    console.log(`[${Date.now()-t0}ms] received request`);

    if (!kindBytes || !ephemeralKey || !zkProof || !maxEpoch || !idToken) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const addressSeed = zkProof.addressSeed;

    // Step 1: Enoki sponsor
    const t1 = Date.now();
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
          transactionBlockKindBytes: kindBytes,
          sender,
          allowedAddresses: [sender],
        }),
      }
    );
    console.log(`[${Date.now()-t0}ms] enoki sponsor returned (${Date.now()-t1}ms)`);

    const sponsorJson = await sponsorRes.json();

    if (!sponsorRes.ok || !sponsorJson?.data?.bytes) {
      return NextResponse.json({
        error: `Enoki sponsorship failed: ${JSON.stringify(sponsorJson)}`,
      }, { status: 400 });
    }

    const sponsoredTxBytes = sponsorJson.data.bytes;
    const sponsorDigest = sponsorJson.data.digest;
    console.log(`[${Date.now()-t0}ms] sponsor digest: ${sponsorDigest}`);

    // Step 2: Sign immediately
    const t2 = Date.now();
    const keypair = Ed25519Keypair.fromSecretKey(ephemeralKey);
    const { signature: ephemeralSignature } = await keypair.signTransaction(fromBase64(sponsoredTxBytes));
    const zkSignature = getZkLoginSignature({
      inputs: { ...zkProof, addressSeed },
      maxEpoch,
      userSignature: ephemeralSignature,
    });
    console.log(`[${Date.now()-t0}ms] signed (${Date.now()-t2}ms)`);

    // Step 3: Execute
    const t3 = Date.now();
    const executeRes = await fetch(
      `https://api.enoki.mystenlabs.com/v1/transaction-blocks/sponsor/${sponsorDigest}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ENOKI_SECRET}`,
        },
        body: JSON.stringify({ signature: zkSignature }),
      }
    );
    console.log(`[${Date.now()-t0}ms] enoki execute returned (${Date.now()-t3}ms)`);

    const executeJson = await executeRes.json();

    if (!executeRes.ok) {
      return NextResponse.json({
        error: `Enoki execution failed: ${JSON.stringify(executeJson)}`,
      }, { status: 400 });
    }

    const finalDigest = executeJson?.data?.digest;
    console.log(`[${Date.now()-t0}ms] ✓ confirmed: ${finalDigest}`);

    // Step 4: Fetch object ID
    let objectId: string | null = null;
    if (finalDigest) {
      try {
        await new Promise(r => setTimeout(r, 2000));
        const txResult = await suiClient.getTransactionBlock({
          digest: finalDigest,
          options: { showObjectChanges: true },
        });
        const created = txResult.objectChanges?.find(
          c => c.type === 'created' && 'objectType' in c && c.objectType?.includes('edge_pass')
        );
        if (created && 'objectId' in created) objectId = created.objectId;
      } catch (e) {
        console.error('Could not fetch objectId:', e);
      }
    }

    return NextResponse.json({ digest: finalDigest, objectId, sponsored: true });

  } catch (e) {
    console.error('sign route failed:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
