'use client';

import { useState, useEffect } from 'react';
import { generateNonce, generateRandomness } from '@mysten/sui/zklogin';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const T = {
  bg: '#080C14', bgCard: '#0D1420', border: '#1A2740',
  blue: '#4DA2FF', teal: '#00D4AA', tealDim: 'rgba(0,212,170,0.1)',
  tealBorder: 'rgba(0,212,170,0.3)', white: '#FFFFFF',
  grey1: '#B8C8E0', grey2: '#5A7090',
};

const LINES = [
  { text: '$ edge init --network mainnet', color: T.grey2 },
  { text: '✓ zkLogin provider loaded', color: T.teal },
  { text: '✓ Sui RPC connected · 94ms latency', color: T.teal },
  { text: '✓ Enoki sponsorship active · gas covered', color: T.teal },
  { text: '✓ Move VM ready · EdgePass contract loaded', color: T.teal },
  { text: '→ Trust infrastructure online', color: T.blue },
];

function TypewriterLine({ text, color, delay, onDone }: {
  text: string; color: string; delay: number; onDone?: () => void;
}) {
  const [displayed, setDisplayed] = useState('');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) { clearInterval(interval); onDone?.(); }
    }, 28);
    return () => clearInterval(interval);
  }, [started]);

  return (
    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 'clamp(11px, 2vw, 13px)', color, lineHeight: 2, minHeight: 26 }}>
      {displayed}
    </div>
  );
}

export default function Home() {
  const [linesReady, setLinesReady] = useState(0);
  const [showButton, setShowButton] = useState(false);
  const [authStep, setAuthStep] = useState(0);

  const handleLogin = async () => {
    setAuthStep(1);

    // Fetch current epoch dynamically
    let maxEpoch = 1137; // fallback
    try {
      const epochRes = await fetch('https://fullnode.mainnet.sui.io:443', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'suix_getLatestSuiSystemState',
          params: [],
          id: 1,
        }),
      });
      const epochData = await epochRes.json();
      const currentEpoch = Number(epochData.result.epoch);
      maxEpoch = currentEpoch + 10;
    } catch (e) {
      console.warn('Could not fetch epoch, using fallback:', maxEpoch);
    }

    const ephemeralKeypair = new Ed25519Keypair();
    const randomness = generateRandomness();
    const nonce = generateNonce(ephemeralKeypair.getPublicKey(), maxEpoch, randomness);

    localStorage.setItem('edge_ephemeral_key', ephemeralKeypair.getSecretKey());
    localStorage.setItem('edge_randomness', randomness.toString());
    localStorage.setItem('edge_max_epoch', maxEpoch.toString());

    const params = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      redirect_uri: `${window.location.origin}/auth/callback`,
      response_type: 'id_token',
      scope: 'openid email profile',
      nonce,
    });

    setTimeout(() => {
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    }, 800);
  };

  return (
    <main style={{ 
      minHeight: 'calc(100vh - 57px - 73px)', 
      paddingBottom: 48,
      background: T.bg, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: 'clamp(32px, 6vw, 64px) clamp(16px, 4vw, 32px)',
    }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes prog { from{width:0} to{width:100%} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
      `}</style>

      <div style={{ maxWidth: 500, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
          {['FESTIVAL MODE DEMO', 'MAINNET'].map((label, i) => (
            <span key={label} style={{ background: i === 0 ? 'rgba(77,162,255,0.12)' : T.tealDim, border: `1px solid ${i === 0 ? 'rgba(77,162,255,0.3)' : T.tealBorder}`, color: i === 0 ? T.blue : T.teal, fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', padding: '3px 10px', borderRadius: 6 }}>{label}</span>
          ))}
        </div>

        <div style={{ borderLeft: `2px solid ${T.border}`, paddingLeft: 20, marginBottom: 32 }}>
          {LINES.map((line, i) => (
            <TypewriterLine
              key={i}
              text={line.text}
              color={line.color}
              delay={i * 600}
              onDone={() => {
                setLinesReady(i + 1);
                if (i === LINES.length - 1) setTimeout(() => setShowButton(true), 300);
              }}
            />
          ))}
          {linesReady < LINES.length && (
            <span style={{ display: 'inline-block', width: 8, height: 14, background: T.teal, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />
          )}
        </div>

        {showButton && authStep === 0 && (
          <div style={{ animation: 'fadeUp 0.4s ease-out' }}>
            <button
              onClick={handleLogin}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '13px 22px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.bgCard, color: T.white, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 28, fontFamily: 'Inter, sans-serif', width: '100%', justifyContent: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.teal; e.currentTarget.style.background = T.tealDim; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.bgCard; }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
                <path d="M43.6 20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-4z" fill="#FFC107"/>
                <path d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" fill="#FF3D00"/>
                <path d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" fill="#4CAF50"/>
                <path d="M43.6 20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 37.2 44 32 44 24c0-1.3-.1-2.7-.4-4z" fill="#1976D2"/>
              </svg>
              Continue with Google
            </button>
          </div>
        )}

        {authStep === 1 && (
          <div style={{ marginBottom: 28 }}>
            <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: T.grey2, marginBottom: 10 }}>$ google-oauth --redirect edge://callback</p>
            <div style={{ width: '100%', maxWidth: 240, height: 2, background: T.border, borderRadius: 1, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: T.teal, animation: 'prog 0.8s ease-out forwards' }} />
            </div>
          </div>
        )}

        {showButton && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, animation: 'fadeUp 0.5s ease-out 0.1s both' }}>
            {[
              { n: '01', t: 'Define boundaries', d: 'Budget, merchants, thresholds' },
              { n: '02', t: 'Delegate safely', d: 'Agents act within your limits' },
              { n: '03', t: 'Stay in control', d: 'Escalate only what matters' },
            ].map(i => (
              <div key={i.n} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 12px' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: T.teal, marginBottom: 6 }}>{i.n}</div>
                <div style={{ fontSize: 12, color: T.white, fontWeight: 600, marginBottom: 3, fontFamily: 'Inter, sans-serif' }}>{i.t}</div>
                <div style={{ fontSize: 11, color: T.grey2, fontFamily: 'Inter, sans-serif' }}>{i.d}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}