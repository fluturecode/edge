# Edge — Complete Project Handoff

## Project Overview

**Edge** is programmable trust infrastructure for autonomous onchain systems, built on Sui for Sui Overflow 2026 (The Agentic Web track).

**The two-layer product:**
1. `@edge-protocol/sdk` — a TypeScript SDK any developer can install to add trust delegation to their app or agent
2. The demo app — Festival Mode, showing EdgePass in action

**One-line pitch:**
> EdgePass is the trust delegation primitive for autonomous onchain systems — an open SDK that lets any app or agent transact within user-defined boundaries on Sui, without wallet interruptions.

**Why it matters:**
Current crypto wallets require manual approval for every transaction. EdgePass lets users define trust boundaries once (budget, merchants, thresholds, expiry) and lets apps/agents execute autonomously within those bounds. Unsafe actions escalate to the user. This solves autonomous agents, gaming micro-transactions, subscriptions, and institutional delegation.

---

## Repo

**GitHub:** https://github.com/fluturecode/edge  
**Live app:** https://edge-web-cyan.vercel.app  
**GitHub handle:** fluturecode

---

## Tech Stack

- **Frontend:** Next.js 15, TypeScript, Tailwind, shadcn (Nova preset)
- **Package manager:** pnpm (v8 on old machine, v10 on new machine)
- **Monorepo:** pnpm workspaces
- **Blockchain:** Sui, @mysten/sui@1.30.0, @mysten/zklogin
- **Auth:** Google OAuth → zkLogin → Sui wallet (no seed phrase)
- **Hosting:** Vercel (edge-web-cyan.vercel.app)
- **Database:** Supabase (not yet wired)

---

## Monorepo Structure

```
edge/
├── apps/
│   └── web/                    ← Next.js demo app
│       ├── app/
│       │   ├── page.tsx        ← Login (terminal hero, typewriter animation) ✅
│       │   ├── layout.tsx      ← Navbar (EDGE + built on Sui) ✅
│       │   ├── globals.css     ✅
│       │   ├── auth/
│       │   │   └── callback/
│       │   │       └── page.tsx ← zkLogin callback handler ✅
│       │   └── dashboard/
│       │       ├── page.tsx    ← Dashboard (address, passes, ecosystem strip) ✅
│       │       ├── create/
│       │       │   └── page.tsx ← EdgePass creation form with PTB preview ✅
│       │       └── activity/
│       │           └── page.tsx ← Festival Mode simulation (TODO)
│       ├── lib/
│       │   ├── zklogin.ts      ← getZkLoginAddress, getDecodedJwt ✅
│       │   └── providers/
│       │       └── enoki-provider.tsx ← stub provider ✅
│       └── .env.local          ← env vars (not in git)
├── packages/
│   └── sdk/                    ← @edge-protocol/sdk
│       ├── src/
│       │   ├── index.ts        ← public exports ✅
│       │   ├── core/
│       │   │   ├── EdgePass.ts      ← main SDK class ✅
│       │   │   ├── PolicyEngine.ts  ← validation logic ✅
│       │   │   └── ExecutionEngine.ts ← PTB builder + chain calls ✅
│       │   └── utils/
│       │       ├── types.ts    ← all TypeScript types ✅
│       │       └── constants.ts ← MIST_PER_SUI, NETWORK_URLS, EDGE_PACKAGE_ID ✅
│       ├── package.json        ← name: @edge-protocol/sdk ✅
│       └── tsconfig.json       ← moduleResolution: Bundler ✅
└── contracts/
    └── navis/
        ├── sources/
        │   └── edge_pass.move  ← EdgePass Move object (TODO)
        └── Move.toml           ← (TODO)
```

---

## Environment Variables

File location: `apps/web/.env.local` (never commit this)

```
NEXT_PUBLIC_ENOKI_API_KEY=enoki_public_eb0eeeb84f04768cf88a5d264bdf9ee6
NEXT_PUBLIC_GOOGLE_CLIENT_ID=522666980790-20qcuen79borlp62m9vjb3cgugi092n3.apps.googleusercontent.com
NEXT_PUBLIC_SUI_NETWORK=devnet
NEXT_PUBLIC_APP_URL=https://edge-web-cyan.vercel.app
```

**Enoki portal:** https://enoki.mystenlabs.com  
- App: Fluturecode  
- Networks enabled: DEVNET, TESTNET  
- Need to add: MAINNET (awaiting sponsorship from Sui Foundation)

**Google OAuth:**  
- Project: edge  
- Authorized origins: http://localhost:3000, https://edge-web-cyan.vercel.app  
- Redirect URIs: http://localhost:3000/auth/callback, https://edge-web-cyan.vercel.app/auth/callback, https://edge-web-cyan.vercel.app/

---

## Design System

All screens use inline styles with this token object (copy into every new page):

```typescript
const T = {
  bg: '#080C14',
  bgCard: '#0D1420',
  bgCardHover: '#111B2E',
  border: '#1A2740',
  borderHover: '#243550',
  blue: '#4DA2FF',           // Sui blue — ecosystem signal
  blueDim: 'rgba(77,162,255,0.12)',
  blueBorder: 'rgba(77,162,255,0.3)',
  teal: '#00D4AA',           // Edge signature color
  tealDim: 'rgba(0,212,170,0.1)',
  tealBorder: 'rgba(0,212,170,0.3)',
  gold: '#FFB830',           // escalation/warning
  goldDim: 'rgba(255,184,48,0.1)',
  goldBorder: 'rgba(255,184,48,0.3)',
  red: '#FF4D6A',            // blocked/error
  redDim: 'rgba(255,77,106,0.1)',
  white: '#FFFFFF',
  grey1: '#B8C8E0',
  grey2: '#5A7090',
  grey3: '#1E2D42',
};
```

