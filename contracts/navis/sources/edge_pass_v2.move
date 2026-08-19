/// EdgePass v2 — programmable trust for autonomous agents on Sui.
///
/// What changed from v1, and why:
///
/// * SHARED, not owned. v1 transferred the pass to `owner`, so only that one
///   address could ever touch it — which meant the "agent" and the "human"
///   had to be the same key. v2 shares the object and expresses rights through
///   `issuer` / `agent` fields plus sender assertions, so a human can grant and
///   revoke while an agent spends.
///
/// * NO WIDENING, BY ANYONE. v1 had `add_merchant`, so the owner could extend
///   scope after minting. v2 removes it. Limits can be narrowed (`remove_merchant`,
///   issuer only) but never raised — not by the agent, not by the issuer, not by
///   anyone. This is a property you can verify by reading the module, and it is
///   the strongest claim the design makes.
///
/// * VELOCITY. A budget caps how much. It does not cap how fast. A retry loop
///   drains a budget before anything notices, so v2 adds a rolling window.
///
/// * ADDRESSES, NOT STRINGS. v1 approved merchants by name. A name is not a
///   settlement destination and cannot be enforced against. v2 uses addresses;
///   keep human-readable labels off chain.
///
/// * REVOKE DEACTIVATES, IT DOES NOT DESTROY. The object persists as an audit
///   record and every check against it fails. Destroying would erase the trail
///   at exactly the moment it matters most.
module navis::edge_pass_v2;

use sui::clock::{Self, Clock};
use sui::event;

// ── Errors ─────────────────────────────────────────────────────────
// Codes start at 1. Abort code 0 is ambiguous with success in some parsers.

const EPassInactive: u64 = 1;
const EPassExpired: u64 = 2;
const EMerchantNotApproved: u64 = 3;
const EBudgetExceeded: u64 = 4;
const EVelocityExceeded: u64 = 5;
const EExceedsMaxPerTransaction: u64 = 6;
const ENotAgent: u64 = 7;
const ENotIssuer: u64 = 8;
const EInvalidConfig: u64 = 9;

// ── The pass ───────────────────────────────────────────────────────

public struct EdgePassV2 has key {
    id: UID,
    /// Grants and revokes. May not spend.
    issuer: address,
    /// Spends. May not revoke, may not change anything.
    agent: address,

    budget: u64,
    spent: u64,
    /// Above this, the SDK routes to a human. Not enforced on chain —
    /// escalation is a routing decision, not a refusal.
    auto_threshold: u64,
    /// Hard ceiling per transaction. Enforced.
    max_per_transaction: u64,

    /// Max actions per window. 0 means unlimited.
    velocity_cap: u64,
    velocity_used: u64,
    window_ms: u64,
    window_start_ms: u64,

    approved_merchants: vector<address>,

    active: bool,
    created_at_ms: u64,
    expires_at_ms: u64,
}

// ── Events ─────────────────────────────────────────────────────────

public struct PassCreated has copy, drop {
    pass_id: address,
    issuer: address,
    agent: address,
    budget: u64,
    velocity_cap: u64,
    window_ms: u64,
    merchant_count: u64,
    expires_at_ms: u64,
}

public struct TransactionExecuted has copy, drop {
    pass_id: address,
    agent: address,
    merchant: address,
    amount: u64,
    spent_total: u64,
    budget_remaining: u64,
    velocity_used: u64,
    at_ms: u64,
}

public struct PassRevoked has copy, drop {
    pass_id: address,
    issuer: address,
    spent_at_revocation: u64,
    at_ms: u64,
}

public struct MerchantRemoved has copy, drop {
    pass_id: address,
    merchant: address,
    remaining_count: u64,
}

// ── Create ─────────────────────────────────────────────────────────

/// The issuer grants a mandate to `agent`. Shares the pass so both parties
/// can reach it; rights are enforced by assertion, not by object ownership.
public fun create_pass(
    agent: address,
    budget: u64,
    auto_threshold: u64,
    max_per_transaction: u64,
    velocity_cap: u64,
    window_ms: u64,
    approved_merchants: vector<address>,
    expiry_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(budget > 0, EInvalidConfig);
    assert!(max_per_transaction > 0, EInvalidConfig);
    assert!(!approved_merchants.is_empty(), EInvalidConfig);
    assert!(expiry_ms > 0, EInvalidConfig);
    // A velocity cap without a window is meaningless.
    assert!(velocity_cap == 0 || window_ms > 0, EInvalidConfig);

    let issuer = ctx.sender();
    let now = clock::timestamp_ms(clock);

    let pass = EdgePassV2 {
        id: object::new(ctx),
        issuer,
        agent,
        budget,
        spent: 0,
        auto_threshold,
        max_per_transaction,
        velocity_cap,
        velocity_used: 0,
        window_ms,
        window_start_ms: now,
        approved_merchants,
        active: true,
        created_at_ms: now,
        expires_at_ms: now + expiry_ms,
    };

    event::emit(PassCreated {
        pass_id: pass.id.to_address(),
        issuer,
        agent,
        budget,
        velocity_cap,
        window_ms,
        merchant_count: pass.approved_merchants.length(),
        expires_at_ms: pass.expires_at_ms,
    });

    transfer::share_object(pass);
}

