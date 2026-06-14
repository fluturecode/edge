'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { generateZkProof } from '@/lib/zklogin';
import { setUserAddress } from '@/lib/signer';
import { jwtToAddress } from '@mysten/zklogin';

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
        const suiAddress = jwtToAddress(idToken, BigInt(0));
        setUserAddress(suiAddress);
        console.log('address:', suiAddress);
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
