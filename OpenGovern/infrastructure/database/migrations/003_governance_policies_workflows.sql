-- =============================================================================
-- Migration 003: Governance — Policies, Workflows, Access Requests
-- =============================================================================
-- The governance layer: the core differentiator of OpenGovern.
-- Neither DataHub nor OpenMetadata has this. This is what Collibra charges
-- $250k/year for. We make it free.
-- =============================================================================

-- =============================================================================
-- POLICIES — governance policy definitions
--
-- Each policy has:
--   - A type (one of 7 governance policy types)
--   - Rego code that gets deployed to OPA for evaluation
--   - A scope (which asset types/domains/tags this applies to)
--   - An enforcement mode (warn vs block)
-- =============================================================================
CREATE TABLE policies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) UNIQUE NOT NULL,
    description     TEXT,

    -- Policy type determines the category of governance concern
    -- access | usage | quality | retention | classification | data_contract | consent
    policy_type     VARCHAR(50) NOT NULL,

    -- Rego code that implements this policy's logic
    -- Deployed to OPA at: /v1/policies/opengovern/{id}
    rego_code       TEXT NOT NULL,

    -- Scope: which assets does this policy apply to?
    -- { entityTypes: ["table", "dashboard"], domains: ["finance"], tags: ["pii"], platforms: [] }
    -- Empty array = applies to all
    scope           JSONB NOT NULL DEFAULT '{}',

    -- How is this policy enforced?
    -- warn:   log violation, notify owner, do NOT block access
    -- block:  return 403 when policy is violated
    -- report: only appears in compliance reports, no runtime enforcement
    enforcement_mode VARCHAR(20) NOT NULL DEFAULT 'warn',

    -- Whether this policy is currently evaluated by OPA
    is_active       BOOLEAN NOT NULL DEFAULT FALSE,

    -- OPA policy path where this is deployed
    -- e.g., opengovern/policies/pii_access_control
    opa_policy_id   VARCHAR(512),

    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policies_type   ON policies(policy_type) WHERE is_active = TRUE;
CREATE INDEX idx_policies_active ON policies(is_active);

-- =============================================================================
-- POLICY_EVALUATIONS — record of every OPA policy decision
-- Used for compliance reporting, audit trails, and debugging.
-- =============================================================================
CREATE TABLE policy_evaluations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id     UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    asset_urn     VARCHAR(1024) NOT NULL,
    user_id       UUID REFERENCES users(id),
    -- allow | deny | warn
    result        VARCHAR(20) NOT NULL,
    -- Full OPA decision log for debugging
    decision_log  JSONB,
    evaluated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policy_evals_policy   ON policy_evaluations(policy_id);
CREATE INDEX idx_policy_evals_asset    ON policy_evaluations(asset_urn);
CREATE INDEX idx_policy_evals_user     ON policy_evaluations(user_id);
CREATE INDEX idx_policy_evals_result   ON policy_evaluations(result);
CREATE INDEX idx_policy_evals_time     ON policy_evaluations(evaluated_at DESC);

-- =============================================================================
-- WORKFLOW_DEFINITIONS — templates for governance workflows
--
-- Defines the state machine, allowed transitions, and automatic actions.
-- Stored as JSONB for flexibility — adding a new workflow type doesn't need
-- a schema change, just a new definition record.
-- =============================================================================
CREATE TABLE workflow_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) UNIQUE NOT NULL,
    description     TEXT,

    -- Workflow type determines the UI form and available actions
    -- access_request | certification | ownership_assignment | deprecation |
    -- policy_exception | data_contract | classification_review | incident
    workflow_type   VARCHAR(100) NOT NULL,

    -- State machine definition
    -- {
    --   states: ["pending", "under_review", "approved", "rejected", "expired"],
    --   initial_state: "pending",
    --   transitions: [{from, to, trigger, allowed_roles}],
    --   on_enter: { approved: ["grant_access", "notify_requester", "set_expiry"] }
    -- }
    definition      JSONB NOT NULL,

    -- SLA: how many hours before this workflow is considered overdue?
    sla_hours       INTEGER DEFAULT 72,

    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Seed built-in workflow definitions
