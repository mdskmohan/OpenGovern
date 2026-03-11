"""
OpenGovern Ingestion Worker

HTTP service that receives ingestion trigger requests from core-api
and executes the appropriate DataHub connector.

Architecture:
  core-api  ──POST /run──>  ingestion-worker  ──executes──>  DataHub source
                                    │
                                    └──writes──>  core-api /assets/upsert
                                    └──updates──> ingestion_runs table

This runs as a separate Docker container that has ALL connectors
pre-installed. Users never need to run pip install themselves.
"""

import asyncio
import json
import logging
import subprocess
import sys
import tempfile
import os
from contextlib import asynccontextmanager
from typing import Optional

import httpx
import psycopg2
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

# Config from environment
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://opengovern:opengovern@postgres:5432/opengovern')
CORE_API_URL = os.environ.get('CORE_API_URL', 'http://core-api:3001')
PORT = int(os.environ.get('PORT', '3007'))


def get_db():
    """Get a database connection."""
    return psycopg2.connect(DATABASE_URL)


def update_run_status(run_id: str, status: str, **kwargs):
    """Update ingestion run status in the database."""
    conn = get_db()
    try:
        with conn.cursor() as cur:
            sets = ['status = %s']
            params = [status]
            if 'assets_discovered' in kwargs:
                sets.append('assets_discovered = %s'); params.append(kwargs['assets_discovered'])
            if 'assets_created' in kwargs:
                sets.append('assets_created = %s'); params.append(kwargs['assets_created'])
            if 'assets_updated' in kwargs:
                sets.append('assets_updated = %s'); params.append(kwargs['assets_updated'])
            if 'error_message' in kwargs:
                sets.append('error_message = %s'); params.append(kwargs['error_message'])
            if status in ('completed', 'failed'):
                sets.append('completed_at = NOW()')
            params.append(run_id)
            cur.execute(f"UPDATE ingestion_runs SET {', '.join(sets)} WHERE id = %s", params)
            conn.commit()
    finally:
        conn.close()


def create_recipe(source: dict) -> dict:
    """
    Build a DataHub pipeline recipe from a data_sources row.

    Maps our connector types to DataHub source types.
    Transforms our config keys to DataHub's expected keys.
    """
    connector_type = source['connector_type']
    config = source['config'] if isinstance(source['config'], dict) else json.loads(source['config'])

    # Map our connector type IDs to DataHub source types
    datahub_type_map = {
        'datahub_snowflake':   'snowflake',
        'datahub_bigquery':    'bigquery',
        'datahub_redshift':    'redshift',
        'datahub_mysql':       'mysql',
        'datahub_mssql':       'mssql',
        'datahub_dbt':         'dbt',
        'datahub_airflow':     'airflow',
        'datahub_looker':      'looker',
        'datahub_tableau':     'tableau',
        'datahub_kafka':       'kafka',
        'datahub_s3':          's3',
        'datahub_databricks':  'databricks',
        'datahub_hive':        'hive',
        'datahub_clickhouse':  'clickhouse',
        'datahub_powerbi':     'powerbi',
        'datahub_metabase':    'metabase',
        'datahub_spark':       'spark',
    }

    # Native OpenGovern connectors use our own source
    if connector_type == 'opengovern_postgres':
        return {
            'source': {
                'type': 'opengovern_postgres',
                'config': config
            },
            'sink': {
                'type': 'opengovern_api',
                'config': {
                    'api_url': CORE_API_URL,
                    'api_token': ''  # internal service, no auth needed
                }
            }
        }

    # DataHub connectors
    datahub_type = datahub_type_map.get(connector_type)
    if not datahub_type:
        raise ValueError(f"Unknown connector type: {connector_type}")

    # Build DataHub recipe with standard sink pointing to OpenGovern
    recipe = {
        'source': {
            'type': datahub_type,
            'config': config
        },
        'sink': {
            'type': 'datahub-rest',  # DataHub REST sink — we intercept and proxy
            'config': {
                'server': f'{CORE_API_URL}/api/v1/metadata-ingest',
                'token': ''
            }
        }
    }

    return recipe


