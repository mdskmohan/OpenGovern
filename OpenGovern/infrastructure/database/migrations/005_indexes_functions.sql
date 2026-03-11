-- =============================================================================
-- Migration 005: Performance Indexes, Functions, Triggers
-- =============================================================================
-- Additional performance optimizations, helper functions, and triggers
-- that maintain data consistency automatically.
-- =============================================================================

-- =============================================================================
-- UPDATED_AT TRIGGER
-- Automatically updates the updated_at column on any row modification.
-- Applied to all tables that have an updated_at column.
-- =============================================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER set_updated_at_users
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_data_assets
    BEFORE UPDATE ON data_assets
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_domains
    BEFORE UPDATE ON domains
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_policies
    BEFORE UPDATE ON policies
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_workflow_instances
    BEFORE UPDATE ON workflow_instances
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_quality_rules
    BEFORE UPDATE ON quality_rules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_data_sources
    BEFORE UPDATE ON data_sources
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- GET_LATEST_ASPECT function
-- Returns the latest version of a specific aspect for an asset.
-- Used heavily by core-api to fetch current metadata.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_latest_aspect(
    p_asset_id   UUID,
    p_aspect_type VARCHAR(100)
)
RETURNS JSONB AS $$
    SELECT payload
    FROM asset_aspects
    WHERE asset_id = p_asset_id
      AND aspect_type = p_aspect_type
    ORDER BY version DESC
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- =============================================================================
-- GET_UPSTREAM_LINEAGE function
-- Recursive traversal: returns all upstream assets up to max_depth hops.
-- Returns: asset URN, depth, path, confidence score.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_upstream_lineage(
    p_urn       VARCHAR(1024),
    p_max_depth INTEGER DEFAULT 10
)
RETURNS TABLE (
    upstream_urn    VARCHAR(1024),
    depth           INTEGER,
    path            TEXT[],
    confidence      DECIMAL(3,2)
) AS $$
WITH RECURSIVE traversal AS (
    -- Base case: direct parents
    SELECT
        le.upstream_urn,
        1 AS depth,
        ARRAY[p_urn, le.upstream_urn] AS path,
        le.confidence
    FROM lineage_edges le
    WHERE le.downstream_urn = p_urn
      AND le.valid_to IS NULL

    UNION ALL

    -- Recursive: parents of parents
    SELECT
        le.upstream_urn,
        t.depth + 1,
        t.path || le.upstream_urn,
        (t.confidence * le.confidence)::DECIMAL(3,2)
    FROM lineage_edges le
    INNER JOIN traversal t ON le.downstream_urn = t.upstream_urn
    WHERE t.depth < p_max_depth
      AND NOT (le.upstream_urn = ANY(t.path))  -- prevent cycles
      AND le.valid_to IS NULL
)
SELECT upstream_urn, depth, path, confidence FROM traversal;
$$ LANGUAGE SQL STABLE;

-- =============================================================================
-- GET_DOWNSTREAM_LINEAGE function
-- Recursive traversal: returns all downstream assets (impact analysis).
-- =============================================================================
CREATE OR REPLACE FUNCTION get_downstream_lineage(
    p_urn       VARCHAR(1024),
    p_max_depth INTEGER DEFAULT 10
)
RETURNS TABLE (
    downstream_urn  VARCHAR(1024),
    depth           INTEGER,
    path            TEXT[],
    confidence      DECIMAL(3,2)
) AS $$
WITH RECURSIVE traversal AS (
    SELECT
        le.downstream_urn,
        1 AS depth,
        ARRAY[p_urn, le.downstream_urn] AS path,
        le.confidence
    FROM lineage_edges le
    WHERE le.upstream_urn = p_urn
      AND le.valid_to IS NULL

    UNION ALL

    SELECT
        le.downstream_urn,
        t.depth + 1,
        t.path || le.downstream_urn,
        (t.confidence * le.confidence)::DECIMAL(3,2)
    FROM lineage_edges le
    INNER JOIN traversal t ON le.upstream_urn = t.downstream_urn
    WHERE t.depth < p_max_depth
      AND NOT (le.downstream_urn = ANY(t.path))
      AND le.valid_to IS NULL
)
SELECT downstream_urn, depth, path, confidence FROM traversal;
$$ LANGUAGE SQL STABLE;

-- =============================================================================
-- COMPUTE_QUALITY_SCORE function
-- Computes the weighted overall quality score from dimension scores.
-- Weights match the quality-service scorer.service.ts implementation.
-- =============================================================================
CREATE OR REPLACE FUNCTION compute_quality_score(
    p_completeness  DECIMAL(5,2),
    p_uniqueness    DECIMAL(5,2),
    p_validity      DECIMAL(5,2),
    p_freshness     DECIMAL(5,2),
    p_accuracy      DECIMAL(5,2),
    p_consistency   DECIMAL(5,2)
)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    score DECIMAL(5,2);
    total_weight DECIMAL(5,2) := 0;
    weighted_sum DECIMAL(10,2) := 0;
