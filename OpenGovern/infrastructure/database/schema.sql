-- OpenGovern Database Schema
-- PostgreSQL

-- Users and Roles
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_roles (
    user_id INTEGER REFERENCES users(id),
    role_id INTEGER REFERENCES roles(id),
    PRIMARY KEY (user_id, role_id)
);

-- Policies
CREATE TABLE policies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    rego_code TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE policy_assets (
    policy_id INTEGER REFERENCES policies(id),
    asset_id VARCHAR(255), -- OpenMetadata asset ID
    asset_type VARCHAR(255),
    PRIMARY KEY (policy_id, asset_id)
);

-- Workflows
CREATE TABLE workflows (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(255) NOT NULL, -- e.g., certification, approval
    status VARCHAR(255) DEFAULT 'pending',
    created_by INTEGER REFERENCES users(id),
    assigned_to INTEGER REFERENCES users(id),
    asset_id VARCHAR(255),
    data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alerts
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    type VARCHAR(255) NOT NULL, -- policy_violation, ingestion_failure, etc.
    message TEXT NOT NULL,
    severity VARCHAR(255) DEFAULT 'info',
    asset_id VARCHAR(255),
    user_id INTEGER REFERENCES users(id),
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Integrations
CREATE TABLE integrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(255) NOT NULL, -- database, warehouse, etc.
    config JSONB NOT NULL,
    status VARCHAR(255) DEFAULT 'active',
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Metadata Cache (for quick access)
CREATE TABLE metadata_cache (
    asset_id VARCHAR(255) PRIMARY KEY,
    asset_type VARCHAR(255),
    name VARCHAR(255),
    description TEXT,
    owner VARCHAR(255),
    domain VARCHAR(255),
    tags JSONB,
    last_updated TIMESTAMP,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI Search Embeddings (if storing in PG, but better in vector DB)
-- For simplicity, assume vector DB handles embeddings

-- Indexes
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_alerts_type ON alerts(type);
CREATE INDEX idx_alerts_resolved ON alerts(resolved);
CREATE INDEX idx_integrations_type ON integrations(type);
CREATE INDEX idx_metadata_cache_type ON metadata_cache(asset_type);