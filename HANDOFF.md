# Edge — Complete Project Handoff
*Last updated: June 18, 2026 — end of Day 3 build session*
*Hours invested: ~35 hours total*

---

## New Chat Prompt

> I'm building Edge for Sui Overflow 2026. Repo: github.com/fluturecode/edge. Live: edge-web-cyan.vercel.app. SDK: @edge-protocol/sdk@0.5.2. Full stack working — zkLogin, real on-chain EdgePass, AI agent demo, Walrus audit logs, 34 tests passing, events system. Read HANDOFF.md before continuing. Deadline: June 21, 2026.

---

## Project Overview

**Edge** is programmable trust infrastructure for autonomous onchain systems, built on Sui for Sui Overflow 2026 (The Agentic Web track).

**Pitch:** EdgePass gives agents your rules, not your keys.
**Tagline:** The best infrastructure is invisible.
**Validated by:** Independent Gemini research across 317 academic papers — all 4 core claims confirmed.

---

## Repo & Links

- **GitHub:** https://github.com/fluturecode/edge
- **Live app:** https://edge-web-cyan.vercel.app
- **npm:** https://npmjs.com/package/@edge-protocol/sdk
- **Contract:** https://suiscan.xyz/testnet/object/0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d
- **Submission:** https://www.deepsurge.xyz/hackathons/b587dc0c-4cb8-4e63-ada5-519df38103bf

---

## What's Working ✅

- zkLogin — Google login → real Sui address via Enoki (correct salt derivation)
- EdgePass creation — real Move object minted on testnet, verified on Suiscan
- Festival Mode simulation — all 5 transaction types, escalation modal
- AI agent demo — Claude LLM makes autonomous decisions, executes via PolicyEngine
- Walrus audit logs — real blobs on testnet
- Seal policy encryption — policies encrypted and stored
- SDK @edge-protocol/sdk@0.5.2 — published on npm, 856+ downloads
- Events system — on/off/removeAllListeners
- 34 tests passing
- Move contract deployed on Sui testnet
- GitHub Actions CI/CD
- Sui Foundation grant email sent — grants@sui.io + devrel@mystenlabs.com

---

## SDK Current State

```
@edge-protocol/sdk@0.5.2
- PolicyEngine — 7 validation rules, pure TypeScript
- EdgePass.fromTemplate() — 5 templates
- Events system — on/off/removeAllListeners
- Config validation in create()
- maxPerTransaction support
- 34/34 tests passing
- DOCS.md — competitive positioning, security model, full API reference
- README.md — production-grade with open-core model
```

---

## Contract Details

```
Package ID: 0x9f4065009494aa5acd92a5c72a6c22ce80939b2bddae3b34345459bc98d2501d
Deployer:   0xe759eaf1a47566836f825b96a8d12e55b858df1be7d86b032f449638a93489c9
Network:    Sui testnet
```

---

## Critical Auth Fix (Hard-Won)

`jwtToAddress(jwt, BigInt(0))` gives WRONG address. Must call Enoki `/v1/zklogin` GET endpoint with JWT to get the correct salt-derived address.

**zkLogin address:** `0x7c06fb216c312ca8088deef35ff34637afafeda40fb40359be9e815c865cc1d0`

Fund this address for testnet gas:
```bash
curl -X POST https://faucet.testnet.sui.io/v1/gas \
  -H 'Content-Type: application/json' \
  -d '{"FixedAmountRequest":{"recipient":"0x7c06fb216c312ca8088deef35ff34637afafeda40fb40359be9e815c865cc1d0"}}'
```

---

## Transaction Signing Flow

Currently using direct execution (Enoki testnet TTL too short):

```
signer.ts (browser):
  1. Fetch sender's SUI coins from testnet
  2. Set sender, gas owner, gas budget, gas payment
  3. Build full tx bytes
  4. POST to /api/sign with fullTxBytes

/api/sign (server):
  1. Receive fullTxBytes
  2. Sign with ephemeral key + getZkLoginSignature
  3. suiClient.executeTransactionBlock with single zkLogin signature
  4. Fetch created objectId from tx effects
```

**Mainnet plan:** Re-enable Enoki sponsorship (longer TTLs on mainnet).

---

## Environment Variables

