import { PolicyEngine } from "./core/PolicyEngine";
import { EdgePassObject } from "./utils/types";
import { MIST_PER_SUI } from "./utils/constants";

// Mock EdgePass for testing
const mockPass: EdgePassObject = {
  id: "0x123",
  config: {
    budget: BigInt(300) * MIST_PER_SUI,
    autoThreshold: BigInt(50) * MIST_PER_SUI,
    escalateThreshold: BigInt(100) * MIST_PER_SUI,
    approvedMerchants: ["Shuttle Express", "Hydra Bar", "Stage Access VIP"],
    expiryMs: 48 * 60 * 60 * 1000,
    owner: "0xabc",
  },
  spent: BigInt(0),
  active: true,
  createdAt: Date.now(),
  expiresAt: Date.now() + 48 * 60 * 60 * 1000,
};

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}: ${e}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// Test 1 — auto approve under threshold
test("auto-approves under $50", () => {
  const result = PolicyEngine.validate(mockPass, {
    merchant: "Shuttle Express",
    amount: BigInt(18) * MIST_PER_SUI,
  });
  assert(result.allowed, "should be allowed");
  assert(!result.requiresEscalation, "should not escalate");
});

// Test 2 — escalate above threshold
test("escalates above $100", () => {
  const result = PolicyEngine.validate(mockPass, {
    merchant: "Shuttle Express",
    amount: BigInt(149) * MIST_PER_SUI,
  });
  assert(result.allowed, "should be allowed");
  assert(result.requiresEscalation, "should escalate");
});

// Test 3 — block unlisted merchant
test("blocks unlisted merchant", () => {
  const result = PolicyEngine.validate(mockPass, {
    merchant: "ShadyTokens.xyz",
    amount: BigInt(1) * MIST_PER_SUI,
  });
  assert(!result.allowed, "should be blocked");
});

// Test 4 — block when budget exceeded
test("blocks when budget exceeded", () => {
  const overSpentPass = { ...mockPass, spent: BigInt(299) * MIST_PER_SUI };
  const result = PolicyEngine.validate(overSpentPass, {
    merchant: "Shuttle Express",
    amount: BigInt(50) * MIST_PER_SUI,
  });
  assert(!result.allowed, "should be blocked");
});

// Test 5 — block when expired
test("blocks when expired", () => {
  const expiredPass = { ...mockPass, expiresAt: Date.now() - 1000 };
  const result = PolicyEngine.validate(expiredPass, {
    merchant: "Shuttle Express",
    amount: BigInt(18) * MIST_PER_SUI,
  });
  assert(!result.allowed, "should be blocked");
});

// Test 6 — block when inactive
test("blocks when inactive", () => {
  const inactivePass = { ...mockPass, active: false };
  const result = PolicyEngine.validate(inactivePass, {
    merchant: "Shuttle Express",
    amount: BigInt(18) * MIST_PER_SUI,
  });
  assert(!result.allowed, "should be blocked");
});

console.log("\nAll tests complete.");