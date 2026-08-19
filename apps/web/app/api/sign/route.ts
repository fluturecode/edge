import { NextRequest, NextResponse } from 'next/server';
import { fromBase64 } from '@mysten/sui/utils';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getZkLoginSignature } from '@mysten/sui/zklogin';
import { getSuiClient } from '@/lib/sui-client';

const suiClient = getSuiClient();

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const { fullTxBytes, ephemeralKey, zkProof, maxEpoch, idToken } = await req.json();
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

    // Move aborts come back from the gRPC client as *data*
    // (`$kind: 'FailedTransaction'`), not a thrown error — only a network/
    // signing failure that never reached the chain lands in the catch below.
    // Requesting effects/objectTypes here means the created object (and the
    // gas coin's new version, for lib/signer.ts's read-after-write fix) are
    // available immediately, with no extra round trip or artificial delay.
    const result = await suiClient.executeTransaction({
      transaction: txBytes,
      signatures: [zkSignature],
      include: { effects: true, objectTypes: true },
    });

    const txData = (result.Transaction ?? result.FailedTransaction)!;
    const failed = result.$kind === 'FailedTransaction' || txData.status.success === false;

    console.log(`[${Date.now()-t0}ms] ${failed ? '✗ aborted' : '✓ confirmed'}: ${txData.digest}`);

    const created = txData.effects?.changedObjects.find(
      o => o.idOperation === 'Created' && txData.objectTypes?.[o.objectId]?.includes('edge_pass')
    );
    const gasObjectEffect = txData.effects?.gasObject;
    const gasObject = gasObjectEffect?.outputVersion && gasObjectEffect.outputDigest
      ? { objectId: gasObjectEffect.objectId, version: gasObjectEffect.outputVersion, digest: gasObjectEffect.outputDigest }
      : null;

    if (failed) {
      // Reached the chain and aborted — this is a real, independently
      // verifiable on-chain denial (e.g. onChainDenials submitting a
      // PolicyEngine block anyway). Still a 200: the request itself
      // succeeded, the transaction just didn't. lib/signer.ts turns this
      // into a thrown error with `.digest` attached so
      // ExecutionEngine.extractAbortInfo() can tell it apart from "never
      // reached the chain".
      return NextResponse.json({
        success: false,
        digest: txData.digest,
        error: txData.status.success === false
          ? txData.status.error.message
          : 'Transaction failed with no status.error',
        gasObject,
      });
    }

    console.log(`[${Date.now()-t0}ms] objectId: ${created?.objectId ?? null}`);

    return NextResponse.json({
      success: true,
      digest: txData.digest,
      objectId: created?.objectId ?? null,
      gasObject,
      sponsored: false,
    });

  } catch (e) {
    console.error('sign route failed:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