```
NEXT_PUBLIC_ENOKI_API_KEY=enoki_public_eb0eeeb84f04768cf88a5d264bdf9ee6
NEXT_PUBLIC_GOOGLE_CLIENT_ID=522666980790-20qcuen79borlp62m9vjb3cgugi092n3.apps.googleusercontent.com
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_APP_URL=https://edge-web-cyan.vercel.app
ENOKI_SECRET_KEY=enoki_private_d5807c3cb9c5fb1a2fb2f562380ef30b
ANTHROPIC_API_KEY=<rotated — get from console.anthropic.com>
```

Also set in Vercel dashboard.

---

## Design System

```typescript
bg: '#080C14', bgCard: '#0D1420', border: '#1A2740'
blue: '#4DA2FF', teal: '#00D4AA', gold: '#FFB830', red: '#FF4D6A'
Fonts: DM Mono (terminal), Inter (body)
Footer: vanish 7s animation — "The best infrastructure is invisible."
```

---

## Competitive Positioning (Gemini Validated)

Edge is the **policy layer**. x402 is the payment rail. They are complementary.

- **Claim 1:** Only open-source npm package with 5D policy enforcement — ✅ VALIDATED
- **Claim 2:** First trust delegation primitive on Sui — ✅ VALIDATED
- **Claim 3:** TS engine + on-chain enforcement + Walrus + 3-outcome escalation is unique — ✅ VALIDATED
- **Claim 4:** Complementary to x402, not competitive — ✅ VALIDATED

Academic reference: arxiv.org/html/2601.04583v1 — identifies "Policy Decision Record" as critical missing layer. Edge is that layer.

---

## Video Script (5 min)

```
0:00-0:20  Hook — "$2.3B in agent assets, no middle ground between key sharing and popups"
0:20-1:00  The Primitive — create EdgePass, show Suiscan confirmation
1:00-1:30  The Flex — 3 lines of code in VS Code
1:30-3:30  Agent Demo — Claude reasoning, transactions, escalation modal, Walrus log
3:30-4:00  Vision — PDR layer, Sui primitives, competitive positioning
4:00-4:30  Numbers — 856 downloads, before this video
4:30-5:00  Close — footer animation breathing, "The best infrastructure is invisible."
```

---

## What's Left

| Priority | Task | Time |
|----------|------|------|
| 🔴 REQUIRED | Demo video (YouTube, ≤5 min) | 2 hrs |
| 🔴 REQUIRED | DeepSurge submission | 30 min |
| 🟡 HIGH | Mainnet deploy | 2 hrs |
| 🟡 HIGH | Re-enable Enoki on mainnet | 30 min |
| 🟡 HIGH | Fund zkLogin address before recording | 5 min |
| 🟢 NICE | Agent reputation card | 1 hr |

---

## Before Recording Video

```bash
# Fund zkLogin address
curl -X POST https://faucet.testnet.sui.io/v1/gas \
  -H 'Content-Type: application/json' \
  -d '{"FixedAmountRequest":{"recipient":"0x7c06fb216c312ca8088deef35ff34637afafeda40fb40359be9e815c865cc1d0"}}'

# Clear localStorage in browser console
localStorage.clear();
```

Then: login fresh → create EdgePass → run AI agent → record.

---

## Mainnet Deployment Plan

1. Email grants@sui.io for gas (already sent ✅)
2. Update GitHub Actions workflow: testnet → mainnet
3. Fund deployer wallet on mainnet
4. Re-enable Enoki sponsorship in /api/sign/route.ts
5. Update EDGE_PACKAGE_ID.mainnet in constants.ts
6. Change NEXT_PUBLIC_SUI_NETWORK=mainnet in Vercel
7. Publish SDK v0.6.0 with mainnet package ID

---

## Personal Laptop

- 2017 MacBook Air (Intel) — sui move build crashes, use GitHub Actions
- Sui wallet alias: festive-tourmaline
- Address: 0xe759eaf1a47566836f825b96a8d12e55b858df1be7d86b032f449638a93489c9
- Recovery: donkey match coil wait seed begin liar thrive sausage always deal drastic

---

*Built by Elizabeth Eidelson (@fluturecode)*
*Sui Overflow 2026 — Agentic Web track*
*The best infrastructure is invisible.*
