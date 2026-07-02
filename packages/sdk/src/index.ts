// ── Core ───────────────────────────────────────────────────────────────────────
export { EdgePass } from './core/EdgePass';
export { PolicyEngine } from './core/PolicyEngine';
export { ExecutionEngine } from './core/ExecutionEngine';

// ── v1.0.0 — Enterprise hardening ─────────────────────────────────────────────

// Two-phase commit / idempotency
export { IdempotencyRegistry, globalRegistry } from './core/IdempotencyRegistry';
export type { IntentPhase, PendingIntent } from './core/IdempotencyRegistry';

// Hardened withFireblocks HOF
export { createWithFireblocks } from './core/withFireblocks';
export type { WithFireblocksOptions, WithFireblocksResult } from './core/withFireblocks';

// Compliance engine — 6th EdgePass dimension
export {
  ComplianceEngine,
  createFireblocksComplianceProvider,
  createChainalysisProvider,
} from './compliance/ComplianceEngine';
export type {
  RiskLevel,
  RiskDimension,
  RiskSignal,
  ComplianceResult,
  ComplianceConfig,
  RiskProvider,
} from './compliance/ComplianceEngine';

// Dynamic identity binding
export { DynamicIdentityEngine, parseDynamicJWT } from './compliance/DynamicIdentityBinding';
export type {
  DynamicJWTPayload,
  DynamicIdentity,
  IdentityBoundEdgePass,
} from './compliance/DynamicIdentityBinding';

// Real Walrus audit storage
export { WalrusAudit, readAuditBlob, walrusExplorerUrl } from './audit/WalrusAudit';
export type { AuditLogEntry, AuditBundle, WalrusWriteResult } from './audit/WalrusAudit';

// ── Types ──────────────────────────────────────────────────────────────────────
export type {
  EdgePassConfig,
  EdgePassObject,
  TransactionRequest,
  TransactionOutcome,
  PolicyValidation,
  SimulatedDecision,
  SimulationResult,
  BudgetStatus,
  Network,
  EdgeSDKConfig,
} from './utils/types';

// ── Constants ──────────────────────────────────────────────────────────────────
export {
  MIST_PER_SUI,
  NETWORK_URLS,
  EDGE_PACKAGE_ID,
  EDGE_TEMPLATES,
  DEFAULT_GAS_BUDGET,
} from './utils/constants';
export type { EdgePassTemplate } from './utils/constants';