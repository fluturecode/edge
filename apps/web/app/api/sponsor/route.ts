import { NextRequest, NextResponse } from 'next/server';
import { fromBase64 } from '@mysten/sui/utils';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getZkLoginSignature, genAddressSeed } from '@mysten/sui/zklogin';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { jwtDecode } from 'jwt-decode';

const suiClient = new SuiJsonRpcClient({
  url: 'https://fullnode.mainnet.sui.io:443',
  network: 'mainnet',
});

export async function POST(req: NextRequest) {
  const { txBytes, ephemeralKey, zkProof, maxEpoch, idToken } = await req.json();

  const decoded = jwtDecode(idToken) as { sub: string; aud: string | string[] };
  const aud = Array.isArray(decoded.aud) ? decoded.aud[0] : decoded.aud;
  const addressSeed = genAddressSeed(BigInt(0), 'sub', decoded.sub, aud).toString();

  console.log('addressSeed:', addressSeed);

  const keypair = Ed25519Keypair.fromSecretKey(ephemeralKey);
  const { signature: ephemeralSignature } = await keypair.signTransaction(fromBase64(txBytes));

  const zkSignature = getZkLoginSignature({
    inputs: {
      ...zkProof,
      addressSeed,
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
