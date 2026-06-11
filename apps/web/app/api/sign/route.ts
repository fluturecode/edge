import { NextRequest, NextResponse } from 'next/server';
import { fromBase64 } from '@mysten/sui/utils';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getZkLoginSignature } from '@mysten/zklogin';
import { SuiClient } from '@mysten/sui/client';

const suiClient = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });

export async function POST(req: NextRequest) {
  const { txBytes, ephemeralKey, zkProof, maxEpoch } = await req.json();

  console.log('zkProof.addressSeed:', zkProof.addressSeed);

  const keypair = Ed25519Keypair.fromSecretKey(ephemeralKey);
  const { signature: ephemeralSignature } = await keypair.signTransaction(fromBase64(txBytes));

  const zkSignature = getZkLoginSignature({
    inputs: {
      ...zkProof,
      addressSeed: zkProof.addressSeed,
    },
    maxEpoch,
    userSignature: ephemeralSignature,
  });

  try {
    const result = await suiClient.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: zkSignature,
      options: { showEffects: true, showObjectChanges: true },
    });
    console.log('tx digest:', result.digest);
    return NextResponse.json({ digest: result.digest });
  } catch (e) {
    console.error('execute failed:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
