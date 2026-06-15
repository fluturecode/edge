import { NextRequest, NextResponse } from 'next/server';
import { toBase64 } from '@mysten/sui/utils';
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

    // Fetch sender's gas coins
    console.log(`[${Date.now()-t0}ms] fetching gas coins for ${sender?.slice(0,12)}...`);
    const coins = await suiClient.getCoins({ owner: sender, coinType: '0x2::sui::SUI' });
    if (!coins.data.length) {
      return NextResponse.json({ error: 'No SUI coins found. Fund your address at faucet.testnet.sui.io' }, { status: 400 });
    }

    const gasCoin = coins.data[0];
    console.log(`[${Date.now()-t0}ms] gas coin found: ${gasCoin.coinObjectId}`);

    // Build transaction from kind bytes with sender paying own gas
    const tx = Transaction.fromKind(kindBytes);
    tx.setSender(sender);
    tx.setGasOwner(sender);
    tx.setGasBudget(BigInt(10_000_000));
    tx.setGasPayment([{
      objectId: gasCoin.coinObjectId,
      version:  gasCoin.version,
      digest:   gasCoin.digest,
    }]);

    const txBytes = await tx.build({ client: suiClient });
    console.log(`[${Date.now()-t0}ms] tx built`);

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

    // Fetch created EdgePass object ID
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
