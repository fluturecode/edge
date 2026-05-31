'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Callback() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const idToken = params.get('id_token');

    if (idToken) {
      // Store the token
      localStorage.setItem('edge_id_token', idToken);
      console.log('Got ID token!', idToken.substring(0, 20) + '...');
      router.push('/dashboard');
    } else {
      console.error('No id_token in callback');
      router.push('/');
    }
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p>Signing you in...</p>
    </main>
  );
}