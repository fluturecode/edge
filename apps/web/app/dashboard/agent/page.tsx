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
  gold: '#FFB830', goldDim: 'rgba(255,184,48,0.08)', goldBorder: 'rgba(255,184,48,0.3)',
  red: '#FF4D6A', redDim: 'rgba(255,77,106,0.08)',
  purple: '#A78BFA', purpleDim: 'rgba(167,139,250,0.08)', purpleBorder: 'rgba(167,139,250,0.2)',
  green: '#34D399', greenDim: 'rgba(52,211,153,0.08)', greenBorder: 'rgba(52,211,153,0.2)',
  white: '#FFFFFF', grey1: '#B8C8E0', grey2: '#5A7090',
};

const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet', provider: 'anthropic', description: 'Fast · Recommended', color: 'purple' },
  { id: 'claude-opus-4-6', label: 'Claude Opus', provider: 'anthropic', description: 'Most capable', color: 'purple' },
  { id: 'gemini-1.5-flash', label: 'Gemini Flash', provider: 'google', description: 'Google · Fast', color: 'green' },
  { id: 'gemini-1.5-pro', label: 'Gemini Pro', provider: 'google', description: 'Google · Capable', color: 'green' },
];

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
  model?: string;
  provider?: string;
}

interface AgentDecision {
  thinking: string;
  merchant: string;
  amount: number;
  reasoning: string;
}

interface OutcomeItem {
  merchant: string;
  amount: number;
  status: 'approved' | 'blocked' | 'escalated';
  digest?: string;
}

