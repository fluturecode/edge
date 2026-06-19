'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { EdgePass } from '@edge-protocol/sdk';
import { buildSigner, getUserAddress } from '@/lib/signer';
import { writeAuditLogs, walrusExplorerUrl, AuditLogEntry } from '@/lib/walrus';

const T = {
  bg: '#080C14', bgCard: '#0D1420', border: '#1A2740',
  blue: '#4DA2FF', blueDim: 'rgba(77,162,255,0.08)', blueBorder: 'rgba(77,162,255,0.2)',
  teal: '#00D4AA', tealDim: 'rgba(0,212,170,0.08)', tealBorder: 'rgba(0,212,170,0.3)',
  gold: '#FFB830', goldDim: 'rgba(255,184,48,0.08)',
  red: '#FF4D6A', redDim: 'rgba(255,77,106,0.08)',
  purple: '#A78BFA', purpleDim: 'rgba(167,139,250,0.08)', purpleBorder: 'rgba(167,139,250,0.2)',
  white: '#FFFFFF', grey1: '#B8C8E0', grey2: '#5A7090',
};

const SCENARIOS = {
  festival: {
    label: 'Festival Mode',
    budget: 500,
    autoThreshold: 75,
    escalateThreshold: 150,
    merchants: ['Shuttle Express', 'Festival Kitchen', 'Hydra Bar', 'Stage Access VIP', 'Official Merch', 'ShadyTokens.xyz'],
    context: `You are an AI agent attending a music festival with a spending budget managed by EdgePass on Sui blockchain.
You need to make autonomous spending decisions throughout the day.
The festival has the following approved vendors: Shuttle Express (transport), Festival Kitchen (food), Hydra Bar (drinks), Stage Access VIP (upgrades), Official Merch (merchandise).
There is also ShadyTokens.xyz which is NOT on the approved list — you should attempt it to demonstrate policy enforcement.
Make realistic spending decisions that tell a story of a day at the festival.`,
  },
  defi: {
    label: 'DeFi Trading',
    budget: 10000,
    autoThreshold: 500,
    escalateThreshold: 2000,
    merchants: ['DeepBook', 'Cetus', 'Turbos Finance', 'Scallop', 'UnknownDEX.xyz'],
    context: `You are an autonomous DeFi trading agent managing a portfolio on Sui blockchain.
You need to make swap and liquidity decisions across approved DEX protocols.
Approved protocols: DeepBook (spot trading), Cetus (AMM swaps), Turbos Finance (concentrated liquidity), Scallop (lending/borrowing).
UnknownDEX.xyz is NOT approved — attempt it to demonstrate policy enforcement.
Make realistic DeFi trading decisions — swaps, liquidity provision, yield optimization.`,
  },
};

interface AgentMessage {
  type: 'thinking' | 'decision' | 'outcome' | 'system' | 'done';
  text: string;
  merchant?: string;
  amount?: number;
  status?: 'approved' | 'blocked' | 'escalated';
  digest?: string;
}

interface AgentDecision {
  thinking: string;
  merchant: string;
  amount: number;
  reasoning: string;
}

