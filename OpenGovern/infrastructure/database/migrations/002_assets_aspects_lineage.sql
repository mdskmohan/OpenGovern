-- =============================================================================
-- Migration 002: Data Assets, Aspects, Lineage, Domains, Tags
-- =============================================================================
-- The core metadata storage layer.
--
-- Design: Aspect-based model (inspired by DataHub's GMS)
--   - data_assets: one row per asset, holds identity fields only
--   - asset_aspects: all metadata as versioned JSONB blobs
--
-- Why aspects?
--   Adding a new metadata concept (e.g., DataContract) never needs a migration.
--   Just add a new aspect_type string. The schema stays stable forever.
-- =============================================================================

-- =============================================================================
-- DOMAINS — logical groupings of related data assets
-- Example: Finance, Customer, Marketing, Operations
-- =============================================================================
CREATE TABLE domains (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) UNIQUE NOT NULL,
    slug        VARCHAR(100) UNIQUE NOT NULL,    -- URL-safe name (e.g., "finance")
    description TEXT,
    color       VARCHAR(7) DEFAULT '#6366f1',    -- hex color for UI badge
    icon        VARCHAR(50),                      -- icon name from Lucide
    owner_id    UUID REFERENCES users(id),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO domains (name, slug, description, color) VALUES
    ('Finance',    'finance',    'Financial data, revenue, and accounting assets', '#16a34a'),
    ('Customer',   'customer',   'Customer profiles, orders, and behavioral data',  '#2563eb'),
    ('Marketing',  'marketing',  'Campaign, attribution, and audience data',         '#9333ea'),
    ('Operations', 'operations', 'Operational metrics, supply chain, and logistics', '#ea580c'),
    ('Product',    'product',    'Product usage, features, and engagement data',     '#0891b2');

-- =============================================================================
-- DATA_ASSETS — the catalog of all data assets
-- One row per asset. This is the identity record only.
-- All descriptive metadata lives in asset_aspects.
-- =============================================================================
CREATE TABLE data_assets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- URN: globally unique identifier across all platforms
    -- Format: urn:opengovern:{platform}:{entity_type}:{fqn}
    -- Example: urn:opengovern:snowflake:table:prod.analytics.revenue
    urn             VARCHAR(1024) UNIQUE NOT NULL,

    -- What kind of asset is this?
    entity_type     VARCHAR(50) NOT NULL,
    -- Allowed values: table, view, dashboard, pipeline, ml_model, topic, feature_group,
    --                 stream, bucket, notebook, api_endpoint, dbt_model, report

    -- Identity fields (denormalized from aspects for fast filtering)
    name            VARCHAR(255) NOT NULL,
    fully_qualified_name VARCHAR(512),       -- e.g., "prod.analytics.revenue_by_region"
    platform        VARCHAR(100) NOT NULL,   -- snowflake, bigquery, postgresql, tableau, dbt...
    service_name    VARCHAR(255),            -- e.g., "Production Snowflake"
    database_name   VARCHAR(255),
    schema_name     VARCHAR(255),

    -- Governance fields (denormalized for fast filtering, source of truth is aspects)
    domain_id       UUID REFERENCES domains(id),
    owner_id        UUID REFERENCES users(id),

    -- Certification status (updated by workflow engine)
    -- Values: uncertified, pending_certification, certified, deprecated
    certification_status VARCHAR(50) DEFAULT 'uncertified',

    -- Sensitivity level (updated by classification engine)
    -- Values: public, internal, confidential, restricted
    sensitivity     VARCHAR(50) DEFAULT 'internal',

    -- Quality score (0-100, updated by quality-service after each run)
    quality_score   DECIMAL(5,2),

    -- Whether this asset is actively tracked (soft delete)
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,

    -- Source tracking
    source          VARCHAR(50),   -- how we learned about this: ingestion, manual, openlineage
    external_id     VARCHAR(512),  -- ID in the source system (e.g., OpenMetadata ID)

    -- Timestamps
    last_ingested_at TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_assets_urn          ON data_assets(urn);
CREATE INDEX idx_assets_entity_type  ON data_assets(entity_type) WHERE is_active = TRUE;
CREATE INDEX idx_assets_platform     ON data_assets(platform) WHERE is_active = TRUE;
CREATE INDEX idx_assets_domain       ON data_assets(domain_id) WHERE is_active = TRUE;
CREATE INDEX idx_assets_owner        ON data_assets(owner_id) WHERE is_active = TRUE;
CREATE INDEX idx_assets_cert_status  ON data_assets(certification_status) WHERE is_active = TRUE;
CREATE INDEX idx_assets_sensitivity  ON data_assets(sensitivity) WHERE is_active = TRUE;
CREATE INDEX idx_assets_name         ON data_assets(name text_pattern_ops);  -- for prefix search

-- =============================================================================
-- ASSET_ASPECTS — versioned metadata for every asset
--
-- aspect_type values and their JSONB payload shapes:
--
--   schema_metadata:
--     { columns: [{name, type, description, nullable, tags[], isPrimaryKey, isForeignKey}] }
--
--   ownership:
--     { owners: [{userId, type}], teams: [{name}] }
--     type values: DATAOWNER, STEWARD, CONSUMER, PRODUCER
--
--   description:
--     { description: "...", readme: "..." }
--
--   lineage_info:
--     { upstreamCount: N, downstreamCount: N, hasColumnLineage: bool }
--     (summary only — full lineage in lineage_edges table)
--
--   classification:
--     { classifications: [{type, confidence, confirmedBy, confirmedAt}], customTags: [] }
--
--   quality_summary:
--     { overallScore: 87.5, lastRunAt: "...", dimensions: {completeness: 95, ...} }
--
--   data_contract:
--     { freshnessHours: 4, completenessThreshold: 99, schemaChangeNoticeWeeks: 2,
--       producerTeam: "...", consumerTeams: [...], status: active|breached|terminated }
--
--   custom_metadata:
--     { [key: string]: string }  -- arbitrary key-value metadata
-- =============================================================================
CREATE TABLE asset_aspects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id    UUID NOT NULL REFERENCES data_assets(id) ON DELETE CASCADE,
    aspect_type VARCHAR(100) NOT NULL,
    version     INTEGER NOT NULL DEFAULT 1,
    payload     JSONB NOT NULL,
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Critical: fetch latest version of a specific aspect efficiently
CREATE UNIQUE INDEX idx_aspects_asset_type_version
    ON asset_aspects(asset_id, aspect_type, version DESC);

CREATE INDEX idx_aspects_asset_id   ON asset_aspects(asset_id);
CREATE INDEX idx_aspects_type       ON asset_aspects(aspect_type);

-- JSONB index for searching within aspect payloads (e.g., find all assets with PII columns)
CREATE INDEX idx_aspects_payload_gin ON asset_aspects USING GIN (payload);

-- =============================================================================
-- TAGS — controlled vocabulary for tagging assets
-- Tags have categories (e.g., "sensitivity", "domain", "business") for organization.
-- =============================================================================
CREATE TABLE tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    category    VARCHAR(100) DEFAULT 'general',  -- sensitivity, compliance, business, technical
    color       VARCHAR(7) DEFAULT '#6b7280',
    description TEXT,
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Seed common governance tags
INSERT INTO tags (name, display_name, category, color) VALUES
    ('pii',          'PII',           'sensitivity', '#dc2626'),
    ('pci',          'PCI',           'sensitivity', '#dc2626'),
    ('phi',          'PHI',           'sensitivity', '#dc2626'),
    ('gdpr',         'GDPR',          'compliance',  '#9333ea'),
    ('ccpa',         'CCPA',          'compliance',  '#9333ea'),
    ('sox',          'SOX',           'compliance',  '#9333ea'),
    ('certified',    'Certified',     'quality',     '#16a34a'),
    ('deprecated',   'Deprecated',    'status',      '#6b7280'),
    ('draft',        'Draft',         'status',      '#ca8a04'),
    ('golden_record','Golden Record', 'quality',     '#f59e0b');

-- =============================================================================
-- ASSET_TAGS — which tags are applied to which assets
-- =============================================================================
CREATE TABLE asset_tags (
    asset_id   UUID NOT NULL REFERENCES data_assets(id) ON DELETE CASCADE,
    tag_id     UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    added_by   UUID REFERENCES users(id),
    added_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (asset_id, tag_id)
);

CREATE INDEX idx_asset_tags_tag ON asset_tags(tag_id);

-- =============================================================================
-- LINEAGE_EDGES — directed graph of data lineage
--
-- Each row is an edge: upstream_urn → downstream_urn
-- Column-level mappings stored in JSONB for flexibility.
--
-- valid_from / valid_to: lineage is time-bounded. When a pipeline is rewritten,
-- the old edge gets a valid_to date and a new edge is created. Historical lineage
-- is preserved for audit and compliance purposes.
-- =============================================================================
CREATE TABLE lineage_edges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    upstream_urn    VARCHAR(1024) NOT NULL,  -- source asset URN
    downstream_urn  VARCHAR(1024) NOT NULL,  -- destination asset URN

    -- What transformation happened between upstream and downstream?
    -- COPY | TRANSFORM | JOIN | AGGREGATE | FILTER | SPLIT | UNION | UNKNOWN
    transformation_type VARCHAR(50) DEFAULT 'UNKNOWN',

    -- Which pipeline/job created this relationship?
    pipeline_urn    VARCHAR(1024),
    pipeline_name   VARCHAR(255),

    -- Column-level lineage mappings
    -- [{upstreamColumn, downstreamColumn, transformationType, expression}]
    column_lineage  JSONB DEFAULT '[]',

    -- How did we learn about this lineage?
    -- dbt | openlineage | sql_parser | query_log | snowflake_access_history | manual
    source          VARCHAR(64) NOT NULL DEFAULT 'unknown',

    -- Confidence: 1.0 = certain (dbt/openlineage), 0.7 = inferred (sql_parser)
    confidence      DECIMAL(3,2) NOT NULL DEFAULT 1.0,

    -- Time bounds for historical lineage
    valid_from      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    valid_to        TIMESTAMP WITH TIME ZONE,  -- NULL = currently active

    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Prevent duplicate active edges from the same source
    UNIQUE (upstream_urn, downstream_urn, source) DEFERRABLE
);

