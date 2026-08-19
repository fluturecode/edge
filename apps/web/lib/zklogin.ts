import { jwtDecode } from 'jwt-decode';
import { getZkLoginSignature } from '@mysten/sui/zklogin';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SUI_NETWORK } from './sui-client';

// Removed: getZkLoginAddress(idToken) — derived the address locally with a
// hardcoded salt of 0 (jwtToAddress(idToken, BigInt(0), true)), which is
// wrong whenever Enoki returns a real, non-zero salt (the normal case).
// The one caller (dashboard/page.tsx) now uses getUserAddress() from
// lib/signer.ts instead — the real Enoki-derived address stored by
// app/auth/callback/page.tsx. Kept as a comment, not just a silent
// deletion, since this exact hardcoded-salt-0 pattern is called out in
// HANDOFF.md as "the most common zkLogin bug."

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
