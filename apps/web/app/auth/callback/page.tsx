'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setUserAddress } from '@/lib/signer';

export default function Callback() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const idToken = params.get('id_token');
    if (!idToken) { router.push('/'); return; }

    const run = async () => {
      localStorage.setItem('edge_id_token', idToken);
      const ephemeralKey = localStorage.getItem('edge_ephemeral_key');
      const randomness = localStorage.getItem('edge_randomness');
      const maxEpoch = Number(localStorage.getItem('edge_max_epoch'));

      if (!ephemeralKey || !randomness || !maxEpoch) {
        router.push('/'); return;
      }

      try {
        // Step 1: Get the correct Enoki-derived address and salt
        const addressRes = await fetch('https://api.enoki.mystenlabs.com/v1/zklogin', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_ENOKI_API_KEY}`,
            'zklogin-jwt': idToken,
          },
        });

        let suiAddress: string;
        let userSalt: string = '0';

        if (addressRes.ok) {
          const addressData = await addressRes.json();
          suiAddress = addressData.data?.address;
          userSalt = addressData.data?.salt || '0';
          console.log('Enoki address:', suiAddress, 'salt:', userSalt);
        } else {
          // Fallback to local derivation with salt 0
          const { jwtToAddress } = await import('@mysten/sui/zklogin');
          suiAddress = jwtToAddress(idToken, BigInt(0), '');
          console.log('Fallback address:', suiAddress);
        }

        setUserAddress(suiAddress);
        localStorage.setItem('edge_user_salt', userSalt);

        // Step 2: Generate ZK proof
        const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');
        const keypair = Ed25519Keypair.fromSecretKey(ephemeralKey);
        const ephemeralPublicKey = keypair.getPublicKey();

        const proofRes = await fetch('/api/zkp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            network: 'mainnet',
            ephemeralPublicKey: ephemeralPublicKey.toSuiPublicKey(),
            maxEpoch,
            randomness: randomness.toString(),
            idToken,
          }),
        });

        if (!proofRes.ok) {
          const err = await proofRes.text();
          throw new Error(`ZK prover failed: ${err}`);
        }

        const proofData = await proofRes.json();
        localStorage.setItem('edge_zk_proof', JSON.stringify(proofData.data));
        console.log('proof stored, addressSeed:', proofData.data?.addressSeed?.slice(0, 20));

      } catch (e) {
        console.error('auth failed:', e);
        router.push('/'); return;
      }

      router.push('/dashboard');
    };

    run();
  }, []);

  return (
    <main style={{ minHeight: 'calc(100vh - 57px)', background: '#080C14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: '#00D4AA' }}>$ authenticating...</p>
    </main>
  );
}