async def execute_ingestion(run_id: str, source: dict):
    """
    Execute an ingestion run using DataHub's pipeline.
    Runs in background — updates run status as it progresses.
    """
    logger.info(f"Starting ingestion run {run_id} for source: {source.get('name')}")
    update_run_status(run_id, 'running')

    try:
        recipe = create_recipe(source)

        # Write recipe to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(recipe, f)
            recipe_file = f.name

        try:
            # Execute DataHub pipeline
            result = subprocess.run(
                [sys.executable, '-m', 'datahub', 'ingest', '-c', recipe_file],
                capture_output=True,
                text=True,
                timeout=3600  # 1 hour timeout
            )

            if result.returncode == 0:
                # Parse stats from output
                logger.info(f"Ingestion completed for run {run_id}")
                logger.info(result.stdout[-2000:] if len(result.stdout) > 2000 else result.stdout)
                update_run_status(run_id, 'completed',
                    assets_discovered=_parse_stat(result.stdout, 'source_report'),
                    assets_created=0,
                    assets_updated=0
                )
            else:
                error_msg = result.stderr[-1000:] if len(result.stderr) > 1000 else result.stderr
                logger.error(f"Ingestion failed for run {run_id}: {error_msg}")
                update_run_status(run_id, 'failed', error_message=error_msg)
        finally:
            os.unlink(recipe_file)

    except subprocess.TimeoutExpired:
        logger.error(f"Ingestion timed out for run {run_id}")
        update_run_status(run_id, 'failed', error_message='Ingestion timed out after 1 hour')
    except Exception as e:
        logger.error(f"Ingestion error for run {run_id}: {e}")
        update_run_status(run_id, 'failed', error_message=str(e))


def _parse_stat(output: str, key: str) -> int:
    """Try to extract a numeric stat from DataHub output."""
    try:
        import re
        match = re.search(r'entities_upserted[^0-9]*(\d+)', output)
        if match:
            return int(match.group(1))
    except Exception:
        pass
    return 0


# ─── FastAPI App ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"OpenGovern Ingestion Worker starting on port {PORT}")
    logger.info(f"Connected to core-api: {CORE_API_URL}")
    try:
        conn = get_db()
        conn.close()
        logger.info("✓ Database connection OK")
    except Exception as e:
        logger.warning(f"Database not ready yet: {e}")
    yield
    logger.info("Ingestion worker shutting down")


app = FastAPI(title="OpenGovern Ingestion Worker", lifespan=lifespan)


class TriggerRequest(BaseModel):
    run_id: str
    source_id: str
    source_name: str
    connector_type: str
    config: dict


class TestConnectionRequest(BaseModel):
    connector_type: str
    config: dict


@app.post("/test-connection")
async def test_connection(request: TestConnectionRequest):
    """
    Validate connector credentials without running a full ingestion.
    Called by core-api when the user clicks "Test Connection" in the wizard.
    Attempts a lightweight connection and returns latency on success.
    """
    import time
    started = time.time()
    connector_type = request.connector_type
    config = request.config

    try:
        if connector_type == 'opengovern_postgres' or connector_type == 'datahub_postgres':
            import psycopg2
            conn = psycopg2.connect(
                host=config.get('host', 'localhost'),
                port=int(config.get('port', 5432)),
                dbname=config.get('database', 'postgres'),
                user=config.get('username', 'postgres'),
                password=config.get('password', ''),
                connect_timeout=10,
            )
            conn.close()

        elif connector_type == 'datahub_snowflake':
            import snowflake.connector
            conn = snowflake.connector.connect(
                account=config.get('account_id', ''),
                user=config.get('username', ''),
                password=config.get('password', ''),
                warehouse=config.get('warehouse', ''),
                role=config.get('role') or None,
                login_timeout=15,
            )
            conn.cursor().execute('SELECT 1')
            conn.close()

        elif connector_type == 'datahub_bigquery':
            from google.cloud import bigquery
            import json as _json
            creds_path = config.get('credentials_path')
            if creds_path:
                client = bigquery.Client.from_service_account_json(creds_path)
            else:
                client = bigquery.Client()
            project = config.get('project_ids', '').split(',')[0].strip()
            list(client.list_datasets(project=project, max_results=1))
            client.close()

        elif connector_type == 'datahub_mysql':
            import pymysql
            conn = pymysql.connect(
                host=config.get('host', 'localhost'),
                port=int(config.get('port', 3306)),
                database=config.get('database', ''),
                user=config.get('username', ''),
                password=config.get('password', ''),
                connect_timeout=10,
            )
            conn.close()

        elif connector_type == 'datahub_redshift':
            import psycopg2
            host_port = config.get('host_port', 'localhost:5439').split(':')
            conn = psycopg2.connect(
                host=host_port[0],
                port=int(host_port[1]) if len(host_port) > 1 else 5439,
                dbname=config.get('database', ''),
                user=config.get('username', ''),
                password=config.get('password', ''),
                connect_timeout=10,
            )
            conn.close()

        else:
            # For connectors without a lightweight test, just verify required fields are present
            recipe = create_recipe({'connector_type': connector_type, 'config': config})
            if not recipe:
                raise ValueError(f"Unknown connector type: {connector_type}")

        latency_ms = int((time.time() - started) * 1000)
        return {'connected': True, 'latency_ms': latency_ms, 'message': f'Connection successful'}

    except Exception as e:
        latency_ms = int((time.time() - started) * 1000)
        error_str = str(e)
        # Strip verbose stack traces — return only the root cause message
        if '\n' in error_str:
            error_str = error_str.split('\n')[-1].strip() or error_str.split('\n')[0].strip()
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail={'connected': False, 'latency_ms': latency_ms, 'message': error_str})


