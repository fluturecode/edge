import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { signWithZkLogin } from '@/lib/zklogin';

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

export function buildSigner(enokiApiKey: string) {
  return {
    signAndExecute: async (tx: Transaction) => {
      const idToken = getIdToken();
      const sender = getUserAddress();
      if (!idToken || !sender) throw new Error('Not authenticated');

      // 1. Build transaction kind bytes
      const txKindBytes = await tx.build({ onlyTransactionKind: true });

      // 2. Ask Enoki to sponsor — returns full tx bytes with gas filled in
      const sponsorRes = await fetch(
        'https://api.enoki.mystenlabs.com/v1/transaction-blocks/sponsor',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${enokiApiKey}`,
            'zklogin-jwt': idToken,
          },
          body: JSON.stringify({
            network: 'testnet',
            transactionBlockKindBytes: toBase64(txKindBytes),
            sender,
          }),
        }
      );

      if (!sponsorRes.ok) {
        const err = await sponsorRes.text();
        throw new Error(`Enoki sponsorship failed: ${err}`);
      }

      const { bytes, digest } = await sponsorRes.json();

      // 3. Sign with zkLogin
      const { fromBase64 } = await import('@mysten/sui/utils');
      const signature = await signWithZkLogin(fromBase64(bytes));

      // 4. Execute the sponsored transaction
      const execRes = await fetch(
        `https://api.enoki.mystenlabs.com/v1/transaction-blocks/sponsor/${digest}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${enokiApiKey}`,
          },
          body: JSON.stringify({ signature }),
        }
      );

      if (!execRes.ok) {
        const err = await execRes.text();
        throw new Error(`Enoki execution failed: ${err}`);
      }

      return { digest };
    },
  };
}