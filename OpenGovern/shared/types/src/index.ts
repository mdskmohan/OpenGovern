/**
 * @opengovern/types
 *
 * Canonical TypeScript type definitions shared across all OpenGovern services.
 * Every service imports from this package rather than defining its own types,
 * ensuring that the data contracts between services stay in sync.
 *
 * Sections:
 *   1. Asset types      – data asset catalogue entities
 *   2. Policy types     – OPA-backed governance policies
 *   3. Workflow types   – orchestration workflow instances
 *   4. Quality types    – data-quality rules and scores
 *   5. Event types      – Kafka message envelopes
 *   6. API types        – shared HTTP response shapes
 *   7. Auth types       – users, roles, permissions, JWT
 */

// ---------------------------------------------------------------------------
// 1. Asset types
// ---------------------------------------------------------------------------

/**
 * High-level category of a data entity tracked in the catalogue.
 * Drives which aspect templates are available for that entity.
 */
export enum EntityType {
  Dataset = 'dataset',
  Table = 'table',
  Column = 'column',
  Dashboard = 'dashboard',
  Pipeline = 'pipeline',
  Model = 'model',
  Feature = 'feature',
  API = 'api',
}

/**
 * Data sensitivity classification.
 * Used for access-control decisions and audit requirements.
 */
export enum SensitivityLevel {
  Public = 'public',
  Internal = 'internal',
  Confidential = 'confidential',
  Restricted = 'restricted',
  TopSecret = 'top_secret',
}

/**
 * Lifecycle certification of a data asset.
 * Certified assets have passed quality and governance checks.
 */
export enum CertificationStatus {
  Uncertified = 'uncertified',
  Pending = 'pending',
  Certified = 'certified',
  Deprecated = 'deprecated',
  Archived = 'archived',
}

/**
 * Core representation of a data asset in the catalogue.
 * Additional metadata lives in typed aspects attached to the asset.
 */
export interface DataAsset {
  /** UUID v4, primary key */
  id: string;
  /** Human-readable identifier unique within the platform (e.g. "finance.sales.orders") */
  qualifiedName: string;
  /** Display name shown in the UI */
  displayName: string;
  /** Free-text description explaining the purpose of this asset */
  description?: string;
  entityType: EntityType;
  sensitivityLevel: SensitivityLevel;
  certificationStatus: CertificationStatus;
  /** URN of the owner user or group */
  ownerUrn?: string;
  /** URN of the owning team / domain */
  domainUrn?: string;
  /** Arbitrary key-value pairs for custom metadata */
  tags: Record<string, string>;
  /** ISO-8601 timestamp */
  createdAt: string;
  /** ISO-8601 timestamp */
  updatedAt: string;
  /** ISO-8601 timestamp, null if not deleted */
  deletedAt?: string;
  /** Aspects attached to this asset, keyed by AspectType */
  aspects?: Partial<Record<AspectType, AssetAspect>>;
}

/**
 * An aspect is a typed chunk of metadata attached to an asset.
 * The union approach lets individual aspects carry their own strongly-typed
 * payload while all sharing a common envelope.
 */
export interface AssetAspect<T = unknown> {
  aspectType: AspectType;
  /** The structured payload; schema varies by AspectType */
  value: T;
  /** ISO-8601 timestamp when this aspect was last written */
  lastModified: string;
  /** Who or what system last wrote this aspect */
  modifiedBy: string;
}

/**
 * Every kind of aspect that can be attached to a DataAsset.
 * New aspect types should be added here and registered in the ingestion layer.
 */
export enum AspectType {
  SchemaMetadata = 'schemaMetadata',
  DatasetProperties = 'datasetProperties',
  Ownership = 'ownership',
  GlossaryTerms = 'glossaryTerms',
  Tags = 'tags',
  Lineage = 'lineage',
  QualityScore = 'qualityScore',
  InstitutionalMemory = 'institutionalMemory',
  StatisticsMetadata = 'statisticsMetadata',
}

