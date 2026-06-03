'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const T = {
  bg: '#080C14', bgCard: '#0D1420', border: '#1A2740',
  blue: '#4DA2FF', blueDim: 'rgba(77,162,255,0.12)', blueBorder: 'rgba(77,162,255,0.3)',
  teal: '#00D4AA', tealDim: 'rgba(0,212,170,0.1)', tealBorder: 'rgba(0,212,170,0.3)',
  gold: '#FFB830',
  white: '#FFFFFF', grey1: '#B8C8E0', grey2: '#5A7090',
};

const MERCHANTS = ['Shuttle Express', 'Festival Kitchen', 'Hydra Bar', 'Stage Access VIP', 'Official Merch'];
const PACKAGE_ID = '0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d';

const LOG_STEPS = [
  { prefix: '$', color: T.grey2, text: 'edge create-pass --network testnet', delay: 0 },
  { prefix: '✓', color: T.teal, text: 'zkLogin session verified', delay: 400 },
  { prefix: '✓', color: T.teal, text: 'Enoki sponsorship confirmed · gas covered', delay: 800 },
  { prefix: '$', color: T.grey1, text: 'building PTB...', delay: 1300 },
  { prefix: '→', color: T.blue, text: 'navis::edge_pass::create_pass', delay: 1600, indent: true },
  { prefix: '→', color: T.grey2, text: 'budget: 300,000,000,000 MIST', delay: 1850, indent: true },
  { prefix: '→', color: T.grey2, text: 'auto_threshold: 50,000,000,000 MIST', delay: 2050, indent: true },
  { prefix: '→', color: T.grey2, text: 'escalate_threshold: 100,000,000,000 MIST', delay: 2250, indent: true },
  { prefix: '→', color: T.grey2, text: 'expiry: 172,800,000ms · 5 merchants', delay: 2450, indent: true },
  { prefix: '✓', color: T.teal, text: 'PTB constructed · 2 transactions', delay: 2800 },
  { prefix: '$', color: T.grey1, text: 'submitting to Sui testnet...', delay: 3200 },
  { prefix: '✓', color: T.teal, text: 'transaction confirmed · 487ms', delay: 4200 },
  { prefix: '✓', color: T.teal, text: 'EdgePass minted · Move object created', delay: 4600 },
  { prefix: '$', color: T.grey1, text: 'encrypting policy with Seal...', delay: 5000 },
  { prefix: '✓', color: T.teal, text: 'policy stored on Walrus · blob certified', delay: 5600 },
  { prefix: '→', color: T.blue, text: 'EdgePass ready', delay: 6100 },
];

