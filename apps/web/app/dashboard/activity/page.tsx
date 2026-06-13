'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { writeAuditLogs, walrusExplorerUrl, AuditLogEntry } from '@/lib/walrus';
import { EdgePass } from '@edge-protocol/sdk';
import { buildSigner } from '@/lib/signer';

const T = {
  bg: '#080C14', bgCard: '#0D1420', bgCardHover: '#111B2E',
  border: '#1A2740', borderHover: '#243550',
  blue: '#4DA2FF', blueDim: 'rgba(77,162,255,0.12)', blueBorder: 'rgba(77,162,255,0.3)',
  teal: '#00D4AA', tealDim: 'rgba(0,212,170,0.1)', tealBorder: 'rgba(0,212,170,0.3)',
  gold: '#FFB830', goldDim: 'rgba(255,184,48,0.1)', goldBorder: 'rgba(255,184,48,0.3)',
  red: '#FF4D6A', redDim: 'rgba(255,77,106,0.1)',
  white: '#FFFFFF', grey1: '#B8C8E0', grey2: '#5A7090',
};

interface PassPolicy {
  budget: number;
  autoThreshold: number;
  escalateThreshold: number;
  merchants: string[];
}

const DEFAULT_POLICY: PassPolicy = {
  budget: 300,
  autoThreshold: 50,
  escalateThreshold: 100,
  merchants: ['Shuttle Express', 'Festival Kitchen', 'Hydra Bar', 'Stage Access VIP', 'Official Merch'],
};

interface TxItem {
  id: number;
  merchant: string;
  amount: number;
  status: string;
  auto: boolean;
  digest: string | null;
  note: string;
}

