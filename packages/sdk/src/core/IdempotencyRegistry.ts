export type IntentPhase =
  | 'PENDING'    // Edge approved on Sui, awaiting Fireblocks
  | 'SETTLING'   // Fireblocks call in flight
  | 'SETTLED'    // Fireblocks confirmed — terminal state
  | 'FAILED';    // Failed after max retries — terminal state

export interface PendingIntent {
  idempotencyKey:  string;
  edgeDigest:      string;       // Sui transaction digest
  merchant:        string;
  amount:          bigint;
  amountUSD:       string;
  destinationAddress: string;
  phase:           IntentPhase;
  createdAt:       number;
  retryCount:      number;
  lastError?:      string;
  settlementResult?: unknown;    // Fireblocks response on success
}

export class IdempotencyRegistry {
  private intents: Map<string, PendingIntent> = new Map();

  /**
   * Register a new intent after Sui approval.
   * Throws if the key already exists in a non-failed state.
   */
  register(intent: Omit<PendingIntent, 'phase' | 'createdAt' | 'retryCount'>): PendingIntent {
    const existing = this.intents.get(intent.idempotencyKey);

    if (existing) {
      if (existing.phase === 'SETTLED') {
        // Already settled — return existing, caller can short-circuit
        return existing;
      }
      if (existing.phase === 'SETTLING') {
        throw new Error(
          `IdempotencyRegistry: intent "${intent.idempotencyKey}" is already SETTLING. ` +
          `Do not retry while a Fireblocks call is in flight.`
        );
      }
      if (existing.phase === 'PENDING' || existing.phase === 'FAILED') {
        // Safe to re-register for retry — preserve retry count
        const updated: PendingIntent = {
          ...intent,
          phase:     'PENDING',
          createdAt: existing.createdAt,
          retryCount: existing.retryCount,
        };
        this.intents.set(intent.idempotencyKey, updated);
        return updated;
      }
    }

    const newIntent: PendingIntent = {
      ...intent,
      phase:     'PENDING',
      createdAt: Date.now(),
      retryCount: 0,
    };
    this.intents.set(intent.idempotencyKey, newIntent);
    return newIntent;
  }

  /** Transition to SETTLING — Fireblocks call is in flight */
  settling(key: string): void {
    const intent = this.require(key);
    intent.phase = 'SETTLING';
  }

  /** Transition to SETTLED — Fireblocks confirmed */
  settled(key: string, result: unknown): PendingIntent {
    const intent = this.require(key);
    intent.phase = 'SETTLED';
    intent.settlementResult = result;
    return intent;
  }

  /** Transition to FAILED — increment retry count */
  failed(key: string, error: string): PendingIntent {
    const intent = this.require(key);
    intent.phase = 'FAILED';
    intent.lastError = error;
    intent.retryCount += 1;
    return intent;
  }

  /** Get an intent by key — returns undefined if not found */
  get(key: string): PendingIntent | undefined {
    return this.intents.get(key);
  }

  /** True if the intent is already settled */
  isSettled(key: string): boolean {
    return this.intents.get(key)?.phase === 'SETTLED';
  }

  /** True if the intent exists in any state */
  has(key: string): boolean {
    return this.intents.has(key);
  }

  /** Remove a settled or failed intent — cleanup */
  clear(key: string): void {
    this.intents.delete(key);
  }

  /** Get all intents in a given phase — useful for recovery on startup */
  byPhase(phase: IntentPhase): PendingIntent[] {
    return Array.from(this.intents.values()).filter(i => i.phase === phase);
  }

  /** Get all PENDING or FAILED intents that need recovery */
  pendingRecovery(): PendingIntent[] {
    return Array.from(this.intents.values()).filter(
      i => i.phase === 'PENDING' || i.phase === 'FAILED'
    );
  }

  private require(key: string): PendingIntent {
    const intent = this.intents.get(key);
    if (!intent) {
      throw new Error(
        `IdempotencyRegistry: intent "${key}" not found. ` +
        `Call register() before transitioning state.`
      );
    }
    return intent;
  }
}

/** Singleton registry — shared across all withFireblocks() calls in a process */
export const globalRegistry = new IdempotencyRegistry();
