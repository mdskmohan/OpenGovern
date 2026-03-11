# OpenGovern — Architecture Reference

## Philosophy

OpenGovern is built on three principles:

1. **Own the governance layer completely.** Metadata catalogs (DataHub, OpenMetadata) are table stakes.
   The governance layer — policy enforcement, workflows, data contracts, compliance — is what enterprises
   pay $250k/year for. OpenGovern makes it free and open source.

2. **Reuse, don't reinvent.** We use `acryl-datahub` and `openmetadata-ingestion` as pip libraries
   for connectors. We write zero connector code. 50+ data sources work on day one.

3. **Simple to deploy.** One `docker compose up`. No Java. No ZooKeeper. Runs on 8GB RAM.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OpenGovern                                   │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │          Frontend  (Next.js 14, TypeScript, Tailwind)          │  │
│  │          Notion-quality UI. Users never see the internals.     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                ↕ REST API                             │
│  ┌──────────────┐  ┌────────────────┐  ┌──────────┐  ┌──────────┐  │
│  │ auth-service │  │   core-api     │  │governance│  │ quality  │  │
│  │  JWT RS256   │  │ assets/lineage │  │OPA+Rego  │  │ DQ rules │  │
│  │  RBAC        │  │ search/aspects │  │workflows │  │ scoring  │  │
│  └──────────────┘  └────────────────┘  └──────────┘  └──────────┘  │
│                                                                       │
│  ┌──────────────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  notification-service│  │  ai-service  │  │ingestion-framework│  │
│  │  Kafka→email/Slack   │  │  FastAPI     │  │  Python CLI       │  │
│  └──────────────────────┘  │  embeddings  │  │  acryl-datahub +  │  │
│                             │  LLM/Qdrant  │  │  OG sink (100 ln) │  │
│                             └──────────────┘  └───────────────────┘  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Infrastructure                                               │   │
│  │  PostgreSQL 15  │  Elasticsearch 8  │  Kafka (KRaft)         │   │
│  │  Redis 7        │  Qdrant           │  OPA 0.58              │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Services

| Service | Port | Language | Responsibility |
|---------|------|----------|----------------|
| auth-service | 3010 | Node.js/TypeScript | JWT RS256 auth, RBAC, users, roles |
| core-api | 3001 | Node.js/TypeScript | Asset CRUD, aspect model, lineage, search |
| governance-service | 3002 | Node.js/TypeScript | OPA policies, workflow engine |
| quality-service | 3003 | Node.js/TypeScript | DQ rules, scoring, scheduling |
| notification-service | 3004 | Node.js/TypeScript | Kafka consumer, email, Slack, webhooks |
| ai-service | 3006 | Python/FastAPI | Embeddings, semantic search, classification |
| ingestion-framework | CLI | Python | Connector pipeline, OpenGovern sink |
| frontend | 3000 | Next.js | UI |

---

## Key Architectural Decisions

### Decision 1: RS256 JWT (Asymmetric Keys)

auth-service signs JWTs with a private key (RS256). All other services validate tokens
using only the public key — fetched once at startup. No synchronous auth call per request.
The private key never leaves auth-service.

### Decision 2: Aspect Model in PostgreSQL

Every data asset has a base row in `data_assets` plus N rows in `asset_aspects`:

```
data_assets:   one row per asset (id, urn, name, platform, ...)
asset_aspects: one row per metadata concept per asset version

aspect_type values:
  schema_metadata  → columns, types, constraints
  ownership        → owners, stewards
  description      → description, readme
  lineage          → upstream/downstream links
  classification   → sensitivity, PII tags
  quality          → latest quality score
  data_contract    → SLA, freshness, schema stability
  custom_metadata  → user-defined key/value pairs
```

Adding a new metadata concept requires zero schema migration — just a new aspect_type string.
This is the same model DataHub uses at LinkedIn scale, implemented in PostgreSQL.

### Decision 3: OPA for Policy Enforcement

All policy decisions go through governance-service which calls OPA. No other service
talks to OPA directly. OPA evaluates Rego policies and returns allow/deny with reasons.
Enforcement is real — not advisory. API returns 403. Access request workflow triggers.

### Decision 4: Kafka KRaft Mode (No ZooKeeper)

