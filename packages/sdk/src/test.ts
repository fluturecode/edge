import { PolicyEngine } from './core/PolicyEngine';
import { EdgePass } from './core/EdgePass';
import { EdgePassObjectV2 } from './utils/types';
import { MIST_PER_SUI, EDGE_TEMPLATES } from './utils/constants';

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}: ${e}`);
    failed++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message} — expected ${expected}, got ${actual}`);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SHUTTLE = '0x1';
const HYDRA   = '0x2';
const STAGE   = '0x3';

const mockPass: EdgePassObjectV2 = {
  version:           'v2',
  id:                '0x123',
  issuer:             '0xabc',
  agent:              '0xagent',
  budget:            BigInt(300) * MIST_PER_SUI,
  autoThreshold:     BigInt(100) * MIST_PER_SUI,
  maxPerTransaction: BigInt(200) * MIST_PER_SUI,
  velocityCap:       0,
  velocityUsed:      0,
  windowMs:          0,
  windowStartMs:     Date.now(),
  approvedMerchants: [SHUTTLE, HYDRA, STAGE],
  spent:     BigInt(0),
  active:    true,
  createdAt: Date.now(),
  expiresAt: Date.now() + 48 * 60 * 60 * 1000,
};

// ── PolicyEngine tests ────────────────────────────────────────────────────────

console.log('\n📋 PolicyEngine.validate()');

test('auto-approves under threshold', () => {
  const r = PolicyEngine.validate(mockPass, { merchant: SHUTTLE, amount: BigInt(18) * MIST_PER_SUI });
  assert(r.allowed, 'should be allowed');
  assert(!r.requiresEscalation, 'should not escalate');
  assertEqual(r.reason, 'Auto-approved', 'reason');
});

test('auto-approves at exactly the threshold', () => {
  const r = PolicyEngine.validate(mockPass, { merchant: SHUTTLE, amount: BigInt(100) * MIST_PER_SUI });
  assert(r.allowed, 'should be allowed');
  assert(!r.requiresEscalation, 'should not escalate');
});

test('escalates above the threshold', () => {
  const r = PolicyEngine.validate(mockPass, { merchant: SHUTTLE, amount: BigInt(149) * MIST_PER_SUI });
  assert(r.allowed, 'should be allowed');
  assert(r.requiresEscalation, 'should escalate');
});

test('escalates at exactly threshold + 1', () => {
  const r = PolicyEngine.validate(mockPass, { merchant: SHUTTLE, amount: BigInt(101) * MIST_PER_SUI });
  assert(r.requiresEscalation, 'should escalate at boundary');
});

test('blocks unapproved merchant', () => {
  const r = PolicyEngine.validate(mockPass, { merchant: '0x99', amount: BigInt(1) * MIST_PER_SUI });
  assert(!r.allowed, 'should be blocked');
  assert(r.reason.includes('not approved'), 'reason should mention approval');
});

test('blocks when budget exceeded', () => {
  const pass = { ...mockPass, spent: BigInt(299) * MIST_PER_SUI };
  const r = PolicyEngine.validate(pass, { merchant: SHUTTLE, amount: BigInt(50) * MIST_PER_SUI });
  assert(!r.allowed, 'should be blocked');
  assert(r.reason.includes('budget'), 'reason should mention budget');
});

test('blocks when expired', () => {
  const pass = { ...mockPass, expiresAt: Date.now() - 1000 };
  const r = PolicyEngine.validate(pass, { merchant: SHUTTLE, amount: BigInt(18) * MIST_PER_SUI });
  assert(!r.allowed, 'should be blocked');
  assert(r.reason.includes('expired'), 'reason should mention expiry');
});

test('blocks when inactive', () => {
  const pass = { ...mockPass, active: false };
  const r = PolicyEngine.validate(pass, { merchant: SHUTTLE, amount: BigInt(18) * MIST_PER_SUI });
  assert(!r.allowed, 'should be blocked');
  assert(r.reason.includes('inactive'), 'reason should mention inactive');
});

