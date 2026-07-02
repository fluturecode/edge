import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';

const suiClient = new SuiJsonRpcClient({
  url: 'https://fullnode.mainnet.sui.io:443',
  network: 'mainnet',
});

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

      const coins = await suiClient.getCoins({ owner: sender, coinType: '0x2::sui::SUI' });
      if (!coins.data.length) throw new Error('No SUI coins found. Fund your address at faucet.mainnet.sui.io');

      const gasCoin = coins.data[0];

      tx.setSender(sender);
      tx.setGasOwner(sender);
      tx.setGasBudget(BigInt(10_000_000));
      tx.setGasPayment([{
        objectId: gasCoin.coinObjectId,
        version:  gasCoin.version,
        digest:   gasCoin.digest,
      }]);

      const fullTxBytes = toBase64(await tx.build({ client: suiClient as any }));

      const res = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullTxBytes,
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
