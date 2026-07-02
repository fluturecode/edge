export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RiskDimension = 'SANCTIONS' | 'AML' | 'VELOCITY' | 'COUNTERPARTY' | 'CUSTOM';

export interface RiskSignal {
  dimension:   RiskDimension;
  level:       RiskLevel;
  score:       number;           // 0-100, higher = riskier
  reason:      string;
  provider?:   string;           // e.g. 'chainalysis', 'fireblocks', 'internal'
  metadata?:   Record<string, unknown>;
}

export interface ComplianceResult {
  allowed:         boolean;
  requiresReview:  boolean;      // true = escalate to compliance officer
  riskLevel:       RiskLevel;
  riskScore:       number;       // 0-100, composite
  signals:         RiskSignal[];
  reason:          string;
  screenedAt:      number;       // timestamp
  destination:     string;
}

export interface ComplianceConfig {
  /** 0-100. Transactions above this score are escalated. Default: 30 */
  escalateThreshold?: number;
  /** 0-100. Transactions above this score are blocked. Default: 70 */
  blockThreshold?:    number;
  /** Enable OFAC/sanctions screening. Default: true */
  sanctionsEnabled?:  boolean;
  /** Enable AML pattern detection. Default: true */
  amlEnabled?:        boolean;
  /** Custom risk providers — called in order, results are merged */
  providers?:         RiskProvider[];
  /** Addresses that are always allowed regardless of risk score */
  allowlist?:         string[];
  /** Addresses that are always blocked */
  blocklist?:         string[];
}

export interface RiskProvider {
  name: string;
  screen: (address: string, amount: bigint, metadata?: Record<string, unknown>) => Promise<RiskSignal[]>;
}

/**
 * Built-in Fireblocks compliance provider.
 * Uses Fireblocks' internal AML/OFAC screening APIs.
 * Requires a Fireblocks API client to be passed in.
 */
export function createFireblocksComplianceProvider(
  screeningFn: (address: string) => Promise<{ riskScore: number; isSanctioned: boolean; amlFlags: string[] }>
): RiskProvider {
  return {
    name: 'fireblocks',
    screen: async (address, _amount) => {
      const signals: RiskSignal[] = [];

      try {
        const result = await screeningFn(address);

        if (result.isSanctioned) {
          signals.push({
            dimension: 'SANCTIONS',
            level:     'CRITICAL',
            score:     100,
            reason:    'Address appears on OFAC/sanctions list',
            provider:  'fireblocks',
          });
        }

        if (result.amlFlags.length > 0) {
          signals.push({
            dimension: 'AML',
            level:     result.riskScore > 70 ? 'HIGH' : 'MEDIUM',
            score:     result.riskScore,
            reason:    `AML flags detected: ${result.amlFlags.join(', ')}`,
            provider:  'fireblocks',
            metadata:  { flags: result.amlFlags },
          });
        }

        if (result.riskScore > 0 && !result.isSanctioned && result.amlFlags.length === 0) {
          signals.push({
            dimension: 'COUNTERPARTY',
            level:     result.riskScore > 70 ? 'HIGH' : result.riskScore > 30 ? 'MEDIUM' : 'LOW',
            score:     result.riskScore,
            reason:    `Counterparty risk score: ${result.riskScore}/100`,
            provider:  'fireblocks',
          });
        }
      } catch (error) {
        // Compliance screening failure — fail open with escalation
        signals.push({
          dimension: 'CUSTOM',
          level:     'MEDIUM',
          score:     50,
          reason:    `Compliance screening unavailable — escalating for manual review. Error: ${error instanceof Error ? error.message : String(error)}`,
          provider:  'fireblocks',
        });
      }

      return signals;
    },
  };
}

/**
 * Built-in Chainalysis provider.
 * Pass your Chainalysis KYT screening function.
 */
