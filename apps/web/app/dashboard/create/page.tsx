'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';
import { buildSigner, getUserAddress } from '@/lib/signer';
import { SUI_NETWORK, SUI_PACKAGE_ID_V2, assertV2Available } from '@/lib/sui-client';
import { FESTIVAL_MERCHANTS } from '@/lib/merchants';

const T = {
  bg: '#080C14', bgCard: '#0D1420', border: '#1A2740',
  blue: '#4DA2FF', blueDim: 'rgba(77,162,255,0.12)', blueBorder: 'rgba(77,162,255,0.3)',
  teal: '#00D4AA', tealDim: 'rgba(0,212,170,0.1)', tealBorder: 'rgba(0,212,170,0.3)',
  gold: '#FFB830',
  white: '#FFFFFF', grey1: '#B8C8E0', grey2: '#5A7090',
};

const EXPIRY_OPTIONS = [24, 48, 72, 168];

export default function CreatePass() {
  const router = useRouter();

  const [budget, setBudget] = useState<number | ''>(300);
  const [autoThreshold, setAutoThreshold] = useState<number | ''>(50);
  const [escalateThreshold, setEscalateThreshold] = useState<number | ''>(100);
  const [expiry, setExpiry] = useState(48);
  // Addresses, not names — v2's approvedMerchants is vector<address> on
  // chain. FESTIVAL_MERCHANTS pairs each real address with the display
  // label rendered below.
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>(
    FESTIVAL_MERCHANTS.map(m => m.address)
  );

  const [state, setState] = useState<'idle' | 'signing' | 'deploying' | 'storing' | 'done' | 'error'>('idle');
  const [visibleLines, setVisibleLines] = useState<number[]>([]);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const budgetNum = Number(budget) || 0;
  const autoNum = Number(autoThreshold) || 0;
  const escalateNum = Number(escalateThreshold) || 0;

  const toggleMerchant = (address: string) => {
    setSelectedMerchants(prev =>
      prev.includes(address) ? prev.filter(x => x !== address) : [...prev, address]
    );
  };

  const logSteps = [
    { prefix: '$', color: T.grey2, text: `edge create-pass --network ${SUI_NETWORK}`, delay: 0 },
    { prefix: '✓', color: T.teal, text: 'zkLogin session verified', delay: 400 },
    { prefix: '✓', color: T.teal, text: 'zkLogin signer ready · direct execution', delay: 800 },
    { prefix: '$', color: T.grey1, text: 'building PTB...', delay: 1300 },
    { prefix: '→', color: T.blue, text: 'edge::edge_pass::create_pass', delay: 1600, indent: true },
    { prefix: '→', color: T.grey2, text: 'budget: ' + (budgetNum * 1_000_000_000) + ' MIST', delay: 1850, indent: true },
    { prefix: '→', color: T.grey2, text: 'auto_threshold: ' + (autoNum * 1_000_000_000) + ' MIST', delay: 2050, indent: true },
    { prefix: '→', color: T.grey2, text: 'escalate_threshold: ' + (escalateNum * 1_000_000_000) + ' MIST', delay: 2250, indent: true },
    { prefix: '→', color: T.grey2, text: 'expiry: ' + (expiry * 3_600_000) + 'ms · ' + selectedMerchants.length + ' merchants', delay: 2450, indent: true },
    { prefix: '✓', color: T.teal, text: 'PTB constructed · 2 transactions', delay: 2800 },
    { prefix: '$', color: T.grey1, text: `submitting to Sui ${SUI_NETWORK}...`, delay: 3200 },
  ];

  const handleCreate = async () => {
    if (state !== 'idle') return;
    if (selectedMerchants.length === 0) { setErrorMsg('Select at least one merchant'); setState('error'); return; }
    if (autoNum >= escalateNum) { setErrorMsg('Auto-approve must be less than escalate threshold'); setState('error'); return; }
    if (escalateNum > budgetNum) { setErrorMsg('Escalate threshold cannot exceed budget'); setState('error'); return; }
    if (budgetNum <= 0) { setErrorMsg('Budget must be greater than 0'); setState('error'); return; }

    // edge_pass_v2 (create()'s only path) isn't deployed on every network —
    // fail here, before signing, with a clear message instead of letting
    // sdk.create() throw deep inside ExecutionEngine after the user has
    // already sat through a signing flow.
    try {
      assertV2Available(SUI_NETWORK);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error');
      setState('error');
      return;
    }

    setState('signing');
    setVisibleLines([]);
    setErrorMsg(null);

    logSteps.forEach((step, i) => {
      setTimeout(() => {
        setVisibleLines(prev => [...prev, i]);
        if (i === 3) setState('deploying');
      }, step.delay);
    });

    try {
      const signer = buildSigner(process.env.NEXT_PUBLIC_ENOKI_API_KEY!);
      const sdk = new EdgePass({ network: SUI_NETWORK, enokiApiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY! });
      const owner = getUserAddress();
      if (!owner) throw new Error('Not authenticated');

      // v1 -> v2: v2 also requires a hard, on-chain-enforced
      // `maxPerTransaction` ceiling with no UI equivalent yet; capping it at
      // the full budget preserves the old "escalate, don't block" behavior
      // for every amount this form can produce. `owner` becomes both
      // `agent` (spends) and `issuer` (bookkeeping only — the real on-chain
      // issuer is always the tx sender) since this demo wallet does both.
      const budgetMist = BigInt(budgetNum) * MIST_PER_SUI;
      const pass = await sdk.create({
        agent:             owner,
        issuer:            owner,
        budget:            budgetMist,
        escalateAbove:     BigInt(escalateNum) * MIST_PER_SUI,
        maxPerTransaction: budgetMist,
        velocityCap:       0,
        velocityWindowMs:  0,
        approvedMerchants: selectedMerchants,
        expiryMs:          expiry * 60 * 60 * 1000,
      }, signer);

      setTxDigest(pass.id);
      setVisibleLines(prev => [...prev, logSteps.length]);
      setState('storing');

      try {
        const { storeEncryptedPolicy } = await import('@/lib/seal');
        await storeEncryptedPolicy({
          passId: pass.id,
          owner,
          approvedMerchants: selectedMerchants,
          budget: budgetNum,
          autoThreshold: autoNum,
          escalateThreshold: escalateNum,
          createdAt: Date.now(),
        });
        setVisibleLines(prev => [...prev, logSteps.length + 1]);
      } catch (e) {
        console.error('Seal store failed:', e);
      }

      const existing = JSON.parse(localStorage.getItem('edge_passes') || '[]');
      localStorage.setItem('edge_pass_id', pass.id);
      localStorage.setItem('edge_passes', JSON.stringify([{
        budget: budgetNum, autoThreshold: autoNum, escalateThreshold: escalateNum, expiry,
        merchants: selectedMerchants,
        id: pass.id,
        packageId: SUI_PACKAGE_ID_V2,
        network: SUI_NETWORK,
        spent: 0,
        active: true,
        createdAt: Date.now(),
      }, ...existing]));

      setState('done');
      await new Promise(r => setTimeout(r, 800));
      router.push('/dashboard');

    } catch (e) {
      console.error('EdgePass creation failed:', e);
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error');
      setState('error');
    }
  };

  const isRunning = state === 'signing' || state === 'deploying' || state === 'storing';
  const showForm = state === 'idle' || state === 'error';
  const showLog = state !== 'idle';

  const inputStyle: React.CSSProperties = {
    background: T.bgCard,
    border: '1px solid ' + T.border,
    borderRadius: 10,
    padding: '11px 14px',
    color: T.white,
    fontFamily: 'DM Mono, monospace',
    fontSize: 14,
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const btnStyle: React.CSSProperties = {
    width: '100%', padding: 14, borderRadius: 12,
    border: '1px solid ' + (isRunning ? T.border : 'transparent'),
    background: state === 'done' ? T.teal : state === 'error' ? T.bgCard : isRunning ? T.bgCard : T.blue,
    color: state === 'done' ? T.bg : isRunning ? T.grey2 : T.white,
    fontSize: 14, fontWeight: 700,
    cursor: isRunning ? 'default' : 'pointer',
    transition: 'all 0.4s', fontFamily: 'Inter, sans-serif',
  };

  const dynamicLogSteps = [
    ...logSteps,
    { prefix: '✓', color: T.teal, text: 'transaction confirmed · EdgePass minted · ' + (txDigest ? txDigest.slice(0, 12) + '...' : ''), indent: false },
    { prefix: '✓', color: T.teal, text: 'policy stored on Walrus · blob certified', indent: false },
    { prefix: '→', color: T.blue, text: 'EdgePass ready', indent: false },
  ];

  const btnLabel = {
    idle: 'Create EdgePass on Sui',
    signing: '$ signing with zkLogin...',
    deploying: '$ deploying Move object...',
    storing: '$ storing policy on Walrus...',
    done: '✓ EdgePass minted on-chain',
    error: 'Try again',
  }[state];

  return (
    <main style={{ background: T.bg, padding: 'clamp(20px, 4vw, 32px) clamp(16px, 4vw, 24px)' }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
        .log-line { opacity: 0; animation: fadeUp 0.3s ease forwards; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        input:focus { border-color: #00D4AA !important; }
      `}</style>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>

        <div style={{ marginBottom: 28 }}>
          <button onClick={() => router.push('/dashboard')}
            style={{ background: 'none', border: 'none', color: T.grey2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Mono, monospace', marginBottom: 16, padding: 0 }}>
            back
          </button>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <span style={{ background: T.blueDim, border: '1px solid ' + T.blueBorder, color: T.blue, fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', padding: '3px 10px', borderRadius: 6 }}>FESTIVAL MODE</span>
          </div>
          <h1 style={{ fontFamily: 'DM Mono, monospace', fontSize: 'clamp(18px, 3vw, 22px)', color: T.white, fontWeight: 700, margin: '0 0 6px' }}>Create EdgePass</h1>
          <p style={{ color: T.grey2, fontSize: 13, margin: 0, fontFamily: 'Inter, sans-serif' }}>Define your trust boundaries. Minted as a Move object on Sui.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {showForm && (
            <div>
              <label style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8, fontFamily: 'DM Mono, monospace' }}>
                Total Budget (USD)
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.teal, fontFamily: 'DM Mono, monospace', fontSize: 14 }}>$</span>
                <input
                  type="number"
                  value={budget}
                  min={1}
                  max={10000}
                  onChange={e => setBudget(e.target.value === '' ? '' : Number(e.target.value))}
                  style={{ ...inputStyle, paddingLeft: 28, color: T.teal }}
                />
              </div>
            </div>
          )}

          {showForm && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8, fontFamily: 'DM Mono, monospace' }}>Auto-approve under</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.teal, fontFamily: 'DM Mono, monospace', fontSize: 14 }}>$</span>
                  <input
                    type="number"
                    value={autoThreshold}
                    min={1}
                    onChange={e => setAutoThreshold(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{ ...inputStyle, paddingLeft: 28, color: T.teal }}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8, fontFamily: 'DM Mono, monospace' }}>Escalate above</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.gold, fontFamily: 'DM Mono, monospace', fontSize: 14 }}>$</span>
                  <input
                    type="number"
                    value={escalateThreshold}
                    min={1}
                    onChange={e => setEscalateThreshold(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{ ...inputStyle, paddingLeft: 28, color: T.gold }}
                  />
                </div>
              </div>
            </div>
          )}

          {showForm && (
            <div>
              <label style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8, fontFamily: 'DM Mono, monospace' }}>Expires After</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {EXPIRY_OPTIONS.map(h => (
                  <button
                    key={h}
                    onClick={() => setExpiry(h)}
                    style={{
                      padding: '10px 0', borderRadius: 8, cursor: 'pointer',
                      border: '1px solid ' + (h === expiry ? T.teal : T.border),
                      background: h === expiry ? T.tealDim : T.bg,
                      color: h === expiry ? T.teal : T.grey2,
                      fontFamily: 'DM Mono, monospace', fontSize: 13, transition: 'all 0.15s',
                    }}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
          )}

          {showForm && (
            <div>
              <label style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8, fontFamily: 'DM Mono, monospace' }}>
                Approved Merchants <span style={{ color: T.grey2, fontWeight: 400 }}>({selectedMerchants.length} selected)</span>
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {FESTIVAL_MERCHANTS.map(m => {
                  const selected = selectedMerchants.includes(m.address);
                  return (
                    <button
                      key={m.address}
                      onClick={() => toggleMerchant(m.address)}
                      style={{
                        background: selected ? T.tealDim : T.bgCard,
                        border: '1px solid ' + (selected ? T.tealBorder : T.border),
                        color: selected ? T.teal : T.grey2,
                        fontSize: 11, fontFamily: 'DM Mono, monospace',
                        padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {selected ? '✓ ' : ''}{m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showForm && (
            <div style={{ background: T.bgCard, border: '1px solid ' + T.border, borderRadius: 10, padding: '12px 14px', animation: 'fadeUp 0.3s ease' }}>
              <div style={{ fontSize: 10, color: T.blue, fontFamily: 'DM Mono, monospace', marginBottom: 8, letterSpacing: '0.06em' }}>PTB PREVIEW</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: T.grey2, lineHeight: 1.8 }}>
                <div style={{ color: T.grey1 }}>edge::pass::create_pass({'{'}</div>
                <div style={{ paddingLeft: 16 }}>budget: <span style={{ color: T.teal }}>{budgetNum * 1_000_000_000}</span>,</div>
                <div style={{ paddingLeft: 16 }}>auto_threshold: <span style={{ color: T.teal }}>{autoNum * 1_000_000_000}</span>,</div>
                <div style={{ paddingLeft: 16 }}>escalate_threshold: <span style={{ color: T.gold }}>{escalateNum * 1_000_000_000}</span>,</div>
                <div style={{ paddingLeft: 16 }}>expiry_ms: <span style={{ color: T.grey1 }}>{expiry * 3_600_000}</span>,</div>
                <div style={{ paddingLeft: 16 }}>merchants: <span style={{ color: T.grey1 }}>[{selectedMerchants.length}]</span>,</div>
                <div style={{ color: T.grey1 }}>{'})'}</div>
              </div>
            </div>
          )}

          {showLog && (
            <div style={{ background: T.bgCard, border: '1px solid ' + T.border, borderRadius: 10, padding: '14px 16px', animation: 'fadeUp 0.4s ease', minHeight: 80 }}>
              <div style={{ fontSize: 10, color: T.blue, fontFamily: 'DM Mono, monospace', marginBottom: 10, letterSpacing: '0.06em' }}>EXECUTION LOG</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, lineHeight: 1.9 }}>
                {dynamicLogSteps.map((step, i) => (
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

          {errorMsg && (
            <div style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#FF4D6A' }}>✗ {errorMsg}</div>
            </div>
          )}

          <button
            onClick={state === 'error' ? () => { setState('idle'); setErrorMsg(null); } : handleCreate}
            disabled={isRunning}
            style={btnStyle}
          >
            {btnLabel}
          </button>

          <p style={{ textAlign: 'center', color: T.grey2, fontSize: 11, margin: 0, fontFamily: 'DM Mono, monospace' }}>
            zkLogin verified · PTB atomic execution · Sui {SUI_NETWORK}
          </p>
        </div>
      </div>
    </main>
  );
}