// ── Execute ────────────────────────────────────────────────────────

/// The agent proposes a payment. Aborts unless every constraint holds.
///
/// Check order is deliberate: liveness, then authorisation, then scope, then
/// per-transaction ceiling, then rate, then budget. Each abort names exactly
/// one reason, so a denial is never ambiguous about why — which is what makes
/// the on-chain record useful rather than merely present.
public fun execute_transaction(
    pass: &mut EdgePassV2,
    amount: u64,
    merchant: address,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(pass.active, EPassInactive);

    let now = clock::timestamp_ms(clock);
    assert!(now <= pass.expires_at_ms, EPassExpired);
    assert!(ctx.sender() == pass.agent, ENotAgent);
    assert!(pass.approved_merchants.contains(&merchant), EMerchantNotApproved);
    assert!(amount <= pass.max_per_transaction, EExceedsMaxPerTransaction);

    // Roll the window forward before testing rate.
    if (pass.velocity_cap > 0 && now >= pass.window_start_ms + pass.window_ms) {
        pass.window_start_ms = now;
        pass.velocity_used = 0;
    };
    if (pass.velocity_cap > 0) {
        assert!(pass.velocity_used + 1 <= pass.velocity_cap, EVelocityExceeded);
    };

    assert!(pass.spent + amount <= pass.budget, EBudgetExceeded);

    // Only reached when every constraint held.
    pass.spent = pass.spent + amount;
    if (pass.velocity_cap > 0) {
        pass.velocity_used = pass.velocity_used + 1;
    };

    event::emit(TransactionExecuted {
        pass_id: pass.id.to_address(),
        agent: pass.agent,
        merchant,
        amount,
        spent_total: pass.spent,
        budget_remaining: pass.budget - pass.spent,
        velocity_used: pass.velocity_used,
        at_ms: now,
    });
}

// ── Revoke ─────────────────────────────────────────────────────────

/// Issuer withdraws all authority. The object persists as an audit record
/// and every subsequent check fails. The agent keeps its wallet and its keys
/// and can do nothing — no redeploy, no key rotation.
public fun revoke_pass(pass: &mut EdgePassV2, clock: &Clock, ctx: &TxContext) {
    assert!(ctx.sender() == pass.issuer, ENotIssuer);
    pass.active = false;

    event::emit(PassRevoked {
        pass_id: pass.id.to_address(),
        issuer: pass.issuer,
        spent_at_revocation: pass.spent,
        at_ms: clock::timestamp_ms(clock),
    });
}

/// Issuer narrows scope. There is deliberately no `add_merchant` — scope can
/// be tightened but never widened, so a mandate can only ever become more
/// restrictive than the one that was granted.
public fun remove_merchant(pass: &mut EdgePassV2, merchant: address, ctx: &TxContext) {
    assert!(ctx.sender() == pass.issuer, ENotIssuer);
    let (found, i) = pass.approved_merchants.index_of(&merchant);
    if (found) {
        pass.approved_merchants.remove(i);
        event::emit(MerchantRemoved {
            pass_id: pass.id.to_address(),
            merchant,
            remaining_count: pass.approved_merchants.length(),
        });
    };
}

// ── Views ──────────────────────────────────────────────────────────

public fun issuer(p: &EdgePassV2): address { p.issuer }
public fun agent(p: &EdgePassV2): address { p.agent }
public fun budget(p: &EdgePassV2): u64 { p.budget }
public fun spent(p: &EdgePassV2): u64 { p.spent }
public fun remaining_budget(p: &EdgePassV2): u64 { p.budget - p.spent }
public fun auto_threshold(p: &EdgePassV2): u64 { p.auto_threshold }
public fun max_per_transaction(p: &EdgePassV2): u64 { p.max_per_transaction }
public fun velocity_cap(p: &EdgePassV2): u64 { p.velocity_cap }
public fun velocity_used(p: &EdgePassV2): u64 { p.velocity_used }
public fun window_ms(p: &EdgePassV2): u64 { p.window_ms }
public fun window_start_ms(p: &EdgePassV2): u64 { p.window_start_ms }
public fun approved_merchants(p: &EdgePassV2): &vector<address> { &p.approved_merchants }
public fun is_active(p: &EdgePassV2): bool { p.active }
public fun expires_at_ms(p: &EdgePassV2): u64 { p.expires_at_ms }

