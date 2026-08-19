import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { getSuiClient } from './sui-client';

const suiClient = getSuiClient();

const GAS_BUDGET = BigInt(10_000_000);

// Carries the gas coin's version/digest forward from each transaction's own
// effects instead of re-querying listCoins() before every call. Firing
// transactions back to back (as the agent demo does) mutates this same coin
// faster than listCoins()'s read path is guaranteed to reflect it — the same
// read-after-write staleness class as bug 2 in HANDOFF.md, just on the gas
// coin instead of the pass. Only the first call in a session falls back to
// listCoins(); every call after that reuses this.
let gasCoinRef: { objectId: string; version: string; digest: string } | null = null;

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

// Gas resolution is the signer's job, not the SDK's — ExecutionEngine only
// sets gasBudget (see its buildPTB comment). A direct wallet signer like this
// one pays from its own coins; a sponsored signer (Enoki) would pay from a
// completely different address the engine has no business assuming, so it
// deliberately leaves gas price/payment unset. Under the gRPC transport, an
// under-specified gas section makes Transaction.build() run a client-side
// pre-flight simulation and throw instead of submitting whenever it predicts
// a Move abort — which would silently defeat onChainDenials. Setting price
// and payment fully here is what lets denials actually reach the chain.
async function resolveGas(tx: Transaction, sender: string): Promise<void> {
  const { referenceGasPrice } = await suiClient.getReferenceGasPrice();
  tx.setGasPrice(referenceGasPrice);
  tx.setGasBudget(GAS_BUDGET);

  if (gasCoinRef) {
    tx.setGasPayment([gasCoinRef]);
    return;
  }

  const { objects: coins } = await suiClient.listCoins({ owner: sender, coinType: '0x2::sui::SUI' });
  if (!coins.length) throw new Error('No SUI coins found. Fund your address at faucet.mainnet.sui.io');

  const [biggest] = [...coins].sort((a, b) => (BigInt(a.balance) < BigInt(b.balance) ? 1 : -1));
  if (BigInt(biggest.balance) < GAS_BUDGET) {
    throw new Error(`Largest coin for ${sender} (${biggest.balance} MIST) is under the gas budget (${GAS_BUDGET} MIST).`);
  }
  tx.setGasPayment([{ objectId: biggest.objectId, version: biggest.version, digest: biggest.digest }]);
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

      tx.setSender(sender);
      tx.setGasOwner(sender);
      await resolveGas(tx, sender);

      const fullTxBytes = toBase64(await tx.build({ client: suiClient as any }));

      const res = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullTxBytes,
          ephemeralKey,
          zkProof: JSON.parse(proofStr),
          maxEpoch,
          idToken,
          sender,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(`Transaction failed: ${JSON.stringify(data)}`);

      // The gas coin is mutated whether the transaction succeeds or aborts on
      // chain — carry its new version/digest forward for the next call
      // regardless of outcome, before checking success below.
      if (data.gasObject?.version && data.gasObject?.digest) {
        gasCoinRef = data.gasObject;
      }

      if (!data.success) {
        // Reached the chain and aborted (e.g. a PolicyEngine denial the SDK
        // submitted anyway for a verifiable record) — surface it as a thrown
        // error carrying `.digest` so ExecutionEngine.extractAbortInfo() can
        // tell this apart from "never reached the chain" and still report a
        // real on-chain `blocked` outcome.
        const err = new Error(data.error ?? 'Transaction failed with no status.error');
        (err as { digest?: string }).digest = data.digest;
        throw err;
      }

      return { digest: data.digest, objectId: data.objectId ?? null };
    },
  };
}