INSERT INTO workflow_definitions (name, description, workflow_type, definition, sla_hours) VALUES
(
    'Access Request',
    'Request access to a protected data asset. Routes to the asset owner for approval.',
    'access_request',
    '{
        "states": ["pending", "under_review", "approved", "rejected", "expired"],
        "initial_state": "pending",
        "transitions": [
            {"from": "pending",      "to": "under_review", "trigger": "submit",  "allowed_roles": ["requester"]},
            {"from": "under_review", "to": "approved",     "trigger": "approve", "allowed_roles": ["data_owner", "data_steward", "admin"]},
            {"from": "under_review", "to": "rejected",     "trigger": "reject",  "allowed_roles": ["data_owner", "data_steward", "admin"]},
            {"from": "approved",     "to": "expired",      "trigger": "expire",  "allowed_roles": ["system"]}
        ],
        "on_enter": {
            "approved": ["grant_platform_access", "notify_requester", "schedule_expiry_reminder"],
            "rejected": ["notify_requester_rejection"],
            "expired":  ["revoke_platform_access", "notify_owner_of_expiry"]
        }
    }',
    48
),
(
    'Data Certification',
    'Certify a data asset as trusted and recommended for use.',
    'certification',
    '{
        "states": ["draft", "submitted", "under_review", "certified", "rejected", "expired"],
        "initial_state": "draft",
        "transitions": [
            {"from": "draft",        "to": "submitted",   "trigger": "submit",  "allowed_roles": ["data_owner", "data_steward"]},
            {"from": "submitted",    "to": "under_review","trigger": "review",  "allowed_roles": ["data_steward", "admin"]},
            {"from": "under_review", "to": "certified",   "trigger": "certify", "allowed_roles": ["data_steward", "admin"]},
            {"from": "under_review", "to": "rejected",    "trigger": "reject",  "allowed_roles": ["data_steward", "admin"]},
            {"from": "certified",    "to": "expired",     "trigger": "expire",  "allowed_roles": ["system"]}
        ],
        "on_enter": {
            "certified": ["apply_certified_tag", "update_asset_certification_status", "notify_owner"],
            "rejected":  ["notify_submitter_with_feedback"],
            "expired":   ["remove_certified_tag", "update_asset_certification_status", "notify_owner"]
        }
    }',
    168
),
(
    'Classification Review',
    'Review AI-suggested data classifications (PII, PCI, PHI) before applying them.',
    'classification_review',
    '{
        "states": ["pending", "under_review", "confirmed", "rejected"],
        "initial_state": "pending",
        "transitions": [
            {"from": "pending",      "to": "under_review", "trigger": "claim",   "allowed_roles": ["data_steward", "data_owner"]},
            {"from": "under_review", "to": "confirmed",    "trigger": "confirm", "allowed_roles": ["data_steward", "data_owner"]},
            {"from": "under_review", "to": "rejected",     "trigger": "reject",  "allowed_roles": ["data_steward", "data_owner"]}
        ],
        "on_enter": {
            "confirmed": ["apply_classification", "propagate_via_lineage", "activate_access_policies"],
            "rejected":  ["log_rejection"]
        }
    }',
    24
),
(
    'Dataset Deprecation',
    'Deprecate a dataset — notify consumers, set a sunset date, then archive.',
    'deprecation',
    '{
        "states": ["draft", "notified", "grace_period", "deprecated", "cancelled"],
        "initial_state": "draft",
        "transitions": [
            {"from": "draft",         "to": "notified",    "trigger": "notify",     "allowed_roles": ["data_owner", "data_steward"]},
            {"from": "notified",      "to": "grace_period","trigger": "start_grace","allowed_roles": ["system"]},
            {"from": "grace_period",  "to": "deprecated",  "trigger": "deprecate",  "allowed_roles": ["system", "data_owner"]},
            {"from": "draft",         "to": "cancelled",   "trigger": "cancel",     "allowed_roles": ["data_owner", "admin"]},
            {"from": "notified",      "to": "cancelled",   "trigger": "cancel",     "allowed_roles": ["data_owner", "admin"]}
        ],
        "on_enter": {
            "notified":    ["run_impact_analysis", "notify_all_consumers", "notify_downstream_owners"],
            "grace_period":["apply_deprecated_tag"],
            "deprecated":  ["archive_asset", "update_asset_status"]
        }
    }',
    336
),
(
    'Policy Exception',
    'Request a time-limited exception to an active governance policy.',
    'policy_exception',
    '{
        "states": ["pending", "under_review", "approved", "rejected", "expired"],
        "initial_state": "pending",
        "transitions": [
            {"from": "pending",      "to": "under_review", "trigger": "submit",  "allowed_roles": ["requester"]},
            {"from": "under_review", "to": "approved",     "trigger": "approve", "allowed_roles": ["data_steward", "admin"]},
            {"from": "under_review", "to": "rejected",     "trigger": "reject",  "allowed_roles": ["data_steward", "admin"]},
            {"from": "approved",     "to": "expired",      "trigger": "expire",  "allowed_roles": ["system"]}
        ],
        "on_enter": {
            "approved": ["create_opa_exception_rule", "notify_requester", "schedule_expiry"],
            "rejected": ["notify_requester_rejection"],
            "expired":  ["revoke_opa_exception_rule", "notify_user"]
        }
    }',
    24
);

