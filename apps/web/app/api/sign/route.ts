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

    // Build full transaction from kind bytes — sender pays their own gas
    const t1 = Date.now();
    const tx = Transaction.from(
      await new Transaction().build({
        client: suiClient,
        onlyTransactionKind: false,
      })
    );

    // Reconstruct transaction with sender and gas
    const fullTx = new Transaction();
    fullTx.setSender(sender);

    // Use kind bytes to build the full sponsored-style tx
    const builtKind = fromBase64(kindBytes);

    // Build a proper transaction block with gas
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

    if (!sponsorRes.ok || !sponsorJson?.data?.bytes) {
      // Fallback: build and execute without sponsorship using sender's own gas
      console.log(`[${Date.now()-t0}ms] sponsorship failed, building direct tx...`);

      const txb = Transaction.fromKind(builtKind);
      txb.setSender(sender);
      txb.setGasBudget(BigInt(10_000_000));

      const txBytes = await txb.build({ client: suiClient });
      console.log(`[${Date.now()-t0}ms] tx built`);

      const keypair = Ed25519Keypair.fromSecretKey(ephemeralKey);
      const { signature: ephemeralSignature } = await keypair.signTransaction(txBytes);

      const zkSignature = getZkLoginSignature({
        inputs: { ...zkProof, addressSeed },
        maxEpoch,
        userSignature: ephemeralSignature,
      });

      console.log(`[${Date.now()-t0}ms] signed, executing...`);

      const result = await suiClient.executeTransactionBlock({
        transactionBlock: toBase64(txBytes),
        signature: [zkSignature],
        options: { showEffects: true, showObjectChanges: true },
      });

      console.log(`[${Date.now()-t0}ms] ✓ confirmed: ${result.digest}`);

      const created = result.objectChanges?.find(
        c => c.type === 'created' && 'objectType' in c && c.objectType?.includes('edge_pass')
      );
      const objectId = created && 'objectId' in created ? created.objectId : null;

      return NextResponse.json({ digest: result.digest, objectId, sponsored: false });
    }

    // Enoki sponsorship succeeded — use two-step flow
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

    console.log(`[${Date.now()-t0}ms] signed, executing via Enoki...`);

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

    if (!executeRes.ok) {
      return NextResponse.json({
        error: `Enoki execution failed: ${JSON.stringify(executeJson)}`,
      }, { status: 400 });
    }

    const finalDigest = executeJson?.data?.digest;
    console.log(`[${Date.now()-t0}ms] ✓ confirmed: ${finalDigest}`);

    let objectId: string | null = null;
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

    return NextResponse.json({ digest: finalDigest, objectId, sponsored: true });

  } catch (e) {
    console.error('sign route failed:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