// ---------------------------------------------------------------------------
// 2. Policy types
// ---------------------------------------------------------------------------

/**
 * What the policy is guarding against.
 * Drives which evaluator and OPA package is selected.
 */
export enum PolicyType {
  Access = 'access',
  Quality = 'quality',
  Retention = 'retention',
  Compliance = 'compliance',
  Classification = 'classification',
  Lineage = 'lineage',
}

/**
 * How violations are handled once a policy fires.
 * Warn: alert only. Enforce: block the operation. Audit: log only.
 */
export enum EnforcementMode {
  Warn = 'warn',
  Enforce = 'enforce',
  Audit = 'audit',
  Disabled = 'disabled',
}

/**
 * A governance policy, stored in the policy engine.
 * The `ruleBody` field contains the raw Rego source code evaluated by OPA.
 */
export interface Policy {
  id: string;
  name: string;
  description?: string;
  policyType: PolicyType;
  enforcementMode: EnforcementMode;
  /** Rego source code, evaluated against OpaInput */
  ruleBody: string;
  /** Metadata key-value pairs for filtering / grouping policies */
  labels: Record<string, string>;
  enabled: boolean;
  /** ISO-8601 */
  createdAt: string;
  /** ISO-8601 */
  updatedAt: string;
  createdBy: string;
}

/**
 * The result of evaluating one policy against one asset.
 */
export interface PolicyEvaluation {
  id: string;
  policyId: string;
  assetId: string;
  passed: boolean;
  /** Rego decision path that was evaluated */
  decisionPath: string;
  /** Structured details returned by the Rego rule */
  details: Record<string, unknown>;
  enforcementMode: EnforcementMode;
  /** ISO-8601 */
  evaluatedAt: string;
}

/**
 * Input document sent to OPA during policy evaluation.
 * The Rego rule reads fields from `input.*` to make its decision.
 */
export interface OpaInput {
  asset: DataAsset;
  /** The acting user (may be a service account) */
  user: {
    id: string;
    roles: string[];
    permissions: string[];
  };
  /** Name of the action being performed, e.g. "read", "write", "delete" */
  action: string;
  /** Additional context specific to the action (e.g. requested columns) */
  context: Record<string, unknown>;
}

/**
 * Parsed response from the OPA REST API after evaluating a rule.
 */
