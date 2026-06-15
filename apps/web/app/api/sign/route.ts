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

    // ── Fallback: build fresh tx server-side with sender's gas coins ───────
    console.log(`[${Date.now()-t0}ms] fetching sender gas coins...`);

    const coins = await suiClient.getCoins({ owner: sender, coinType: '0x2::sui::SUI' });
    if (!coins.data.length) {
      return NextResponse.json({ error: 'No SUI coins found for sender. Please fund your zkLogin address.' }, { status: 400 });
    }

    const gasCoin = coins.data[0];
    console.log(`[${Date.now()-t0}ms] gas coin: ${gasCoin.coinObjectId}, balance: ${gasCoin.balance}`);

    // Build fresh transaction from kind bytes with explicit gas payment
    const tx = Transaction.fromKind(kindBytes);
    tx.setSender(sender);
    tx.setGasBudget(BigInt(10_000_000));
    tx.setGasPayment([{
      objectId: gasCoin.coinObjectId,
      version: gasCoin.version,
      digest: gasCoin.digest,
    }]);

    const txBytes = await tx.build({ client: suiClient });
    console.log(`[${Date.now()-t0}ms] fresh tx built with explicit gas`);

    const { signature: eph } = await keypair.signTransaction(txBytes);
    const zkSig = getZkLoginSignature({ inputs: { ...zkProof, addressSeed }, maxEpoch, userSignature: eph });

    console.log(`[${Date.now()-t0}ms] signed, executing...`);

    const result = await suiClient.executeTransactionBlock({
      transactionBlock: toBase64(txBytes),
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
