import { NextRequest, NextResponse } from 'next/server';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getZkLoginSignature } from '@mysten/zklogin';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

const suiClient = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const { kindBytes, ephemeralKey, zkProof, maxEpoch, idToken, sender } = await req.json();
    console.log(`[${Date.now()-t0}ms] received request, sender: ${sender?.slice(0,12)}`);

    if (!kindBytes || !ephemeralKey || !zkProof || !maxEpoch || !idToken) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const addressSeed = zkProof.addressSeed;

    // Try Enoki sponsorship first
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

    // ── Path A: Enoki sponsorship succeeded ───────────────────────────────
    if (sponsorRes.ok && sponsorJson?.data?.bytes) {
      const sponsoredTxBytes = sponsorJson.data.bytes;
      const sponsorDigest = sponsorJson.data.digest;
      console.log(`[${Date.now()-t0}ms] sponsored, digest: ${sponsorDigest}`);

      const keypair = Ed25519Keypair.fromSecretKey(ephemeralKey);
      const { signature: ephemeralSignature } = await keypair.signTransaction(fromBase64(sponsoredTxBytes));
      const zkSignature = getZkLoginSignature({
        inputs: { ...zkProof, addressSeed },
        maxEpoch,
        userSignature: ephemeralSignature,
      });

      const executeRes = await fetch(
        `https://api.enoki.mystenlabs.com/v1/transaction-blocks/sponsor/${sponsorDigest}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.ENOKI_SECRET_KEY}`,
          },
          body: JSON.stringify({ signature: zkSignature }),
        }
      );

      const executeJson = await executeRes.json();
      console.log(`[${Date.now()-t0}ms] enoki execute status: ${executeRes.status}`);

      if (executeRes.ok) {
        const finalDigest = executeJson?.data?.digest;
        console.log(`[${Date.now()-t0}ms] ✓ sponsored confirmed: ${finalDigest}`);
        const objectId = await fetchObjectId(finalDigest);
        return NextResponse.json({ digest: finalDigest, objectId, sponsored: true });
      }

      console.warn(`[${Date.now()-t0}ms] Enoki execute failed: ${JSON.stringify(executeJson)}, falling back to direct...`);
    }

    // ── Path B: Direct execution — sender pays own gas ────────────────────
    console.log(`[${Date.now()-t0}ms] building direct tx...`);

    // Rebuild the full transaction from kind bytes with sender + gas
    const tx = Transaction.fromKind(kindBytes);
    tx.setSender(sender);
    tx.setGasBudget(BigInt(10_000_000));

    // Build with client so gas coin is resolved
    const txBytes = await tx.build({ client: suiClient });
    console.log(`[${Date.now()-t0}ms] tx built`);

    const keypair = Ed25519Keypair.fromSecretKey(ephemeralKey);
    const { signature: ephemeralSignature } = await keypair.signTransaction(txBytes);

    const zkSignature = getZkLoginSignature({
      inputs: { ...zkProof, addressSeed },
      maxEpoch,
      userSignature: ephemeralSignature,
    });

    console.log(`[${Date.now()-t0}ms] signed, executing directly...`);

    const result = await suiClient.executeTransactionBlock({
      transactionBlock: toBase64(txBytes),
      signature: [zkSignature],
      options: { showEffects: true, showObjectChanges: true },
    });

    console.log(`[${Date.now()-t0}ms] ✓ direct confirmed: ${result.digest}`);

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
    const txResult = await suiClient.getTransactionBlock({
      digest,
      options: { showObjectChanges: true },
    });
    const created = txResult.objectChanges?.find(
      c => c.type === 'created' && 'objectType' in c && c.objectType?.includes('edge_pass')
    );
    return created && 'objectId' in created ? created.objectId : null;
  } catch (e) {
    console.error('Could not fetch objectId:', e);
    return null;
  }
}