public fun is_merchant_approved(p: &EdgePassV2, merchant: &address): bool {
    p.approved_merchants.contains(merchant)
}

/// Actions still available in the current window, accounting for a roll.
public fun velocity_remaining(p: &EdgePassV2, clock: &Clock): u64 {
    if (p.velocity_cap == 0) return 0;
    let now = clock::timestamp_ms(clock);
    if (now >= p.window_start_ms + p.window_ms) { p.velocity_cap }
    else { p.velocity_cap - p.velocity_used }
}

// ── Tests ──────────────────────────────────────────────────────────
#[test_only] use sui::test_scenario as ts;

#[test_only] const ISSUER: address = @0xA;
#[test_only] const AGENT: address = @0xB;
#[test_only] const M1: address = @0xC1;
#[test_only] const M2: address = @0xC2;
#[test_only] const STRANGER: address = @0xD;

#[test_only]
fun mint(sc: &mut ts::Scenario, clock: &Clock) {
    ts::next_tx(sc, ISSUER);
    create_pass(
        AGENT,
        10_000,      // budget
        1_000,       // auto threshold
        5_000,       // max per transaction
        3,           // velocity cap
        60_000,      // 60s window
        vector[M1, M2],
        86_400_000,  // 24h
        clock,
        ts::ctx(sc),
    );
}

#[test]
fun allows_within_all_limits() {
    let mut sc = ts::begin(ISSUER);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));
    mint(&mut sc, &clock);

    ts::next_tx(&mut sc, AGENT);
    let mut p = ts::take_shared<EdgePassV2>(&sc);
    execute_transaction(&mut p, 2_500, M1, &clock, ts::ctx(&mut sc));
    assert!(spent(&p) == 2_500, 0);
    assert!(remaining_budget(&p) == 7_500, 1);
    assert!(velocity_used(&p) == 1, 2);

    ts::return_shared(p);
    clock::destroy_for_testing(clock);
    ts::end(sc);
}

#[test, expected_failure(abort_code = EBudgetExceeded)]
fun blocks_over_budget() {
    let mut sc = ts::begin(ISSUER);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));
    mint(&mut sc, &clock);

    ts::next_tx(&mut sc, AGENT);
    let mut p = ts::take_shared<EdgePassV2>(&sc);
    // Under max_per_transaction and under velocity — only budget binds.
    execute_transaction(&mut p, 4_000, M1, &clock, ts::ctx(&mut sc));
    execute_transaction(&mut p, 4_000, M1, &clock, ts::ctx(&mut sc));
    execute_transaction(&mut p, 4_000, M1, &clock, ts::ctx(&mut sc));

    ts::return_shared(p);
    clock::destroy_for_testing(clock);
    ts::end(sc);
}

#[test, expected_failure(abort_code = EVelocityExceeded)]
fun blocks_over_velocity_while_budget_is_fine() {
    let mut sc = ts::begin(ISSUER);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));
    mint(&mut sc, &clock);

    ts::next_tx(&mut sc, AGENT);
    let mut p = ts::take_shared<EdgePassV2>(&sc);
    execute_transaction(&mut p, 100, M1, &clock, ts::ctx(&mut sc));
    execute_transaction(&mut p, 100, M1, &clock, ts::ctx(&mut sc));
    execute_transaction(&mut p, 100, M1, &clock, ts::ctx(&mut sc));
    assert!(remaining_budget(&p) == 9_700, 0); // budget clearly fine
    execute_transaction(&mut p, 100, M1, &clock, ts::ctx(&mut sc)); // 4th → rate

    ts::return_shared(p);
    clock::destroy_for_testing(clock);
    ts::end(sc);
}

#[test]
fun window_rolls_and_budget_does_not() {
    let mut sc = ts::begin(ISSUER);
    let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
    mint(&mut sc, &clock);

    ts::next_tx(&mut sc, AGENT);
    let mut p = ts::take_shared<EdgePassV2>(&sc);
    execute_transaction(&mut p, 100, M1, &clock, ts::ctx(&mut sc));
    execute_transaction(&mut p, 100, M1, &clock, ts::ctx(&mut sc));
    execute_transaction(&mut p, 100, M1, &clock, ts::ctx(&mut sc));
    assert!(velocity_used(&p) == 3, 0);

    clock::increment_for_testing(&mut clock, 60_001);
    execute_transaction(&mut p, 100, M1, &clock, ts::ctx(&mut sc));
    assert!(velocity_used(&p) == 1, 1);
    assert!(spent(&p) == 400, 2); // budget did not reset

    ts::return_shared(p);
    clock::destroy_for_testing(clock);
    ts::end(sc);
}