test('blocks when maxPerTransaction exceeded', () => {
  const r = PolicyEngine.validate(mockPass, { merchant: SHUTTLE, amount: BigInt(250) * MIST_PER_SUI });
  assert(!r.allowed, 'should be blocked');
  assert(r.reason.includes('per-transaction'), 'reason should mention per-transaction limit');
});

test('blocks when velocity cap exceeded', () => {
  const pass = { ...mockPass, velocityCap: 3, velocityUsed: 3, windowMs: 60_000 };
  const r = PolicyEngine.validate(pass, { merchant: SHUTTLE, amount: BigInt(1) * MIST_PER_SUI });
  assert(!r.allowed, 'should be blocked');
  assert(r.reason.includes('Velocity'), 'reason should mention velocity');
});

test('allows once the velocity window rolls', () => {
  const pass = {
    ...mockPass,
    velocityCap: 3,
    velocityUsed: 3,
    windowMs: 60_000,
    windowStartMs: Date.now() - 61_000,
  };
  const r = PolicyEngine.validate(pass, { merchant: SHUTTLE, amount: BigInt(1) * MIST_PER_SUI });
  assert(r.allowed, 'should be allowed once the window has rolled');
});

// ── PolicyEngine helpers ───────────────────────────────────────────────────────

console.log('\n📋 PolicyEngine helpers');

test('isValid returns true for active pass', () => {
  assert(PolicyEngine.isValid(mockPass), 'should be valid');
});

test('isValid returns false for expired pass', () => {
  const pass = { ...mockPass, expiresAt: Date.now() - 1000 };
  assert(!PolicyEngine.isValid(pass), 'should be invalid');
});

test('isValid returns false for inactive pass', () => {
  const pass = { ...mockPass, active: false };
  assert(!PolicyEngine.isValid(pass), 'should be invalid');
});

test('remainingBudget calculates correctly', () => {
  const pass = { ...mockPass, spent: BigInt(100) * MIST_PER_SUI };
  const remaining = PolicyEngine.remainingBudget(pass);
  assertEqual(remaining, BigInt(200) * MIST_PER_SUI, 'remaining budget');
});

test('remainingBudget returns full budget when nothing spent', () => {
  const remaining = PolicyEngine.remainingBudget(mockPass);
  assertEqual(remaining, BigInt(300) * MIST_PER_SUI, 'full budget');
});

test('velocityStatus reports unlimited when cap is 0', () => {
  const status = PolicyEngine.velocityStatus(mockPass);
  assert(status.isUnlimited, 'should be unlimited');
  assert(!status.isExhausted, 'should not be exhausted');
});

test('velocityStatus reports exhausted at cap', () => {
  const pass = { ...mockPass, velocityCap: 3, velocityUsed: 3, windowMs: 60_000 };
  const status = PolicyEngine.velocityStatus(pass);
  assert(!status.isUnlimited, 'should not be unlimited');
  assert(status.isExhausted, 'should be exhausted');
  assertEqual(status.remaining, 0, 'no actions remaining');
});

// ── EdgePass.fromTemplate ──────────────────────────────────────────────────────

console.log('\n📋 EdgePass.fromTemplate()');

test('festival template has correct defaults', () => {
  const config = EdgePass.fromTemplate('festival', { agent: '0xagent' });
  assertEqual(config.budget, EDGE_TEMPLATES.festival.budget, 'budget');
  assertEqual(config.autoThreshold, EDGE_TEMPLATES.festival.autoThreshold, 'autoThreshold');
  assertEqual(config.maxPerTransaction, EDGE_TEMPLATES.festival.maxPerTransaction, 'maxPerTransaction');
  assertEqual(config.agent, '0xagent', 'agent');
});

