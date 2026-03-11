import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../config/database';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const RuleTypeEnum = z.enum([
  'completeness',
  'uniqueness',
  'validity',
  'freshness',
  'accuracy',
  'consistency',
  'custom_sql',
]);

const DimensionEnum = z.enum([
  'completeness',
  'uniqueness',
  'validity',
  'freshness',
  'accuracy',
  'consistency',
]);

const CreateRuleSchema = z.object({
  asset_urn: z.string().min(1),
  rule_name: z.string().min(1).max(255),
  rule_type: RuleTypeEnum,
  dimension: DimensionEnum,
  config: z.record(z.unknown()).default({}),
  threshold_value: z.number().min(0).max(100).default(95),
  is_active: z.boolean().default(true),
  schedule_cron: z.string().optional(),
});

const UpdateRuleSchema = CreateRuleSchema.partial();

const ListQuerySchema = z.object({
  assetUrn: z.string().optional(),
  ruleType: RuleTypeEnum.optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

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
 * GET /quality/rules
 * Query params: assetUrn, ruleType, isActive, page, limit
 */
export async function listRules(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListQuerySchema.parse(req.query);
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (query.assetUrn) {
      conditions.push(`asset_urn = $${idx++}`);
      params.push(query.assetUrn);
    }
    if (query.ruleType) {
      conditions.push(`rule_type = $${idx++}`);
      params.push(query.ruleType);
    }
    if (query.isActive !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      params.push(query.isActive);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (query.page - 1) * query.limit;

    const [countResult, rowsResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM quality_rules ${where}`, params),
      pool.query(
        `SELECT * FROM quality_rules ${where}
         ORDER BY created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, query.limit, offset],
      ),
    ]);

    ok(res, {
      items: rowsResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: query.page,
      limit: query.limit,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      fail(res, err.errors.map((e) => e.message).join(', '));
      return;
    }
    next(err);
  }
}

/**
 * GET /quality/rules/:id
 */
export async function getRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM quality_rules WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      fail(res, `Rule ${id} not found`, 404);
      return;
    }

    ok(res, result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /quality/rules
 */
export async function createRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CreateRuleSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO quality_rules
         (asset_urn, rule_name, rule_type, dimension, config, threshold_value, is_active, schedule_cron)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        body.asset_urn,
        body.rule_name,
        body.rule_type,
        body.dimension,
        JSON.stringify(body.config),
        body.threshold_value,
        body.is_active,
        body.schedule_cron ?? null,
      ],
    );

    ok(res, result.rows[0], 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      fail(res, err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
      return;
    }
    next(err);
  }
}

/**
 * PUT /quality/rules/:id
 */
export async function updateRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const body = UpdateRuleSchema.parse(req.body);

    // Build dynamic SET clause
    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const fieldMap: Record<string, unknown> = {
      rule_name: body.rule_name,
      rule_type: body.rule_type,
      dimension: body.dimension,
      config: body.config !== undefined ? JSON.stringify(body.config) : undefined,
      threshold_value: body.threshold_value,
      is_active: body.is_active,
      schedule_cron: body.schedule_cron,
      asset_urn: body.asset_urn,
    };

    for (const [col, val] of Object.entries(fieldMap)) {
      if (val !== undefined) {
        fields.push(`${col} = $${idx++}`);
        params.push(val);
      }
    }

    if (fields.length === 0) {
      fail(res, 'No fields to update');
      return;
    }

    fields.push(`updated_at = NOW()`);
    params.push(id);

    const result = await pool.query(
      `UPDATE quality_rules SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );

    if (result.rows.length === 0) {
      fail(res, `Rule ${id} not found`, 404);
      return;
    }

    ok(res, result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      fail(res, err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
      return;
    }
    next(err);
  }
}

/**
 * DELETE /quality/rules/:id
 */
export async function deleteRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `DELETE FROM quality_rules WHERE id = $1 RETURNING id`,
      [id],
    );

    if (result.rows.length === 0) {
      fail(res, `Rule ${id} not found`, 404);
      return;
    }

    ok(res, { deleted: true, id });
  } catch (err) {
    next(err);
  }
}
