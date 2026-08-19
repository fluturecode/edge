/// EdgePass v1 — superseded by `edge_pass_v2`, but not deprecated dead code.
///
/// This module stays in the repo permanently. v1 passes were minted on Sui
/// mainnet before v2 existed, and they're real, live objects that agents and
/// issuers still depend on — removing this module would strand every one of
/// them with no way to `fetch`, inspect, or `revoke_pass`. The SDK's
/// `create()` no longer targets this module (there is no v1 creation path),
/// but `fetch()`/`revoke()` still route here for any v1 object ID for as
/// long as those objects exist on chain.
///
/// See `edge_pass_v2.move`'s header for what changed and why v2 exists.
module navis::edge_pass {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::clock::{Self, Clock};
    use sui::event;
    use std::string::{Self, String};
    use std::vector;

    // ── Errors ────────────────────────────────────────────────────────────────

    const EPassInactive: u64 = 0;
    const EPassExpired: u64 = 1;
    const EMerchantNotApproved: u64 = 2;
    const EBudgetExceeded: u64 = 3;
    const ENotOwner: u64 = 4;
    const EAmountExceedsEscalationThreshold: u64 = 5;

    // ── Structs ───────────────────────────────────────────────────────────────

    public struct EdgePass has key, store {
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

    // ── Events ────────────────────────────────────────────────────────────────

    public struct PassCreated has copy, drop {
        pass_id: address,
        owner: address,
        budget: u64,
        expires_at: u64,
    }

    public struct TransactionExecuted has copy, drop {
        pass_id: address,
        merchant: String,
        amount: u64,
        spent_total: u64,
    }

    public struct PassRevoked has copy, drop {
        pass_id: address,
        owner: address,
    }

    // ── Functions ─────────────────────────────────────────────────────────────

    /// Creates a new EdgePass and transfers it to the caller.
    public entry fun create_pass(
        budget: u64,
        auto_threshold: u64,
        escalate_threshold: u64,
        expiry_ms: u64,
        approved_merchants: vector<String>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let owner = tx_context::sender(ctx);
        let now = clock::timestamp_ms(clock);
        let expires_at = now + expiry_ms;

        let pass = EdgePass {
            id: object::new(ctx),
            owner,
            budget,
            auto_threshold,
            escalate_threshold,
            approved_merchants,
            spent: 0,
            active: true,
            created_at: now,
            expires_at,
        };

        event::emit(PassCreated {
            pass_id: object::uid_to_address(&pass.id),
            owner,
            budget,
            expires_at,
        });

        transfer::transfer(pass, owner);
    }

    /// Validates and records a transaction against an EdgePass.
    /// Called by apps/agents — not the user directly.
    public entry fun execute_transaction(
        pass: &mut EdgePass,
        amount: u64,
        merchant: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Must be active
        assert!(pass.active, EPassInactive);

        // Must not be expired
        let now = clock::timestamp_ms(clock);
        assert!(now <= pass.expires_at, EPassExpired);

        // Merchant must be approved
        assert!(is_merchant_approved(pass, &merchant), EMerchantNotApproved);

        // Must not exceed remaining budget
        assert!(pass.spent + amount <= pass.budget, EBudgetExceeded);

        // Must not exceed escalation threshold
        assert!(amount <= pass.escalate_threshold, EAmountExceedsEscalationThreshold);

        // Record the spend
        pass.spent = pass.spent + amount;

        event::emit(TransactionExecuted {
            pass_id: object::uid_to_address(&pass.id),
            merchant,
            amount,
            spent_total: pass.spent,
        });
    }

    /// Revokes an EdgePass — only the owner can do this.
    public entry fun revoke_pass(
        pass: &mut EdgePass,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == pass.owner, ENotOwner);
        pass.active = false;

        event::emit(PassRevoked {
            pass_id: object::uid_to_address(&pass.id),
            owner: pass.owner,
        });
    }

    /// Adds a merchant to the approved list — only owner.
    public entry fun add_merchant(
        pass: &mut EdgePass,
        merchant: String,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == pass.owner, ENotOwner);
        vector::push_back(&mut pass.approved_merchants, merchant);
    }

    /// Removes a merchant from the approved list — only owner.
    public entry fun remove_merchant(
        pass: &mut EdgePass,
        merchant: String,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == pass.owner, ENotOwner);
        let len = vector::length(&pass.approved_merchants);
        let mut i = 0;
        while (i < len) {
            if (*vector::borrow(&pass.approved_merchants, i) == merchant) {
                vector::remove(&mut pass.approved_merchants, i);
                return
            };
            i = i + 1;
        };
    }

    // ── View functions ────────────────────────────────────────────────────────

    public fun is_merchant_approved(pass: &EdgePass, merchant: &String): bool {
        let len = vector::length(&pass.approved_merchants);
        let mut i = 0;
        while (i < len) {
            if (vector::borrow(&pass.approved_merchants, i) == merchant) {
                return true
            };
            i = i + 1;
        };
        false
    }

    public fun remaining_budget(pass: &EdgePass): u64 {
        pass.budget - pass.spent
    }

    public fun is_active(pass: &EdgePass): bool {
        pass.active
    }

    public fun owner(pass: &EdgePass): address {
        pass.owner
    }
}
