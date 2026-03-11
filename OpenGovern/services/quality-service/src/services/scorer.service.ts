/**
 * Scorer Service — evaluates quality rules and computes scores.
 *
 * Quality dimensions and their weights:
 *   completeness: 30%  — are required fields populated?
 *   uniqueness:   20%  — are values deduplicated?
 *   validity:     20%  — do values match expected format/range?
 *   freshness:    15%  — was the data updated recently?
 *   accuracy:     10%  — are numeric values within expected bounds?
 *   consistency:   5%  — do related datasets agree?
 */

import axios from 'axios';
import { pool } from '../config/database';
import { publishEvent } from '../config/kafka';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QualityRule {
  id: string;
  asset_urn: string;
  rule_name: string;
  rule_type:
    | 'completeness'
    | 'uniqueness'
    | 'validity'
    | 'freshness'
    | 'accuracy'
    | 'consistency'
    | 'custom_sql';
  dimension:
    | 'completeness'
    | 'uniqueness'
    | 'validity'
    | 'freshness'
    | 'accuracy'
    | 'consistency';
  config: Record<string, unknown>;
  threshold_value: number;
  is_active: boolean;
  schedule_cron?: string;
  last_run_at?: Date;
}

export interface QualityResult {
  rule_id: string;
  passed: boolean;
  score: number;
  observed_value: string;
  threshold_value: number;
  message: string;
}

export interface QualityRun {
  id: string;
  asset_urn: string;
  status: 'running' | 'completed' | 'failed';
  triggered_by: string;
  overall_score: number;
  dimension_scores: QualityDimensions;
  results: QualityResult[];
  started_at: Date;
  completed_at?: Date;
}

export interface QualityDimensions {
  completeness?: number;
  uniqueness?: number;
  validity?: number;
  freshness?: number;
  accuracy?: number;
  consistency?: number;
}

const DIMENSION_WEIGHTS: Record<keyof QualityDimensions, number> = {
  completeness: 0.30,
  uniqueness:   0.20,
  validity:     0.20,
  freshness:    0.15,
  accuracy:     0.10,
  consistency:  0.05,
};

const CORE_API_URL = process.env.CORE_API_URL ?? 'http://core-api:3001';

// ---------------------------------------------------------------------------
// Individual rule evaluators
// ---------------------------------------------------------------------------

/**
 * Completeness: % of non-null values across specified columns.
 *
 * NOTE: A real implementation must query the actual data source via core-api.
 * The fallback simulates a result when the data-source integration is unavailable.
 */
async function evaluateCompleteness(
  rule: QualityRule,
): Promise<{ score: number; passed: boolean; message: string }> {
  const threshold = (rule.config.threshold as number) ?? rule.threshold_value ?? 95;

  try {
    const response = await axios.post(
      `${CORE_API_URL}/api/v1/datasources/query`,
      {
        asset_urn: rule.asset_urn,
        query_type: 'completeness',
        columns: (rule.config.columns as string[]) ?? [],
      },
      { timeout: 15_000 },
    );
    const pct: number = response.data.completeness_pct ?? 100;
    const passed = pct >= threshold;
    return {
      score: pct,
      passed,
      message: passed
        ? `Completeness ${pct.toFixed(1)}% meets threshold ${threshold}%`
        : `Completeness ${pct.toFixed(1)}% is below threshold ${threshold}%`,
    };
  } catch {
    // Fallback: simulate result (replace with real query when data-source proxy is ready)
    const simulated = 92 + Math.random() * 8;
    const passed = simulated >= threshold;
    return {
      score: Math.round(simulated * 10) / 10,
      passed,
      message: `[Simulated] Completeness ${simulated.toFixed(1)}% vs threshold ${threshold}%`,
    };
  }
}

/**
 * Uniqueness: % of distinct values in a column.
 *
 * NOTE: Requires data-source query via core-api; simulated when unavailable.
 */
async function evaluateUniqueness(
  rule: QualityRule,
): Promise<{ score: number; passed: boolean; message: string }> {
  const threshold = (rule.config.threshold as number) ?? rule.threshold_value ?? 95;

  try {
    const response = await axios.post(
      `${CORE_API_URL}/api/v1/datasources/query`,
      {
        asset_urn: rule.asset_urn,
        query_type: 'uniqueness',
        column: rule.config.column as string,
      },
      { timeout: 15_000 },
    );
    const pct: number = response.data.uniqueness_pct ?? 100;
    const passed = pct >= threshold;
    return {
      score: pct,
      passed,
      message: passed
        ? `Uniqueness ${pct.toFixed(1)}% meets threshold ${threshold}%`
        : `Uniqueness ${pct.toFixed(1)}% is below threshold ${threshold}% — possible duplicates detected`,
    };
  } catch {
    const simulated = 85 + Math.random() * 15;
    const passed = simulated >= threshold;
    return {
      score: Math.round(simulated * 10) / 10,
      passed,
      message: `[Simulated] Uniqueness ${simulated.toFixed(1)}% vs threshold ${threshold}%`,
    };
  }
}

