import { Request } from 'express';

// ─── Database Row Types ────────────────────────────────────────────────────────

export interface DataAsset {
  id: string;
  urn: string;
  entity_type: string;
  name: string;
  fully_qualified_name: string;
  platform: string;
  service_name: string | null;
  database_name: string | null;
  schema_name: string | null;
  description: string | null;
  domain_id: string | null;
  domain_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  certification_status: 'uncertified' | 'certified' | 'deprecated';
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  quality_score: number | null;
  tags: string[];
  custom_properties: Record<string, unknown>;
  source_id: string | null;
  last_ingested_at: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface AssetAspect {
  id: string;
  asset_id: string;
  aspect_type: string;
  version: number;
  payload: Record<string, unknown>;
  created_at: Date;
  created_by: string | null;
}

export interface LineageEdge {
  id: string;
  upstream_urn: string;
  downstream_urn: string;
  transformation_type: string | null;
  transformation_description: string | null;
  field_mappings: FieldMapping[] | null;
  confidence: number;
  source_type: string;
  source_job_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  transformationLogic?: string;
}

export interface Domain {
  id: string;
  name: string;
  description: string | null;
  parent_domain_id: string | null;
  owner_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Tag {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  category: string | null;
  created_at: Date;
}

export interface DataSource {
  id: string;
  name: string;
  source_type: string;
  platform: string;
  connection_config: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface IngestionRun {
  id: string;
  source_id: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'partial';
  started_at: Date | null;
  completed_at: Date | null;
  assets_discovered: number;
  assets_created: number;
  assets_updated: number;
  error_message: string | null;
  run_config: Record<string, unknown>;
  created_at: Date;
}

export interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  user_id: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// ─── Service-Specific Types ────────────────────────────────────────────────────

export interface AssetFilters {
  entityType?: string;
  platform?: string;
  domainId?: string;
  ownerId?: string;
  certificationStatus?: string;
  sensitivity?: string;
  search?: string;
  tags?: string[];
  isActive?: boolean;
}

export interface SearchParams {
  q: string;
  type?: string;
  platform?: string;
  domain?: string;
  sensitivity?: string;
  certificationStatus?: string;
  tags?: string[];
  from?: number;
  size?: number;
}

export interface LineageOptions {
  depth?: number;
  direction?: 'upstream' | 'downstream' | 'both';
  includeColumnLineage?: boolean;
}

export interface CreateAssetRequest {
  urn: string;
  entity_type: string;
  name: string;
  fully_qualified_name: string;
  platform: string;
  service_name?: string;
  database_name?: string;
  schema_name?: string;
  description?: string;
  domain_id?: string;
  sensitivity?: 'public' | 'internal' | 'confidential' | 'restricted';
  tags?: string[];
  custom_properties?: Record<string, unknown>;
  source_id?: string;
}

export interface UpdateAspectRequest {
  payload: Record<string, unknown>;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: string[];
    orgId?: string;
  };
}

// ─── Composite Types ───────────────────────────────────────────────────────────

export interface FullAsset extends DataAsset {
  aspects: {
    schema_metadata?: Record<string, unknown>;
    ownership?: Record<string, unknown>;
    description?: Record<string, unknown>;
    lineage_info?: Record<string, unknown>;
    classification?: Record<string, unknown>;
    quality_metrics?: Record<string, unknown>;
  };
}

export interface AssetSummary {
  id: string;
  urn: string;
  entity_type: string;
  name: string;
  fully_qualified_name: string;
  platform: string;
  domain_name: string | null;
  owner_name: string | null;
  certification_status: string;
  sensitivity: string;
  quality_score: number | null;
  tags: string[];
  last_ingested_at: Date | null;
  updated_at: Date;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LineageNode {
  urn: string;
  depth: number;
  name?: string;
  entity_type?: string;
  platform?: string;
  quality_score?: number | null;
}

export interface LineageGraph {
  nodes: LineageGraphNode[];
  edges: LineageGraphEdge[];
}

export interface LineageGraphNode {
  id: string;
  type: string;
  data: {
    urn: string;
    name: string;
    entityType: string;
    platform: string;
    qualityScore: number | null;
    certificationStatus: string;
    isRoot: boolean;
  };
  position: { x: number; y: number };
}

export interface LineageGraphEdge {
  id: string;
  source: string;
  target: string;
  data?: {
    transformationType?: string | null;
    confidence: number;
  };
}

export interface ImpactAnalysis {
  urn: string;
  directUpstreamCount: number;
  directDownstreamCount: number;
  totalDownstreamCount: number;
  downstreamAssets: Array<{
    urn: string;
    name: string;
    entityType: string;
    ownerName: string | null;
    qualityScore: number | null;
  }>;
}

export interface SearchResult {
  urn: string;
  name: string;
  fullyQualifiedName: string;
  entityType: string;
  platform: string;
  description: string | null;
  domainName: string | null;
  certificationStatus: string;
  sensitivity: string;
  qualityScore: number | null;
  tags: string[];
  score: number;
  highlights: Record<string, string[]>;
}

export interface FullAssetWithGovernance extends FullAsset {
  governance: {
    policies: GovernancePolicy[];
    complianceStatus: 'compliant' | 'warning' | 'violation';
    accessAllowed: boolean;
    reasons: string[];
  };
}

export interface GovernancePolicy {
  id: string;
  name: string;
  decision: 'allow' | 'deny' | 'warn';
  reasons: string[];
}

export interface OpenLineageEvent {
  eventType: 'START' | 'COMPLETE' | 'FAIL' | 'ABORT' | 'OTHER';
  eventTime: string;
  job: {
    namespace: string;
    name: string;
    facets?: Record<string, unknown>;
  };
  inputs: Array<{
    namespace: string;
    name: string;
    facets?: Record<string, unknown>;
  }>;
  outputs: Array<{
    namespace: string;
    name: string;
    facets?: Record<string, unknown>;
  }>;
  run: {
    runId: string;
    facets?: Record<string, unknown>;
  };
}