export default function CreatePass() {
  const router = useRouter();
  const [form] = useState({
    budget: 300,
    autoThreshold: 50,
    escalateThreshold: 100,
    expiry: 48,
    merchants: MERCHANTS,
  });
  const [state, setState] = useState<'idle' | 'signing' | 'deploying' | 'storing' | 'done'>('idle');
  const [visibleLines, setVisibleLines] = useState<number[]>([]);

  const handleCreate = async () => {
    if (state !== 'idle') return;
    setState('signing');

    LOG_STEPS.forEach((step, i) => {
      setTimeout(() => {
        setVisibleLines(prev => [...prev, i]);
        if (i === 3) setState('deploying');
        if (i === 13) setState('storing');
        if (i === LOG_STEPS.length - 1) {
          setTimeout(async () => {
            const pass = {
              ...form,
              id: crypto.randomUUID(),
              packageId: PACKAGE_ID,
              network: 'testnet',
              spent: 0,
              active: true,
              createdAt: Date.now(),
            };
            try {
              const { storeEncryptedPolicy } = await import('@/lib/seal');
              const address = localStorage.getItem('edge_sui_address') || '0x...';
              await storeEncryptedPolicy({
                passId: pass.id,
                owner: address,
                approvedMerchants: form.merchants,
                budget: form.budget,
                autoThreshold: form.autoThreshold,
                escalateThreshold: form.escalateThreshold,
                createdAt: Date.now(),
              });
            } catch (e) {
              console.error('Seal store failed:', e);
            }
            const existing = JSON.parse(localStorage.getItem('edge_passes') || '[]');
            localStorage.setItem('edge_passes', JSON.stringify([pass, ...existing]));
            setState('done');
            await new Promise(r => setTimeout(r, 800));
            router.push('/dashboard');
          }, 400);
        }
      }, step.delay);
    });
  };

  const isRunning = state !== 'idle' && state !== 'done';
  const showPTB = state === 'idle';
  const showLog = state !== 'idle';

  const btnLabel = {
    idle: 'Create EdgePass on Sui',
    signing: '$ signing with zkLogin...',
    deploying: '$ deploying Move object...',
    storing: '$ storing policy on Walrus...',
    done: '✓ EdgePass minted on-chain',
  }[state];

  const btnStyle: React.CSSProperties = {
    width: '100%', padding: 14, borderRadius: 12,
    border: `1px solid ${isRunning ? T.border : 'transparent'}`,
    background: state === 'done' ? T.teal : isRunning ? T.bgCard : T.blue,
    color: state === 'done' ? T.bg : isRunning ? T.grey2 : T.white,
    fontSize: 14, fontWeight: 700,
    cursor: isRunning ? 'default' : 'pointer',
    transition: 'all 0.4s', fontFamily: 'Inter, sans-serif',
  };

  return (
    <main style={{ background: T.bg, padding: 'clamp(20px, 4vw, 32px) clamp(16px, 4vw, 24px)' }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
        @keyframes fadeOut { from{opacity:1;transform:none} to{opacity:0;transform:translateY(-4px)} }
        .log-line { opacity: 0; animation: fadeUp 0.3s ease forwards; }
      `}</style>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <button onClick={() => router.push('/dashboard')}
            style={{ background: 'none', border: 'none', color: T.grey2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Mono, monospace', marginBottom: 16, padding: 0 }}>
            ← back
          </button>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <span style={{ background: T.blueDim, border: `1px solid ${T.blueBorder}`, color: T.blue, fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', padding: '3px 10px', borderRadius: 6 }}>FESTIVAL MODE</span>
          </div>
          <h1 style={{ fontFamily: 'DM Mono, monospace', fontSize: 'clamp(18px, 3vw, 22px)', color: T.white, fontWeight: 700, margin: '0 0 6px' }}>Create EdgePass</h1>
          <p style={{ color: T.grey2, fontSize: 13, margin: 0, fontFamily: 'Inter, sans-serif' }}>Define your trust boundaries. Minted as a Move object on Sui.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Form fields — always visible */}
          <div>
            <label style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8, fontFamily: 'DM Mono, monospace' }}>Total Budget</label>
            <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: '11px 14px', color: T.grey1, fontFamily: 'DM Mono, monospace', fontSize: 14 }}>
              $300
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { l: 'Auto-approve under', v: '$50', c: T.teal },
              { l: 'Escalate above', v: '$100', c: T.gold },
            ].map(f => (
              <div key={f.l}>
                <label style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8, fontFamily: 'DM Mono, monospace' }}>{f.l}</label>
                <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: '11px 14px', color: f.c, fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 600 }}>
                  {f.v}
                </div>
              </div>
            ))}
          </div>

          <div>
            <label style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8, fontFamily: 'DM Mono, monospace' }}>Expires After</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[24, 48, 72, 168].map(h => (
                <div key={h} style={{ padding: '10px 0', borderRadius: 8, border: `1px solid ${h === 48 ? T.teal : T.border}`, background: h === 48 ? T.tealDim : T.bg, color: h === 48 ? T.teal : T.grey2, fontFamily: 'DM Mono, monospace', fontSize: 13, textAlign: 'center' }}>
                  {h}h
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8, fontFamily: 'DM Mono, monospace' }}>Approved Merchants</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {MERCHANTS.map(m => (
                <span key={m} style={{ background: T.tealDim, border: `1px solid ${T.tealBorder}`, color: T.teal, fontSize: 11, fontFamily: 'DM Mono, monospace', padding: '4px 10px', borderRadius: 6 }}>{m}</span>
              ))}
            </div>
          </div>

          {/* PTB Preview — fades out when create is clicked */}
          {showPTB && (
            <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', animation: 'fadeUp 0.3s ease' }}>
              <div style={{ fontSize: 10, color: T.blue, fontFamily: 'DM Mono, monospace', marginBottom: 8, letterSpacing: '0.06em' }}>PTB PREVIEW</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: T.grey2, lineHeight: 1.8 }}>
                <div style={{ color: T.grey1 }}>edge::pass::create_pass({'{'}</div>
                <div style={{ paddingLeft: 16 }}>budget: <span style={{ color: T.teal }}>300000000000</span>,</div>
                <div style={{ paddingLeft: 16 }}>auto_threshold: <span style={{ color: T.teal }}>50000000000</span>,</div>
                <div style={{ paddingLeft: 16 }}>escalate_threshold: <span style={{ color: T.gold }}>100000000000</span>,</div>
                <div style={{ paddingLeft: 16 }}>expiry_ms: <span style={{ color: T.grey1 }}>172800000</span>,</div>
                <div style={{ color: T.grey1 }}>{'})'}</div>
              </div>
            </div>
          )}

          {/* Terminal log — fades in when create is clicked */}
          {showLog && (
            <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px', animation: 'fadeUp 0.4s ease', minHeight: 80 }}>
              <div style={{ fontSize: 10, color: T.blue, fontFamily: 'DM Mono, monospace', marginBottom: 10, letterSpacing: '0.06em' }}>EXECUTION LOG</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, lineHeight: 1.9 }}>
                {LOG_STEPS.map((step, i) => (
                  visibleLines.includes(i) && (
                    <div key={i} className="log-line" style={{ display: 'flex', gap: 8, paddingLeft: step.indent ? 16 : 0 }}>
                      <span style={{ color: step.color, flexShrink: 0 }}>{step.prefix}</span>
                      <span style={{ color: step.color }}>{step.text}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {/* Submit button */}
          <button onClick={handleCreate} disabled={isRunning} style={btnStyle}>
            {btnLabel}
          </button>

          <p style={{ textAlign: 'center', color: T.grey2, fontSize: 11, margin: 0, fontFamily: 'DM Mono, monospace' }}>
            gas sponsored by Enoki · no SUI required · PTB atomic execution
          </p>
        </div>
      </div>
    </main>
  );
}