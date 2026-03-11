-- =============================================================================
-- Migration 004: Data Quality + Alerts + Notifications
-- =============================================================================

-- =============================================================================
-- QUALITY_RULES — data quality rules defined per asset (or column)
--
-- Rule types:
--   completeness  → % of non-null values must be above threshold
--   uniqueness    → % of unique values must be above threshold
--   validity      → values must match regex or be in allowed set
--   freshness     → table must have been updated within N hours
--   accuracy      → numeric values must be within a range
--   consistency   → count/value must match another table/column
--   referential   → all values must exist in a reference dataset
--   custom_sql    → custom SQL expression that must return TRUE
-- =============================================================================
CREATE TABLE quality_rules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    asset_urn   VARCHAR(1024) NOT NULL,
    column_name VARCHAR(255),  -- NULL = table-level rule

    -- Rule type determines how config is interpreted
    rule_type   VARCHAR(50) NOT NULL,

    -- Rule configuration (interpreted differently per rule_type)
    -- completeness: { threshold: 95 }
    -- uniqueness:   { threshold: 100 }
    -- validity:     { pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$" }
    -- freshness:    { maxAgeHours: 24 }
    -- accuracy:     { minValue: 0, maxValue: 1000000 }
    -- consistency:  { referenceUrn: "...", referenceColumn: "..." }
    -- custom_sql:   { expression: "SELECT COUNT(*) = 0 FROM orders WHERE amount < 0" }
    config      JSONB NOT NULL,

    -- How bad is a failure?
    -- critical: blocks workflows, fires PagerDuty-level alert
    -- warning:  shows warning in UI, fires email alert
    -- info:     tracked but no active alerts
    severity    VARCHAR(20) NOT NULL DEFAULT 'warning',

    -- Cron schedule for automated checks (inherits from asset source if null)
    schedule    VARCHAR(100),

    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quality_rules_asset    ON quality_rules(asset_urn) WHERE is_active = TRUE;
CREATE INDEX idx_quality_rules_type     ON quality_rules(rule_type);

-- =============================================================================
-- QUALITY_RUNS — one run per asset per scheduled execution
-- =============================================================================
CREATE TABLE quality_runs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_urn   VARCHAR(1024) NOT NULL,
    -- scheduled | manual | post_ingestion
    triggered_by VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    status      VARCHAR(50) NOT NULL DEFAULT 'running',
    started_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quality_runs_asset  ON quality_runs(asset_urn);
CREATE INDEX idx_quality_runs_status ON quality_runs(status);

-- =============================================================================
-- QUALITY_RESULTS — individual rule check results per run
-- =============================================================================
CREATE TABLE quality_results (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id      UUID NOT NULL REFERENCES quality_runs(id) ON DELETE CASCADE,
    rule_id     UUID NOT NULL REFERENCES quality_rules(id),
    asset_urn   VARCHAR(1024) NOT NULL,
    column_name VARCHAR(255),
    passed      BOOLEAN NOT NULL,
    -- The actual measured value (e.g., 94.2 for a completeness check with threshold 95)
    observed_value DECIMAL(10,4),
    -- The configured threshold (e.g., 95)
    threshold_value DECIMAL(10,4),
    -- Human-readable result message
    message     TEXT,
    measured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quality_results_run   ON quality_results(run_id);
CREATE INDEX idx_quality_results_rule  ON quality_results(rule_id);
CREATE INDEX idx_quality_results_asset ON quality_results(asset_urn);

-- =============================================================================
-- QUALITY_SCORES — aggregated quality scores per asset over time
-- This is the time-series history used for trend charts.
-- =============================================================================
CREATE TABLE quality_scores (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_urn           VARCHAR(1024) NOT NULL,
    run_id              UUID REFERENCES quality_runs(id),

    -- Individual dimension scores (0-100)
    completeness_score  DECIMAL(5,2),
    uniqueness_score    DECIMAL(5,2),
    validity_score      DECIMAL(5,2),
    freshness_score     DECIMAL(5,2),
    accuracy_score      DECIMAL(5,2),
    consistency_score   DECIMAL(5,2),

    -- Weighted overall score (formula in quality-service)
    overall_score       DECIMAL(5,2) NOT NULL,

    -- Rules passed vs total rules evaluated
    rules_passed        INTEGER NOT NULL DEFAULT 0,
    rules_total         INTEGER NOT NULL DEFAULT 0,

    measured_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quality_scores_asset ON quality_scores(asset_urn, measured_at DESC);

-- =============================================================================
-- ALERT_DEFINITIONS — configurable alert rules
-- When a trigger condition is met, an alert is created and notifications fired.
-- =============================================================================
CREATE TABLE alert_definitions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    description TEXT,

    -- What triggers this alert?
    -- policy_violation | quality_score_drop | quality_rule_failure | ingestion_failure |
    -- workflow_overdue | certification_expired | data_contract_breach
    trigger_type VARCHAR(100) NOT NULL,

    -- Conditions (interpreted by notification-service per trigger_type)
    -- policy_violation:    { policyIds: [...], severities: ["critical"] }
    -- quality_score_drop:  { assetUrns: [...], dropThreshold: 10, belowScore: 80 }
    -- workflow_overdue:    { workflowTypes: ["access_request"], overdueHours: 48 }
    conditions  JSONB NOT NULL DEFAULT '{}',

    -- Notification channels
    -- [{type: "email", recipients: ["owner", "steward"]},
    --  {type: "slack", webhookUrl: "...", channel: "#data-alerts"},
    --  {type: "webhook", url: "https://..."}]
    channels    JSONB NOT NULL DEFAULT '[]',

    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- ALERTS — individual alert instances (one per event that matches a definition)
-- =============================================================================
CREATE TABLE alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id   UUID REFERENCES alert_definitions(id),

    -- Severity: critical | high | medium | low | info
    severity        VARCHAR(20) NOT NULL DEFAULT 'medium',

    title           VARCHAR(512) NOT NULL,
    message         TEXT NOT NULL,

    -- The asset this alert is about (optional — some alerts are platform-wide)
    asset_urn       VARCHAR(1024),

    -- Extra event data for context (policy decision log, quality result, etc.)
    event_data      JSONB DEFAULT '{}',

    -- Status lifecycle: open → acknowledged → resolved
    status          VARCHAR(20) NOT NULL DEFAULT 'open',

    -- Who is responsible for resolving this?
    assigned_to     UUID REFERENCES users(id),

    -- Resolution details
    resolved_at     TIMESTAMP WITH TIME ZONE,
    resolved_by     UUID REFERENCES users(id),
    resolution_note TEXT,

    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_status   ON alerts(status) WHERE status = 'open';
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_asset    ON alerts(asset_urn) WHERE asset_urn IS NOT NULL;
CREATE INDEX idx_alerts_time     ON alerts(created_at DESC);

-- =============================================================================
-- NOTIFICATION_DELIVERIES — tracks delivery status for each alert channel
-- =============================================================================
CREATE TABLE notification_deliveries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id    UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    channel_type VARCHAR(50) NOT NULL,  -- email | slack | webhook | in_app
    recipient   VARCHAR(512),           -- email address or channel name
    status      VARCHAR(50) NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error  TEXT,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_deliveries_alert  ON notification_deliveries(alert_id);
CREATE INDEX idx_notif_deliveries_status ON notification_deliveries(status) WHERE status = 'pending';

-- =============================================================================
-- NOTIFICATION_SUBSCRIPTIONS — user preferences for receiving notifications
-- =============================================================================
CREATE TABLE notification_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Which events to receive notifications for
    -- ["workflow.assigned", "workflow.approved", "alert.critical", "quality.drop"]
    event_types JSONB NOT NULL DEFAULT '[]',
    -- Preferred channels with config
    -- [{type: "email"}, {type: "slack", webhook: "..."}]
    channels    JSONB NOT NULL DEFAULT '[{"type": "email"}]',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_notif_subs_user ON notification_subscriptions(user_id);