-- =============================================================================
-- WORKFLOW_INSTANCES — running instances of workflow definitions
-- One instance per "in-flight" governance action.
-- =============================================================================
CREATE TABLE workflow_instances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id   UUID NOT NULL REFERENCES workflow_definitions(id),
    asset_urn       VARCHAR(1024) NOT NULL,

    -- Current state in the state machine
    current_state   VARCHAR(100) NOT NULL,

    -- Overall status (derived from current_state for easy filtering)
    -- active | completed | cancelled | expired | overdue
    status          VARCHAR(50) NOT NULL DEFAULT 'active',

    -- Context: the form data submitted when creating this workflow instance
    -- For access_request: { reason, duration_days, intended_use }
    -- For certification: { checklist_results, reviewer_notes }
    -- For classification_review: { suggested_classification, confidence, column_name }
    context         JSONB NOT NULL DEFAULT '{}',

    -- Who initiated and who is currently responsible for action
    initiated_by    UUID NOT NULL REFERENCES users(id),
    assigned_to     UUID REFERENCES users(id),

    -- SLA tracking
    due_at          TIMESTAMP WITH TIME ZONE,
    completed_at    TIMESTAMP WITH TIME ZONE,

    -- For access_request: when does granted access expire?
    access_expires_at TIMESTAMP WITH TIME ZONE,

    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wf_instances_asset    ON workflow_instances(asset_urn);
CREATE INDEX idx_wf_instances_status   ON workflow_instances(status) WHERE status = 'active';
CREATE INDEX idx_wf_instances_assignee ON workflow_instances(assigned_to) WHERE status = 'active';
CREATE INDEX idx_wf_instances_def      ON workflow_instances(definition_id);
CREATE INDEX idx_wf_instances_due      ON workflow_instances(due_at) WHERE status = 'active';

-- =============================================================================
-- WORKFLOW_EVENTS — audit trail of every state transition and comment
-- Immutable record. No updates, no deletes.
-- =============================================================================
CREATE TABLE workflow_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id),

    -- The action taken
    event_type  VARCHAR(50) NOT NULL,
    -- state_transition | comment | assignment | system_action

    -- For state transitions
    from_state  VARCHAR(100),
    to_state    VARCHAR(100),
    trigger     VARCHAR(100),

    -- Human-readable comment or system message
    content     TEXT,

    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wf_events_instance ON workflow_events(instance_id);
CREATE INDEX idx_wf_events_user     ON workflow_events(user_id);
