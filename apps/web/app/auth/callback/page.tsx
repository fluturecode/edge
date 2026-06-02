'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getZkLoginAddress } from '@/lib/zklogin';
import { setUserAddress } from '@/lib/signer';

export default function Callback() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const idToken = params.get('id_token');

    if (idToken) {
      localStorage.setItem('edge_id_token', idToken);
      const address = getZkLoginAddress(idToken);
      setUserAddress(address);
      router.push('/dashboard');
    } else {
      router.push('/');
    }
  }, []);

  return (
    <main style={{ minHeight: 'calc(100vh - 57px)', background: '#080C14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: '#00D4AA' }}>
        $ authenticating...
      </p>
    </main>
  );
}