**Fonts:**
- `DM Mono, monospace` — all numbers, addresses, labels, terminal text, nav
- `Inter, sans-serif` — body copy, buttons, descriptions

**Color semantics:**
- Teal = approved / active / safe
- Gold = escalation / warning / attention
- Red = blocked / error
- Blue = Sui ecosystem / info / addresses

**Component patterns:**
- Tags: `background: ${color}18, border: 1px solid ${color}40`
- Cards: `background: T.bgCard, border: 1px solid T.border, borderRadius: 18px`
- Buttons primary: `background: T.teal, color: T.bg`
- Buttons secondary: `background: none, border: 1px solid T.border`
- All padding uses `clamp()` for mobile responsiveness

**Navbar** (in layout.tsx):
- Compass SVG logo (teal)
- EDGE in DM Mono bold
- "built on" + Sui droplet SVG (#4DA2FF) + "Sui"
- DEVNET pill (hides "built on Sui" on mobile via `.nav-built-on` class)

---

## Auth Flow

1. User clicks "Continue with Google" on `page.tsx`
2. Redirected to Google OAuth with nonce
3. Google redirects to `/auth/callback` with `#id_token=...` in URL hash
4. Callback page extracts token, stores in `localStorage('edge_id_token')`
5. `getZkLoginAddress(token)` calls `jwtToAddress()` from `@mysten/zklogin`
6. Returns deterministic Sui address — same Google account = same address always
7. User redirected to `/dashboard`

**Key files:**
- `apps/web/lib/zklogin.ts` — `getZkLoginAddress()`, `getDecodedJwt()`
- `apps/web/app/auth/callback/page.tsx` — handles the hash redirect

---

## SDK Architecture

```typescript
// Developer usage (what we're building toward):
import { EdgePass, MIST_PER_SUI } from '@edge-protocol/sdk';

const sdk = new EdgePass({ network: 'mainnet', enokiApiKey: '...' });

const pass = await sdk.create({
  budget: 300n * MIST_PER_SUI,
  autoThreshold: 50n * MIST_PER_SUI,
  escalateThreshold: 100n * MIST_PER_SUI,
  approvedMerchants: ['Shuttle Express', 'Hydra Bar'],
  expiryMs: 48 * 60 * 60 * 1000,
  owner: '0x...',
}, signer);

const outcome = await sdk.execute(pass, {
  merchant: 'Shuttle Express',
  amount: 18_500_000_000n,
}, signer);
// outcome.status === 'approved' | 'blocked' | 'escalated'
```

**PolicyEngine rules (in order):**
1. Pass must be active
2. Pass must not be expired
3. Merchant must be in approved list
4. Amount must not exceed remaining budget
5. If amount > escalateThreshold → escalate
6. If amount <= autoThreshold → auto-approve

---

## Move Contract (TODO)

File: `contracts/navis/sources/edge_pass.move`

Needs these functions:
- `create_pass(budget, auto_threshold, escalate_threshold, expiry_ms, approved_merchants)` → EdgePass object
- `execute_transaction(pass, amount, merchant)` → validates + updates spent
- `revoke_pass(pass)` → sets active = false
- Emit events for all state changes

EdgePass struct fields:
```move
struct EdgePass has key, store {
  id: UID,
  owner: address,
  budget: u64,
  auto_threshold: u64,
  escalate_threshold: u64,
  approved_merchants: vector<String>,
  spent: u64,
  active: bool,
  created_at: u64,
  expires_at: u64,
}
```

---

## What's Next (in order)

1. **Activity page** — `apps/web/app/dashboard/activity/page.tsx`
   - Festival Mode simulation
   - Typewriter tx processing
   - Escalation modal
   - Live budget bar

2. **Move contract** — `contracts/navis/sources/edge_pass.move`
   - Write the Move object
   - Test locally with `sui move test`
   - Deploy to devnet

3. **Wire SDK to contract**
   - Fill in `EDGE_PACKAGE_ID` in `constants.ts`
   - Test `sdk.create()` end to end on devnet

4. **Wire app to SDK**
   - Replace localStorage mock in create page with real `sdk.create()`
   - Wire activity page to real `sdk.execute()`

5. **Mainnet deploy**
   - Get mainnet sponsorship from Sui Foundation (contact: grants@sui.io, Sui Discord)
   - Deploy contract to mainnet
   - Update `EDGE_PACKAGE_ID.mainnet`

6. **Polish**
   - Mobile responsive pass
   - Animations
   - Error states

7. **Submission**
   - Publish `@edge-protocol/sdk` to npm
   - Write README
   - Record demo video
   - Submit to Sui Overflow by June 21st

---

## To Start A New Chat

Paste this into a new Claude chat:

> I'm building Edge — a programmable trust SDK for autonomous onchain systems on Sui, for Sui Overflow 2026 (The Agentic Web track). Repo: github.com/fluturecode/edge. Live: edge-web-cyan.vercel.app. I have a full handoff doc — please read it carefully before we continue building.

Then paste the entire contents of this file.

---

## Sui Overflow Submission Checklist

- [ ] Working app deployed to mainnet
- [ ] EdgePass Move contract on mainnet (verifiable on-chain)
- [ ] `@edge-protocol/sdk` published to npm
- [ ] Festival Mode demo end to end
- [ ] README with SDK quickstart
- [ ] Demo video
- [ ] Submission writeup on Sui Overflow site
- [ ] Deadline: June 21, 2026
