/**
 * Live e2e test against testnet package
 * 0xe781abc2d83f5400a2863501a40e0ed9c68f5af63c62f050c564bacaf495361a, run
 * through the actual SDK (not the Move test suite, not mocks). Exercises:
 *
 *   1. sdk.create()  — mint a real EdgePassV2
 *   2. sdk.execute() — one allowed (approved) transaction
 *   3. sdk.fetch()   — immediately after, checking for read-after-write staleness
 *   4. sdk.execute() x3 — all three on-chain denial kinds, back to back, no
 *      artificial delays: merchant-not-approved, exceeds-max-per-transaction,
 *      budget-exceeded
 *
 * Every `blocked` outcome must carry a real digest (resolvable on Suiscan)
 * and the correct Move abort code. If a digest comes back undefined, this
 * test says so explicitly rather than treating the run as a pass.
 *
 * Uses a single-use Ed25519 keypair, generated once and cached in the OS
 * scratch dir (not the repo, not version control) purely so repeated runs of
 * this dev-only script don't have to re-hit the rate-limited public faucet
 * every time — it's throwaway testnet funds, not a real credential.
 *
 * Run with: pnpm --filter @edge-protocol/sdk exec ts-node --compiler-options
 * '{"module":"CommonJS"}' src/e2e.testnet.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { requestSuiFromFaucetV2, getFaucetHost } from '@mysten/sui/faucet';

import { EdgePass } from './core/EdgePass';
import { ABORT_CODES } from './utils/types';
import { MIST_PER_SUI, NETWORK_URLS } from './utils/constants';
import type { EdgePassObjectV2 } from './utils/types';

const NETWORK = 'testnet' as const;
const SUISCAN = (digest: string) => `https://suiscan.xyz/testnet/tx/${digest}`;
const KEYPAIR_CACHE = path.join(os.tmpdir(), 'edgepass-e2e-testnet-keypair.txt');

function loadOrCreateKeypair(): Ed25519Keypair {
  if (fs.existsSync(KEYPAIR_CACHE)) {
    const secretKey = fs.readFileSync(KEYPAIR_CACHE, 'utf8').trim();
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  const keypair = Ed25519Keypair.generate();
  fs.writeFileSync(KEYPAIR_CACHE, keypair.getSecretKey(), { mode: 0o600 });
  return keypair;
}

// MIST_PER_SUI is 1e9 MIST/SUI — fractional SUI amounts below are all
// multiples of 0.1 SUI, so this stays an exact integer.
function sui(n: number): bigint {
  return BigInt(Math.round(n * 10)) * MIST_PER_SUI / BigInt(10);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fundFromFaucet(client: SuiGrpcClient, address: string): Promise<void> {
  const existing = await client.getBalance({ owner: address });
  if (BigInt(existing.balance.balance) > BigInt(0)) {
    console.log(`\n💰 ${address} already funded: ${existing.balance.balance} MIST — skipping faucet.`);
    return;
  }

  console.log(`\n💧 Requesting testnet SUI for ${address}...`);
  await requestSuiFromFaucetV2({ host: getFaucetHost('testnet'), recipient: address });

  // Faucet drips asynchronously — poll balance until it lands, bounded.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const { balance } = await client.getBalance({ owner: address });
    if (BigInt(balance.balance) > BigInt(0)) {
      console.log(`   funded: ${balance.balance} MIST`);
      return;
    }
    await sleep(1500);
  }
  throw new Error(`Faucet funding did not land within 30s for ${address}`);
}

async function main() {
  console.log('═'.repeat(70));
  console.log('EdgePass V2 — live testnet e2e (real SDK, real chain, no mocks)');
  console.log('═'.repeat(70));

  const client = new SuiGrpcClient({ network: NETWORK, baseUrl: NETWORK_URLS[NETWORK] });
  const keypair = loadOrCreateKeypair();
  const address = keypair.toSuiAddress();
  const merchant = Ed25519Keypair.generate().toSuiAddress();
  const unapprovedMerchant = Ed25519Keypair.generate().toSuiAddress();

  console.log(`\nSender (issuer + agent): ${address}`);
  console.log(`Approved merchant:       ${merchant}`);
  console.log(`Unapproved merchant:     ${unapprovedMerchant}`);

  await fundFromFaucet(client, address);

  // Gas resolution is the *signer's* job, not the SDK's — ExecutionEngine
  // only sets gasBudget (see buildPTB's comment on why). A direct wallet
  // signer pays from its own coins, exactly like apps/web/lib/signer.ts
  // does; a sponsored signer (Enoki) would do this against a completely
  // different address instead.
  //
  // Firing transactions back to back with no delay (as this test does)
  // means each one consumes/bumps the SAME gas coin (this wallet only has
  // one) before the read path used by listCoins() is guaranteed to reflect
  // it — the exact read-after-write staleness class bug 2 is about, just on
  // the gas coin instead of the pass. Re-querying listCoins() on every call
  // raced that staleness and failed with "version ... is unavailable for
  // consumption". Fixed the same way ExecutionEngine.fetchPass() is: don't
  // re-read, carry the coin's new version forward from the transaction's own
  // effects (`gasObject`) — only fall back to listCoins() the first time.
  const GAS_BUDGET = BigInt(10_000_000);
  let gasCoinRef: { objectId: string; version: string; digest: string } | null = null;

  async function resolveGasForSender(tx: Transaction, sender: string): Promise<void> {
    const { referenceGasPrice } = await client.getReferenceGasPrice();
    tx.setGasPrice(referenceGasPrice);

    if (gasCoinRef) {
      tx.setGasPayment([gasCoinRef]);
      return;
    }

    const { objects: coins } = await client.listCoins({ owner: sender, coinType: '0x2::sui::SUI' });
    if (coins.length === 0) {
      throw new Error(`No SUI coins for ${sender} — fund it via the testnet faucet first.`);
    }
    const [biggest] = [...coins].sort((a, b) => (BigInt(a.balance) < BigInt(b.balance) ? 1 : -1));
    if (BigInt(biggest.balance) < GAS_BUDGET) {
      throw new Error(`Largest coin for ${sender} (${biggest.balance} MIST) is under the gas budget (${GAS_BUDGET} MIST).`);
    }
    tx.setGasPayment([{ objectId: biggest.objectId, version: biggest.version, digest: biggest.digest }]);
  }

  // ── The signer ────────────────────────────────────────────────────────────
  //
  // Mirrors how a real signAndExecute wrapper behaves: on-chain execution
  // failures (Move aborts) come back from the gRPC client as *data*
  // (`$kind: 'FailedTransaction'`), not a thrown error — the client only
  // throws for things that never reach the chain at all (a client-side
  // SimulationError from Transaction.build()'s pre-flight resolution, a
  // network error, a signing error). This wrapper normalizes that the way
  // most wallet/signer SDKs do: throw on failure, with `.digest` attached and
  // the chain's own formatted abort message as the error text — which is
  // exactly what ExecutionEngine.extractAbortInfo() is written to parse.
  const signAndExecute = async (
    tx: Transaction
  ): Promise<{ digest: string; objectId?: string | null }> => {
    tx.setSender(address);
    await resolveGasForSender(tx, address);

    const result = await client.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      include: { effects: true, objectTypes: true },
    });

    const txData = (result.Transaction ?? result.FailedTransaction)!;

    // The gas coin is mutated whether the transaction succeeds or aborts —
    // carry its new version/digest forward for the next call regardless of
    // outcome, before checking status below.
    const gasObject = txData.effects?.gasObject;
    if (gasObject?.outputVersion && gasObject.outputDigest) {
      gasCoinRef = { objectId: gasObject.objectId, version: gasObject.outputVersion, digest: gasObject.outputDigest };
    }

    if (result.$kind === 'FailedTransaction' || txData.status.success === false) {
      const err = new Error(
        txData.status.success === false
          ? txData.status.error.message
          : 'Transaction failed with no status.error'
      );
      (err as { digest?: string }).digest = txData.digest;
      throw err;
    }

    const created = txData.effects?.changedObjects.find(o => o.idOperation === 'Created');
    return { digest: txData.digest, objectId: created?.objectId ?? null };
  };

  const sdk = new EdgePass({ network: NETWORK, enokiApiKey: 'unused-direct-signing' });

  // ── Step 1: create ────────────────────────────────────────────────────────

  console.log('\n📋 Step 1 — sdk.create()');

  const budget = sui(2);
  const maxPerTransaction = sui(1.5);
  const escalateAbove = sui(1.5);

  let pass: EdgePassObjectV2 = await sdk.create(
    {
      agent: address,
      issuer: address,
      budget,
      escalateAbove,
      maxPerTransaction,
      velocityCap: 10,
      velocityWindowMs: 60 * 60 * 1000,
      approvedMerchants: [merchant],
      expiryMs: 60 * 60 * 1000,
    },
    { signAndExecute }
  );

  console.log(`   pass id: ${pass.id}`);
  console.log(`   initialSharedVersion: ${pass.initialSharedVersion}`);
  if (!pass.initialSharedVersion) {
    throw new Error('❌ FAIL: created pass has no initialSharedVersion — bug 1 fix incomplete.');
  }

  // ── Step 2: one allowed transaction ──────────────────────────────────────

  console.log('\n📋 Step 2 — sdk.execute() — allowed transaction');

  // == escalateAbove and == maxPerTransaction — PolicyEngine only escalates
  // strictly *above* escalateAbove, so this still auto-approves. Leaves
  // 0.5 SUI of budget remaining, which the denial cases below depend on.
  const allowedAmount = sui(1.5);
  const approvedOutcome = await sdk.execute(pass, { merchant, amount: allowedAmount }, { signAndExecute });

  console.log(`   status: ${approvedOutcome.status}`);
  if (approvedOutcome.status !== 'approved') {
    throw new Error(`❌ FAIL: expected 'approved', got '${approvedOutcome.status}': ${JSON.stringify(approvedOutcome)}`);
  }
  console.log(`   digest: ${approvedOutcome.digest}`);
  console.log(`   suiscan: ${SUISCAN(approvedOutcome.digest)}`);

  // ── Step 3: fetch immediately after — the read-after-write test ─────────

  console.log('\n📋 Step 3 — sdk.fetch() immediately after, no artificial delay');

  const fetched = await sdk.fetch(pass.id);
  if (!fetched || fetched.version !== 'v2') {
    throw new Error(`❌ FAIL: fetch() after create/execute did not return a v2 pass: ${JSON.stringify(fetched)}`);
  }
  console.log(`   spent: ${fetched.spent} (expected ${allowedAmount})`);
  if (fetched.spent !== allowedAmount) {
    throw new Error(
      `❌ FAIL: bug 2 not fixed — fetch() returned stale state. ` +
      `Expected spent=${allowedAmount}, got spent=${fetched.spent}.`
    );
  }
  console.log('   ✅ fresh read confirmed — no staleness');

  pass = fetched;

  // ── Step 4: all three denials, back to back, no artificial delay ────────

  console.log('\n📋 Step 4 — three on-chain denials in sequence, no delays');

  const denialCases: Array<{
    label: string;
    request: { merchant: string; amount: bigint };
    expectedAbortCode: number;
  }> = [
    {
      label: 'merchant not approved',
      request: { merchant: unapprovedMerchant, amount: sui(0.1) },
      expectedAbortCode: ABORT_CODES.EMerchantNotApproved,
    },
    {
      // 1.6 > maxPerTransaction (1.5). Also > remaining budget (0.5), but
      // the Move contract's assert order (merchant, max-per-tx, velocity,
      // budget — see edge_pass_v2.move) means max-per-tx trips first, so
      // this is unambiguously *that* denial and not budget.
      label: 'exceeds max per transaction',
      request: { merchant, amount: sui(1.6) },
      expectedAbortCode: ABORT_CODES.EExceedsMaxPerTransaction,
    },
    {
      // 0.6 <= maxPerTransaction (1.5), so that check passes; but only 0.5
      // SUI of budget remains after step 2, so this trips budget alone.
      label: 'budget exceeded',
      request: { merchant, amount: sui(0.6) },
      expectedAbortCode: ABORT_CODES.EBudgetExceeded,
    },
  ];

  const results: Array<{ label: string; digest?: string; abortCode?: number; status: string }> = [];

  for (const denial of denialCases) {
    const outcome = await sdk.execute(pass, denial.request, { signAndExecute });
    console.log(`\n   — ${denial.label} —`);
    console.log(`     status: ${outcome.status}`);

    if (outcome.status !== 'blocked') {
      throw new Error(`❌ FAIL [${denial.label}]: expected 'blocked', got '${outcome.status}': ${JSON.stringify(outcome)}`);
    }
    console.log(`     digest: ${outcome.digest ?? 'undefined'}`);
    console.log(`     abortCode: ${outcome.abortCode ?? 'undefined'} (expected ${denial.expectedAbortCode})`);

    if (!outcome.digest) {
      throw new Error(
        `❌ FAIL [${denial.label}]: digest is undefined — the denial did not reach the ` +
        `chain, so bug 1's fix is incomplete. reason: ${outcome.reason}`
      );
    }
    if (outcome.abortCode !== denial.expectedAbortCode) {
      throw new Error(
        `❌ FAIL [${denial.label}]: expected abort code ${denial.expectedAbortCode}, got ${outcome.abortCode}`
      );
    }
    console.log(`     suiscan: ${SUISCAN(outcome.digest)}`);

    results.push({ label: denial.label, digest: outcome.digest, abortCode: outcome.abortCode, status: outcome.status });
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(70));
  console.log('SUMMARY');
  console.log('═'.repeat(70));
  console.log(`create():           ${pass.id}`);
  console.log(`approved execute(): ${approvedOutcome.status === 'approved' ? approvedOutcome.digest : 'N/A'}  ${SUISCAN((approvedOutcome as any).digest)}`);
  for (const r of results) {
    console.log(`${r.label.padEnd(28)} digest=${r.digest}  abortCode=${r.abortCode}  ${SUISCAN(r.digest!)}`);
  }
  console.log('\n✅ All checks passed — every blocked outcome carried a real digest and the correct abort code.');
}

main().catch(err => {
  console.error('\n❌ e2e test failed:', err);
  process.exitCode = 1;
});
