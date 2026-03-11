/**
 * Quality score and run model – database query layer.
 *
 * quality_scores: stores computed quality scores per asset over time.
 * quality_runs:   tracks each evaluation run (status, timing, results).
 */

import { query } from '../config/database';
import {
  QualityScore,
  QualityScoreRow,
  QualityRun,
  QualityRunRow,
  QualityResult,
  DimensionScores,
  DashboardStats,
  RunStatus,
} from '../types';

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function rowToScore(row: QualityScoreRow): QualityScore {
  return {
    id: row.id,
    assetUrn: row.asset_urn,
    overallScore: Number(row.overall_score),
    dimensions: {
      completeness: row.completeness_score !== null ? Number(row.completeness_score) : null,
      uniqueness: row.uniqueness_score !== null ? Number(row.uniqueness_score) : null,
      validity: row.validity_score !== null ? Number(row.validity_score) : null,
      freshness: row.freshness_score !== null ? Number(row.freshness_score) : null,
      accuracy: row.accuracy_score !== null ? Number(row.accuracy_score) : null,
      consistency: row.consistency_score !== null ? Number(row.consistency_score) : null,
    },
    ruleResults: row.rule_results ?? [],
    computedAt: row.computed_at.toISOString(),
    runId: row.run_id,
  };
}

function rowToRun(row: QualityRunRow): QualityRun {
  return {
    id: row.id,
    assetUrn: row.asset_urn,
    status: row.status,
    triggeredBy: row.triggered_by,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    results: row.results,
    errorMessage: row.error_message,
  };
}

const SCORE_COLS = `
  id, asset_urn, overall_score,
  completeness_score, uniqueness_score, validity_score,
  freshness_score, accuracy_score, consistency_score,
  rule_results, computed_at, run_id
`;

// ---------------------------------------------------------------------------
// Score functions
// ---------------------------------------------------------------------------

/**
 * Return the most recent quality score for a given asset URN.
 */
export async function getLatestScore(
  assetUrn: string,
): Promise<QualityScore | null> {
  const result = await query<QualityScoreRow>(
    `SELECT ${SCORE_COLS}
     FROM quality_scores
     WHERE asset_urn = $1
     ORDER BY computed_at DESC
     LIMIT 1`,
    [assetUrn],
  );

  return result.rows.length > 0 ? rowToScore(result.rows[0]!) : null;
}

/**
 * Return the quality score history for an asset, optionally filtered by date range.
 */
export async function getScoreHistory(
  assetUrn: string,
  fromDate?: Date,
  toDate?: Date,
): Promise<QualityScore[]> {
  const conditions = ['asset_urn = $1'];
  const params: unknown[] = [assetUrn];
  let idx = 2;

  if (fromDate) {
    conditions.push(`computed_at >= $${idx++}`);
    params.push(fromDate.toISOString());
  }
  if (toDate) {
    conditions.push(`computed_at <= $${idx++}`);
    params.push(toDate.toISOString());
  }

  const result = await query<QualityScoreRow>(
    `SELECT ${SCORE_COLS}
     FROM quality_scores
     WHERE ${conditions.join(' AND ')}
     ORDER BY computed_at DESC
     LIMIT 500`,
    params,
  );

  return result.rows.map(rowToScore);
}

/**
 * Persist a computed quality score to the database.
 */
export async function saveScore(scoreData: {
  id: string;
  assetUrn: string;
  overallScore: number;
  dimensions: DimensionScores;
  ruleResults: QualityResult[];
  runId: string | null;
}): Promise<QualityScore> {
  const result = await query<QualityScoreRow>(
    `INSERT INTO quality_scores
       (id, asset_urn, overall_score,
        completeness_score, uniqueness_score, validity_score,
        freshness_score, accuracy_score, consistency_score,
        rule_results, computed_at, run_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)
     RETURNING ${SCORE_COLS}`,
    [
      scoreData.id,
      scoreData.assetUrn,
      scoreData.overallScore,
      scoreData.dimensions.completeness,
      scoreData.dimensions.uniqueness,
      scoreData.dimensions.validity,
      scoreData.dimensions.freshness,
      scoreData.dimensions.accuracy,
      scoreData.dimensions.consistency,
      JSON.stringify(scoreData.ruleResults),
      scoreData.runId,
    ],
  );

  return rowToScore(result.rows[0]!);
}