test('gaming template has correct expiry', () => {
  const config = EdgePass.fromTemplate('gaming', { agent: '0xagent' });
  assertEqual(config.expiryMs, 4 * 60 * 60 * 1000, 'gaming expiry should be 4h');
});

test('defi template has correct budget', () => {
  const config = EdgePass.fromTemplate('defi', { agent: '0xagent' });
  assertEqual(config.budget, BigInt(10_000) * MIST_PER_SUI, 'defi budget should be 10k SUI');
});

test('enterprise template has correct budget', () => {
  const config = EdgePass.fromTemplate('enterprise', { agent: '0xagent' });
  assertEqual(config.budget, BigInt(50_000) * MIST_PER_SUI, 'enterprise budget should be 50k SUI');
});

test('fromTemplate allows budget override', () => {
  const config = EdgePass.fromTemplate('festival', {
    budget: BigInt(500) * MIST_PER_SUI,
    agent: '0xagent',
  });
  assertEqual(config.budget, BigInt(500) * MIST_PER_SUI, 'overridden budget');
});

test('fromTemplate allows merchant override', () => {
  const merchants = ['0xvendor1', '0xvendor2'];
  const config = EdgePass.fromTemplate('festival', {
    approvedMerchants: merchants,
    agent: '0xagent',
  });
  assertEqual(config.approvedMerchants.length, 2, 'merchant count');
  assertEqual(config.approvedMerchants[0], '0xvendor1', 'first merchant');
});

test('fromTemplate preserves agent', () => {
  const config = EdgePass.fromTemplate('defi', { agent: '0xdeadbeef' });
  assertEqual(config.agent, '0xdeadbeef', 'agent preserved');
});

// ── Constants ─────────────────────────────────────────────────────────────────

console.log('\n📋 Constants');

test('MIST_PER_SUI is 1_000_000_000', () => {
  assertEqual(MIST_PER_SUI, BigInt(1_000_000_000), 'MIST_PER_SUI');
});

test('all 5 base templates exist', () => {
  const templates = ['festival', 'gaming', 'subscription', 'defi', 'enterprise'];
  for (const t of templates) {
    assert(t in EDGE_TEMPLATES, `template ${t} should exist`);
  }
});

test('all templates have required fields', () => {
  for (const [name, template] of Object.entries(EDGE_TEMPLATES)) {
    assert('budget' in template, `${name} should have budget`);
    assert('autoThreshold' in template, `${name} should have autoThreshold`);
    assert('maxPerTransaction' in template, `${name} should have maxPerTransaction`);
    assert('velocityCap' in template, `${name} should have velocityCap`);
    assert('expiryMs' in template, `${name} should have expiryMs`);
  }
});

test('all templates have autoThreshold <= maxPerTransaction', () => {
  for (const [name, template] of Object.entries(EDGE_TEMPLATES)) {
    assert(
      template.autoThreshold <= template.maxPerTransaction,
      `${name}: autoThreshold must be <= maxPerTransaction`
    );
  }
});

