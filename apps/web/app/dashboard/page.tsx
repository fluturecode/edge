'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const [token, setToken] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const t = localStorage.getItem('edge_id_token');
    if (!t) {
      router.push('/');
    } else {
      setToken(t);
    }
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-4">Welcome to Edge</h1>
      <p className="text-green-500">✓ Signed in successfully</p>
    </main>
  );
}