export function createChainalysisProvider(
  kytFn: (address: string) => Promise<{ riskRating: 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE'; cluster?: string }>
): RiskProvider {
  return {
    name: 'chainalysis',
    screen: async (address) => {
      const signals: RiskSignal[] = [];

      try {
        const result = await kytFn(address);

        const levelMap: Record<string, RiskLevel> = {
          LOW:    'LOW',
          MEDIUM: 'MEDIUM',
          HIGH:   'HIGH',
          SEVERE: 'CRITICAL',
        };

        const scoreMap: Record<string, number> = {
          LOW: 10, MEDIUM: 45, HIGH: 75, SEVERE: 100,
        };

        signals.push({
          dimension: 'COUNTERPARTY',
          level:     levelMap[result.riskRating] ?? 'MEDIUM',
          score:     scoreMap[result.riskRating] ?? 50,
          reason:    `Chainalysis KYT: ${result.riskRating}${result.cluster ? ` (${result.cluster})` : ''}`,
          provider:  'chainalysis',
          metadata:  { cluster: result.cluster },
        });
      } catch (error) {
        signals.push({
          dimension: 'CUSTOM',
          level:     'MEDIUM',
          score:     50,
          reason:    `Chainalysis screening unavailable — escalating for manual review.`,
          provider:  'chainalysis',
        });
      }

      return signals;
    },
  };
}

export class ComplianceEngine {
  private config: Required<ComplianceConfig>;

  constructor(config: ComplianceConfig = {}) {
    this.config = {
      escalateThreshold: config.escalateThreshold ?? 30,
      blockThreshold:    config.blockThreshold    ?? 70,
      sanctionsEnabled:  config.sanctionsEnabled  ?? true,
      amlEnabled:        config.amlEnabled         ?? true,
      providers:         config.providers          ?? [],
      allowlist:         config.allowlist          ?? [],
      blocklist:         config.blocklist          ?? [],
    };
  }

  async screen(
    destinationAddress: string,
    amount:             bigint,
    metadata?:          Record<string, unknown>
  ): Promise<ComplianceResult> {
    const screenedAt = Date.now();

    // ── Allowlist check (fast path) ────────────────────────────────────────
    if (this.config.allowlist.includes(destinationAddress)) {
      return {
        allowed:        true,
        requiresReview: false,
        riskLevel:      'LOW',
        riskScore:      0,
        signals:        [],
        reason:         'Address on compliance allowlist',
        screenedAt,
        destination:    destinationAddress,
      };
    }

    // ── Blocklist check (fast path) ────────────────────────────────────────
    if (this.config.blocklist.includes(destinationAddress)) {
      return {
        allowed:        false,
        requiresReview: false,
        riskLevel:      'CRITICAL',
        riskScore:      100,
        signals: [{
          dimension: 'CUSTOM',
          level:     'CRITICAL',
          score:     100,
          reason:    'Address on compliance blocklist',
        }],
        reason:      'Address on compliance blocklist — transaction blocked',
        screenedAt,
        destination: destinationAddress,
      };
    }

    // ── Run all providers ──────────────────────────────────────────────────
    const allSignals: RiskSignal[] = [];

    await Promise.allSettled(
      this.config.providers.map(async (provider) => {
        try {
          const signals = await provider.screen(destinationAddress, amount, metadata);
          allSignals.push(...signals);
        } catch (error) {
          // Provider failure — add a medium escalation signal
          allSignals.push({
            dimension: 'CUSTOM',
            level:     'MEDIUM',
            score:     50,
            reason:    `Provider "${provider.name}" failed — escalating for review.`,
            provider:  provider.name,
          });
        }
      })
    );

    // ── Compute composite risk score ───────────────────────────────────────
    const compositeScore = allSignals.length > 0
      ? Math.max(...allSignals.map(s => s.score))
      : 0;

    // ── Determine highest risk level ───────────────────────────────────────
    const levelPriority: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const highestLevel: RiskLevel = allSignals.reduce((highest, signal) => {
      return levelPriority.indexOf(signal.level) > levelPriority.indexOf(highest)
        ? signal.level
        : highest;
    }, 'LOW' as RiskLevel);

    // ── Decision ───────────────────────────────────────────────────────────
    const isCritical  = highestLevel === 'CRITICAL' || compositeScore >= 100;
    const isBlocked   = isCritical || compositeScore >= this.config.blockThreshold;
    const isEscalated = !isBlocked && compositeScore >= this.config.escalateThreshold;

    const reason = isCritical
      ? `Transaction blocked — critical compliance risk detected (score: ${compositeScore}/100)`
      : isBlocked
      ? `Transaction blocked — risk score ${compositeScore}/100 exceeds threshold of ${this.config.blockThreshold}`
      : isEscalated
      ? `Transaction escalated for compliance review — risk score ${compositeScore}/100`
      : `Compliance check passed — risk score ${compositeScore}/100`;

    return {
      allowed:        !isBlocked,
      requiresReview: isEscalated,
      riskLevel:      highestLevel,
      riskScore:      compositeScore,
      signals:        allSignals,
      reason,
      screenedAt,
      destination:    destinationAddress,
    };
  }
}