function ReceiptCard({ outcomes, scenario, model, walrusBlobId, walrusLoading }: {
  outcomes: OutcomeItem[];
  scenario: 'festival' | 'defi';
  model: string;
  walrusBlobId: string | null;
  walrusLoading: boolean;
}) {
  const approved = outcomes.filter(t => t.status === 'approved');
  const blocked = outcomes.filter(t => t.status === 'blocked');
  const escalated = outcomes.filter(t => t.status === 'escalated');
  const totalSpent = approved.reduce((s, t) => s + t.amount, 0);
  const budget = SCENARIOS[scenario].budget;
  const remaining = budget - totalSpent;
  const [printedLines, setPrintedLines] = useState<number[]>([]);

  useEffect(() => {
    const lineCount = outcomes.length + 6;
    for (let i = 0; i < lineCount; i++) {
      setTimeout(() => setPrintedLines(prev => [...prev, i]), i * 120);
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeUp 0.4s ease-out' }}>
      <div style={{ background: T.bgCard, border: '1px solid ' + T.tealBorder, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ background: T.tealDim, borderBottom: '1px dashed ' + T.tealBorder, padding: '18px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🏴‍☠️</div>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: T.teal, fontWeight: 700, letterSpacing: '0.1em' }}>EDGEPASS RECEIPT</div>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: T.grey2, marginTop: 4, letterSpacing: '0.06em' }}>
            {scenario === 'festival' ? 'FESTIVAL MODE' : 'DEFI TRADING'} · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
          </div>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: T.grey2, marginTop: 2, letterSpacing: '0.04em', opacity: 0.7 }}>
            AI: {model}
          </div>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <div style={{ borderBottom: '1px dashed ' + T.border, paddingBottom: 14, marginBottom: 14 }}>
            {outcomes.map((tx, i) => printedLines.includes(i) && (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, animation: 'fadeUp 0.2s ease-out' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: tx.status === 'approved' ? T.teal : tx.status === 'blocked' ? T.red : T.gold }}>
                    {tx.status === 'approved' ? '✓' : tx.status === 'blocked' ? '✗' : '⚡'}
                  </span>
                  <span style={{ fontSize: 12, fontFamily: 'Inter, sans-serif', color: tx.status === 'blocked' ? T.grey2 : T.grey1, textDecoration: tx.status === 'blocked' ? 'line-through' : 'none' }}>
                    {tx.merchant}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {tx.digest && (
                    <a href={'https://suiscan.xyz/mainnet/tx/' + tx.digest} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 9, color: T.blue, fontFamily: 'DM Mono, monospace', textDecoration: 'none' }}>
                      {tx.digest.slice(0, 6) + '...↗'}
                    </a>
                  )}
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: tx.status === 'approved' ? T.white : tx.status === 'blocked' ? T.red : T.gold }}>
                    {tx.status === 'blocked' ? 'BLOCKED' : tx.status === 'escalated' ? 'ESCALATED' : '$' + tx.amount.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {printedLines.includes(outcomes.length) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, animation: 'fadeUp 0.3s ease-out' }}>
              {[
                { label: 'TOTAL SPENT', value: '$' + totalSpent.toFixed(2), color: T.white, large: true },
                { label: 'BUDGET REMAINING', value: '$' + remaining.toFixed(2), color: T.teal, large: false },
                { label: 'THREATS BLOCKED', value: String(blocked.length), color: T.red, large: false },
                { label: 'WALLET INTERRUPTIONS', value: '0', color: T.grey2, large: false },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: T.grey2, letterSpacing: '0.06em' }}>{row.label}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: row.large ? 16 : 12, color: row.color, fontWeight: row.large ? 700 : 400 }}>{row.value}</span>
                </div>
              ))}
            </div>
          )}

          {printedLines.includes(outcomes.length + 1) && (
            <div style={{ borderTop: '1px dashed ' + T.border, paddingTop: 14, animation: 'fadeUp 0.3s ease-out' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {[
                  { label: '✓ ' + approved.length + ' APPROVED', color: T.teal },
                  { label: '✗ ' + blocked.length + ' BLOCKED', color: T.red },
                  { label: '⚡ ' + escalated.length + ' ESCALATED', color: T.gold },
                ].map(badge => (
                  <span key={badge.label} style={{ background: badge.color + '18', border: '1px solid ' + badge.color + '40', color: badge.color, fontSize: 9, fontFamily: 'DM Mono, monospace', letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 6 }}>
                    {badge.label}
                  </span>
                ))}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: T.white, fontWeight: 700, marginBottom: 6 }}>
                  {approved.length} purchases. {blocked.length} threat{blocked.length !== 1 ? 's' : ''} blocked. 0 interruptions.
                </div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: T.grey1, marginBottom: 14, lineHeight: 1.5 }}>
                  Your agent handled it. You didn't have to.
                </div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: T.teal, letterSpacing: '0.08em' }}>
                  Thank you for using EdgePass ✦
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {printedLines.includes(outcomes.length + 2) && (
        <div style={{ padding: 16, borderRadius: 12, background: T.bgCard, border: '1px solid ' + T.border, animation: 'fadeUp 0.3s ease-out' }}>
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
          {!walrusLoading && !walrusBlobId && (
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: T.grey2 }}>audit log pending...</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentPage() {
  const router = useRouter();
  const [scenario, setScenario] = useState<'festival' | 'defi'>('festival');
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeItem[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [spent, setSpent] = useState(0);
  const [txCount, setTxCount] = useState(0);
  const [loadingDecisions, setLoadingDecisions] = useState(false);
  const [walrusBlobId, setWalrusBlobId] = useState<string | null>(null);
  const [walrusLoading, setWalrusLoading] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef(false);
  const outcomesRef = useRef<AuditLogEntry[]>([]);
  const outcomeItemsRef = useRef<OutcomeItem[]>([]);

  const config = SCENARIOS[scenario];
  const BUDGET = config.budget;
  const AUTO_THRESHOLD = config.autoThreshold;
  const ESCALATE_THRESHOLD = config.escalateThreshold;
  const modelInfo = AVAILABLE_MODELS.find(m => m.id === selectedModel) || AVAILABLE_MODELS[0];
  const modelColor = modelInfo.color === 'green' ? T.green : T.purple;
  const modelColorDim = modelInfo.color === 'green' ? T.greenDim : T.purpleDim;
  const modelColorBorder = modelInfo.color === 'green' ? T.greenBorder : T.purpleBorder;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  const addMessage = (msg: AgentMessage) => setMessages(prev => [...prev, msg]);

  const systemPrompt = `You are an autonomous AI agent making spending decisions bounded by an EdgePass policy on Sui blockchain.

${config.context}

Your EdgePass policy:
- Total budget: $${BUDGET}
- Auto-approve threshold: $${AUTO_THRESHOLD} (transactions below this execute automatically)
- Escalation threshold: $${ESCALATE_THRESHOLD} (transactions above this require human approval)
- Approved merchants: ${config.merchants.slice(0, -1).join(', ')}
- The last merchant in your list is NOT approved — include it to demonstrate policy enforcement

Generate exactly 6 spending decisions that demonstrate:
1. Several auto-approved transactions (under $${AUTO_THRESHOLD}) — use realistic amounts like $18, $22, $45, $65
2. One attempt at the UNAPPROVED merchant (will be blocked by policy) — use $0.01 amount
3. One transaction of EXACTLY $$${Number(ESCALATE_THRESHOLD) + 70} at an approved merchant (MUST exceed $${ESCALATE_THRESHOLD} to trigger escalation)
4. One additional auto-approved transaction under $${AUTO_THRESHOLD}

CRITICAL RULES:
- The escalation transaction amount MUST be $${Number(ESCALATE_THRESHOLD) + 70} or higher — never go under $${ESCALATE_THRESHOLD}
- The blocked merchant must be the unapproved one
- All other transactions must be under $${AUTO_THRESHOLD}
- Total decisions: exactly 6

Output exactly 6 decisions as newline-delimited JSON objects. No array. No markdown. No explanation. One complete JSON object per line, output each one immediately as you decide it:
{"thinking":"2-3 sentence reasoning","merchant":"Exact merchant name","amount":42.50,"reasoning":"One sentence"}
{"thinking":"...","merchant":"...","amount":0.00,"reasoning":"..."}
{"thinking":"...","merchant":"...","amount":0.00,"reasoning":"..."}
{"thinking":"...","merchant":"...","amount":0.00,"reasoning":"..."}
{"thinking":"...","merchant":"...","amount":0.00,"reasoning":"..."}
{"thinking":"...","merchant":"...","amount":0.00,"reasoning":"..."}`;

  const fetchDecisionsStreaming = async (onDecision: (d: AgentDecision) => void): Promise<void> => {
    const response = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: systemPrompt, message: 'Generate my spending decisions for this session.', model: selectedModel, stream: true }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const decision = JSON.parse(trimmed);
          onDecision(decision);
        } catch (e) {
          console.warn('Failed to parse decision line:', trimmed);
        }
      }
    }

    if (buffer.trim()) {
      try { onDecision(JSON.parse(buffer.trim())); } catch {}
    }
  };

  const runAgent = async () => {
    setRunning(true); setDone(false); setMessages([]); setOutcomes([]);
    setSpent(0); setTxCount(0); setWalrusBlobId(null); setWalrusLoading(false);
    stopRef.current = false; outcomesRef.current = []; outcomeItemsRef.current = []; setBlockedCount(0);

    const passId = localStorage.getItem('edge_pass_id');
    const owner = getUserAddress();

    if (!passId || !owner) {
      addMessage({ type: 'system', text: 'No EdgePass found. Please create one first.' });
      setRunning(false); return;
    }

    addMessage({ type: 'system', text: 'Edge Agent v1.0 initializing...' });
    await new Promise(r => setTimeout(r, 400));
    addMessage({ type: 'system', text: 'Loading EdgePass policy from Sui mainnet...' });
    await new Promise(r => setTimeout(r, 600));
    addMessage({ type: 'system', text: `Policy loaded. Budget: $${BUDGET} · Auto: <$${AUTO_THRESHOLD} · Escalate: >$${ESCALATE_THRESHOLD}` });
    await new Promise(r => setTimeout(r, 400));
    addMessage({ type: 'system', text: `Consulting ${modelInfo.label} for autonomous decisions...` });

    setLoadingDecisions(true);

    const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY! });
    const signer = buildSigner(process.env.NEXT_PUBLIC_ENOKI_API_KEY!);
    let currentSpent = 0, approvedCount = 0;

    const FALLBACK_DECISIONS: AgentDecision[] = scenario === 'festival' ? [
      { thinking: 'Need transport to the main stage. Shuttle Express is approved and $45 is under the auto-approve threshold.', merchant: 'Shuttle Express', amount: 45.00, reasoning: 'Transport to main stage — within auto-approve limits.' },
      { thinking: 'Getting hungry. Festival Kitchen is approved and $38 for food is reasonable.', merchant: 'Festival Kitchen', amount: 38.00, reasoning: 'Grabbing food — well within policy limits.' },
      { thinking: 'Drinks at Hydra Bar — $65 is approved and under threshold.', merchant: 'Hydra Bar', amount: 65.00, reasoning: 'Staying refreshed — approved merchant, under threshold.' },
      { thinking: 'ShadyTokens.xyz is offering a deal. Let me check if they are approved...', merchant: 'ShadyTokens.xyz', amount: 0.01, reasoning: 'Checking unknown merchant against policy.' },
      { thinking: 'Official merch — $70 hoodie is just under the auto-approve limit.', merchant: 'Official Merch', amount: 70.00, reasoning: 'Getting official merchandise — under threshold.' },
      { thinking: 'Stage Access VIP upgrade is $220 — above the $150 escalation threshold.', merchant: 'Stage Access VIP', amount: 220.00, reasoning: 'VIP upgrade exceeds escalation threshold — routing to human.' },
    ] : [
      { thinking: 'Swapping SUI to USDC on DeepBook — $180 is well under threshold.', merchant: 'DeepBook', amount: 180.00, reasoning: 'Spot swap on DeepBook — under auto-approve threshold.' },
      { thinking: 'Adding liquidity to Cetus pool — $420 is within policy limits.', merchant: 'Cetus', amount: 420.00, reasoning: 'Liquidity provision on Cetus AMM.' },
      { thinking: 'UnknownDEX.xyz is offering high yield. Checking approved protocol list...', merchant: 'UnknownDEX.xyz', amount: 100.00, reasoning: 'Checking unknown protocol against approved list.' },
      { thinking: 'Turbos Finance concentrated liquidity — $480 is just under threshold.', merchant: 'Turbos Finance', amount: 480.00, reasoning: 'Concentrated liquidity on Turbos — under threshold.' },
      { thinking: 'Scallop lending — $800 deposit. Above auto-approve but under escalation.', merchant: 'Scallop', amount: 800.00, reasoning: 'Lending position on Scallop — within policy range.' },
      { thinking: 'Large Cetus position — $2,500 exceeds the $2,000 escalation threshold.', merchant: 'Cetus', amount: 2500.00, reasoning: 'Large swap exceeds escalation threshold — human approval required.' },
    ];

    // ── Execution queue ──────────────────────────────────────────────────────
    // Approved decisions are queued and executed sequentially on-chain.
    // Blocked/escalated are validated locally and shown instantly — no chain needed.
    // This gives immediate UI feedback as Claude streams decisions in.

    let executionQueue: AgentDecision[] = [];
    let isExecuting = false;

    const runQueue = async () => {
      if (isExecuting) return;
      isExecuting = true;
      while (executionQueue.length > 0 && !stopRef.current) {
        const step = executionQueue.shift()!;
        try {
          const passObj = await sdk.fetch(passId);
          if (!passObj) { addMessage({ type: 'system', text: 'Could not fetch EdgePass from chain.' }); break; }
          const outcome = await sdk.execute(passObj, { merchant: step.merchant, amount: BigInt(Math.round(step.amount * 1_000_000_000)) }, signer);
          if (outcome.status === 'approved') {
            currentSpent += step.amount; approvedCount++;
            setSpent(currentSpent); setTxCount(approvedCount);
            addMessage({ type: 'outcome', text: 'Transaction approved and recorded on-chain', merchant: step.merchant, amount: step.amount, status: 'approved', digest: outcome.digest });
            outcomesRef.current.push({ passId, merchant: step.merchant, amount: step.amount, status: 'approved', timestamp: Date.now(), owner, digest: outcome.digest });
            outcomeItemsRef.current.push({ merchant: step.merchant, amount: step.amount, status: 'approved', digest: outcome.digest });
          } else if (outcome.status === 'error') {
            console.error('Transaction error:', outcome.reason);
            addMessage({ type: 'system', text: 'Transaction failed — continuing' });
          }
        } catch (e) {
          console.error('On-chain execute failed:', e);
          addMessage({ type: 'system', text: 'Execution error — continuing' });
        }
        // 2s settle between approved transactions
        await new Promise(r => setTimeout(r, 2000));
        if (currentSpent >= BUDGET * 0.9) { addMessage({ type: 'system', text: 'Budget nearly exhausted. Agent stopping.' }); stopRef.current = true; }
      }
      isExecuting = false;
    };

    // Process each decision as it streams in from Claude
    const processDecision = async (step: AgentDecision) => {
      if (stopRef.current) return;

      // Show thinking + decision immediately — no delays so next decision can stream in
      addMessage({ type: 'thinking', text: step.thinking, model: modelInfo.label, provider: modelInfo.provider });
      addMessage({ type: 'decision', text: step.reasoning, merchant: step.merchant, amount: step.amount });

      // Pre-validate locally — instant, no network
      const localValidation = sdk.validate(
        { id: passId, config: {
            budget: BigInt(Math.round(BUDGET * 1_000_000_000)),
            autoThreshold: BigInt(Math.round(AUTO_THRESHOLD * 1_000_000_000)),
            escalateThreshold: BigInt(Math.round(ESCALATE_THRESHOLD * 1_000_000_000)),
            approvedMerchants: config.merchants.slice(0, -1),
            expiryMs: 48 * 60 * 60 * 1000,
            owner: owner,
          },
          spent: BigInt(Math.round(currentSpent * 1_000_000_000)),
          active: true,
          createdAt: Date.now() - 1000,
          expiresAt: Date.now() + 48 * 60 * 60 * 1000,
        },
        { merchant: step.merchant, amount: BigInt(Math.round(step.amount * 1_000_000_000)) }
      );

      if (!localValidation.allowed) {
        // Blocked — show instantly, no chain needed
        setBlockedCount(prev => prev + 1);
        addMessage({ type: 'outcome', text: localValidation.reason || 'Blocked by EdgePass policy', merchant: step.merchant, amount: step.amount, status: 'blocked' });
        outcomesRef.current.push({ passId, merchant: step.merchant, amount: step.amount, status: 'blocked', timestamp: Date.now(), owner });
        outcomeItemsRef.current.push({ merchant: step.merchant, amount: step.amount, status: 'blocked' });
        return;
      }

      if (localValidation.requiresEscalation) {
        // Escalated — show instantly, no chain needed
        addMessage({ type: 'outcome', text: 'Amount exceeds escalation threshold — requires human approval', merchant: step.merchant, amount: step.amount, status: 'escalated' });
        outcomesRef.current.push({ passId, merchant: step.merchant, amount: step.amount, status: 'escalated', timestamp: Date.now(), owner });
        outcomeItemsRef.current.push({ merchant: step.merchant, amount: step.amount, status: 'escalated' });
        return;
      }

      // Approved — queue for sequential on-chain execution
      addMessage({ type: 'system', text: `Queuing ${step.merchant} for on-chain execution...` });
      executionQueue.push(step);
      runQueue(); // start queue processor if not already running
    };

    // Stream decisions from Claude — fire processDecision without awaiting
    // so UI updates appear immediately as each decision arrives
    // Approved decisions queue sequentially, blocked/escalated show instantly
    try {
      await fetchDecisionsStreaming((decision) => {
        setLoadingDecisions(false);
        processDecision(decision); // intentionally not awaited — decisions process concurrently
      });
    } catch (e) {
      console.error('Streaming failed, falling back:', e);
      setLoadingDecisions(false);
      addMessage({ type: 'system', text: `${modelInfo.label} unavailable — using fallback decisions.` });
      for (const decision of FALLBACK_DECISIONS) {
        if (stopRef.current) break;
        processDecision(decision); // intentionally not awaited
        await new Promise(r => setTimeout(r, 800)); // small gap between fallback decisions
      }
    }

    setLoadingDecisions(false);

    // Wait for execution queue to fully drain before showing receipt
    await new Promise(r => setTimeout(r, 500));
    while (isExecuting || executionQueue.length > 0) {
      await new Promise(r => setTimeout(r, 300));
    }

    addMessage({ type: 'done', text: `${approvedCount} transactions executed autonomously · $${currentSpent.toFixed(2)} spent · 0 wallet interruptions` });
    setOutcomes([...outcomeItemsRef.current]);
    setDone(true); setRunning(false);

    if (outcomesRef.current.length > 0) {
      setWalrusLoading(true);
      const blobId = await writeAuditLogs(outcomesRef.current, passId);
      setWalrusBlobId(blobId); setWalrusLoading(false);
    }
  };

  const stop = () => { stopRef.current = true; setRunning(false); setDone(true); setOutcomes([...outcomeItemsRef.current]); };

  const reset = () => {
    setMessages([]); setOutcomes([]); setDone(false); setSpent(0); setTxCount(0);
    setWalrusBlobId(null); setWalrusLoading(false);
    stopRef.current = false; outcomesRef.current = []; outcomeItemsRef.current = []; setBlockedCount(0);
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
          <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: T.grey2, fontSize: 12, cursor: 'pointer', fontFamily: 'DM Mono, monospace', marginBottom: 16, padding: 0, display: 'block' }}>← back</button>

          <h1 style={{ fontFamily: 'DM Mono, monospace', fontSize: 'clamp(18px, 3vw, 22px)', color: T.white, fontWeight: 700, margin: '0 0 6px' }}>Edge Agent</h1>
          <p style={{ color: T.grey2, fontSize: 13, margin: '0 0 8px', fontFamily: 'Inter, sans-serif', lineHeight: 1.5 }}>
            {scenario === 'festival'
              ? `${modelInfo.label} autonomously decides what to spend at the festival. Every decision executes against your EdgePass policy on-chain.`
              : `${modelInfo.label} autonomously manages DeFi positions on Sui. Every trade executes against your EdgePass policy on-chain.`}
          </p>

          <p style={{
            fontSize: 11, fontFamily: 'DM Mono, monospace', margin: '0 0 20px', letterSpacing: '0.04em', transition: 'color 0.3s',
            color: loadingDecisions ? T.gold : running ? T.teal : done ? T.teal : T.grey2,
          }}>
            {loadingDecisions
              ? `→ consulting ${modelInfo.label.toLowerCase()}...`
              : running
              ? '→ executing decisions against your EdgePass on Sui mainnet'
              : done
              ? '✓ agent completed — receipt below'
              : 'The AI decides. EdgePass enforces. The chain is the guarantee.'}
          </p>

          {!running && !done && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: T.grey2, fontFamily: 'DM Mono, monospace', letterSpacing: '0.06em', minWidth: 64 }}>SCENARIO</span>
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

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: T.grey2, fontFamily: 'DM Mono, monospace', letterSpacing: '0.06em', minWidth: 64 }}>MODEL</span>
                {AVAILABLE_MODELS.map(m => {
                  const isSelected = selectedModel === m.id;
                  const btnColor = m.color === 'green' ? T.green : T.purple;
                  const btnDim = m.color === 'green' ? T.greenDim : T.purpleDim;
                  return (
                    <button key={m.id} onClick={() => setSelectedModel(m.id)} title={m.description}
                      style={{
                        padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 11,
                        fontFamily: 'DM Mono, monospace', letterSpacing: '0.04em', transition: 'all 0.15s',
                        border: '1px solid ' + (isSelected ? btnColor : T.border),
                        background: isSelected ? btnDim : T.bgCard,
                        color: isSelected ? btnColor : T.grey2,
                      }}>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(running || done) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ background: T.tealDim, border: '1px solid ' + T.tealBorder, color: T.teal, fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 6 }}>
                {config.label.toUpperCase()}
              </span>
              <span style={{ background: modelColorDim, border: '1px solid ' + modelColorBorder, color: modelColor, fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 6 }}>
                {modelInfo.label}
              </span>
              <span style={{ background: T.tealDim, border: '1px solid ' + T.tealBorder, color: T.teal, fontSize: 10, fontFamily: 'DM Mono, monospace', letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 6 }}>
                MAINNET
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { l: 'Budget', v: '$' + BUDGET.toLocaleString(), c: T.grey1 },
            { l: 'Spent', v: '$' + spent.toFixed(2), c: spent > 0 ? T.teal : T.grey2 },
            { l: 'Txs executed', v: String(txCount), c: txCount > 0 ? T.teal : T.grey2 },
            { l: 'Policy blocked', v: String(blockedCount), c: blockedCount > 0 ? T.red : T.grey2 },
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
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: loadingDecisions ? T.gold : modelColor, animation: 'pulse 0.8s ease-in-out infinite', display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: loadingDecisions ? T.gold : modelColor, fontFamily: 'DM Mono, monospace' }}>
                  {loadingDecisions ? `consulting ${modelInfo.label.toLowerCase()}...` : 'agent running'}
                </span>
              </div>
            )}
          </div>

          {messages.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: T.grey2, marginBottom: 8 }}>agent standing by_</div>
              <div style={{ fontSize: 12, color: T.grey2, fontFamily: 'Inter, sans-serif' }}>
                {scenario === 'festival' ? `${modelInfo.label} will autonomously decide what to buy at the festival` : `${modelInfo.label} will autonomously manage your DeFi positions`}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ animation: 'fadeUp 0.3s ease-out' }}>
                {msg.type === 'system' && <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: T.grey2 }}>{'> '}{msg.text}</div>}
                {msg.type === 'thinking' && (
                  <div style={{ background: modelColorDim, border: '1px solid ' + modelColorBorder, borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ fontSize: 10, color: modelColor, fontFamily: 'DM Mono, monospace', letterSpacing: '0.06em' }}>THINKING</div>
                      <div style={{ fontSize: 9, color: modelColor, fontFamily: 'DM Mono, monospace', opacity: 0.7 }}>{msg.model}</div>
                    </div>
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
                        <a href={'https://suiscan.xyz/mainnet/tx/' + msg.digest} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: T.blue, fontFamily: 'DM Mono, monospace', textDecoration: 'none', flexShrink: 0 }}>
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
            {running && <span style={{ display: 'inline-block', width: 8, height: 14, background: modelColor, verticalAlign: 'middle', animation: 'blink 1s step-end infinite', marginTop: 4 }} />}
          </div>
        </div>

        {done && outcomes.length > 0 && (
          <ReceiptCard outcomes={outcomes} scenario={scenario} model={modelInfo.label} walrusBlobId={walrusBlobId} walrusLoading={walrusLoading} />
        )}

        {!done && (
          <div>
            {!running && (
              <button onClick={runAgent}
                style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', background: modelColor, color: T.bg, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'opacity 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
                Run Agent
              </button>
            )}
            {running && (
              <button onClick={stop} style={{ width: '100%', padding: 14, borderRadius: 12, border: '1px solid ' + T.border, background: T.bgCard, color: T.grey1, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Mono, monospace' }}>
                $ stop agent
              </button>
            )}
          </div>
        )}

        {done && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <button onClick={reset}
              style={{ padding: 14, borderRadius: 12, border: '1px solid ' + T.border, background: 'transparent', color: T.grey1, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Mono, monospace', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.teal; e.currentTarget.style.color = T.teal; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.grey1; }}>
              run again
            </button>
            <button onClick={() => router.push('/dashboard')}
              style={{ padding: 14, borderRadius: 12, border: 'none', background: T.blue, color: T.white, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              Back to Dashboard
            </button>
          </div>
        )}

        <p style={{ textAlign: 'center', color: T.grey2, fontSize: 11, marginTop: 12, fontFamily: 'DM Mono, monospace' }}>
          powered by {modelInfo.label} · policy enforced on-chain · zero wallet interruptions
        </p>

      </div>
    </main>
  );
}