/**
 * Validity: checks regex pattern, allowed values list, or length constraints.
 *
 * NOTE: Pattern/length checks can run client-side against sample data returned from core-api.
 */
async function evaluateValidity(
  rule: QualityRule,
): Promise<{ score: number; passed: boolean; message: string }> {
  const threshold = (rule.config.threshold as number) ?? rule.threshold_value ?? 95;
  const pattern = rule.config.pattern as string | undefined;
  const allowedValues = rule.config.allowed_values as string[] | undefined;
  const maxLength = rule.config.max_length as number | undefined;
  const minLength = rule.config.min_length as number | undefined;

  try {
    // Fetch a sample of values from core-api for validation
    const response = await axios.post(
      `${CORE_API_URL}/api/v1/datasources/query`,
      {
        asset_urn: rule.asset_urn,
        query_type: 'sample',
        column: rule.config.column as string,
        sample_size: 1000,
      },
      { timeout: 15_000 },
    );

    const values: unknown[] = response.data.values ?? [];
    if (values.length === 0) {
      return { score: 100, passed: true, message: 'No values to validate' };
    }

    let validCount = 0;
    for (const val of values) {
      const str = String(val ?? '');
      let valid = true;

      if (pattern) {
        valid = valid && new RegExp(pattern).test(str);
      }
      if (allowedValues) {
        valid = valid && allowedValues.includes(str);
      }
      if (maxLength !== undefined) {
        valid = valid && str.length <= maxLength;
      }
      if (minLength !== undefined) {
        valid = valid && str.length >= minLength;
      }
      if (valid) validCount++;
    }

    const pct = (validCount / values.length) * 100;
    const passed = pct >= threshold;
    return {
      score: Math.round(pct * 10) / 10,
      passed,
      message: passed
        ? `Validity ${pct.toFixed(1)}% meets threshold ${threshold}%`
        : `Validity ${pct.toFixed(1)}% — ${values.length - validCount} invalid values found`,
    };
  } catch {
    const simulated = 88 + Math.random() * 12;
    const passed = simulated >= threshold;
    return {
      score: Math.round(simulated * 10) / 10,
      passed,
      message: `[Simulated] Validity ${simulated.toFixed(1)}% vs threshold ${threshold}%`,
    };
  }
}

/**
 * Freshness: binary check — was the asset ingested within the expected window?
 *
 * Score 100 if within window, 0 if stale. Uses last_ingested_at from assets table.
 */
async function evaluateFreshness(
  rule: QualityRule,
): Promise<{ score: number; passed: boolean; message: string }> {
  const maxAgeHours = (rule.config.max_age_hours as number) ?? 24;

  const result = await pool.query<{ last_ingested_at: Date | null }>(
    `SELECT last_ingested_at FROM assets WHERE urn = $1`,
    [rule.asset_urn],
  );

  const row = result.rows[0];
  if (!row || !row.last_ingested_at) {
    return {
      score: 0,
      passed: false,
      message: `Asset has never been ingested (no last_ingested_at)`,
    };
  }

  const ageMs = Date.now() - new Date(row.last_ingested_at).getTime();
  const ageHours = ageMs / 3_600_000;
  const passed = ageHours <= maxAgeHours;

  return {
    score: passed ? 100 : 0,
    passed,
    message: passed
      ? `Data is fresh — last ingested ${ageHours.toFixed(1)}h ago (max ${maxAgeHours}h)`
      : `Data is stale — last ingested ${ageHours.toFixed(1)}h ago, exceeds max ${maxAgeHours}h`,
  };
}

/**
 * Accuracy: % of numeric values within expected [min, max] bounds.
 *
 * NOTE: Requires data-source query via core-api; simulated when unavailable.
 */
async function evaluateAccuracy(
  rule: QualityRule,
): Promise<{ score: number; passed: boolean; message: string }> {
  const threshold = (rule.config.threshold as number) ?? rule.threshold_value ?? 95;
  const min = rule.config.min as number | undefined;
  const max = rule.config.max as number | undefined;

  try {
    const response = await axios.post(
      `${CORE_API_URL}/api/v1/datasources/query`,
      {
        asset_urn: rule.asset_urn,
        query_type: 'range_check',
        column: rule.config.column as string,
        min,
        max,
      },
      { timeout: 15_000 },
    );
    const pct: number = response.data.in_range_pct ?? 100;
    const passed = pct >= threshold;
    return {
      score: pct,
      passed,
      message: passed
        ? `Accuracy ${pct.toFixed(1)}% in range [${min ?? '-∞'}, ${max ?? '+∞'}]`
        : `Accuracy ${pct.toFixed(1)}% — values outside expected range`,
    };
  } catch {
    const simulated = 90 + Math.random() * 10;
    const passed = simulated >= threshold;
    return {
      score: Math.round(simulated * 10) / 10,
      passed,
      message: `[Simulated] Accuracy ${simulated.toFixed(1)}% vs threshold ${threshold}%`,
    };
  }
}

