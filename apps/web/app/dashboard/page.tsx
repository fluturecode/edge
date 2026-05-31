'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getZkLoginAddress, getDecodedJwt } from '@/lib/zklogin';

interface EdgePass {
  id: string;
  budget: number;
  spent: number;
  autoThreshold: number;
  escalateThreshold: number;
  expiry: number;
  merchants: string[];
  active: boolean;
  createdAt: number;
}

export default function Dashboard() {
  const [address, setAddress] = useState<string | null>(null);
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [passes, setPasses] = useState<EdgePass[]>([]);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('edge_id_token');
    if (!token) { router.push('/'); return; }
    setAddress(getZkLoginAddress(token));
    setUser(getDecodedJwt(token) as any);
    setPasses(JSON.parse(localStorage.getItem('edge_passes') || '[]'));
  }, []);

  return (
    <main className="flex min-h-screen flex-col px-4 py-12 max-w-lg mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold">Edge</h1>
          {user && <p className="text-sm text-muted-foreground">{user.name}</p>}
        </div>
        <button
          onClick={() => router.push('/dashboard/create')}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium"
        >
          + New Pass
        </button>
      </div>

      {address && (
        <div className="bg-muted p-3 rounded-lg mb-6">
          <p className="text-xs text-muted-foreground mb-1">Sui Address</p>
          <p className="font-mono text-xs truncate">{address}</p>
        </div>
      )}

      {passes.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center">
          <p className="text-muted-foreground">No EdgePasses yet.</p>
          <button
            onClick={() => router.push('/dashboard/create')}
            className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold"
          >
            Create your first EdgePass
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {passes.map((pass) => (
            <div key={pass.id} className="border rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono text-muted-foreground">
                  {pass.id.substring(0, 8)}...
                </span>
                <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full">
                  Active
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Budget</p>
                  <p className="font-mono font-semibold">${pass.budget}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Auto-approve</p>
                  <p className="font-mono font-semibold">≤${pass.autoThreshold}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Escalate</p>
                  <p className="font-mono font-semibold">≥${pass.escalateThreshold}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Expires</p>
                  <p className="font-mono font-semibold">{pass.expiry}h</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}