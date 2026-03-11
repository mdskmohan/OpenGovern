import { Request, Response } from 'express';
import { query } from '../config/database';
import { Domain, DataAsset, AuthenticatedRequest } from '../types';
import { v4 as uuidv4 } from 'uuid';

function handleError(res: Response, err: unknown): void {
  console.error('[DomainsController]', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const result = await query<Domain>(
      `SELECT * FROM domains ORDER BY name ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    handleError(res, err);
  }
}

export async function get(req: Request, res: Response): Promise<void> {
  try {
    const result = await query<Domain>(
      `SELECT * FROM domains WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Domain not found' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    handleError(res, err);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { name, description, parent_domain_id, owner_id } = req.body as Partial<Domain>;
    if (!name) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name is required' } });
      return;
    }

    const id = uuidv4();
    const result = await query<Domain>(
      `INSERT INTO domains (id, name, description, parent_domain_id, owner_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, name, description ?? null, parent_domain_id ?? null, owner_id ?? null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    handleError(res, err);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const { name, description, parent_domain_id, owner_id } = req.body as Partial<Domain>;

    const existing = await query<Domain>(`SELECT * FROM domains WHERE id = $1`, [req.params.id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Domain not found' } });
      return;
    }

    const result = await query<Domain>(
      `UPDATE domains SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         parent_domain_id = COALESCE($4, parent_domain_id),
         owner_id = COALESCE($5, owner_id),
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, name ?? null, description ?? null, parent_domain_id ?? null, owner_id ?? null]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    handleError(res, err);
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const existing = await query<Domain>(`SELECT id FROM domains WHERE id = $1`, [req.params.id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Domain not found' } });
      return;
    }

    await query(`DELETE FROM domains WHERE id = $1`, [req.params.id]);
    res.json({ success: true, data: { message: 'Domain deleted' } });
  } catch (err) {
    handleError(res, err);
  }
}

export async function listAssets(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '20', 10)));
    const offset = (page - 1) * limit;

    const domainId = req.params.id;

    const domainCheck = await query<Domain>(`SELECT id FROM domains WHERE id = $1`, [domainId]);
    if (domainCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Domain not found' } });
      return;
    }

    const [countResult, dataResult] = await Promise.all([
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM data_assets WHERE domain_id = $1 AND is_active = true`,
        [domainId]
      ),
      query<DataAsset>(
        `SELECT id, urn, entity_type, name, fully_qualified_name, platform,
                domain_name, owner_name, certification_status, sensitivity,
                quality_score, tags, last_ingested_at, updated_at
         FROM data_assets
         WHERE domain_id = $1 AND is_active = true
         ORDER BY updated_at DESC
         LIMIT $2 OFFSET $3`,
        [domainId, limit, offset]
      ),
    ]);

    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);
    res.json({
      success: true,
      data: {
        items: dataResult.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    handleError(res, err);
  }
}