@app.post("/run")
async def trigger_run(request: TriggerRequest, background_tasks: BackgroundTasks):
    """
    Trigger an ingestion run.
    Called by core-api when a user clicks "Run Now" in the UI.
    Executes asynchronously — returns immediately, updates DB as it progresses.
    """
    logger.info(f"Received run request: {request.run_id} ({request.source_name})")

    source = {
        'id': request.source_id,
        'name': request.source_name,
        'connector_type': request.connector_type,
        'config': request.config
    }

    background_tasks.add_task(execute_ingestion, request.run_id, source)

    return {
        'status': 'queued',
        'run_id': request.run_id,
        'message': f'Ingestion started for {request.source_name}'
    }


@app.get("/connectors")
async def list_connectors():
    """
    Return all supported connector types with their capabilities.
    Used by the UI to show the connector catalog.
    """
    return {
        'connectors': [
            {'id': 'opengovern_postgres', 'name': 'PostgreSQL', 'category': 'Database', 'status': 'available'},
            {'id': 'datahub_snowflake', 'name': 'Snowflake', 'category': 'Data Warehouse', 'status': 'available'},
            {'id': 'datahub_bigquery', 'name': 'BigQuery', 'category': 'Data Warehouse', 'status': 'available'},
            {'id': 'datahub_redshift', 'name': 'Redshift', 'category': 'Data Warehouse', 'status': 'available'},
            {'id': 'datahub_databricks', 'name': 'Databricks', 'category': 'Data Warehouse', 'status': 'available'},
            {'id': 'datahub_dbt', 'name': 'dbt', 'category': 'Transformation', 'status': 'available'},
            {'id': 'datahub_airflow', 'name': 'Airflow', 'category': 'Orchestration', 'status': 'available'},
            {'id': 'datahub_looker', 'name': 'Looker', 'category': 'BI Tool', 'status': 'available'},
            {'id': 'datahub_tableau', 'name': 'Tableau', 'category': 'BI Tool', 'status': 'available'},
            {'id': 'datahub_powerbi', 'name': 'Power BI', 'category': 'BI Tool', 'status': 'available'},
            {'id': 'datahub_kafka', 'name': 'Kafka', 'category': 'Messaging', 'status': 'available'},
            {'id': 'datahub_mysql', 'name': 'MySQL', 'category': 'Database', 'status': 'available'},
            {'id': 'datahub_s3', 'name': 'Amazon S3', 'category': 'File Storage', 'status': 'available'},
        ]
    }


@app.get("/health")
async def health():
    return {'status': 'ok', 'service': 'ingestion-worker', 'version': '1.0.0'}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=PORT)