/**
 * Aggregate stats for the quality dashboard.
 * Returns the overall average score and counts of assets above/below thresholds,
 * plus a per-domain breakdown if assets have a domain tag in the DB.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  // Overall aggregate
  const aggregateResult = await query<{
    average_score: string;
    assets_above_80: string;
    assets_below_60: string;
  }>(
    `WITH latest_scores AS (
       SELECT DISTINCT ON (asset_urn)
         asset_urn, overall_score
       FROM quality_scores
       ORDER BY asset_urn, computed_at DESC
     )
     SELECT
       COALESCE(AVG(overall_score), 0)::numeric(5,2)              AS average_score,
       COUNT(*) FILTER (WHERE overall_score >= 80)::text           AS assets_above_80,
       COUNT(*) FILTER (WHERE overall_score < 60)::text            AS assets_below_60
     FROM latest_scores`,
  );

  // Per-domain breakdown – assets table provides domain info
  const domainResult = await query<{
    domain: string;
    average_score: string;
    asset_count: string;
  }>(
    `WITH latest_scores AS (
       SELECT DISTINCT ON (qs.asset_urn)
         qs.asset_urn, qs.overall_score
       FROM quality_scores qs
       ORDER BY qs.asset_urn, qs.computed_at DESC
     )
     SELECT
       COALESCE(a.domain, 'unclassified')     AS domain,
       AVG(ls.overall_score)::numeric(5,2)    AS average_score,
       COUNT(*)::text                         AS asset_count
     FROM latest_scores ls
     LEFT JOIN assets a ON a.urn = ls.asset_urn
     GROUP BY COALESCE(a.domain, 'unclassified')
     ORDER BY average_score DESC`,
  );

  const row = aggregateResult.rows[0];

  return {
    averageScore: Number(row?.average_score ?? 0),
    assetsAbove80: parseInt(row?.assets_above_80 ?? '0', 10),
    assetsBelow60: parseInt(row?.assets_below_60 ?? '0', 10),
    byDomain: domainResult.rows.map((r) => ({
      domain: r.domain,
      averageScore: Number(r.average_score),
      assetCount: parseInt(r.asset_count, 10),
    })),
  };
}

// ---------------------------------------------------------------------------
// Run functions
// ---------------------------------------------------------------------------

/**
 * Create a new quality run record in 'pending' status.
 */
export async function createRun(
  id: string,
  assetUrn: string,
  triggeredBy: string,
): Promise<QualityRun> {
  const result = await query<QualityRunRow>(
    `INSERT INTO quality_runs
       (id, asset_urn, status, triggered_by, started_at)
     VALUES ($1, $2, 'pending', $3, NOW())
     RETURNING id, asset_urn, status, triggered_by,
               started_at, completed_at, results, error_message`,
    [id, assetUrn, triggeredBy],
  );

  return rowToRun(result.rows[0]!);
}

/**
 * Update a run's status, results, and completion time.
 */
export async function updateRun(
  id: string,
  status: RunStatus,
  results?: QualityResult[],
  errorMessage?: string,
): Promise<void> {
  await query(
    `UPDATE quality_runs
     SET status = $2,
         results = $3,
         error_message = $4,
         completed_at = CASE WHEN $2 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
     WHERE id = $1`,
    [
      id,
      status,
      results ? JSON.stringify(results) : null,
      errorMessage ?? null,
    ],
  );
}

/**
 * Find assets that have had no quality run in the past 24 hours
 * but have at least one active quality rule. Used by the overdue checker.
 */
export async function getOverdueAssets(): Promise<string[]> {
  const result = await query<{ asset_urn: string }>(
    `SELECT DISTINCT qr.asset_urn
     FROM quality_rules qr
     WHERE qr.is_active = true
       AND qr.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM quality_runs run
         WHERE run.asset_urn = qr.asset_urn
           AND run.started_at > NOW() - INTERVAL '24 hours'
       )`,
  );

  return result.rows.map((r) => r.asset_urn);
}
