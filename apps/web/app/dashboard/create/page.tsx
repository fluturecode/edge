'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const T = {
  bg: '#080C14', bgCard: '#0D1420', border: '#1A2740',
  blue: '#4DA2FF', blueDim: 'rgba(77,162,255,0.12)', blueBorder: 'rgba(77,162,255,0.3)',
  teal: '#00D4AA', tealDim: 'rgba(0,212,170,0.1)', tealBorder: 'rgba(0,212,170,0.3)',
  gold: '#FFB830', goldBorder: 'rgba(255,184,48,0.3)',
  white: '#FFFFFF', grey1: '#B8C8E0', grey2: '#5A7090',
};

const MERCHANTS = ['Shuttle Express', 'Festival Kitchen', 'Hydra Bar', 'Stage Access VIP', 'Official Merch'];

export default function CreatePass() {
  const router = useRouter();
  const [form, setForm] = useState({
    budget: 300,
    autoThreshold: 50,
    escalateThreshold: 100,
    expiry: 48,
    merchants: MERCHANTS,
  });
  const [state, setState] = useState<'idle' | 'signing' | 'deploying' | 'done'>('idle');

  const handleCreate = async () => {
    setState('signing');
    await new Promise(r => setTimeout(r, 1000));
    setState('deploying');
    await new Promise(r => setTimeout(r, 1400));
    setState('done');
    await new Promise(r => setTimeout(r, 600));
    const pass = {
      ...form,
      id: crypto.randomUUID(),
      spent: 0,
      active: true,
      createdAt: Date.now(),
    };
    const existing = JSON.parse(localStorage.getItem('edge_passes') || '[]');
    localStorage.setItem('edge_passes', JSON.stringify([pass, ...existing]));
    router.push('/dashboard');
  };

  const inp: React.CSSProperties = {
    width: '100%',
    background: T.bg,
    border: `1px solid ${T.border}`,
    borderRadius: 10,
    padding: '11px 14px',
    color: T.white,
    fontFamily: 'DM Mono, monospace',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  };

  return (
    <main style={{ minHeight: 'calc(100vh - 57px)', background: T.bg, padding: 'clamp(20px, 4vw, 32px) clamp(16px, 4vw, 24px)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{ background: 'none', border: 'none', color: T.grey2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Mono, monospace', marginBottom: 16, padding: 0 }}
          >
            ← back
          </button>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <span style={{ background: T.blueDim, border: `1px solid ${T.blueBorder}`, color: T.blue, fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', padding: '3px 10px', borderRadius: 6 }}>FESTIVAL MODE</span>
          </div>
          <h1 style={{ fontFamily: 'DM Mono, monospace', fontSize: 'clamp(18px, 3vw, 22px)', color: T.white, fontWeight: 700, margin: '0 0 6px' }}>Create EdgePass</h1>
          <p style={{ color: T.grey2, fontSize: 13, margin: 0, fontFamily: 'Inter, sans-serif' }}>Define your trust boundaries. Minted as a Move object on Sui.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Budget */}
          <div>
            <label style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8, fontFamily: 'DM Mono, monospace' }}>Total Budget</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.grey2, fontFamily: 'DM Mono, monospace' }}>$</span>
              <input
                type="number"
                value={form.budget}
                onChange={e => setForm({ ...form, budget: +e.target.value })}
                style={{ ...inp, paddingLeft: 28 }}
                onFocus={e => e.target.style.borderColor = T.teal}
                onBlur={e => e.target.style.borderColor = T.border}
              />
            </div>
          </div>

          {/* Thresholds */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { l: 'Auto-approve under', k: 'autoThreshold', c: T.teal },
              { l: 'Escalate above', k: 'escalateThreshold', c: T.gold },
            ].map(f => (
              <div key={f.k}>
                <label style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8, fontFamily: 'DM Mono, monospace' }}>{f.l}</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.grey2, fontFamily: 'DM Mono, monospace' }}>$</span>
                  <input
                    type="number"
                    value={form[f.k as keyof typeof form] as number}
                    onChange={e => setForm({ ...form, [f.k]: +e.target.value })}
                    style={{ ...inp, paddingLeft: 28 }}
                    onFocus={e => e.target.style.borderColor = f.c}
                    onBlur={e => e.target.style.borderColor = T.border}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Expiry */}
          <div>
            <label style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8, fontFamily: 'DM Mono, monospace' }}>Expires After</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[24, 48, 72, 168].map(h => (
                <button
                  key={h}
                  onClick={() => setForm({ ...form, expiry: h })}
                  style={{ padding: '10px 0', borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s', border: `1px solid ${form.expiry === h ? T.teal : T.border}`, background: form.expiry === h ? T.tealDim : T.bg, color: form.expiry === h ? T.teal : T.grey2, fontFamily: 'DM Mono, monospace', fontSize: 13 }}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>

          {/* Merchants */}
          <div>
            <label style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8, fontFamily: 'DM Mono, monospace' }}>Approved Merchants</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {MERCHANTS.map(m => (
                <span key={m} style={{ background: T.tealDim, border: `1px solid ${T.tealBorder}`, color: T.teal, fontSize: 11, fontFamily: 'DM Mono, monospace', padding: '4px 10px', borderRadius: 6 }}>{m}</span>
              ))}
            </div>
          </div>

          {/* PTB Preview */}
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: T.blue, fontFamily: 'DM Mono, monospace', marginBottom: 8, letterSpacing: '0.06em' }}>PTB PREVIEW</div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: T.grey2, lineHeight: 1.8 }}>
              <div style={{ color: T.grey1 }}>edge::pass::create_pass({'{'}</div>
              <div style={{ paddingLeft: 16 }}>budget: <span style={{ color: T.teal }}>{form.budget * 1000000000}</span>,</div>
              <div style={{ paddingLeft: 16 }}>auto_threshold: <span style={{ color: T.teal }}>{form.autoThreshold * 1000000000}</span>,</div>
              <div style={{ paddingLeft: 16 }}>escalate_threshold: <span style={{ color: T.gold }}>{form.escalateThreshold * 1000000000}</span>,</div>
              <div style={{ paddingLeft: 16 }}>expiry_ms: <span style={{ color: T.grey1 }}>{form.expiry * 3600000}</span>,</div>
              <div style={{ color: T.grey1 }}>{'})'}</div>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleCreate}
            disabled={state !== 'idle'}
            style={{ width: '100%', padding: 14, border: 'none', borderRadius: 12, background: state === 'done' ? T.teal : state !== 'idle' ? T.bgCard : T.blue, color: state === 'done' ? T.bg : state !== 'idle' ? T.grey2 : T.white, fontSize: 14, fontWeight: 700, cursor: state !== 'idle' ? 'default' : 'pointer', transition: 'all 0.4s', fontFamily: 'Inter, sans-serif', border: `1px solid ${state !== 'idle' ? T.border : 'transparent'}` as any }}
          >
            {state === 'idle' && 'Create EdgePass on Sui'}
            {state === 'signing' && '$ signing with zkLogin...'}
            {state === 'deploying' && '$ deploying Move object...'}
            {state === 'done' && '✓ EdgePass minted on-chain'}
          </button>

          <p style={{ textAlign: 'center', color: T.grey2, fontSize: 11, margin: 0, fontFamily: 'DM Mono, monospace' }}>
            gas sponsored by Enoki · no SUI required · PTB atomic execution
          </p>
        </div>
      </div>
    </main>
  );
}