#[test, expected_failure(abort_code = EMerchantNotApproved)]
fun blocks_unapproved_merchant() {
    let mut sc = ts::begin(ISSUER);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));
    mint(&mut sc, &clock);

    ts::next_tx(&mut sc, AGENT);
    let mut p = ts::take_shared<EdgePassV2>(&sc);
    execute_transaction(&mut p, 100, STRANGER, &clock, ts::ctx(&mut sc));

    ts::return_shared(p);
    clock::destroy_for_testing(clock);
    ts::end(sc);
}

#[test, expected_failure(abort_code = EExceedsMaxPerTransaction)]
fun blocks_over_max_per_transaction() {
    let mut sc = ts::begin(ISSUER);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));
    mint(&mut sc, &clock);

    ts::next_tx(&mut sc, AGENT);
    let mut p = ts::take_shared<EdgePassV2>(&sc);
    execute_transaction(&mut p, 5_001, M1, &clock, ts::ctx(&mut sc));

    ts::return_shared(p);
    clock::destroy_for_testing(clock);
    ts::end(sc);
}

#[test, expected_failure(abort_code = ENotAgent)]
fun issuer_cannot_spend() {
    let mut sc = ts::begin(ISSUER);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));
    mint(&mut sc, &clock);

    ts::next_tx(&mut sc, ISSUER);
    let mut p = ts::take_shared<EdgePassV2>(&sc);
    execute_transaction(&mut p, 100, M1, &clock, ts::ctx(&mut sc));

    ts::return_shared(p);
    clock::destroy_for_testing(clock);
    ts::end(sc);
}

#[test, expected_failure(abort_code = ENotIssuer)]
fun agent_cannot_revoke() {
    let mut sc = ts::begin(ISSUER);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));
    mint(&mut sc, &clock);

    ts::next_tx(&mut sc, AGENT);
    let mut p = ts::take_shared<EdgePassV2>(&sc);
    revoke_pass(&mut p, &clock, ts::ctx(&mut sc));

    ts::return_shared(p);
    clock::destroy_for_testing(clock);
    ts::end(sc);
}

#[test, expected_failure(abort_code = EPassInactive)]
fun revoked_pass_blocks_everything() {
    let mut sc = ts::begin(ISSUER);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));
    mint(&mut sc, &clock);

    ts::next_tx(&mut sc, ISSUER);
    let mut p = ts::take_shared<EdgePassV2>(&sc);
    revoke_pass(&mut p, &clock, ts::ctx(&mut sc));
    ts::return_shared(p);

    ts::next_tx(&mut sc, AGENT);
    let mut p2 = ts::take_shared<EdgePassV2>(&sc);
    execute_transaction(&mut p2, 100, M1, &clock, ts::ctx(&mut sc));

    ts::return_shared(p2);
    clock::destroy_for_testing(clock);
    ts::end(sc);
}

#[test, expected_failure(abort_code = EPassExpired)]
fun expired_pass_blocks_everything() {
    let mut sc = ts::begin(ISSUER);
    let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
    mint(&mut sc, &clock);

    clock::increment_for_testing(&mut clock, 86_400_001);

    ts::next_tx(&mut sc, AGENT);
    let mut p = ts::take_shared<EdgePassV2>(&sc);
    execute_transaction(&mut p, 100, M1, &clock, ts::ctx(&mut sc));

    ts::return_shared(p);
    clock::destroy_for_testing(clock);
    ts::end(sc);
}

#[test, expected_failure(abort_code = EMerchantNotApproved)]
fun issuer_can_narrow_scope() {
    let mut sc = ts::begin(ISSUER);
    let clock = clock::create_for_testing(ts::ctx(&mut sc));
    mint(&mut sc, &clock);

    ts::next_tx(&mut sc, ISSUER);
    let mut p = ts::take_shared<EdgePassV2>(&sc);
    remove_merchant(&mut p, M2, ts::ctx(&mut sc));
    ts::return_shared(p);

    ts::next_tx(&mut sc, AGENT);
    let mut p2 = ts::take_shared<EdgePassV2>(&sc);
    execute_transaction(&mut p2, 100, M2, &clock, ts::ctx(&mut sc));

    ts::return_shared(p2);
    clock::destroy_for_testing(clock);
    ts::end(sc);
}