test('all templates have maxPerTransaction <= budget', () => {
  for (const [name, template] of Object.entries(EDGE_TEMPLATES)) {
    assert(
      template.maxPerTransaction <= template.budget,
      `${name}: maxPerTransaction must be <= budget`
    );
  }
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${passed} passed · ${failed} failed`);
if (failed > 0) {
  console.error(`\n  ✗ ${failed} test(s) failed`);
  (process as any).exit(1);
} else {
  console.log(`\n  ✅ All ${passed} tests passing`);
}

// ── Events system ─────────────────────────────────────────────────────────────

console.log('\n📋 Events system');

test('on() returns sdk instance for chaining', () => {
  const sdk = new EdgePass({ network: 'testnet', enokiApiKey: 'test' });
  const result = sdk.on('approved', () => {});
  assert(result === sdk, 'should be chainable');
});

test('fires approved event on auto-approve', async () => {
  const sdk = new EdgePass({ network: 'testnet', enokiApiKey: 'test' });
  let fired = false;

  sdk.on('approved', ({ outcome, request }) => {
    fired = true;
    assertEqual(outcome.status, 'approved', 'event status');
    assertEqual(request.merchant, SHUTTLE, 'event merchant');
  });

  const mockSigner = {
    signAndExecute: async () => ({ digest: '0xmock', objectId: null }),
  };

  await sdk.execute(mockPass, {
    merchant: SHUTTLE,
    amount: BigInt(18) * MIST_PER_SUI,
  }, mockSigner as any);

  assert(fired, 'approved event should have fired');
});

test('fires blocked event on policy rejection', async () => {
  const sdk = new EdgePass({ network: 'testnet', enokiApiKey: 'test' });
  let fired = false;

  sdk.on('blocked', ({ outcome }) => {
    fired = true;
    assertEqual(outcome.status, 'blocked', 'event status');
  });

  const mockSigner = {
    signAndExecute: async () => ({ digest: '0xmock', objectId: null }),
  };

  await sdk.execute(mockPass, {
    merchant: '0x99',
    amount: BigInt(1) * MIST_PER_SUI,
  }, mockSigner as any);

  assert(fired, 'blocked event should have fired');
});

test('fires escalated event above threshold', async () => {
  const sdk = new EdgePass({ network: 'testnet', enokiApiKey: 'test' });
  let fired = false;

  sdk.on('escalated', ({ outcome }) => {
    fired = true;
    assertEqual(outcome.status, 'escalated', 'event status');
  });

  const mockSigner = {
    signAndExecute: async () => ({ digest: '0xmock', objectId: null }),
  };

  await sdk.execute(mockPass, {
    merchant: SHUTTLE,
    amount: BigInt(149) * MIST_PER_SUI,
  }, mockSigner as any);

  assert(fired, 'escalated event should have fired');
});

test('off() removes listener', async () => {
  const sdk = new EdgePass({ network: 'testnet', enokiApiKey: 'test' });
  let count = 0;
  const listener = () => { count++; };

  sdk.on('blocked', listener);
  sdk.off('blocked', listener);

  const mockSigner = {
    signAndExecute: async () => ({ digest: '0xmock', objectId: null }),
  };

  await sdk.execute(mockPass, {
    merchant: '0x99',
    amount: BigInt(1) * MIST_PER_SUI,
  }, mockSigner as any);

  assertEqual(count, 0, 'listener should not fire after off()');
});

test('removeAllListeners() clears all events', async () => {
  const sdk = new EdgePass({ network: 'testnet', enokiApiKey: 'test' });
  let count = 0;

  sdk.on('approved', () => { count++; });
  sdk.on('blocked', () => { count++; });
  sdk.removeAllListeners();

  const mockSigner = {
    signAndExecute: async () => ({ digest: '0xmock', objectId: null }),
  };

  await sdk.execute(mockPass, {
    merchant: '0x99',
    amount: BigInt(1) * MIST_PER_SUI,
  }, mockSigner as any);

  assertEqual(count, 0, 'no listeners should fire after removeAllListeners()');
});

test('multiple listeners fire for same event', async () => {
  const sdk = new EdgePass({ network: 'testnet', enokiApiKey: 'test' });
  let count = 0;

  sdk.on('blocked', () => { count++; });
  sdk.on('blocked', () => { count++; });

  const mockSigner = {
    signAndExecute: async () => ({ digest: '0xmock', objectId: null }),
  };

  await sdk.execute(mockPass, {
    merchant: '0x99',
    amount: BigInt(1) * MIST_PER_SUI,
  }, mockSigner as any);

  assertEqual(count, 2, 'both listeners should fire');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${passed} passed · ${failed} failed`);
if (failed > 0) {
  console.error(`\n  ✗ ${failed} test(s) failed`);
  (process as any).exit(1);
} else {
  console.log(`\n  ✅ All ${passed} tests passing`);
}
