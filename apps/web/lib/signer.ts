import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';

const suiClient = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });

export function getUserAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('edge_sui_address');
}

export function setUserAddress(address: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('edge_sui_address', address);
}

export function getIdToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('edge_id_token');
}

export function buildSigner(_enokiApiKey: string) {
  return {
    signAndExecute: async (tx: Transaction, kindBytes?: string) => {
      const idToken = getIdToken();
      const sender = getUserAddress();
      if (!idToken || !sender) throw new Error('Not authenticated');

      const ephemeralKey = localStorage.getItem('edge_ephemeral_key');
      const proofStr = localStorage.getItem('edge_zk_proof');
      const maxEpoch = Number(localStorage.getItem('edge_max_epoch'));
      if (!ephemeralKey || !proofStr) throw new Error('Missing zkLogin credentials');

      tx.setSender(sender);

      // Use pre-built kindBytes if provided (create flow — no RPC, instant)
      // Otherwise build them now (execute/revoke flows)
      const finalKindBytes = kindBytes ?? toBase64(await tx.build({
        client: suiClient,
        onlyTransactionKind: true,
      }));

      const res = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kindBytes: finalKindBytes,
          ephemeralKey,
          zkProof:  JSON.parse(proofStr),
          maxEpoch,
          idToken,
          sender,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(`Transaction failed: ${JSON.stringify(data)}`);
      return { digest: data.digest, objectId: data.objectId ?? null };
    },
  };
}
