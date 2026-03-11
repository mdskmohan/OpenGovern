// ─── API Parameter Types ──────────────────────────────────────────────────────

export type RegisterData = {
  email: string;
  password: string;
  username: string;
  fullName: string;
};

export type AssetListParams = {
  entityType?: string;
  platform?: string;
  domainId?: string;
  certificationStatus?: string;
  sensitivity?: string;
  q?: string;
  page?: number;
  limit?: number;
};

export type SearchParams = {
  q: string;
  type?: string;
  platform?: string;
  from?: number;
  size?: number;
};

export type PolicyListParams = {
  policyType?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
};

// ─── Core User & Auth ───────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string;
  fullName: string;
  avatarUrl?: string;
  roles: Role[];
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
}

// ─── Domains & Tags ─────────────────────────────────────────────────────────

export interface Domain {
  id: string;
  name: string;
  description?: string;
  ownerId?: string;
  color?: string;
  assetCount?: number;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  assetCount?: number;
}

// ─── Data Assets ────────────────────────────────────────────────────────────

export type EntityType = 'table' | 'dashboard' | 'pipeline' | 'ml_model' | 'feature_group' | 'dataset' | 'view' | 'topic';
export type CertificationStatus = 'certified' | 'uncertified' | 'deprecated' | 'pending';
export type SensitivityLevel = 'restricted' | 'confidential' | 'internal' | 'public';

export interface AssetSummary {
  urn: string;
  name: string;
  fullyQualifiedName: string;
  entityType: EntityType;
  platform: string;
  domainId?: string;
  domainName?: string;
  certificationStatus: CertificationStatus;
  sensitivity?: SensitivityLevel;
  ownerName?: string;
  ownerEmail?: string;
  qualityScore?: number;
  lastUpdated: string;
  createdAt: string;
}

export interface SchemaField {
  position: number;
  name: string;
  type: string;
  nullable: boolean;
  description?: string;
  isPrimaryKey?: boolean;
  isPii?: boolean;
  tags?: string[];
}

export interface AssetAspect {
  aspectType: string;
  payload: Record<string, unknown>;
  updatedBy: string;
  updatedAt: string;
}

export interface FullAsset extends AssetSummary {
  description?: string;
  schemaFields?: SchemaField[];
  aspects?: AssetAspect[];
  tags?: Tag[];
  rowCount?: number;
  columnCount?: number;
  lastIngestedAt?: string;
  customMetadata?: Record<string, unknown>;
}

// ─── Lineage ─────────────────────────────────────────────────────────────────

export interface LineageNode {
  urn: string;
  name: string;
  entityType: EntityType;
  platform: string;
}

export interface LineageEdge {
  fromUrn: string;
  toUrn: string;
  type?: string;
}

export interface LineageGraph {
  rootUrn: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
}

// ─── Policies ────────────────────────────────────────────────────────────────

export type PolicyType = 'access' | 'quality' | 'retention' | 'classification' | 'masking';
export type EnforcementMode = 'block' | 'warn' | 'report';

export interface PolicyScope {
  entityTypes?: EntityType[];
  domainIds?: string[];
  tags?: string[];
  platforms?: string[];
}

export interface Policy {
  id: string;
  name: string;
  description?: string;
  policyType: PolicyType;
  enforcementMode: EnforcementMode;
  regoPolicy?: string;
  scope?: PolicyScope;
  isActive: boolean;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Workflows ────────────────────────────────────────────────────────────────

export type WorkflowStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'cancelled' | 'expired';
export type WorkflowType = 'access_request' | 'data_certification' | 'deprecation' | 'ownership_transfer' | 'classification_review';
export type WorkflowEventType = 'initiated' | 'approved' | 'rejected' | 'commented' | 'assigned' | 'escalated' | 'completed';

export interface WorkflowEvent {
  id: string;
  instanceId: string;
  eventType: WorkflowEventType;
  actorId: string;
  actorName: string;
  comment?: string;
  createdAt: string;
}

export interface WorkflowInstance {
  id: string;
  workflowType: WorkflowType;
  assetUrn: string;
  assetName?: string;
  status: WorkflowStatus;
  initiatedBy: string;
  initiatedByName?: string;
  assignedTo?: string;
  assignedToName?: string;
  context?: Record<string, unknown>;
  dueDate?: string;
  events?: WorkflowEvent[];
  createdAt: string;
  updatedAt: string;
}

// ─── Data Quality ────────────────────────────────────────────────────────────

export type QualityDimension = 'completeness' | 'uniqueness' | 'validity' | 'freshness' | 'accuracy' | 'consistency';
export type RuleStatus = 'pass' | 'fail' | 'error' | 'skipped';

export interface QualityRuleResult {
  ruleId: string;
  ruleName: string;
  dimension: QualityDimension;
  status: RuleStatus;
  observedValue?: number;
  threshold?: number;
  description?: string;
}

export interface QualityScore {
  id: string;
  assetUrn: string;
  overallScore: number;
  dimensionScores: Record<QualityDimension, number>;
  ruleResults: QualityRuleResult[];
  runAt: string;
}

export interface QualityRule {
  id: string;
  name: string;
  description?: string;
  dimension: QualityDimension;
  assetUrn?: string;
  expression: string;
  threshold?: number;
  isActive: boolean;
  createdAt: string;
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  status: AlertStatus;
  assetUrn?: string;
  assetName?: string;
  policyId?: string;
  resolvedNote?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  createdAt: string;
}

// ─── Data Sources / Ingestion ─────────────────────────────────────────────────

export type SourceType = 'snowflake' | 'bigquery' | 'postgresql' | 'mysql' | 'dbt' | 'airflow' | 'kafka' | 'redshift' | 'databricks' | 'looker' | 's3' | 'hive';
export type RunStatus = 'running' | 'success' | 'failed' | 'cancelled';

export interface IngestionRun {
  id: string;
  sourceId: string;
  status: RunStatus;
  assetsDiscovered: number;
  assetsCreated: number;
  assetsUpdated: number;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

export interface DataSource {
  id: string;
  name: string;
  sourceType: SourceType;
  config?: Record<string, unknown>;
  schedule?: string;
  isActive: boolean;
  lastRun?: IngestionRun;
  nextRunAt?: string;
  createdAt: string;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  urn: string;
  name: string;
  entityType: EntityType;
  platform: string;
  domainName?: string;
  description?: string;
  score: number;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface AssetStats {
  total: number;
  certified: number;
  byType: Record<string, number>;
  byPlatform: Record<string, number>;
  qualityDistribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
}
