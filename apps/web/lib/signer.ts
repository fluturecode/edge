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
    signAndExecute: async (tx: Transaction) => {
      const idToken = getIdToken();
      const sender = getUserAddress();
      if (!idToken || !sender) throw new Error('Not authenticated');

      const ephemeralKey = localStorage.getItem('edge_ephemeral_key');
      const proofStr = localStorage.getItem('edge_zk_proof');
      const maxEpoch = Number(localStorage.getItem('edge_max_epoch'));
      if (!ephemeralKey || !proofStr) throw new Error('Missing zkLogin credentials');

      // Set sender so gas is paid from zkLogin address
      tx.setSender(sender);

      const txBytes = await tx.build({ client: suiClient });

      const res = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txBytes: toBase64(txBytes),
          ephemeralKey,
          zkProof: JSON.parse(proofStr),
          maxEpoch,
          idToken
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(`Transaction failed: ${JSON.stringify(data)}`);
      return { digest: data.digest };
    },
  };
}
