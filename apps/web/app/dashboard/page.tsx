'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getZkLoginAddress, getDecodedJwt } from '@/lib/zklogin';

export default function Dashboard() {
  const [address, setAddress] = useState<string | null>(null);
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('edge_id_token');
    if (!token) {
      router.push('/');
      return;
    }
    const suiAddress = getZkLoginAddress(token);
    const decoded = getDecodedJwt(token);
    setAddress(suiAddress);
    setUser({ email: decoded.email, name: decoded.name });
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">Edge Dashboard</h1>
      {user && (
        <p className="text-muted-foreground">Welcome, {user.name}</p>
      )}
      {address && (
        <div className="bg-muted p-4 rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Your Sui Address</p>
          <p className="font-mono text-sm">{address}</p>
        </div>
      )}
    </main>
  );
}