function Tag({ label, color = T.blue }: { label: string; color?: string }) {
  return (
    <span style={{ background: color + '18', border: '1px solid ' + color + '40', color, fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', padding: '3px 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>{label}</span>
  );
}

function Pill({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    approved: { color: T.teal, label: 'Approved' },
    blocked: { color: T.red, label: 'Blocked' },
    escalated: { color: T.gold, label: 'Escalated' },
    pending: { color: T.blue, label: 'Pending' },
  };
  const { color, label } = map[status] || map.pending;
  return <Tag label={label} color={color} />;
}

function EscalationModal({ tx, policy, onApprove, onDeny }: { tx: TxItem; policy: PassPolicy; onApprove: () => void; onDeny: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.92)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <div style={{ background: T.bgCard, border: '1px solid ' + T.goldBorder, borderRadius: 20, padding: 'clamp(20px, 4vw, 28px)', maxWidth: 380, width: '100%' }}>
        <Tag label="APPROVAL REQUIRED" color={T.gold} />
        <h2 style={{ fontFamily: 'DM Mono, monospace', fontSize: 16, color: T.white, fontWeight: 700, margin: '14px 0 6px' }}>Transaction exceeds threshold</h2>
        <p style={{ fontSize: 12, color: T.grey2, margin: '0 0 20px', fontFamily: 'Inter, sans-serif' }}>This transaction requires your explicit approval before execution.</p>
        <div style={{ background: T.bg, borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid ' + T.border }}>
          {[
            ['Merchant', tx.merchant, T.white],
            ['Amount', '$' + tx.amount.toFixed(2), T.gold],
            ['Escalate threshold', '$' + policy.escalateThreshold + '.00', T.grey1],
            ['Action', 'Manual approval required', T.grey1],
          ].map(([k, v, c]) => (
            <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, fontSize: 13 }}>
              <span style={{ color: T.grey2, fontFamily: 'Inter, sans-serif' }}>{k}</span>
              <span style={{ color: c as string, fontFamily: k === 'Amount' ? 'DM Mono, monospace' : 'Inter, sans-serif', fontWeight: k === 'Amount' ? 700 : 400, fontSize: k === 'Amount' ? 17 : 13 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ background: T.bgCard, border: '1px solid ' + T.border, borderRadius: 8, padding: '10px 14px', marginBottom: 18 }}>
          <span style={{ fontSize: 11, color: T.grey2, fontFamily: 'DM Mono, monospace' }}>production: Face ID / biometric confirmation triggers here</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onDeny} style={{ flex: 1, padding: 13, borderRadius: 10, border: '1px solid ' + T.border, background: 'transparent', color: T.grey1, cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.background = T.redDim; e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.grey1; }}>
            Deny
          </button>
          <button onClick={async () => { setDone(true); await new Promise(r => setTimeout(r, 500)); onApprove(); }} disabled={done}
            style={{ flex: 2, padding: 13, borderRadius: 10, border: 'none', background: done ? T.teal : T.gold, color: T.bg, cursor: done ? 'default' : 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'Inter, sans-serif', transition: 'background 0.3s' }}>
            {done ? '✓ Approved' : 'Approve Transaction'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TxRow({ tx }: { tx: TxItem }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 50); return () => clearTimeout(t); }, []);
  const statusColors: Record<string, string> = { approved: T.teal, blocked: T.red, escalated: T.gold };
  const dotColor = statusColors[tx.status] || T.blue;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid ' + T.border, opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(8px)', transition: 'all 0.35s ease-out' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, boxShadow: '0 0 5px ' + dotColor, flexShrink: 0, display: 'inline-block' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          <span style={{ fontSize: 14, color: T.white, fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>{tx.merchant}</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, color: T.white, fontWeight: 600 }}>${tx.amount.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 4 }}>
          <span style={{ fontSize: 11, color: T.grey2, fontFamily: 'DM Mono, monospace' }}>{tx.note}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {tx.digest && (
              <a
                href={'https://suiscan.xyz/testnet/tx/' + tx.digest}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: T.blue, textDecoration: 'none' }}
              >
                {tx.digest.slice(0, 8) + '... \u2197'}
              </a>
            )}
            <Pill status={tx.status} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Activity() {
  const router = useRouter();
  const [policy, setPolicy] = useState<PassPolicy>(DEFAULT_POLICY);
  const [transactions, setTransactions] = useState<TxItem[]>([]);
  const [shown, setShown] = useState<TxItem[]>([]);
  const [processing, setProcessing] = useState<number | null>(null);
  const [idx, setIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [modal, setModal] = useState<TxItem | null>(null);
  const [done, setDone] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [walrusBlobId, setWalrusBlobId] = useState<string | null>(null);
  const [walrusLoading, setWalrusLoading] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const ref = useRef(false);
  const autoRef = useRef(false);

  // Load policy from localStorage on mount
  useEffect(() => {
    const passes = JSON.parse(localStorage.getItem('edge_passes') || '[]');
    if (passes.length > 0) {
      const latest = passes[0];
      const p: PassPolicy = {
        budget: latest.budget || 300,
        autoThreshold: latest.autoThreshold || 50,
        escalateThreshold: latest.escalateThreshold || 100,
        merchants: latest.merchants || DEFAULT_POLICY.merchants,
      };
      setPolicy(p);

      // Build transactions dynamically based on policy
      const txs: TxItem[] = [
        { id: 1, merchant: p.merchants[0] || 'Shuttle Express', amount: Math.min(p.autoThreshold * 0.4, 20), status: 'approved', auto: true, digest: null, note: 'Auto-approved · under threshold' },
        { id: 2, merchant: p.merchants[2] || 'Hydra Bar', amount: Math.min(p.autoThreshold * 0.65, 32), status: 'approved', auto: true, digest: null, note: 'Auto-approved · trusted merchant' },
        { id: 3, merchant: p.merchants[3] || 'Stage Access VIP', amount: Math.min(p.escalateThreshold * 0.75, 75), status: 'approved', auto: true, digest: null, note: 'Auto-approved · within limits' },
        { id: 4, merchant: 'ShadyTokens.xyz', amount: 0.01, status: 'blocked', auto: true, digest: null, note: 'Blocked · unlisted merchant' },
        { id: 5, merchant: p.merchants[3] || 'Artist Meet & Greet', amount: Math.min(p.escalateThreshold * 1.5, 149), status: 'escalated', auto: false, digest: null, note: 'Escalated · exceeds $' + p.escalateThreshold + ' threshold' },
      ];
      setTransactions(txs);
    } else {
      setTransactions([
        { id: 1, merchant: 'Shuttle Express', amount: 18.50, status: 'approved', auto: true, digest: null, note: 'Auto-approved · under threshold' },
        { id: 2, merchant: 'Hydra Bar', amount: 32.00, status: 'approved', auto: true, digest: null, note: 'Auto-approved · trusted merchant' },
        { id: 3, merchant: 'Stage Access VIP', amount: 75.00, status: 'approved', auto: true, digest: null, note: 'Auto-approved · within limits' },
        { id: 4, merchant: 'ShadyTokens.xyz', amount: 0.01, status: 'blocked', auto: true, digest: null, note: 'Blocked · unlisted merchant' },
        { id: 5, merchant: 'Artist Meet & Greet', amount: 149.00, status: 'escalated', auto: false, digest: null, note: 'Escalated · exceeds $100 threshold' },
      ]);
    }
  }, []);

  const spent = shown.filter(t => t.status === 'approved').reduce((s, t) => s + t.amount, 0);
  const pct = Math.min((spent / policy.budget) * 100, 100);
  const barColor = pct > 80 ? T.red : pct > 55 ? T.gold : T.teal;

  useEffect(() => {
    if (!done || shown.length === 0 || walrusBlobId) return;
    const flush = async () => {
      setWalrusLoading(true);
      const passId = localStorage.getItem('edge_pass_id') || '0x...';
      const entries: AuditLogEntry[] = shown.map(tx => ({
        passId,
        merchant: tx.merchant,
        amount: tx.amount,
        status: tx.status as 'approved' | 'blocked' | 'escalated',
        timestamp: Date.now(),
        owner: localStorage.getItem('edge_sui_address') || '0x...',
        digest: tx.digest || undefined,
      }));
      const blobId = await writeAuditLogs(entries, passId);
      setWalrusBlobId(blobId);
      setWalrusLoading(false);
    };
    flush();
  }, [done]);

  const processOne = async (currentIdx: number) => {
    if (ref.current || transactions.length === 0) return;
    ref.current = true;
    setRunning(true);
    setExecError(null);
    const tx = transactions[currentIdx];
    setProcessing(tx.id);

    let resultTx: TxItem = { ...tx };

    if (tx.status === 'approved') {
      try {
        const passId = localStorage.getItem('edge_pass_id');
        if (passId) {
          const sdk = new EdgePass({ network: 'testnet', enokiApiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY! });
          const signer = buildSigner(process.env.NEXT_PUBLIC_ENOKI_API_KEY!);
          const passObj = await sdk.fetch(passId);
          if (passObj) {
            const outcome = await sdk.execute(passObj, {
              merchant: tx.merchant,
              amount: BigInt(Math.round(tx.amount * 1_000_000_000)),
            }, signer);
            if (outcome.status === 'approved' && outcome.digest) {
              resultTx = { ...tx, digest: outcome.digest };
            } else if (outcome.status === 'blocked') {
              resultTx = { ...tx, status: 'blocked', note: outcome.reason || 'Blocked by policy' };
            }
          }
        }
      } catch (e) {
        console.error('On-chain execute failed:', e);
        setExecError(e instanceof Error ? e.message : 'Execution failed');
      }
    }

    await new Promise(r => setTimeout(r, 800));
    setProcessing(null);

    if (tx.status === 'escalated') {
      setModal(tx);
      autoRef.current = false;
      setAutoMode(false);
    } else {
      setShown(p => [...p, resultTx]);
      setIdx(currentIdx + 1);
      ref.current = false;
      setRunning(false);
      if (currentIdx + 1 >= transactions.length) { setDone(true); setAutoMode(false); return; }
      if (autoRef.current) { await new Promise(r => setTimeout(r, 500)); processOne(currentIdx + 1); }
    }
  };

  const next = () => { if (!ref.current && idx < transactions.length && !done) processOne(idx); };
  const runAll = () => { if (ref.current || done) return; autoRef.current = true; setAutoMode(true); processOne(idx); };

  const approve = () => {
    setModal(null);
    if (modal) setShown(p => [...p, modal]);
    setIdx(idx + 1);
    ref.current = false;
    setRunning(false);
    if (idx + 1 >= transactions.length) setDone(true);
  };

  const deny = () => {
    setModal(null);
    if (modal) setShown(p => [...p, { ...modal, status: 'blocked', note: 'Denied by user' }]);
    setIdx(idx + 1);
    ref.current = false;
    setRunning(false);
    if (idx + 1 >= transactions.length) setDone(true);
  };

  const reset = () => {
    setShown([]); setIdx(0); setRunning(false); setDone(false);
    setAutoMode(false); setModal(null); setProcessing(null);
    setWalrusBlobId(null); setWalrusLoading(false); setExecError(null);
    ref.current = false; autoRef.current = false;
  };

  if (transactions.length === 0) return null;

  return (
    <main style={{ minHeight: 'calc(100vh - 57px)', background: T.bg, padding: 'clamp(20px, 4vw, 32px) clamp(16px, 4vw, 24px)' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      {modal && <EscalationModal tx={modal} policy={policy} onApprove={approve} onDeny={deny} />}

      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: T.grey2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Mono, monospace', marginBottom: 8, padding: 0, display: 'block' }}>back</button>
            <h1 style={{ fontFamily: 'DM Mono, monospace', fontSize: 'clamp(18px, 3vw, 22px)', color: T.white, fontWeight: 700, margin: 0 }}>Activity</h1>
            <p style={{ color: T.grey2, fontSize: 13, margin: '4px 0 0', fontFamily: 'Inter, sans-serif' }}>
              Festival Mode · auto: &lt;${policy.autoThreshold} · escalate: &gt;${policy.escalateThreshold}
            </p>
          </div>
          {done && (
            <button onClick={reset} style={{ background: 'none', border: '1px solid ' + T.border, borderRadius: 8, padding: '8px 14px', color: T.grey2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Mono, monospace', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.teal; e.currentTarget.style.color = T.teal; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.grey2; }}>
              reset
            </button>
          )}
        </div>

        <div style={{ background: T.bgCard, border: '1px solid ' + T.border, borderRadius: 12, padding: '14px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 4 }}>
            <span style={{ fontSize: 11, color: T.grey2, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'DM Mono, monospace' }}>Budget</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: T.white }}>${spent.toFixed(2)} <span style={{ color: T.grey2 }}>/ ${policy.budget}.00</span></span>
          </div>
          <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: barColor, borderRadius: 2, width: pct + '%', transition: 'width 0.6s ease-out, background 0.4s' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { l: 'Auto-approved', v: shown.filter(t => t.auto && t.status === 'approved').length, c: T.teal },
            { l: 'Blocked', v: shown.filter(t => t.status === 'blocked').length, c: T.red },
            { l: 'Escalated', v: shown.filter(t => t.status === 'escalated').length, c: T.gold },
            { l: 'Wallet popups', v: 0, c: T.grey2 },
          ].map(s => (
            <div key={s.l} style={{ background: T.bgCard, border: '1px solid ' + T.border, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: T.grey2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontFamily: 'DM Mono, monospace' }}>{s.l}</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 20, fontWeight: 700, color: s.c }}>{s.v}</div>
            </div>
          ))}
        </div>

        <div style={{ background: T.bgCard, border: '1px solid ' + T.border, borderRadius: 16, padding: 'clamp(16px, 3vw, 20px) clamp(16px, 3vw, 24px)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'DM Mono, monospace' }}>Transaction Log</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {running && <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.blue, animation: 'pulse 0.8s ease-in-out infinite', display: 'inline-block' }} />}
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: T.grey2 }}>{shown.length}/{transactions.length}</span>
            </div>
          </div>

          {shown.length === 0 && !running && processing === null && (
            <div style={{ padding: '28px 0', textAlign: 'center' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: T.grey2 }}>awaiting execution_</div>
            </div>
          )}

          {processing !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: '1px solid ' + T.border }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.blue, boxShadow: '0 0 8px ' + T.blue, flexShrink: 0, display: 'inline-block', animation: 'pulse 0.8s ease-in-out infinite' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, color: T.white, fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>{transactions.find(t => t.id === processing)?.merchant}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, color: T.white, fontWeight: 600 }}>${transactions.find(t => t.id === processing)?.amount.toFixed(2)}</span>
                </div>
                <span style={{ fontSize: 11, color: T.blue, fontFamily: 'DM Mono, monospace' }}>
                  {transactions.find(t => t.id === processing)?.status === 'approved' ? 'executing on-chain via EdgePass...' : 'validating against EdgePass policy...'}
                </span>
              </div>
            </div>
          )}

          {shown.map(tx => <TxRow key={tx.id} tx={tx} />)}
        </div>

        {execError && (
          <div style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 10 }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: T.red }}>⚠ {execError}</div>
          </div>
        )}

        {!done ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button onClick={next} disabled={running || !!modal}
              style={{ padding: 13, borderRadius: 12, border: '1px solid ' + (running ? T.border : T.borderHover), background: 'transparent', color: running ? T.grey2 : T.grey1, fontSize: 13, fontWeight: 600, cursor: running ? 'default' : 'pointer', transition: 'all 0.2s', fontFamily: 'DM Mono, monospace' }}
              onMouseEnter={e => { if (!running) { e.currentTarget.style.borderColor = T.blue; e.currentTarget.style.color = T.blue; } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = running ? T.border : T.borderHover; e.currentTarget.style.color = running ? T.grey2 : T.grey1; }}>
              {running ? '$ processing...' : '$ next (' + (idx + 1) + '/' + transactions.length + ')'}
            </button>
            <button onClick={runAll} disabled={running || autoMode || !!modal}
              style={{ padding: 13, borderRadius: 12, border: '1px solid ' + (running || autoMode ? T.border : 'transparent'), background: running || autoMode ? T.bgCard : T.blue, color: running || autoMode ? T.grey2 : T.white, fontSize: 13, fontWeight: 700, cursor: running || autoMode ? 'default' : 'pointer', transition: 'all 0.2s', fontFamily: 'Inter, sans-serif' }}>
              {autoMode ? '$ running all...' : 'Run all →'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeUp 0.4s ease-out' }}>
            <div style={{ padding: 16, borderRadius: 12, background: T.tealDim, border: '1px solid ' + T.tealBorder, textAlign: 'center' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: T.teal, fontWeight: 700, marginBottom: 4 }}>✓ execution complete</div>
              <div style={{ fontSize: 12, color: T.grey2, fontFamily: 'Inter, sans-serif' }}>
                {shown.filter(t => t.status === 'approved').length} approved · {shown.filter(t => t.status === 'blocked').length} blocked · 0 wallet popups
              </div>
            </div>

            <div style={{ padding: 16, borderRadius: 12, background: T.bgCard, border: '1px solid ' + T.border }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'DM Mono, monospace' }}>Walrus Audit Log</span>
                {walrusLoading && <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.blue, animation: 'pulse 0.8s ease-in-out infinite', display: 'inline-block' }} />}
              </div>
              {walrusLoading && <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: T.grey2 }}>$ writing audit log to Walrus...</div>}
              {walrusBlobId && (
                <div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: T.teal, marginBottom: 8 }}>✓ audit log stored on Walrus</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: T.grey2, wordBreak: 'break-all', marginBottom: 8 }}>{walrusBlobId}</div>
                  <a href={walrusExplorerUrl(walrusBlobId)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: T.blue, fontFamily: 'DM Mono, monospace', textDecoration: 'none' }}>
                    view on Walrus explorer
                  </a>
                </div>
              )}
              {!walrusLoading && !walrusBlobId && <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: T.grey2 }}>audit log pending...</div>}
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', color: T.grey2, fontSize: 11, marginTop: 12, fontFamily: 'DM Mono, monospace' }}>
          zero wallet interruptions · gas sponsored · audit logs on Walrus
        </p>
      </div>
    </main>
  );
}