-- Performance indexes for graph traversal
-- These are the critical indexes — without them, recursive CTEs are slow
CREATE INDEX idx_lineage_downstream ON lineage_edges(downstream_urn) WHERE valid_to IS NULL;
CREATE INDEX idx_lineage_upstream   ON lineage_edges(upstream_urn)   WHERE valid_to IS NULL;
CREATE INDEX idx_lineage_pipeline   ON lineage_edges(pipeline_urn)   WHERE pipeline_urn IS NOT NULL;
CREATE INDEX idx_lineage_source     ON lineage_edges(source);

-- =============================================================================
-- DATA_SOURCES — connector configurations (Snowflake, BigQuery, dbt, etc.)
-- Config is stored encrypted in production.
-- =============================================================================
CREATE TABLE data_sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) UNIQUE NOT NULL,
    connector_type  VARCHAR(100) NOT NULL,  -- snowflake, bigquery, postgresql, dbt, looker, tableau...
    config          JSONB NOT NULL,         -- connection parameters (encrypted at rest in prod)
    -- Cron schedule for automated ingestion runs
    -- e.g., "0 */6 * * *" = every 6 hours
    schedule        VARCHAR(100),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      UUID REFERENCES users(id),
    last_run_at     TIMESTAMP WITH TIME ZONE,
    last_run_status VARCHAR(50),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INGESTION_RUNS — history of connector runs
-- =============================================================================
CREATE TABLE ingestion_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id           UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    status              VARCHAR(50) NOT NULL DEFAULT 'queued',
    -- queued | running | completed | failed | cancelled
    triggered_by        VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    -- scheduled | manual | api
    assets_discovered   INTEGER DEFAULT 0,
    assets_created      INTEGER DEFAULT 0,
    assets_updated      INTEGER DEFAULT 0,
    assets_failed       INTEGER DEFAULT 0,
    error_message       TEXT,
    started_at          TIMESTAMP WITH TIME ZONE,
    completed_at        TIMESTAMP WITH TIME ZONE,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ingestion_runs_source ON ingestion_runs(source_id);
CREATE INDEX idx_ingestion_runs_status ON ingestion_runs(status);
