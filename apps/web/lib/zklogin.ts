import { jwtDecode } from 'jwt-decode';
import { jwtToAddress, getZkLoginSignature } from '@mysten/sui/zklogin';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

export function getZkLoginAddress(idToken: string): string {
  return jwtToAddress(idToken, BigInt(0));
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
      network:            'mainnet',
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
