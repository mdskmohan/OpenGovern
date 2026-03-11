# Getting Started with OpenGovern

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Docker Desktop | 4.x+ | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) (already installed) |
| Python | 3.10+ | [python.org](https://python.org) (for ingestion) |

> Docker Desktop is the only hard requirement. It includes Docker Compose and allocates all the resources needed.

---

## Step 1 — Start the Platform

```bash
cd OpenGovern
chmod +x setup.sh
./setup.sh
```

That's it. The script:
1. Generates JWT RS256 keys (first run only)
2. Builds all Docker images (~3-5 minutes first time, 30 seconds after)
3. Starts all 8 services + infrastructure
4. Waits until everything is healthy

**Alternatively, run manually:**
```bash
cd OpenGovern/infrastructure/docker
docker compose up -d
```

---

## Step 2 — Open the App

→ **http://localhost:3000**

Login with:
```
Email:    admin@opengovern.io
Password: admin
```

---

## Step 3 — Connect a Data Source

The Integrations page lets you configure connectors to your data sources.

**For a quick demo with your local PostgreSQL:**
```bash
cd OpenGovern/ingestion
pip install -e .

# Edit the recipe with your DB credentials
cp configs/postgres-recipe.yaml my-recipe.yaml
# Then run:
opengovern ingest --recipe my-recipe.yaml
```

**For Snowflake (via DataHub connector):**
```bash
pip install "acryl-datahub[snowflake]"
opengovern ingest --recipe configs/snowflake-recipe.yaml
```

After ingestion completes, refresh the Catalog page — your tables will appear.

---

## What You Get

| Feature | Where |
|---------|-------|
| **Data Catalog** | `/catalog` — browse all ingested assets |
| **Asset Detail** | Click any asset — Schema, Lineage, Quality, Governance tabs |
| **Policy Engine** | `/policies` — create OPA policies, enforce PII access |
| **Governance Workflows** | `/workflows` — access requests, certifications |
| **Data Quality** | `/data-quality` — quality rules, scores, trends |
| **Lineage Graph** | `/lineage` — interactive upstream/downstream graph |
| **Alerts** | `/alerts` — policy violations, quality drops, ingestion failures |
| **Connector Management** | `/integrations` — add/remove data sources, view run history |
| **AI Search** | TopBar search — semantic search across all assets |
| **Email (Mailhog)** | http://localhost:8025 — view alert emails locally |
| **Kafka UI** | http://localhost:8080 — browse event topics |

---

## Available Data Source Connectors

| Connector | Recipe Type | Install |
|-----------|-------------|---------|
| PostgreSQL (native) | `opengovern_postgres` | included |
| Snowflake | `datahub_snowflake` | `pip install "acryl-datahub[snowflake]"` |
| BigQuery | `datahub_bigquery` | `pip install "acryl-datahub[bigquery]"` |
| Redshift | `datahub_redshift` | `pip install "acryl-datahub[redshift]"` |
| dbt | `datahub_dbt` | `pip install "acryl-datahub[dbt-cloud]"` |
| Airflow | `datahub_airflow` | `pip install "acryl-datahub[airflow]"` |
| Looker | `datahub_looker` | `pip install "acryl-datahub[looker]"` |
| Tableau | `datahub_tableau` | `pip install "acryl-datahub[tableau]"` |
| Kafka | `datahub_kafka` | `pip install "acryl-datahub[kafka]"` |
| MySQL | `datahub_mysql` | `pip install "acryl-datahub[mysql]"` |

---

## Service URLs (when running)

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:3000 | Main UI |
| Auth Service | http://localhost:3010 | JWT auth, users, roles |
| Core API | http://localhost:3001 | Assets, lineage, search |
| Governance | http://localhost:3002 | Policies, workflows |
| Quality | http://localhost:3003 | DQ rules, scoring |
| Notifications | http://localhost:3004 | Alerts, email, Slack |
| AI Service | http://localhost:3006 | Semantic search |
| Kafka UI | http://localhost:8080 | Event browser |
| Mailhog | http://localhost:8025 | Local email viewer |
| Elasticsearch | http://localhost:9200 | Search index |
| OPA | http://localhost:8181 | Policy engine |

---

## Common Commands

```bash
# View all service logs
docker compose logs -f

# View logs for one service
docker compose logs -f core-api

# Restart a single service (after code change)
docker compose restart core-api

# Rebuild after code changes
docker compose build core-api
docker compose up -d core-api

# Stop everything (keeps data)
docker compose down

# Stop and wipe all data (fresh start)
docker compose down -v

# Check service health
docker compose ps
```

---

## Adding OpenAI for AI Search

By default, OpenGovern uses keyword search. For semantic search and auto-classification:

1. Add your OpenAI API key to `OpenGovern/.env`:
   ```
   OPENAI_API_KEY=sk-...
   ```

2. Restart the AI service:
   ```bash
   docker compose restart ai-service
   ```

---

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the complete technical architecture.

**Services:**
- `auth-service` — JWT RS256 authentication, RBAC
- `core-api` — Asset catalog, lineage, search, domains
- `governance-service` — OPA policy engine, workflow state machine
- `quality-service` — Data quality rules, scoring, scheduling
- `notification-service` — Kafka consumer, email, Slack, webhooks
- `ai-service` (Python) — Semantic search, auto-classification, LLM assistant
- `ingestion-framework` (Python CLI) — 50+ data source connectors

**Infrastructure:**
- PostgreSQL 15 — Primary data store
- Elasticsearch 8 — Full-text search
- Kafka (KRaft) — Event streaming (no ZooKeeper)
- Redis 7 — Cache and sessions
- Qdrant — Vector database for AI search
- OPA — Policy evaluation engine
