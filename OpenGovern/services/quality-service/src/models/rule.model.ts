/**
 * Quality rule model – database query layer for the `quality_rules` table.
 *
 * Provides typed, parameterised queries for CRUD operations on quality rules.
 * All business validation lives in the service layer above this.
 */

import { query } from '../config/database';
import {
  QualityRule,
  QualityRuleRow,
  RuleType,
  RuleDimension,
  RuleConfig,
} from '../types';

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function rowToRule(row: QualityRuleRow): QualityRule {
  return {
    id: row.id,
    assetUrn: row.asset_urn,
    name: row.name,
    description: row.description,
    ruleType: row.rule_type,
    dimension: row.dimension,
    config: row.config,
    weight: row.weight,
    isActive: row.is_active,
    scheduleCron: row.schedule_cron,
    lastRunAt: row.last_run_at ? row.last_run_at.toISOString() : null,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const SELECT_COLS = `
  id, asset_urn, name, description, rule_type, dimension, config,
  weight, is_active, schedule_cron, last_run_at,
  created_by, created_at, updated_at
`;

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Return quality rules matching the given filters.
 * All filters are optional; omitting them returns all rules.
 */
export async function list(filters: {
  assetUrn?: string;
  ruleType?: RuleType;
  isActive?: boolean;
}): Promise<QualityRule[]> {
  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.assetUrn !== undefined) {
    conditions.push(`asset_urn = $${idx++}`);
    params.push(filters.assetUrn);
  }
  if (filters.ruleType !== undefined) {
    conditions.push(`rule_type = $${idx++}`);
    params.push(filters.ruleType);
  }
  if (filters.isActive !== undefined) {
    conditions.push(`is_active = $${idx++}`);
    params.push(filters.isActive);
  }

  const result = await query<QualityRuleRow>(
    `SELECT ${SELECT_COLS}
     FROM quality_rules
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC`,
    params,
  );

  return result.rows.map(rowToRule);
}

/**
 * Find a single rule by primary key. Returns null if not found or soft-deleted.
 */
export async function findById(id: string): Promise<QualityRule | null> {
  const result = await query<QualityRuleRow>(
    `SELECT ${SELECT_COLS}
     FROM quality_rules
     WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );

  return result.rows.length > 0 ? rowToRule(result.rows[0]!) : null;
}

/**
 * Insert a new quality rule and return the created row.
 */
export async function create(data: {
  id: string;
  assetUrn: string;
  name: string;
  description?: string;
  ruleType: RuleType;
  dimension: RuleDimension;
  config: RuleConfig;
  weight?: number;
  scheduleCron?: string;
  createdBy: string;
}): Promise<QualityRule> {
  const result = await query<QualityRuleRow>(
    `INSERT INTO quality_rules
       (id, asset_urn, name, description, rule_type, dimension, config,
        weight, schedule_cron, is_active, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, NOW(), NOW())
     RETURNING ${SELECT_COLS}`,
    [
      data.id,
      data.assetUrn,
      data.name,
      data.description ?? null,
      data.ruleType,
      data.dimension,
      JSON.stringify(data.config),
      data.weight ?? 1.0,
      data.scheduleCron ?? null,
      data.createdBy,
    ],
  );

  return rowToRule(result.rows[0]!);
}

/**
 * Update an existing rule. Only supplied fields are changed.
 */
export async function update(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    config: RuleConfig;
    weight: number;
    isActive: boolean;
    scheduleCron: string | null;
  }>,
): Promise<QualityRule> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }
  if (data.config !== undefined) {
    setClauses.push(`config = $${paramIndex++}`);
    values.push(JSON.stringify(data.config));
  }
  if (data.weight !== undefined) {
    setClauses.push(`weight = $${paramIndex++}`);
    values.push(data.weight);
  }
  if (data.isActive !== undefined) {
    setClauses.push(`is_active = $${paramIndex++}`);
    values.push(data.isActive);
  }
  if (data.scheduleCron !== undefined) {
    setClauses.push(`schedule_cron = $${paramIndex++}`);
    values.push(data.scheduleCron);
  }

  if (setClauses.length === 0) {
    throw new Error('update() called with no fields to update');
  }

  setClauses.push('updated_at = NOW()');
  values.push(id);

  const result = await query<QualityRuleRow>(
    `UPDATE quality_rules
     SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex} AND deleted_at IS NULL
     RETURNING ${SELECT_COLS}`,
    values,
  );

  if (result.rows.length === 0) {
    throw new Error(`Quality rule ${id} not found`);
  }

  return rowToRule(result.rows[0]!);
}

/**
 * Soft-delete a quality rule by setting deleted_at.
 */
export async function deleteRule(id: string): Promise<void> {
  const result = await query(
    `UPDATE quality_rules
     SET deleted_at = NOW(), updated_at = NOW(), is_active = false
     WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );

  if (result.rowCount === 0) {
    throw new Error(`Quality rule ${id} not found or already deleted`);
  }
}

/**
 * Return all active rules for a given asset URN.
 * Used by the scorer to know which rules to evaluate.
 */
export async function getActiveRulesForAsset(
  assetUrn: string,
): Promise<QualityRule[]> {
  const result = await query<QualityRuleRow>(
    `SELECT ${SELECT_COLS}
     FROM quality_rules
     WHERE asset_urn = $1
       AND is_active = true
       AND deleted_at IS NULL
     ORDER BY weight DESC, created_at ASC`,
    [assetUrn],
  );

  return result.rows.map(rowToRule);
}

/**
 * Update the last_run_at timestamp after a rule evaluation.
 */
export async function updateLastRunAt(id: string): Promise<void> {
  await query(
    `UPDATE quality_rules SET last_run_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id],
  );
}

/**
 * Return distinct asset URNs that have at least one active rule with a
 * schedule_cron expression (used by the scheduler).
 */
export async function getScheduledAssets(): Promise<string[]> {
  const result = await query<{ asset_urn: string }>(
    `SELECT DISTINCT asset_urn
     FROM quality_rules
     WHERE is_active = true
       AND deleted_at IS NULL
       AND schedule_cron IS NOT NULL`,
  );

  return result.rows.map((r) => r.asset_urn);
}