Kafka 3.3+ supports KRaft mode — runs without ZooKeeper. One less service to operate.
All async events (metadata changes, policy violations, quality drops, workflow transitions)
flow through Kafka. Services are fully decoupled.

### Decision 5: Python for Ingestion and AI

The data engineering ecosystem lives in Python. `acryl-datahub` gives us 50+ connectors.
We write one custom sink (~100 lines) that receives DataHub MCE events and POSTs to our API.
Zero connector code written from scratch. Any DataHub connector works with OpenGovern.

### Decision 6: Lineage in PostgreSQL Recursive CTEs

Lineage is a directed graph stored in `lineage_edges`. Traversal uses PostgreSQL
recursive CTEs. No graph database needed at enterprise scale (< 10M edges).
Performance: sub-100ms for 10-hop traversal on 1M edge graphs with proper indexes.

---

## Data Flow

### Ingestion Flow
```
opengovern ingest --recipe snowflake.yaml
  → acryl-datahub SnowflakeSource reads metadata
  → OpenGovernSink translates MCE → aspect model
  → POST /api/v1/assets → core-api → PostgreSQL
  → core-api publishes to Kafka: metadata.changes
  → Elasticsearch consumer indexes asset
  → ai-service generates embedding → Qdrant
  → classification checks → if PII detected → workflow created
```

### Policy Enforcement Flow
```
GET /api/v1/assets/:id
  → core-api validates JWT (public key, no network call)
  → core-api calls governance-service: POST /evaluate
  → governance-service builds OPA input context
  → OPA evaluates all active Rego policies
  → ALLOW → return asset data
  → DENY  → 403 + { workflow: "access_request", asset_id }
```

### Governance Workflow Flow
```
User submits access request
  → governance-service creates workflow instance (state: pending)
  → Kafka event: governance.events / WORKFLOW_CREATED
  → notification-service consumes → emails data owner
  → Data owner approves in UI
  → governance-service transitions state: pending → approved
  → on_enter actions: grant_access, set_expiry
  → Kafka event: governance.events / WORKFLOW_APPROVED
  → notification-service → emails requester
```

---

## Kafka Topics

| Topic | Producer | Consumers | Purpose |
|-------|----------|-----------|---------|
| `metadata.changes` | core-api | Elasticsearch indexer, ai-service | Asset create/update/delete |
| `governance.events` | governance-service | notification-service | Policy violations, workflow transitions |
| `quality.events` | quality-service | notification-service | DQ score drops, rule failures |
| `lineage.events` | core-api, ingestion | (future: lineage analytics) | Lineage edge create/update |
| `audit.events` | all services | (append-only audit store) | Complete audit trail |

---

## URN Format

Every asset has a globally unique URN:
```
urn:opengovern:{platform}:{entity_type}:{database}.{schema}.{name}

Examples:
  urn:opengovern:snowflake:table:prod.analytics.revenue_by_region
  urn:opengovern:bigquery:table:myproject.dataset.orders
  urn:opengovern:tableau:dashboard:sales.Revenue Dashboard
  urn:opengovern:dbt:model:jaffle_shop.stg_orders
  urn:opengovern:airflow:pipeline:daily_revenue_etl
```

URNs are the glue for cross-platform lineage. Lineage edges reference upstream/downstream URNs.
Connectors from different platforms can stitch together because they use the same URN format.

---

## OpenLineage Integration

OpenGovern runs a lightweight OpenLineage-compatible HTTP endpoint on core-api:
```
POST /api/v1/lineage/openlineage
```

Tools that support OpenLineage (Airflow, Spark, dbt, Flink) POST events here automatically.
No polling. No parsing query logs. Runtime lineage captured as it happens.

---

## Directory Structure

```
OpenGovern/
├── services/           Node.js/TypeScript microservices
│   ├── auth-service/
│   ├── core-api/
│   ├── governance-service/
│   ├── quality-service/
│   └── notification-service/
├── ingestion/          Python ingestion framework
├── ai/                 Python AI service (FastAPI)
├── frontend/           Next.js 14 application
├── shared/             Shared TypeScript types (internal package)
├── infrastructure/
│   ├── database/migrations/   PostgreSQL migrations
│   ├── docker/                Docker Compose files
│   └── opa/                   OPA configuration
└── docs/               Architecture, API reference, guides
```