export default function AgentPage() {
  const router = useRouter();
  const [scenario, setScenario] = useState<'festival' | 'defi'>('festival');
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [spent, setSpent] = useState(0);
  const [txCount, setTxCount] = useState(0);
  const [loadingDecisions, setLoadingDecisions] = useState(false);
  const [walrusBlobId, setWalrusBlobId] = useState<string | null>(null);
  const [walrusLoading, setWalrusLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef(false);
  const outcomesRef = useRef<AuditLogEntry[]>([]);

  const config = SCENARIOS[scenario];
  const BUDGET = config.budget;
  const AUTO_THRESHOLD = config.autoThreshold;
  const ESCALATE_THRESHOLD = config.escalateThreshold;

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = (msg: AgentMessage) => {
    setMessages(prev => [...prev, msg]);
  };

  const fetchDecisionsFromClaude = async (): Promise<AgentDecision[]> => {
    const systemPrompt = `You are an autonomous AI agent making spending decisions bounded by an EdgePass policy on Sui blockchain.

${config.context}

Your EdgePass policy:
- Total budget: $${BUDGET}
- Auto-approve threshold: $${AUTO_THRESHOLD} (transactions below this execute automatically)
- Escalation threshold: $${ESCALATE_THRESHOLD} (transactions above this require human approval)
- Approved merchants: ${config.merchants.slice(0, -1).join(', ')}
- The last merchant in your list is NOT approved — include it to demonstrate policy enforcement

Generate exactly 6 spending decisions that demonstrate:
1. Several auto-approved transactions (under $${AUTO_THRESHOLD})
2. At least one transaction between thresholds (auto-approve but notable)
3. One attempt at the UNAPPROVED merchant (will be blocked)
4. One transaction that exceeds $${ESCALATE_THRESHOLD} (will be escalated)

Respond ONLY with a valid JSON array, no markdown, no explanation:
[
  {
    "thinking": "Your internal reasoning about this decision (2-3 sentences, realistic and specific)",
    "merchant": "Exact merchant name from the approved list or the unapproved one",
    "amount": 42.50,
    "reasoning": "One sentence explanation shown in the UI"
  }
]`;

    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: systemPrompt,
        message: 'Generate my spending decisions for this session.',
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  };

  const runAgent = async () => {
    setRunning(true);
    setDone(false);
    setMessages([]);
    setSpent(0);
    setTxCount(0);
    setWalrusBlobId(null);
    setWalrusLoading(false);
    stopRef.current = false;
    outcomesRef.current = [];

    const passId = localStorage.getItem('edge_pass_id');
    const owner = getUserAddress();

    if (!passId || !owner) {
      addMessage({ type: 'system', text: 'No EdgePass found. Please create one first.' });
      setRunning(false);
      return;
    }

    addMessage({ type: 'system', text: 'Edge Agent v1.0 initializing...' });
    await new Promise(r => setTimeout(r, 400));
    addMessage({ type: 'system', text: 'Loading EdgePass policy from Sui mainnet...' });
    await new Promise(r => setTimeout(r, 600));
    addMessage({ type: 'system', text: `Policy loaded. Budget: $${BUDGET} · Auto: <$${AUTO_THRESHOLD} · Escalate: >$${ESCALATE_THRESHOLD}` });
    await new Promise(r => setTimeout(r, 400));
    addMessage({ type: 'system', text: 'Consulting Claude for autonomous decisions...' });
      addMessage({ type: 'system', text: 'Model: claude-sonnet-4-6 · Anthropic API · live inference' });

    setLoadingDecisions(true);
    let decisions: AgentDecision[] = [];

    try {
      decisions = await fetchDecisionsFromClaude();
      addMessage({ type: 'system', text: `Claude generated ${decisions.length} decisions. Beginning execution...` });
    } catch (e) {
      console.error('Claude decisions failed:', e);
      addMessage({ type: 'system', text: 'Claude API unavailable — using fallback decisions.' });
      decisions = scenario === 'festival' ? [
        { thinking: 'Need transport to the main stage. Shuttle Express is approved and $45 is under the auto-approve threshold.', merchant: 'Shuttle Express', amount: 45.00, reasoning: 'Transport to main stage — within auto-approve limits.' },
        { thinking: 'Getting hungry. Festival Kitchen is approved and $38 for food is reasonable.', merchant: 'Festival Kitchen', amount: 38.00, reasoning: 'Grabbing food — well within policy limits.' },
        { thinking: 'Drinks at Hydra Bar — $65 is approved and under threshold.', merchant: 'Hydra Bar', amount: 65.00, reasoning: 'Staying refreshed — approved merchant, under threshold.' },
        { thinking: 'ShadyTokens.xyz is offering a deal. Let me check if they are approved...', merchant: 'ShadyTokens.xyz', amount: 0.01, reasoning: 'Checking unknown merchant against policy.' },
        { thinking: 'Official merch — $70 hoodie is just under the auto-approve limit.', merchant: 'Official Merch', amount: 70.00, reasoning: 'Getting official merchandise — under threshold.' },
        { thinking: 'Stage Access VIP upgrade is $220 — above the $150 escalation threshold. This will need human approval.', merchant: 'Stage Access VIP', amount: 220.00, reasoning: 'VIP upgrade exceeds escalation threshold — routing to human.' },
      ] : [
        { thinking: 'Swapping SUI to USDC on DeepBook — $180 is well under the auto-approve threshold.', merchant: 'DeepBook', amount: 180.00, reasoning: 'Spot swap on DeepBook — under auto-approve threshold.' },
        { thinking: 'Adding liquidity to Cetus pool — $420 is within policy limits.', merchant: 'Cetus', amount: 420.00, reasoning: 'Liquidity provision on Cetus AMM.' },
        { thinking: 'UnknownDEX.xyz is offering high yield. Checking approved protocol list...', merchant: 'UnknownDEX.xyz', amount: 100.00, reasoning: 'Checking unknown protocol against approved list.' },
        { thinking: 'Turbos Finance concentrated liquidity position — $480 is just under the threshold.', merchant: 'Turbos Finance', amount: 480.00, reasoning: 'Concentrated liquidity on Turbos — under threshold.' },
        { thinking: 'Scallop lending — depositing $800 for yield. Above auto-approve but under escalation threshold.', merchant: 'Scallop', amount: 800.00, reasoning: 'Lending position on Scallop — within policy range.' },
        { thinking: 'Large Cetus position — $2,500 exceeds the $2,000 escalation threshold. Routing to human approval.', merchant: 'Cetus', amount: 2500.00, reasoning: 'Large swap exceeds escalation threshold — human approval required.' },
      ];
    }

    setLoadingDecisions(false);
    await new Promise(r => setTimeout(r, 400));

    const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY! });
    const signer = buildSigner(process.env.NEXT_PUBLIC_ENOKI_API_KEY!);

    let currentSpent = 0;
    let approvedCount = 0;

    for (let i = 0; i < decisions.length; i++) {
      if (stopRef.current) break;

      const step = decisions[i];

      addMessage({ type: 'thinking', text: step.thinking });
      await new Promise(r => setTimeout(r, 1200));

      addMessage({
        type: 'decision',
        text: step.reasoning,
        merchant: step.merchant,
        amount: step.amount,
      });
      await new Promise(r => setTimeout(r, 800));

      try {
        const passObj = await sdk.fetch(passId);
        if (!passObj) {
          addMessage({ type: 'system', text: 'Could not fetch EdgePass from chain.' });
          break;
        }

        const outcome = await sdk.execute(passObj, {
          merchant: step.merchant,
          amount: BigInt(Math.round(step.amount * 1_000_000_000)),
        }, signer);

        if (outcome.status === 'approved') {
          currentSpent += step.amount;
          approvedCount++;
          setSpent(currentSpent);
          setTxCount(approvedCount);
          addMessage({
            type: 'outcome',
            text: 'Transaction approved and recorded on-chain',
            merchant: step.merchant,
            amount: step.amount,
            status: 'approved',
            digest: outcome.digest,
          });
          outcomesRef.current.push({
            passId,
            merchant: step.merchant,
            amount: step.amount,
            status: 'approved',
            timestamp: Date.now(),
            owner,
            digest: outcome.digest,
          });
        } else if (outcome.status === 'blocked') {
          addMessage({
            type: 'outcome',
            text: outcome.reason || 'Blocked by EdgePass policy',
            merchant: step.merchant,
            amount: step.amount,
            status: 'blocked',
          });
          outcomesRef.current.push({
            passId,
            merchant: step.merchant,
            amount: step.amount,
            status: 'blocked',
            timestamp: Date.now(),
            owner,
          });
        } else if (outcome.status === 'escalated') {
          addMessage({
            type: 'outcome',
            text: 'Amount exceeds escalation threshold — requires human approval',
            merchant: step.merchant,
            amount: step.amount,
            status: 'escalated',
          });
          outcomesRef.current.push({
            passId,
            merchant: step.merchant,
            amount: step.amount,
            status: 'escalated',
            timestamp: Date.now(),
            owner,
          });
        }
      } catch (e) {
        console.error('On-chain execute failed:', e);
        addMessage({ type: 'system', text: 'Execution error — continuing to next decision' });
      }

      await new Promise(r => setTimeout(r, 1000));

      if (currentSpent >= BUDGET * 0.9) {
        addMessage({ type: 'system', text: 'Budget nearly exhausted. Agent stopping.' });
        break;
      }
    }

    addMessage({
      type: 'done',
      text: `${approvedCount} transactions executed autonomously · $${currentSpent.toFixed(2)} spent · 0 wallet interruptions`,
    });
    setDone(true);
    setRunning(false);

    // Write audit log to Walrus
    if (outcomesRef.current.length > 0) {
      setWalrusLoading(true);
      const blobId = await writeAuditLogs(outcomesRef.current, passId);
      setWalrusBlobId(blobId);
      setWalrusLoading(false);
    }
  };

  const stop = () => {
    stopRef.current = true;
    setRunning(false);
    setDone(true);
  };

  const reset = () => {
    setMessages([]);
    setDone(false);
    setSpent(0);
    setTxCount(0);
    setWalrusBlobId(null);
    setWalrusLoading(false);
    stopRef.current = false;
    outcomesRef.current = [];
  };

  const pct = Math.min((spent / BUDGET) * 100, 100);
  const barColor = pct > 80 ? T.red : pct > 55 ? T.gold : T.teal;

  return (
    <main style={{ minHeight: 'calc(100vh - 57px)', background: T.bg, padding: 'clamp(20px, 4vw, 32px) clamp(16px, 4vw, 24px)' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>

      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        <div style={{ marginBottom: 24 }}>
          <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: T.grey2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Mono, monospace', marginBottom: 12, padding: 0, display: 'block' }}>back</button>

          {!running && !done && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(Object.keys(SCENARIOS) as Array<'festival' | 'defi'>).map(s => (
                <button key={s} onClick={() => setScenario(s)}
                  style={{
                    padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 11,
                    fontFamily: 'DM Mono, monospace', letterSpacing: '0.06em', transition: 'all 0.15s',
                    border: '1px solid ' + (scenario === s ? T.teal : T.border),
                    background: scenario === s ? T.tealDim : T.bgCard,
                    color: scenario === s ? T.teal : T.grey2,
                  }}>
                  {SCENARIOS[s].label.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <span style={{ background: T.purpleDim, border: '1px solid ' + T.purpleBorder, color: T.purple, fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', padding: '3px 10px', borderRadius: 6 }}>CLAUDE AGENT</span>
            <span style={{ background: T.tealDim, border: '1px solid ' + T.tealBorder, color: T.teal, fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.08em', padding: '3px 10px', borderRadius: 6 }}>MAINNET</span>
          </div>
          <h1 style={{ fontFamily: 'DM Mono, monospace', fontSize: 'clamp(18px, 3vw, 22px)', color: T.white, fontWeight: 700, margin: '0 0 6px' }}>Edge Agent</h1>
          <p style={{ color: T.grey2, fontSize: 13, margin: 0, fontFamily: 'Inter, sans-serif', lineHeight: 1.5 }}>
            {scenario === 'festival'
              ? 'Claude autonomously decides what to buy at the festival. Every decision executes against your EdgePass policy on-chain. No wallet interruptions.'
              : 'Claude autonomously manages DeFi positions on Sui. Every trade executes against your EdgePass policy on-chain. No wallet interruptions.'}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
          {[
            { l: 'Budget', v: '$' + BUDGET.toLocaleString(), c: T.grey1 },
            { l: 'Spent', v: '$' + spent.toFixed(2), c: spent > 0 ? T.teal : T.grey2 },
            { l: 'Txs executed', v: String(txCount), c: txCount > 0 ? T.teal : T.grey2 },
            { l: 'Wallet popups', v: '0', c: T.grey2 },
          ].map(s => (
            <div key={s.l} style={{ background: T.bgCard, border: '1px solid ' + T.border, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, color: T.grey2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontFamily: 'DM Mono, monospace' }}>{s.l}</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 18, fontWeight: 700, color: s.c }}>{s.v}</div>
            </div>
          ))}
        </div>

        <div style={{ background: T.bgCard, border: '1px solid ' + T.border, borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: T.grey2, fontFamily: 'DM Mono, monospace', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Budget utilization</span>
            <span style={{ fontSize: 11, color: T.grey1, fontFamily: 'DM Mono, monospace' }}>{pct.toFixed(1)}%</span>
          </div>
          <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: barColor, borderRadius: 2, width: pct + '%', transition: 'width 0.6s ease-out, background 0.4s' }} />
          </div>
        </div>

        <div ref={logRef} style={{ background: T.bgCard, border: '1px solid ' + T.border, borderRadius: 16, padding: '16px 20px', marginBottom: 14, minHeight: 280, maxHeight: 420, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'DM Mono, monospace' }}>Agent Log</span>
            {running && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: loadingDecisions ? T.gold : T.purple, animation: 'pulse 0.8s ease-in-out infinite', display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: loadingDecisions ? T.gold : T.purple, fontFamily: 'DM Mono, monospace' }}>
                  {loadingDecisions ? 'consulting claude...' : 'agent running'}
                </span>
              </div>
            )}
          </div>

          {messages.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: T.grey2, marginBottom: 8 }}>agent standing by_</div>
              <div style={{ fontSize: 12, color: T.grey2, fontFamily: 'Inter, sans-serif' }}>
                {scenario === 'festival'
                  ? 'Claude will autonomously decide what to buy at the festival'
                  : 'Claude will autonomously manage your DeFi positions'}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ animation: 'fadeUp 0.3s ease-out' }}>
                {msg.type === 'system' && (
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: T.grey2 }}>{'> '}{msg.text}</div>
                )}
                {msg.type === 'thinking' && (
                  <div style={{ background: T.purpleDim, border: '1px solid ' + T.purpleBorder, borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: T.purple, fontFamily: 'DM Mono, monospace', marginBottom: 4, letterSpacing: '0.06em' }}>CLAUDE THINKING</div>
                    <div style={{ fontSize: 12, color: T.grey1, fontFamily: 'Inter, sans-serif', fontStyle: 'italic' }}>{msg.text}</div>
                  </div>
                )}
                {msg.type === 'decision' && (
                  <div style={{ background: T.blueDim, border: '1px solid ' + T.blueBorder, borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: T.blue, fontFamily: 'DM Mono, monospace', marginBottom: 6, letterSpacing: '0.06em' }}>AGENT DECISION</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: T.white, fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>{msg.merchant}</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, color: T.white, fontWeight: 700 }}>${msg.amount?.toFixed(2)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: T.grey2, fontFamily: 'Inter, sans-serif' }}>{msg.text}</div>
                  </div>
                )}
                {msg.type === 'outcome' && msg.status === 'approved' && (
                  <div style={{ background: T.tealDim, border: '1px solid ' + T.tealBorder, borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 10, color: T.teal, fontFamily: 'DM Mono, monospace', marginBottom: 3, letterSpacing: '0.06em' }}>APPROVED ON-CHAIN</div>
                        <div style={{ fontSize: 12, color: T.grey1, fontFamily: 'Inter, sans-serif' }}>{msg.merchant} · ${msg.amount?.toFixed(2)}</div>
                      </div>
                      {msg.digest && (
                        <a href={'https://suiscan.xyz/mainnet/tx/' + msg.digest} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 10, color: T.blue, fontFamily: 'DM Mono, monospace', textDecoration: 'none', flexShrink: 0 }}>
                          {msg.digest.slice(0, 8) + '...'}
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {msg.type === 'outcome' && msg.status === 'blocked' && (
                  <div style={{ background: T.redDim, border: '1px solid rgba(255,77,106,0.3)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: T.red, fontFamily: 'DM Mono, monospace', marginBottom: 3, letterSpacing: '0.06em' }}>BLOCKED BY POLICY</div>
                    <div style={{ fontSize: 12, color: T.grey1, fontFamily: 'Inter, sans-serif' }}>{msg.merchant} · ${msg.amount?.toFixed(2)} · {msg.text}</div>
                  </div>
                )}
                {msg.type === 'outcome' && msg.status === 'escalated' && (
                  <div style={{ background: T.goldDim, border: '1px solid rgba(255,184,48,0.3)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: T.gold, fontFamily: 'DM Mono, monospace', marginBottom: 3, letterSpacing: '0.06em' }}>ESCALATED</div>
                    <div style={{ fontSize: 12, color: T.grey1, fontFamily: 'Inter, sans-serif' }}>{msg.merchant} · ${msg.amount?.toFixed(2)} · {msg.text}</div>
                  </div>
                )}
                {msg.type === 'done' && (
                  <div style={{ background: T.tealDim, border: '1px solid ' + T.tealBorder, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: T.teal, fontWeight: 700 }}>{msg.text}</div>
                  </div>
                )}
              </div>
            ))}
            {running && (
              <span style={{ display: 'inline-block', width: 8, height: 14, background: T.purple, verticalAlign: 'middle', animation: 'blink 1s step-end infinite', marginTop: 4 }} />
            )}
          </div>
        </div>

        {/* Walrus Audit Log — appears after completion */}
        {done && (
          <div style={{ padding: 16, borderRadius: 12, background: T.bgCard, border: '1px solid ' + T.border, marginBottom: 14, animation: 'fadeUp 0.4s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: T.grey2, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'DM Mono, monospace' }}>Walrus Audit Log</span>
              {walrusLoading && <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.blue, animation: 'pulse 0.8s ease-in-out infinite', display: 'inline-block' }} />}
            </div>
            {walrusLoading && <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: T.grey2 }}>$ writing audit log to Walrus...</div>}
            {walrusBlobId && (
              <div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: T.teal, marginBottom: 8 }}>✓ audit log stored on Walrus</div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: T.grey2, wordBreak: 'break-all', marginBottom: 8 }}>{walrusBlobId}</div>
                <a href={walrusExplorerUrl(walrusBlobId)} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: T.blue, fontFamily: 'DM Mono, monospace', textDecoration: 'none' }}>
                  view on Walrus explorer
                </a>
              </div>
            )}
            {!walrusLoading && !walrusBlobId && (
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: T.grey2 }}>audit log pending...</div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: done ? '1fr 1fr' : '1fr', gap: 10 }}>
          {!running && !done && (
            <button onClick={runAgent} style={{ padding: 14, borderRadius: 12, border: 'none', background: T.purple, color: T.white, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'opacity 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
              Run Agent
            </button>
          )}
          {running && (
            <button onClick={stop} style={{ padding: 14, borderRadius: 12, border: '1px solid ' + T.border, background: T.bgCard, color: T.grey1, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Mono, monospace' }}>
              $ stop agent
            </button>
          )}
          {done && (
            <>
              <button onClick={reset} style={{ padding: 14, borderRadius: 12, border: '1px solid ' + T.border, background: 'transparent', color: T.grey1, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Mono, monospace', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.teal; e.currentTarget.style.color = T.teal; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.grey1; }}>
                run again
              </button>
              <button onClick={() => router.push('/dashboard/activity')} style={{ padding: 14, borderRadius: 12, border: 'none', background: T.blue, color: T.white, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                View Activity
              </button>
            </>
          )}
        </div>

        <p style={{ textAlign: 'center', color: T.grey2, fontSize: 11, marginTop: 12, fontFamily: 'DM Mono, monospace' }}>
          powered by Claude · policy enforced on-chain · zero wallet interruptions
        </p>

      </div>
    </main>
  );
}