export interface OpaResult {
  result: boolean;
  /** Human-readable explanation produced by the Rego `reason` variable */
  reason?: string;
  /** Structured bindings for partial-evaluation results */
  bindings?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 3. Workflow types
// ---------------------------------------------------------------------------

/**
 * Category of automated workflow the orchestration layer can run.
 */
export enum WorkflowType {
  Ingestion = 'ingestion',
  Certification = 'certification',
  QualityCheck = 'quality_check',
  PolicyReview = 'policy_review',
  DataPurge = 'data_purge',
  LineageRefresh = 'lineage_refresh',
  Notification = 'notification',
}

/**
 * Lifecycle states of a workflow run.
 * Terminal states: Completed, Failed, Cancelled.
 */
export enum WorkflowStatus {
  Pending = 'pending',
  Running = 'running',
  Paused = 'paused',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
  TimedOut = 'timed_out',
}

/**
 * A single execution of a workflow definition.
 */
export interface WorkflowInstance {
  id: string;
  /** The workflow definition that was instantiated */
  workflowDefinitionId: string;
  workflowType: WorkflowType;
  status: WorkflowStatus;
  /** Input payload supplied when the workflow was triggered */
  input: Record<string, unknown>;
  /** Output payload written when the workflow reaches a terminal state */
  output?: Record<string, unknown>;
  /** Error message if status === Failed */
  errorMessage?: string;
  /** Step-level progress details */
  steps: WorkflowStepRecord[];
  triggeredBy: string;
  /** ISO-8601 */
  startedAt: string;
  /** ISO-8601, present only once the workflow has finished */
  completedAt?: string;
}

/** Progress record for a single step within a workflow instance */
export interface WorkflowStepRecord {
  stepName: string;
  status: WorkflowStatus;
  /** ISO-8601 */
  startedAt: string;
  /** ISO-8601 */
  completedAt?: string;
  output?: Record<string, unknown>;
  errorMessage?: string;
}

/**
 * Domain events emitted by the orchestration layer.
 * These are published to Kafka and consumed by interested services.
 */
export interface WorkflowEvent {
  workflowInstanceId: string;
  workflowType: WorkflowType;
  status: WorkflowStatus;
  /** ISO-8601 */
  timestamp: string;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 4. Quality types
// ---------------------------------------------------------------------------

/**
 * The kind of quality check a rule performs.
 */
export enum RuleType {
  Completeness = 'completeness',
  Uniqueness = 'uniqueness',
  Validity = 'validity',
  Consistency = 'consistency',
  Timeliness = 'timeliness',
  Accuracy = 'accuracy',
  Referential = 'referential',
  Custom = 'custom',
}

/**
 * How seriously a quality rule failure should be treated.
 */
export enum Severity {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
  Critical = 'critical',
}

/**
 * A single data-quality rule that can be evaluated against an asset.
 */
export interface QualityRule {
  id: string;
  name: string;
  description?: string;
  ruleType: RuleType;
  severity: Severity;
  /** JSON-encoded rule expression (dialect depends on the evaluator) */
  expression: string;
  /** Which columns / fields the rule targets (empty = whole dataset) */
  targetColumns: string[];
  enabled: boolean;
  /** ISO-8601 */
  createdAt: string;
  createdBy: string;
}

/**
 * Aggregated quality score for an asset at a point in time.
 * Scores range from 0 (worst) to 100 (perfect).
 */
export interface QualityScore {
  assetId: string;
  /** Overall composite score [0-100] */
  overallScore: number;
  /** Dimension-level scores, keyed by RuleType */
  dimensionScores: Partial<Record<RuleType, number>>;
  /** How many rules were evaluated */
  totalRulesEvaluated: number;
  /** How many rules passed */
  rulesPassed: number;
  /** How many rules failed */
  rulesFailed: number;
  /** ISO-8601 */
  computedAt: string;
}

/**
 * Outcome of evaluating one QualityRule against one asset.
 */
export interface QualityResult {
  id: string;
  ruleId: string;
  assetId: string;
  passed: boolean;
  severity: Severity;
  /** Fraction of rows/values that passed [0-1] */
  passRate: number;
  /** Number of failing rows / values */
  failedCount: number;
  /** Sample of failing values (capped for performance) */
  failingSamples: unknown[];
  /** ISO-8601 */
  evaluatedAt: string;
}

// ---------------------------------------------------------------------------
// 5. Event types (Kafka message envelopes)
// ---------------------------------------------------------------------------

/**
 * Generic Kafka message envelope.
 * Every message published to a Kafka topic is wrapped in this shape.
 * The `payload` is typed by the specific event interface.
 */
export interface KafkaEvent<T = unknown> {
  /** UUID v4 for exactly-once deduplication */
  eventId: string;
  /** Kafka topic name, also identifies the event kind */
  eventType: string;
  /** Emitting service name (e.g. "ingestion-service") */
  source: string;
  /** ISO-8601 */
  timestamp: string;
  /** Schema version so consumers can evolve independently */
  schemaVersion: string;
  payload: T;
}

/**
 * Emitted whenever a metadata aspect on an asset is created or updated.
 * Consumers can use this to trigger downstream enrichment, indexing, etc.
 */
export interface MetadataChangeEvent {
  assetId: string;
  entityType: EntityType;
  aspectType: AspectType;
  /** The previous aspect value (null on first write) */
  previousValue: unknown | null;
  /** The new aspect value */
  newValue: unknown;
  /** Who or what system performed the change */
  changedBy: string;
}

/**
 * Emitted whenever a policy evaluation produces a decision.
 */
export interface GovernanceEvent {
  policyId: string;
  assetId: string;
  passed: boolean;
  enforcementMode: EnforcementMode;
  action: string;
  userId: string;
  details: Record<string, unknown>;
}

/**
 * Emitted whenever a quality check run completes for an asset.
 */
export interface QualityEvent {
  assetId: string;
  score: QualityScore;
  failedRules: QualityResult[];
  triggeredBy: string;
}

// ---------------------------------------------------------------------------
// 6. API types – shared HTTP response shapes
// ---------------------------------------------------------------------------

/**
 * Standard envelope for list endpoints.
 * All paginated responses return items + pagination metadata so clients can
 * implement cursor-based or offset-based navigation uniformly.
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    /** Total number of matching records (before pagination) */
    total: number;
    /** Number of records per page */
    limit: number;
    /** Zero-based page index */
    offset: number;
    /** Whether there are more pages after this one */
    hasMore: boolean;
  };
}

