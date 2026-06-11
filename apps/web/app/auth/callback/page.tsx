'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { generateZkProof } from '@/lib/zklogin';
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

      if (ephemeralKey && randomness && maxEpoch) {
        try {
          const proof = await generateZkProof({
            idToken,
            ephemeralKey,
            randomness,
            maxEpoch,
            userAddress: '',
          });
          localStorage.setItem('edge_zk_proof', JSON.stringify(proof));

          // Get address from Enoki — consistent with the salt Enoki uses
          const addrRes = await fetch('https://api.enoki.mystenlabs.com/v1/zklogin', {
            headers: {
              'Authorization': `Bearer ${process.env.NEXT_PUBLIC_ENOKI_API_KEY}`,
              'zklogin-jwt': idToken,
            },
          });
          const addrData = await addrRes.json();
          const enokiAddress = addrData.data?.address;
          if (enokiAddress) {
            setUserAddress(enokiAddress);
            console.log('Enoki address:', enokiAddress);
          } else {
            console.error('Could not get Enoki address:', addrData);
            router.push('/');
            return;
          }
        } catch (e) {
          console.error('ZK proof generation failed:', e);
          router.push('/');
          return;
        }
      }

      router.push('/dashboard');
    };

    run();
  }, []);

  return (
    <main style={{ minHeight: 'calc(100vh - 57px)', background: '#080C14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: '#00D4AA' }}>
        $ authenticating...
      </p>
    </main>
  );
}