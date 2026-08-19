'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setUserAddress } from '@/lib/signer';
import { generateZkProof } from '@/lib/zklogin';

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
          console.log('Enoki address:', suiAddress);
        } else {
          // Fallback to local derivation with salt 0
          const { jwtToAddress } = await import('@mysten/sui/zklogin');
          suiAddress = jwtToAddress(idToken, BigInt(0), true);
          console.log('Fallback address:', suiAddress);
        }

        setUserAddress(suiAddress);
        localStorage.setItem('edge_user_salt', userSalt);

        // Step 2: Generate ZK proof — via the shared helper so this stays in
        // sync with SUI_NETWORK. This used to duplicate the /api/zkp call
        // inline with a hardcoded `network: 'mainnet'`, independently of
        // (and un-fixed by) lib/zklogin.ts's fix for the same bug.
        const proof = await generateZkProof({ idToken, ephemeralKey, randomness, maxEpoch, userAddress: suiAddress });
        localStorage.setItem('edge_zk_proof', JSON.stringify(proof));

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
