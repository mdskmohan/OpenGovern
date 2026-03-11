import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../config/database';
import { ScorerService } from '../services/scorer.service';

const scorer = new ScorerService();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

function fail(res: Response, message: string, status = 400): void {
  res.status(status).json({ success: false, error: message });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /quality/scores/:assetUrn/latest
 * Returns the most recent quality score for an asset.
 */
export async function getLatest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { assetUrn } = req.params;

    const result = await pool.query(
      `SELECT qs.*, qr.triggered_by, qr.status as run_status
       FROM quality_scores qs
       JOIN quality_runs qr ON qr.id = qs.run_id
       WHERE qs.asset_urn = $1
       ORDER BY qs.created_at DESC
       LIMIT 1`,
      [assetUrn],
    );

    if (result.rows.length === 0) {
      fail(res, `No quality scores found for asset ${assetUrn}`, 404);
      return;
    }

    ok(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /quality/scores/:assetUrn/history
 * Query params: from (ISO date), to (ISO date)
 */
export async function getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { assetUrn } = req.params;
    const HistorySchema = z.object({
      from: z.string().datetime({ offset: true }).optional(),
      to: z.string().datetime({ offset: true }).optional(),
      limit: z.coerce.number().int().positive().max(500).default(100),
    });

    const { from, to, limit } = HistorySchema.parse(req.query);

    const conditions = ['qs.asset_urn = $1'];
    const params: unknown[] = [assetUrn];
    let idx = 2;

    if (from) {
      conditions.push(`qs.created_at >= $${idx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`qs.created_at <= $${idx++}`);
      params.push(to);
    }

    params.push(limit);

    const result = await pool.query(
      `SELECT qs.id, qs.overall_score, qs.dimension_scores, qs.created_at,
              qr.triggered_by, qr.status as run_status
       FROM quality_scores qs
       JOIN quality_runs qr ON qr.id = qs.run_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY qs.created_at DESC
       LIMIT $${idx}`,
      params,
    );

    ok(res, { items: result.rows, total: result.rows.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      fail(res, err.errors.map((e) => e.message).join(', '));
      return;
    }
    next(err);
  }
}

/**
 * POST /quality/scores/:assetUrn/run
 * Trigger a quality check for an asset.
 */
export async function triggerRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { assetUrn } = req.params;
    // req.user is set by requireAuth middleware
    const triggeredBy = (req as Request & { user?: { id: string; email: string } }).user?.email ?? 'api';

    // Check asset exists
    const assetResult = await pool.query(
      `SELECT urn FROM assets WHERE urn = $1`,
      [assetUrn],
    );
    if (assetResult.rows.length === 0) {
      fail(res, `Asset ${assetUrn} not found`, 404);
      return;
    }

    // Run asynchronously — respond immediately with run ID
    const runResult = await pool.query<{ id: string }>(
      `INSERT INTO quality_runs (asset_urn, status, triggered_by, started_at)
       VALUES ($1, 'running', $2, NOW())
       RETURNING id`,
      [assetUrn, triggeredBy],
    );
    const runId = runResult.rows[0].id;

    // Kick off check without blocking the response
    scorer.runQualityCheck(assetUrn, triggeredBy).catch((err) => {
      console.error(`[ScoresController] Background quality check failed for ${assetUrn}:`, err);
      pool.query(
        `UPDATE quality_runs SET status = 'failed', completed_at = NOW() WHERE id = $1`,
        [runId],
      ).catch(() => {});
    });

    ok(res, { run_id: runId, asset_urn: assetUrn, status: 'running' }, 202);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /quality/dashboard
 * Aggregate statistics for the quality dashboard.
 */
export async function getDashboard(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [summary, distribution, recentRuns, topFailing] = await Promise.all([
      // Overall averages
      pool.query(`
        SELECT
          COUNT(DISTINCT asset_urn)::int AS total_assets_evaluated,
          ROUND(AVG(latest.overall_score)::numeric, 1) AS avg_overall_score,
          COUNT(CASE WHEN latest.overall_score >= 80 THEN 1 END)::int AS healthy_count,
          COUNT(CASE WHEN latest.overall_score >= 50 AND latest.overall_score < 80 THEN 1 END)::int AS warning_count,
          COUNT(CASE WHEN latest.overall_score < 50 THEN 1 END)::int AS critical_count
        FROM (
          SELECT DISTINCT ON (asset_urn) asset_urn, overall_score
          FROM quality_scores
          ORDER BY asset_urn, created_at DESC
        ) AS latest
      `),

      // Score distribution buckets
      pool.query(`
        SELECT
          CASE
            WHEN overall_score >= 90 THEN '90-100'
            WHEN overall_score >= 70 THEN '70-89'
            WHEN overall_score >= 50 THEN '50-69'
            ELSE '0-49'
          END AS bucket,
          COUNT(*)::int AS count
        FROM (
          SELECT DISTINCT ON (asset_urn) asset_urn, overall_score
          FROM quality_scores
          ORDER BY asset_urn, created_at DESC
        ) AS latest
        GROUP BY bucket
        ORDER BY bucket
      `),

      // Recent quality runs (last 10)
      pool.query(`
        SELECT id, asset_urn, status, overall_score, triggered_by, started_at, completed_at
        FROM quality_runs
        ORDER BY started_at DESC
        LIMIT 10
      `),

      // Top 10 assets with lowest scores
      pool.query(`
        SELECT DISTINCT ON (asset_urn)
          asset_urn,
          overall_score,
          dimension_scores,
          created_at
        FROM quality_scores
        ORDER BY asset_urn, created_at DESC
        LIMIT 100
      `).then((r) => ({
        rows: r.rows.sort((a, b) => a.overall_score - b.overall_score).slice(0, 10),
      })),
    ]);

    ok(res, {
      summary: summary.rows[0],
      distribution: distribution.rows,
      recent_runs: recentRuns.rows,
      top_failing_assets: topFailing.rows,
    });
  } catch (err) {
    next(err);
  }
}