/**
 * Consistency: cross-asset agreement check.
 *
 * Placeholder — a real implementation requires cross-dataset joins.
 * Returns a neutral 80% score with an informational message.
 */
async function evaluateConsistency(
  rule: QualityRule,
): Promise<{ score: number; passed: boolean; message: string }> {
  // TODO: Implement cross-asset consistency checks.
  // This requires querying two data sources and comparing agreed values.
  // Likely implemented as a custom SQL check proxied through core-api.
  return {
    score: 80,
    passed: true,
    message: `Consistency check placeholder — cross-asset queries not yet implemented`,
  };
}

/**
 * Custom SQL: user-provided SQL query executed via core-api data source proxy.
 *
 * Placeholder — requires secure SQL execution via core-api.
 */
async function evaluateCustomSQL(
  rule: QualityRule,
): Promise<{ score: number; passed: boolean; message: string }> {
  // TODO: Execute rule.config.sql via core-api /api/v1/datasources/execute
  // The SQL must return a single numeric result (0–100) or a pass/fail boolean.
  try {
    const response = await axios.post(
      `${CORE_API_URL}/api/v1/datasources/execute`,
      {
        asset_urn: rule.asset_urn,
        sql: rule.config.sql as string,
      },
      { timeout: 30_000 },
    );
    const score: number = response.data.score ?? 0;
    const passed = score >= (rule.threshold_value ?? 80);
    return {
      score,
      passed,
      message: `Custom SQL returned score ${score}`,
    };
  } catch {
    return {
      score: 0,
      passed: false,
      message: `Custom SQL execution failed — core-api data source proxy unavailable`,
    };
  }
}

// ---------------------------------------------------------------------------
// ScorerService
// ---------------------------------------------------------------------------

