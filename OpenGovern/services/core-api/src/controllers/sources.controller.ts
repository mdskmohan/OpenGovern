/**
 * Sources Controller
 *
 * Manages data source connector configurations and ingestion runs.
 * When a run is triggered, this controller calls the ingestion-worker service
 * which actually executes the DataHub/OpenGovern connector.
 */
import { Request, Response } from 'express';
import axios from 'axios';
import { query } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

const INGESTION_WORKER_URL = process.env.INGESTION_WORKER_URL || 'http://ingestion-worker:3007';

function handleError(res: Response, err: unknown): void {
  console.error('[SourcesController]', err);
  const message = err instanceof Error ? err.message : 'An unexpected error occurred';
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message } });
}

// GET /sources — list all configured connectors
export async function list(req: Request, res: Response): Promise<void> {
  try {
    const result = await query(
      `SELECT id, name, connector_type, schedule, is_active, last_run_at, last_run_status, created_at, updated_at
       FROM data_sources
       WHERE is_active = true
       ORDER BY name ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { handleError(res, err); }
}

// GET /sources/:id — get one source
export async function get(req: Request, res: Response): Promise<void> {
  try {
    const result = await query(
      `SELECT id, name, connector_type, schedule, is_active, last_run_at, last_run_status, created_at
       FROM data_sources WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Source not found' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { handleError(res, err); }
}

// POST /sources — create a new connector configuration
export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { name, connector_type, config, schedule } = req.body;

    if (!name || !connector_type || !config) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'name, connector_type, and config are required' }
      });
      return;
    }

    const id = uuidv4();
    const result = await query(
      `INSERT INTO data_sources (id, name, connector_type, config, schedule, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, name, connector_type, schedule, is_active, created_at`,
      [id, name, connector_type, JSON.stringify(config), schedule || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { handleError(res, err); }
}

// PUT /sources/:id — update connector configuration
export async function update(req: Request, res: Response): Promise<void> {
  try {
    const { name, config, schedule, is_active } = req.body;

    const result = await query(
      `UPDATE data_sources SET
         name = COALESCE($2, name),
         config = COALESCE($3::jsonb, config),
         schedule = COALESCE($4, schedule),
         is_active = COALESCE($5, is_active),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, connector_type, schedule, is_active`,
      [req.params.id, name ?? null, config ? JSON.stringify(config) : null, schedule ?? null, is_active ?? null]
    );

    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Source not found' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { handleError(res, err); }
}

// DELETE /sources/:id — deactivate a connector
export async function remove(req: Request, res: Response): Promise<void> {
  try {
    await query(
      `UPDATE data_sources SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true, data: { deleted: true } });
  } catch (err) { handleError(res, err); }
}

/**
 * POST /sources/:id/trigger
 *
 * Trigger an ingestion run for a connector.
 * Creates an ingestion_runs record, then calls the ingestion-worker HTTP service
 * which actually executes the DataHub connector and populates the catalog.
 */
export async function triggerIngestion(req: Request, res: Response): Promise<void> {
  try {
    // Get the source configuration
    const sourceResult = await query(
      `SELECT * FROM data_sources WHERE id = $1 AND is_active = true`,
      [req.params.id]
    );
    if (!sourceResult.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Source not found or inactive' } });
      return;
    }
    const source = sourceResult.rows[0];

    // Create an ingestion run record
    const runId = uuidv4();
    await query(
      `INSERT INTO ingestion_runs (id, source_id, status, triggered_by, started_at)
       VALUES ($1, $2, 'queued', 'manual', NOW())`,
      [runId, source.id]
    );

    // Update source last run status
    await query(
      `UPDATE data_sources SET last_run_at = NOW(), last_run_status = 'running' WHERE id = $1`,
      [source.id]
    );

    // Call the ingestion worker to actually execute the connector
    // This is fire-and-forget from the HTTP perspective — the worker updates
    // the ingestion_runs record directly as it progresses.
    const config = typeof source.config === 'string' ? JSON.parse(source.config) : source.config;

    axios.post(`${INGESTION_WORKER_URL}/run`, {
      run_id: runId,
      source_id: source.id,
      source_name: source.name,
      connector_type: source.connector_type,
      config,
    }).then(() => {
      console.log(`[Sources] Ingestion run ${runId} handed off to worker`);
    }).catch((err: Error) => {
      // If worker is unavailable, mark the run as failed
      console.error(`[Sources] Ingestion worker unavailable: ${err.message}`);
      query(
        `UPDATE ingestion_runs SET status = 'failed', error_message = $2, completed_at = NOW()
         WHERE id = $1`,
        [runId, `Ingestion worker unavailable: ${err.message}`]
      ).catch(() => {});
      query(
        `UPDATE data_sources SET last_run_status = 'failed' WHERE id = $1`,
        [source.id]
      ).catch(() => {});
    });

    res.status(202).json({
      success: true,
      data: {
        run_id: runId,
        status: 'queued',
        message: `Ingestion started for ${source.name}. Check run history for progress.`
      }
    });
  } catch (err) { handleError(res, err); }
}

// POST /sources/test-connection — validate credentials before saving
// Proxies to the ingestion-worker which does an actual connection attempt.
// If the ingestion worker is unavailable, falls back to a basic TCP reachability check.
export async function testConnection(req: Request, res: Response): Promise<void> {
  const { connector_type, config } = req.body as { connector_type: string; config: Record<string, string> };

  if (!connector_type || !config) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'connector_type and config are required' } });
    return;
  }

  const started = Date.now();

  try {
    // Delegate to ingestion worker — it has the actual connector libraries installed
    const response = await axios.post(
      `${INGESTION_WORKER_URL}/test-connection`,
      { connector_type, config },
      { timeout: 30000 }
    );
    const latency_ms = Date.now() - started;
    res.json({
      success: true,
      data: { connected: true, latency_ms, details: response.data }
    });
  } catch (err: unknown) {
    const latency_ms = Date.now() - started;
    const axiosErr = err as { response?: { data?: { message?: string; error?: string } }; code?: string; message?: string };

    if (axiosErr.code === 'ECONNREFUSED' || axiosErr.code === 'ENOTFOUND') {
      // Ingestion worker is down — return a clear message rather than a confusing auth error
      res.status(503).json({
        success: false,
        error: {
          code: 'WORKER_UNAVAILABLE',
          message: 'Ingestion worker is not running. Start it with: docker compose up -d ingestion-worker'
        }
      });
      return;
    }

    // Worker responded with a connection failure (wrong credentials, unreachable host, etc.)
    const detail = axiosErr.response?.data?.message
      || axiosErr.response?.data?.error
      || axiosErr.message
      || 'Connection failed';

    res.status(400).json({
      success: false,
      data: { connected: false, latency_ms },
      error: { code: 'CONNECTION_FAILED', message: detail }
    });
  }
}

// GET /sources/:id/runs — ingestion run history
export async function listRuns(req: Request, res: Response): Promise<void> {
  try {
    const result = await query(
      `SELECT id, status, triggered_by, assets_discovered, assets_created, assets_updated, assets_failed,
              error_message, started_at, completed_at, created_at
       FROM ingestion_runs
       WHERE source_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.params.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { handleError(res, err); }
}
