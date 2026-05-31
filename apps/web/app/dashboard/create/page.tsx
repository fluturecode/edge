'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const PRESET_MERCHANTS = [
  'Shuttle Express',
  'Festival Kitchen',
  'Hydra Bar',
  'Stage Access VIP',
  'Official Merch',
];

export default function CreatePass() {
  const router = useRouter();
  const [form, setForm] = useState({
    budget: 300,
    autoThreshold: 50,
    escalateThreshold: 100,
    expiry: 48,
    merchants: PRESET_MERCHANTS,
  });
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    // We'll wire this to the Move contract next
    // For now store in localStorage to test the flow
    const pass = {
      ...form,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      spent: 0,
      active: true,
    };
    const existing = JSON.parse(localStorage.getItem('edge_passes') || '[]');
    localStorage.setItem('edge_passes', JSON.stringify([...existing, pass]));
    await new Promise((r) => setTimeout(r, 1000)); // simulate tx
    router.push('/dashboard');
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Create EdgePass</h1>
          <p className="text-muted-foreground mt-1">
            Set your trust boundaries once.
          </p>
        </div>

        {/* Budget */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Total Budget</label>
          <div className="flex items-center border rounded-lg px-3 py-2 gap-2">
            <span className="text-muted-foreground">$</span>
            <input
              type="number"
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: +e.target.value })}
              className="flex-1 bg-transparent outline-none font-mono"
            />
          </div>
        </div>

        {/* Thresholds */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Auto-approve under</label>
            <div className="flex items-center border rounded-lg px-3 py-2 gap-2">
              <span className="text-muted-foreground">$</span>
              <input
                type="number"
                value={form.autoThreshold}
                onChange={(e) => setForm({ ...form, autoThreshold: +e.target.value })}
                className="flex-1 bg-transparent outline-none font-mono"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Escalate above</label>
            <div className="flex items-center border rounded-lg px-3 py-2 gap-2">
              <span className="text-muted-foreground">$</span>
              <input
                type="number"
                value={form.escalateThreshold}
                onChange={(e) => setForm({ ...form, escalateThreshold: +e.target.value })}
                className="flex-1 bg-transparent outline-none font-mono"
              />
            </div>
          </div>
        </div>

        {/* Expiry */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Expires after</label>
          <div className="grid grid-cols-4 gap-2">
            {[24, 48, 72, 168].map((h) => (
              <button
                key={h}
                onClick={() => setForm({ ...form, expiry: h })}
                className={`py-2 rounded-lg border font-mono text-sm transition-colors ${
                  form.expiry === h
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>

        {/* Merchants */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Approved Merchants</label>
          <div className="flex flex-wrap gap-2">
            {PRESET_MERCHANTS.map((m) => (
              <span
                key={m}
                className="text-xs border border-primary/40 text-primary px-3 py-1 rounded-full font-mono"
              >
                {m}
              </span>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-semibold transition-opacity disabled:opacity-50"
        >
          {loading ? 'Creating EdgePass...' : 'Create EdgePass'}
        </button>

        <p className="text-center text-xs text-muted-foreground">
          Gas sponsored · No SUI required · Powered by zkLogin
        </p>
      </div>
    </main>
  );
}