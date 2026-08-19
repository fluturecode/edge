import { jwtDecode } from 'jwt-decode';
import { jwtToAddress, getZkLoginSignature } from '@mysten/sui/zklogin';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SUI_NETWORK } from './sui-client';

export function getZkLoginAddress(idToken: string): string {
  return jwtToAddress(idToken, BigInt(0), true);
}

export function getDecodedJwt(idToken: string) {
  return jwtDecode(idToken) as {
    sub: string;
    email: string;
    name: string;
    picture: string;
    iss: string;
    aud: string;
  };
}

interface ZkProofParams {
  idToken:      string;
  ephemeralKey: string;
  randomness:   string;
  maxEpoch:     number;
  userAddress:  string;
}

export async function generateZkProof({
  idToken,
  ephemeralKey,
  randomness,
  maxEpoch,
}: ZkProofParams): Promise<object> {
  const keypair = Ed25519Keypair.fromSecretKey(ephemeralKey);
  const ephemeralPublicKey = keypair.getPublicKey();

  const response = await fetch('/api/zkp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Was hardcoded to 'mainnet'. Enoki's prover needs to know which
      // network the resulting proof will be submitted to; v2 (the only pass
      // type this app creates/executes) only exists on testnet, so a proof
      // generated for the wrong network fails verification whenever
      // SUI_NETWORK isn't mainnet.
      network:            SUI_NETWORK,
      ephemeralPublicKey: ephemeralPublicKey.toSuiPublicKey(),
      maxEpoch,
      randomness:         randomness.toString(),
      idToken,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ZK prover failed: ${err}`);
  }

  const data = await response.json();
  return data.data;
}

export { getZkLoginSignature };