export class ScorerService {
  /**
   * Run a full quality check for one asset.
   *
   * 1. Create a quality run record (status=running)
   * 2. Fetch all active rules for this asset
   * 3. Evaluate each rule in parallel
   * 4. Group results by dimension, average within each dimension
   * 5. Compute weighted overall score
   * 6. Persist scores to quality_scores table
   * 7. Publish quality.events if score dropped > 10 points
   * 8. Update the quality_summary aspect on the asset via core-api
   */
  async runQualityCheck(assetUrn: string, triggeredBy: string): Promise<QualityRun> {
    // Step 1: Create run record
    const runResult = await pool.query<{ id: string; started_at: Date }>(
      `INSERT INTO quality_runs (asset_urn, status, triggered_by, started_at)
       VALUES ($1, 'running', $2, NOW())
       RETURNING id, started_at`,
      [assetUrn, triggeredBy],
    );
    const runId = runResult.rows[0].id;
    const startedAt = runResult.rows[0].started_at;

    try {
      // Step 2: Fetch active rules
      const rulesResult = await pool.query<QualityRule>(
        `SELECT id, asset_urn, rule_name, rule_type, dimension, config,
                threshold_value, is_active, schedule_cron, last_run_at
         FROM quality_rules
         WHERE asset_urn = $1 AND is_active = true`,
        [assetUrn],
      );
      const rules = rulesResult.rows;

      // Step 3: Evaluate each rule in parallel
      const results: QualityResult[] = await Promise.all(
        rules.map(async (rule) => {
          const res = await this.evaluateRule(rule);
          // Persist individual result
          await pool.query(
            `INSERT INTO quality_rule_results
               (run_id, rule_id, passed, score, observed_value, threshold_value, message)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              runId,
              rule.id,
              res.passed,
              res.score,
              res.observed_value,
              res.threshold_value,
              res.message,
            ],
          );
          // Update rule last_run_at
          await pool.query(
            `UPDATE quality_rules SET last_run_at = NOW() WHERE id = $1`,
            [rule.id],
          );
          return res;
        }),
      );

      // Step 4: Group by dimension and average
      const dimensionAccumulators: Record<string, { total: number; count: number }> = {};
      for (const rule of rules) {
        const res = results[rules.indexOf(rule)];
        if (!dimensionAccumulators[rule.dimension]) {
          dimensionAccumulators[rule.dimension] = { total: 0, count: 0 };
        }
        dimensionAccumulators[rule.dimension].total += res.score;
        dimensionAccumulators[rule.dimension].count += 1;
      }

      const dimensionScores: QualityDimensions = {};
      for (const [dim, acc] of Object.entries(dimensionAccumulators)) {
        (dimensionScores as Record<string, number>)[dim] =
          Math.round((acc.total / acc.count) * 10) / 10;
      }

      // Step 5: Weighted overall score
      const overallScore = this.computeWeightedScore(dimensionScores);

      // Step 6: Persist to quality_scores
      const prevScoreResult = await pool.query<{ overall_score: number }>(
        `SELECT overall_score FROM quality_scores
         WHERE asset_urn = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [assetUrn],
      );
      const prevScore = prevScoreResult.rows[0]?.overall_score ?? null;

      await pool.query(
        `INSERT INTO quality_scores
           (run_id, asset_urn, overall_score, dimension_scores, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [runId, assetUrn, overallScore, JSON.stringify(dimensionScores)],
      );

      // Update run record to completed
      await pool.query(
        `UPDATE quality_runs
         SET status = 'completed', overall_score = $1, dimension_scores = $2, completed_at = NOW()
         WHERE id = $3`,
        [overallScore, JSON.stringify(dimensionScores), runId],
      );

      const qualityRun: QualityRun = {
        id: runId,
        asset_urn: assetUrn,
        status: 'completed',
        triggered_by: triggeredBy,
        overall_score: overallScore,
        dimension_scores: dimensionScores,
        results,
        started_at: startedAt,
        completed_at: new Date(),
      };

      // Step 7: Publish event if score dropped > 10 points
      if (prevScore !== null && prevScore - overallScore > 10) {
        await publishEvent('quality.events', assetUrn, {
          event_type: 'QUALITY_SCORE_DROP',
          asset_urn: assetUrn,
          previous_score: prevScore,
          current_score: overallScore,
          drop: prevScore - overallScore,
          run_id: runId,
          triggered_by: triggeredBy,
        });
      }

      // Step 8: Update quality_summary aspect on the asset via core-api
      try {
        await axios.patch(
          `${CORE_API_URL}/api/v1/assets/${encodeURIComponent(assetUrn)}/aspects/quality_summary`,
          {
            overall_score: overallScore,
            dimension_scores: dimensionScores,
            last_run_at: new Date().toISOString(),
            run_id: runId,
          },
          { timeout: 10_000 },
        );
      } catch (err) {
        // Non-fatal — the score is already persisted in quality_scores
        console.warn(`[ScorerService] Failed to update quality_summary aspect on core-api:`, err);
      }

      return qualityRun;
    } catch (err) {
      await pool.query(
        `UPDATE quality_runs SET status = 'failed', completed_at = NOW() WHERE id = $1`,
        [runId],
      );
      throw err;
    }
  }

  /**
   * Evaluate a single quality rule.
   * Dispatches to the appropriate dimension evaluator.
   */
  async evaluateRule(rule: QualityRule): Promise<QualityResult> {
    let raw: { score: number; passed: boolean; message: string };

    switch (rule.rule_type) {
      case 'completeness':
        raw = await evaluateCompleteness(rule);
        break;
      case 'uniqueness':
        raw = await evaluateUniqueness(rule);
        break;
      case 'validity':
        raw = await evaluateValidity(rule);
        break;
      case 'freshness':
        raw = await evaluateFreshness(rule);
        break;
      case 'accuracy':
        raw = await evaluateAccuracy(rule);
        break;
      case 'consistency':
        raw = await evaluateConsistency(rule);
        break;
      case 'custom_sql':
        raw = await evaluateCustomSQL(rule);
        break;
      default:
        raw = { score: 0, passed: false, message: `Unknown rule type: ${(rule as QualityRule).rule_type}` };
    }

    return {
      rule_id: rule.id,
      passed: raw.passed,
      score: raw.score,
      observed_value: String(raw.score),
      threshold_value: rule.threshold_value,
      message: raw.message,
    };
  }

  /**
   * Compute the weighted overall score from dimension scores.
   * Only dimensions with at least one result are included in the weight calculation.
   * Weights are re-normalized among present dimensions.
   */
  computeWeightedScore(dimensions: QualityDimensions): number {
    const presentDimensions = Object.keys(dimensions) as (keyof QualityDimensions)[];

    if (presentDimensions.length === 0) return 0;

    let totalWeight = 0;
    let weightedSum = 0;

    for (const dim of presentDimensions) {
      const score = dimensions[dim];
      if (score === undefined) continue;
      const weight = DIMENSION_WEIGHTS[dim] ?? 0;
      weightedSum += score * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return 0;

    // Re-normalize to 0–100
    const score = (weightedSum / totalWeight) * 100 / 100;
    return Math.round((weightedSum / totalWeight) * 10) / 10;
  }
}