/**
 * Standard error envelope returned by all services on non-2xx responses.
 * Clients should key on `code` for programmatic error handling.
 */
export interface ApiError {
  /** Stable machine-readable error code (e.g. "NOT_FOUND", "UNAUTHORIZED") */
  code: string;
  /** Human-readable description of the error */
  message: string;
  /** Additional structured context (field-level validation errors, etc.) */
  details?: Record<string, unknown>;
  /** UUID that identifies this specific error occurrence in logs */
  requestId?: string;
}

/**
 * Shape returned by every service's GET /health endpoint.
 */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  /** ISO-8601 */
  timestamp: string;
  /** Optional per-dependency health status */
  dependencies?: Record<string, 'ok' | 'degraded' | 'down'>;
}

// ---------------------------------------------------------------------------
// 7. Auth types
// ---------------------------------------------------------------------------

/**
 * A platform user account.
 * Passwords are never present on this interface – they live only in the DB
 * hashed and salted, and are never returned by any API.
 */
export interface User {
  id: string;
  email: string;
  username: string;
  fullName: string;
  /** Whether the account has been confirmed (email verification, etc.) */
  isActive: boolean;
  /** Whether the account has superuser/admin privileges */
  isSuperuser: boolean;
  /** ISO-8601 */
  lastLoginAt?: string;
  /** ISO-8601 */
  createdAt: string;
  /** ISO-8601 */
  updatedAt: string;
  /** ISO-8601, present if the account has been soft-deleted */
  deletedAt?: string;
}

/**
 * A named collection of permissions.
 * Users are assigned zero or more roles; effective permissions are the union.
 */
export interface Role {
  id: string;
  name: string;
  description?: string;
  /** Whether this role was shipped with the platform and cannot be deleted */
  isSystem: boolean;
  /** ISO-8601 */
  createdAt: string;
  /** ISO-8601 */
  updatedAt: string;
}

/**
 * A granular permission that can be included in a role.
 * Expressed as "resource:action", e.g. "assets:read", "policies:write".
 */
export interface Permission {
  id: string;
  /** The resource the permission governs, e.g. "assets", "policies" */
  resource: string;
  /** The action the permission allows, e.g. "read", "write", "delete", "admin" */
  action: string;
  description?: string;
  /** ISO-8601 */
  createdAt: string;
}

/**
 * Payload encoded inside every JWT access token.
 * The claims follow RFC 7519 conventions where applicable.
 */
export interface JwtPayload {
  /** User UUID (subject) */
  sub: string;
  /** User email */
  email: string;
  /** Username */
  username: string;
  /** Role names the user held at token-issuance time */
  roles: string[];
  /** Flattened "resource:action" permission strings */
  permissions: string[];
  /** Issued-at Unix timestamp (seconds) */
  iat: number;
  /** Expiry Unix timestamp (seconds) */
  exp: number;
  /** Issuer */
  iss: string;
  /** Audience */
  aud: string | string[];
}
