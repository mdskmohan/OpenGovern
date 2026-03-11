import { Request, Response } from 'express';
import { query } from '../config/database';
import { Tag } from '../types';
import { v4 as uuidv4 } from 'uuid';

function handleError(res: Response, err: unknown): void {
  console.error('[TagsController]', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}

interface TagWithCount extends Tag {
  asset_count: number;
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const result = await query<TagWithCount>(
      `SELECT t.*,
              COUNT(da.id) FILTER (WHERE $1::text[] IS NULL OR t.name = ANY($1::text[])) as asset_count
       FROM tags t
       LEFT JOIN data_assets da ON t.name = ANY(da.tags) AND da.is_active = true
       GROUP BY t.id
       ORDER BY t.name ASC`,
      [null]
    );

    // Simpler query that works reliably
    const tagsResult = await query<Tag>(`SELECT * FROM tags ORDER BY name ASC`);
    const countResult = await query<{ tag_name: string; count: string }>(
      `SELECT unnest(tags) as tag_name, COUNT(*) as count
       FROM data_assets
       WHERE is_active = true
       GROUP BY tag_name`
    );

    const countMap = new Map<string, number>();
    for (const row of countResult.rows) {
      countMap.set(row.tag_name, parseInt(row.count, 10));
    }

    const tags = tagsResult.rows.map((t) => ({
      ...t,
      asset_count: countMap.get(t.name) ?? 0,
    }));

    res.json({ success: true, data: tags });
  } catch (err) {
    handleError(res, err);
  }
}

export async function get(req: Request, res: Response): Promise<void> {
  try {
    const tagResult = await query<Tag>(`SELECT * FROM tags WHERE id = $1`, [req.params.id]);
    if (tagResult.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tag not found' } });
      return;
    }
    const tag = tagResult.rows[0];
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM data_assets WHERE $1 = ANY(tags) AND is_active = true`,
      [tag.name]
    );
    res.json({
      success: true,
      data: { ...tag, asset_count: parseInt(countResult.rows[0]?.count ?? '0', 10) },
    });
  } catch (err) {
    handleError(res, err);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const { name, description, color, category } = req.body as Partial<Tag>;
    if (!name) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name is required' } });
      return;
    }

    const id = uuidv4();
    const result = await query<Tag>(
      `INSERT INTO tags (id, name, description, color, category)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO NOTHING
       RETURNING *`,
      [id, name, description ?? null, color ?? null, category ?? null]
    );

    if (result.rows.length === 0) {
      res.status(409).json({ success: false, error: { code: 'CONFLICT', message: `Tag '${name}' already exists` } });
      return;
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    handleError(res, err);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const existing = await query<Tag>(`SELECT * FROM tags WHERE id = $1`, [req.params.id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tag not found' } });
      return;
    }

    const { description, color, category } = req.body as Partial<Tag>;
    const result = await query<Tag>(
      `UPDATE tags SET
         description = COALESCE($2, description),
         color = COALESCE($3, color),
         category = COALESCE($4, category)
       WHERE id = $1
       RETURNING *`,
      [req.params.id, description ?? null, color ?? null, category ?? null]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    handleError(res, err);
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const existing = await query<Tag>(`SELECT id FROM tags WHERE id = $1`, [req.params.id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tag not found' } });
      return;
    }

    await query(`DELETE FROM tags WHERE id = $1`, [req.params.id]);
    res.json({ success: true, data: { message: 'Tag deleted' } });
  } catch (err) {
    handleError(res, err);
  }
}