BEGIN
    -- Apply weights only for dimensions that have a value (not NULL)
    IF p_completeness IS NOT NULL THEN
        weighted_sum := weighted_sum + (p_completeness * 0.30);
        total_weight := total_weight + 0.30;
    END IF;
    IF p_uniqueness IS NOT NULL THEN
        weighted_sum := weighted_sum + (p_uniqueness * 0.20);
        total_weight := total_weight + 0.20;
    END IF;
    IF p_validity IS NOT NULL THEN
        weighted_sum := weighted_sum + (p_validity * 0.20);
        total_weight := total_weight + 0.20;
    END IF;
    IF p_freshness IS NOT NULL THEN
        weighted_sum := weighted_sum + (p_freshness * 0.15);
        total_weight := total_weight + 0.15;
    END IF;
    IF p_accuracy IS NOT NULL THEN
        weighted_sum := weighted_sum + (p_accuracy * 0.10);
        total_weight := total_weight + 0.10;
    END IF;
    IF p_consistency IS NOT NULL THEN
        weighted_sum := weighted_sum + (p_consistency * 0.05);
        total_weight := total_weight + 0.05;
    END IF;

    IF total_weight = 0 THEN RETURN NULL; END IF;

    -- Normalize by actual weights applied (handles missing dimensions)
    RETURN ROUND((weighted_sum / total_weight)::DECIMAL, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- SYNC QUALITY SCORE to data_assets
-- When a new quality score is inserted, update the denormalized quality_score
-- on the data_assets table for fast filtering.
-- =============================================================================
CREATE OR REPLACE FUNCTION sync_quality_score_to_asset()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE data_assets
    SET quality_score = NEW.overall_score,
        updated_at    = NOW()
    WHERE urn = NEW.asset_urn;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_quality_score
    AFTER INSERT ON quality_scores
    FOR EACH ROW EXECUTE FUNCTION sync_quality_score_to_asset();

-- =============================================================================
-- VIEWS — commonly needed data shapes
-- =============================================================================

-- Asset summary view: most fields needed by catalog list page
CREATE VIEW v_asset_summary AS
SELECT
    da.id,
    da.urn,
    da.entity_type,
    da.name,
    da.fully_qualified_name,
    da.platform,
    da.service_name,
    da.database_name,
    da.schema_name,
    da.certification_status,
    da.sensitivity,
    da.quality_score,
    da.last_ingested_at,
    da.created_at,
    d.name   AS domain_name,
    d.color  AS domain_color,
    u.full_name AS owner_name,
    u.email     AS owner_email,
    u.avatar_url AS owner_avatar,
    -- Latest description from aspect
    get_latest_aspect(da.id, 'description') -> 'description' AS description,
    -- Tag names array for display
    COALESCE(
        (SELECT json_agg(t.display_name)
         FROM asset_tags at2
         JOIN tags t ON t.id = at2.tag_id
         WHERE at2.asset_id = da.id),
        '[]'::json
    ) AS tags
FROM data_assets da
LEFT JOIN domains d  ON d.id  = da.domain_id
LEFT JOIN users   u  ON u.id  = da.owner_id
WHERE da.is_active = TRUE;

-- Workflow queue view: active workflows with context for assignee
CREATE VIEW v_workflow_queue AS
SELECT
    wi.id,
    wi.current_state,
    wi.status,
    wi.asset_urn,
    wi.context,
    wi.due_at,
    wi.created_at,
    wi.updated_at,
    wd.name         AS workflow_name,
    wd.workflow_type,
    wd.sla_hours,
    u_initiator.full_name  AS initiated_by_name,
    u_initiator.avatar_url AS initiated_by_avatar,
    u_assignee.full_name   AS assigned_to_name,
    u_assignee.avatar_url  AS assigned_to_avatar,
    -- Is this overdue?
    CASE WHEN wi.due_at < NOW() AND wi.status = 'active' THEN TRUE ELSE FALSE END AS is_overdue
FROM workflow_instances wi
JOIN workflow_definitions wd ON wd.id = wi.definition_id
JOIN users u_initiator       ON u_initiator.id = wi.initiated_by
LEFT JOIN users u_assignee   ON u_assignee.id  = wi.assigned_to
WHERE wi.status = 'active';

-- =============================================================================
-- FULL TEXT SEARCH — tsvector index for PostgreSQL native search
-- Used as fallback when Elasticsearch is not available.
-- =============================================================================
ALTER TABLE data_assets
    ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(fully_qualified_name, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(platform, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(service_name, '')), 'D')
    ) STORED;

CREATE INDEX idx_assets_fts ON data_assets USING GIN(search_vector);
