-- =============================================================================
-- Migration 001: Users, Roles, Permissions, Auth
-- =============================================================================
-- Foundation tables for authentication and role-based access control.
-- All IDs are UUIDs (not serial integers) for:
--   1. No information leakage (user #3 doesn't tell you there are only 3 users)
--   2. Safe to expose in APIs
--   3. Distributed-safe (can generate IDs without database roundtrip)
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- USERS
-- =============================================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    username        VARCHAR(100) UNIQUE NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,       -- bcrypt hash, rounds=12
    avatar_url      VARCHAR(512),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at   TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email    ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_active   ON users(is_active) WHERE is_active = TRUE;

-- =============================================================================
-- ROLES
-- Predefined system roles + custom roles created by admins.
-- System roles cannot be deleted (is_system = true).
-- =============================================================================
CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_system   BOOLEAN NOT NULL DEFAULT FALSE,  -- system roles cannot be deleted
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Seed built-in roles
INSERT INTO roles (name, description, is_system) VALUES
    ('admin',         'Full platform access. Can manage users, roles, and all settings.', TRUE),
    ('data_steward',  'Manages data classifications, certifications, and governance workflows.', TRUE),
    ('data_owner',    'Owns data assets. Approves access requests and certifications.', TRUE),
    ('analyst',       'Read access to catalog, lineage, and quality. Can request data access.', TRUE),
    ('viewer',        'Read-only access to the catalog. Cannot modify anything.', TRUE);

-- =============================================================================
-- PERMISSIONS
-- Fine-grained permissions that map to specific API actions.
-- Format: resource:action (e.g., assets:write, policies:manage)
-- =============================================================================
CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource    VARCHAR(100) NOT NULL,  -- assets, policies, workflows, quality, users, settings
    action      VARCHAR(50) NOT NULL,   -- read, write, delete, manage, approve
    description TEXT,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (resource, action)
);

-- Seed all permissions
INSERT INTO permissions (resource, action, description) VALUES
    -- Asset permissions
    ('assets', 'read',    'View assets in the catalog'),
    ('assets', 'write',   'Create and update assets and their metadata'),
    ('assets', 'delete',  'Delete assets from the catalog'),
    -- Policy permissions
    ('policies', 'read',    'View governance policies'),
    ('policies', 'write',   'Create and update policies'),
    ('policies', 'manage',  'Activate, deactivate, and delete policies'),
    -- Workflow permissions
    ('workflows', 'read',    'View workflow instances'),
    ('workflows', 'create',  'Initiate new workflow instances'),
    ('workflows', 'approve', 'Approve or reject workflow steps'),
    ('workflows', 'manage',  'Manage workflow definitions'),
    -- Quality permissions
    ('quality', 'read',   'View quality scores and rules'),
    ('quality', 'write',  'Create and update quality rules'),
    ('quality', 'manage', 'Trigger quality runs, manage definitions'),
    -- Alert permissions
    ('alerts', 'read',   'View alerts and notifications'),
    ('alerts', 'manage', 'Create alert definitions, resolve alerts'),
    -- User management
    ('users', 'read',   'View users and their roles'),
    ('users', 'manage', 'Create, update, and deactivate users. Assign roles.'),
    -- Lineage
    ('lineage', 'read',  'View lineage graphs'),
    ('lineage', 'write', 'Add or update lineage edges'),
    -- Settings
    ('settings', 'read',   'View platform settings'),
    ('settings', 'manage', 'Modify platform settings, connectors, integrations'),
    -- Classifications
    ('classifications', 'read',   'View data classifications'),
    ('classifications', 'manage', 'Create and apply classifications'),
    -- Domains
    ('domains', 'read',   'View data domains'),
    ('domains', 'manage', 'Create and manage data domains');

-- =============================================================================
-- ROLE_PERMISSIONS — maps roles to their permitted actions
-- =============================================================================
CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Assign permissions to built-in roles
-- Admin: everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'admin';

-- Data Steward: read/write most things, manage classifications and workflows
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'data_steward'
  AND (p.resource, p.action) IN (
    ('assets', 'read'), ('assets', 'write'),
    ('policies', 'read'), ('policies', 'write'),
    ('workflows', 'read'), ('workflows', 'create'), ('workflows', 'approve'), ('workflows', 'manage'),
    ('quality', 'read'), ('quality', 'write'), ('quality', 'manage'),
    ('alerts', 'read'), ('alerts', 'manage'),
    ('lineage', 'read'), ('lineage', 'write'),
    ('classifications', 'read'), ('classifications', 'manage'),
    ('domains', 'read'), ('domains', 'manage')
  );

-- Data Owner: read all, write assets they own, approve workflows
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'data_owner'
  AND (p.resource, p.action) IN (
    ('assets', 'read'), ('assets', 'write'),
    ('policies', 'read'),
    ('workflows', 'read'), ('workflows', 'create'), ('workflows', 'approve'),
    ('quality', 'read'),
    ('alerts', 'read'),
    ('lineage', 'read'),
    ('classifications', 'read'),
    ('domains', 'read')
  );

-- Analyst: read everything, create workflows (access requests)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'analyst'
  AND (p.resource, p.action) IN (
    ('assets', 'read'),
    ('policies', 'read'),
    ('workflows', 'read'), ('workflows', 'create'),
    ('quality', 'read'),
    ('alerts', 'read'),
    ('lineage', 'read'),
    ('classifications', 'read'),
    ('domains', 'read')
  );

-- Viewer: read everything, no modifications
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'viewer'
  AND p.action = 'read';

-- =============================================================================
-- USER_ROLES — assigns roles to users (many-to-many)
-- =============================================================================
CREATE TABLE user_roles (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

-- =============================================================================
-- REFRESH_TOKENS — JWT refresh token store with rotation
-- Refresh tokens are rotated on every use (sliding expiry).
-- Revoked tokens stay in the table until cleanup job removes them.
-- =============================================================================
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) UNIQUE NOT NULL,  -- SHA-256 hash of the actual token
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at  TIMESTAMP WITH TIME ZONE,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user    ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash    ON refresh_tokens(token_hash) WHERE revoked = FALSE;
CREATE INDEX idx_refresh_tokens_expiry  ON refresh_tokens(expires_at) WHERE revoked = FALSE;

-- =============================================================================
-- AUDIT_LOGS — immutable record of all platform actions
-- Append-only. No UPDATE or DELETE on this table.
-- =============================================================================
CREATE TABLE audit_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id),        -- NULL for system actions
    action        VARCHAR(100) NOT NULL,             -- e.g., 'asset.created', 'policy.evaluated'
    resource_type VARCHAR(100) NOT NULL,             -- e.g., 'asset', 'policy', 'workflow'
    resource_id   VARCHAR(255),                      -- URN or UUID of the resource
    old_value     JSONB,                             -- previous state (for updates)
    new_value     JSONB,                             -- new state
    metadata      JSONB DEFAULT '{}',               -- extra context (IP, user agent, etc.)
    ip_address    INET,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user     ON audit_logs(user_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_action   ON audit_logs(action);
CREATE INDEX idx_audit_time     ON audit_logs(created_at DESC);
