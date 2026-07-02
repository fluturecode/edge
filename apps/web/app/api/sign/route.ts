import { NextRequest, NextResponse } from 'next/server';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getZkLoginSignature } from '@mysten/sui/zklogin';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

const suiClient = new SuiJsonRpcClient({
  url: 'https://fullnode.mainnet.sui.io:443',
  network: 'mainnet',
});

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const { fullTxBytes, ephemeralKey, zkProof, maxEpoch, idToken, sender } = await req.json();
    console.log(`[${Date.now()-t0}ms] received request`);

    if (!fullTxBytes || !ephemeralKey || !zkProof || !maxEpoch || !idToken) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const addressSeed = zkProof.addressSeed;
    const keypair = Ed25519Keypair.fromSecretKey(ephemeralKey);

    const txBytes = fromBase64(fullTxBytes);
    const { signature: ephemeralSignature } = await keypair.signTransaction(txBytes);
    const zkSignature = getZkLoginSignature({
      inputs: { ...zkProof, addressSeed },
      maxEpoch,
      userSignature: ephemeralSignature,
    });

    console.log(`[${Date.now()-t0}ms] signed, executing...`);

    const result = await suiClient.executeTransactionBlock({
      transactionBlock: fullTxBytes,
      signature: [zkSignature],
      options: { showEffects: true, showObjectChanges: true },
    });

    console.log(`[${Date.now()-t0}ms] ✓ confirmed: ${result.digest}`);

    let objectId: string | null = null;
    try {
      await new Promise(r => setTimeout(r, 2000));
      const txResult = await suiClient.getTransactionBlock({
        digest: result.digest,
        options: { showObjectChanges: true },
      });
      const created = txResult.objectChanges?.find(
        c => c.type === 'created' && 'objectType' in c && c.objectType?.includes('edge_pass')
      );
      if (created && 'objectId' in created) objectId = created.objectId;
      console.log(`[${Date.now()-t0}ms] objectId: ${objectId}`);
    } catch (e) {
      console.error('fetchObjectId failed:', e);
    }

    return NextResponse.json({ digest: result.digest, objectId, sponsored: false });

  } catch (e) {
    console.error('sign route failed:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
