'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getZkLoginAddress, getDecodedJwt } from '@/lib/zklogin';

const T = {
  bg: '#080C14', bgCard: '#0D1420', border: '#1A2740',
  blue: '#4DA2FF', blueDim: 'rgba(77,162,255,0.12)', blueBorder: 'rgba(77,162,255,0.3)',
  teal: '#00D4AA', tealDim: 'rgba(0,212,170,0.1)', tealBorder: 'rgba(0,212,170,0.3)',
  gold: '#FFB830', white: '#FFFFFF', grey1: '#B8C8E0', grey2: '#5A7090',
};

interface EdgePass {
  id: string; budget: number; spent: number; autoThreshold: number;
  escalateThreshold: number; expiry: number; merchants: string[];
  active: boolean; createdAt: number; packageId?: string; network?: string;
}

function BudgetRing({ total, spent }: { total: number; spent: number }) {
  const pct = Math.min((spent / total) * 100, 100);
  const r = 40, circ = 2 * Math.PI * r;
  const color = pct > 80 ? '#FF4D6A' : pct > 55 ? T.gold : T.teal;
  return (
    <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
      <svg width="96" height="96" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="48" cy="48" r={r} fill="none" stroke={T.border} strokeWidth="6"/>
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${(pct/100)*circ} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1), stroke 0.4s' }}/>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600, color: T.white }}>${spent.toFixed(0)}</span>
        <span style={{ fontSize: 10, color: T.grey2, fontFamily: 'DM Mono, monospace' }}>spent</span>
      </div>
    </div>
  );
}

const ECOSYSTEM = [
  { label: 'zkLogin', color: T.teal },
  { label: 'Sponsored Tx', color: T.gold },
  { label: 'PTBs', color: T.blue },
  { label: 'Walrus Logs', color: T.teal },
  { label: 'Seal Policies', color: T.blue },
];

export default function Dashboard() {
  const router = useRouter();
  const [address, setAddress] = useState<string | null>(null);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [passes, setPasses] = useState<EdgePass[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('edge_id_token');
    if (!token) { router.push('/'); return; }
    try {
      setAddress(getZkLoginAddress(token));
      const decoded = getDecodedJwt(token) as any;
      setUser({ name: decoded.name, email: decoded.email });
    } catch (e) { router.push('/'); }
    setPasses(JSON.parse(localStorage.getItem('edge_passes') || '[]'));
  }, []);

  const pass = passes[0];

  return (
    <main style={{ background: T.bg, padding: 'clamp(20px, 4vw, 32px) clamp(16px, 4vw, 24px)' }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: 'DM Mono, monospace', fontSize: 'clamp(18px, 3vw, 22px)', color: T.white, fontWeight: 700, margin: 0 }}>Dashboard</h1>
            {user && <p style={{ fontSize: 12, color: T.grey2, margin: '4px 0 0', fontFamily: 'Inter, sans-serif' }}>{user.name} · {user.email}</p>}
            {address && <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: T.blue, margin: '4px 0 0', wordBreak: 'break-all' }}>{address.slice(0, 20)}...{address.slice(-8)}</p>}
          </div>
          <button onClick={() => router.push('/dashboard/create')}
            style={{ background: 'none', color: T.teal, border: `1px solid ${T.tealBorder}`, borderRadius: 10, padding: '9px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.background = T.tealDim; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
            + New EdgePass
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {ECOSYSTEM.map(e => (
            <span key={e.label} style={{ background: `${e.color}12`, border: `1px solid ${e.color}35`, color: e.color, fontSize: 10, fontFamily: 'DM Mono, monospace', padding: '4px 10px', borderRadius: 6 }}>
              {e.label}
            </span>
          ))}
        </div>

        {!pass ? (
          <div style={{ textAlign: 'center', padding: '56px 24px', border: `1px dashed ${T.border}`, borderRadius: 16, animation: 'fadeUp 0.4s ease-out' }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: T.grey2, marginBottom: 20 }}>No EdgePasses found_</div>
            <button onClick={() => router.push('/dashboard/create')}
              style={{ background: T.teal, color: T.bg, border: 'none', borderRadius: 10, padding: '13px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              Create your first EdgePass
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeUp 0.4s ease-out' }}>
            <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 18, padding: 'clamp(16px, 3vw, 22px)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', background: T.teal, opacity: 0.04, filter: 'blur(50px)', top: -50, right: -30, pointerEvents: 'none' }}/>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4, fontFamily: 'DM Mono, monospace' }}>EdgePass · Festival Mode</div>
                  <a href={`https://suiscan.xyz/mainnet/object/${pass.id}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: T.blue, textDecoration: 'none' }}>
                    {pass.id.slice(0, 10)}...{pass.id.slice(-8)} ↗
                  </a>
                </div>
                <span style={{ background: T.tealDim, border: `1px solid ${T.tealBorder}`, color: T.teal, fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', padding: '3px 10px', borderRadius: 6 }}>ACTIVE</span>
              </div>

              <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <BudgetRing total={pass.budget} spent={pass.spent || 0} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1, minWidth: 180 }}>
                  {[
                    { l: 'Remaining', v: `$${(pass.budget - (pass.spent||0)).toFixed(0)}`, c: T.teal },
                    { l: 'Auto ≤', v: `$${pass.autoThreshold}`, c: T.white },
                    { l: 'Escalate ≥', v: `$${pass.escalateThreshold}`, c: T.gold },
                    { l: 'Expires', v: `${pass.expiry}h`, c: T.grey1 },
                  ].map(s => (
                    <div key={s.l} style={{ background: T.bg, borderRadius: 8, border: `1px solid ${T.border}`, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: T.grey2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3, fontFamily: 'DM Mono, monospace' }}>{s.l}</div>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 600, color: s.c }}>{s.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, color: T.grey2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: 'DM Mono, monospace' }}>Approved Merchants</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(pass.merchants || []).map((m: string) => (
                    <span key={m} style={{ background: T.tealDim, border: `1px solid ${T.tealBorder}`, color: T.teal, fontSize: 10, fontFamily: 'DM Mono, monospace', padding: '3px 8px', borderRadius: 5 }}>{m}</span>
                  ))}
                </div>
              </div>

              {pass.packageId && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: T.grey2, fontFamily: 'DM Mono, monospace' }}>contract:</span>
                  <a href={`https://suiscan.xyz/mainnet/object/${pass.packageId}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: T.grey2, textDecoration: 'none' }}>
                    {pass.packageId.slice(0, 10)}...{pass.packageId.slice(-8)} ↗
                  </a>
                  <span style={{ background: T.blueDim, border: `1px solid ${T.blueBorder}`, color: T.blue, fontSize: 10, fontFamily: 'DM Mono, monospace', padding: '2px 8px', borderRadius: 4 }}>
                    {pass.network || 'mainnet'}
                  </span>
                </div>
              )}
            </div>

            <button onClick={() => router.push('/dashboard/activity')}
              style={{ width: '100%', padding: 13, background: 'none', border: `1px solid ${T.border}`, borderRadius: 12, color: T.grey1, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'DM Mono, monospace' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.teal; e.currentTarget.style.color = T.teal; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.grey1; }}>
              → Run Festival Mode Simulation
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
