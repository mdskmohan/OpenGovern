import { query, withTransaction } from '../config/database';
import { DataAsset, AssetFilters, AssetSummary } from '../types';
import { v4 as uuidv4 } from 'uuid';

export async function findByUrn(urn: string): Promise<DataAsset | null> {
  const result = await query<DataAsset>(
    `SELECT * FROM data_assets WHERE urn = $1 AND is_active = true`,
    [urn]
  );
  return result.rows[0] || null;
}

export async function findById(id: string): Promise<DataAsset | null> {
  const result = await query<DataAsset>(
    `SELECT * FROM data_assets WHERE id = $1 AND is_active = true`,
    [id]
  );
  return result.rows[0] || null;
}

export async function list(
  filters: AssetFilters,
  page: number,
  limit: number
): Promise<{ items: AssetSummary[]; total: number }> {
  const conditions: string[] = ['a.is_active = true'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.entityType) {
    conditions.push(`a.entity_type = $${paramIndex++}`);
    params.push(filters.entityType);
  }
  if (filters.platform) {
    conditions.push(`a.platform = $${paramIndex++}`);
    params.push(filters.platform);
  }
  if (filters.domainId) {
    conditions.push(`a.domain_id = $${paramIndex++}`);
    params.push(filters.domainId);
  }
  if (filters.ownerId) {
    conditions.push(`a.owner_id = $${paramIndex++}`);
    params.push(filters.ownerId);
  }
  if (filters.certificationStatus) {
    conditions.push(`a.certification_status = $${paramIndex++}`);
    params.push(filters.certificationStatus);
  }
  if (filters.sensitivity) {
    conditions.push(`a.sensitivity = $${paramIndex++}`);
    params.push(filters.sensitivity);
  }
  if (filters.search) {
    conditions.push(
      `(a.name ILIKE $${paramIndex} OR a.fully_qualified_name ILIKE $${paramIndex} OR a.description ILIKE $${paramIndex})`
    );
    params.push(`%${filters.search}%`);
    paramIndex++;
  }
  if (filters.tags && filters.tags.length > 0) {
    conditions.push(`a.tags && $${paramIndex++}`);
    params.push(filters.tags);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM data_assets a ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0]?.count || '0', 10);

  const dataResult = await query<AssetSummary>(
    `SELECT
       a.id, a.urn, a.entity_type, a.name, a.fully_qualified_name,
       a.platform, a.domain_name, a.owner_name, a.certification_status,
       a.sensitivity, a.quality_score, a.tags, a.last_ingested_at, a.updated_at
     FROM data_assets a
     ${whereClause}
     ORDER BY a.updated_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return { items: dataResult.rows, total };
}

export async function create(data: Partial<DataAsset> & { urn: string; name: string; entity_type: string; platform: string; fully_qualified_name: string }): Promise<DataAsset> {
  const id = uuidv4();
  const result = await query<DataAsset>(
    `INSERT INTO data_assets (
       id, urn, entity_type, name, fully_qualified_name, platform,
       service_name, database_name, schema_name, description,
       domain_id, sensitivity, tags, custom_properties, source_id,
       created_by, updated_by
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15, $16, $16
     )
     RETURNING *`,
    [
      id,
      data.urn,
      data.entity_type,
      data.name,
      data.fully_qualified_name,
      data.platform,
      data.service_name || null,
      data.database_name || null,
      data.schema_name || null,
      data.description || null,
      data.domain_id || null,
      data.sensitivity || 'internal',
      data.tags || [],
      JSON.stringify(data.custom_properties || {}),
      data.source_id || null,
      data.created_by || null,
    ]
  );
  return result.rows[0];
}

export async function update(id: string, data: Partial<DataAsset>): Promise<DataAsset> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  const updatableFields: (keyof DataAsset)[] = [
    'name', 'fully_qualified_name', 'description', 'domain_id', 'domain_name',
    'owner_id', 'owner_name', 'certification_status', 'sensitivity',
    'quality_score', 'tags', 'custom_properties', 'last_ingested_at', 'updated_by',
  ];

  for (const field of updatableFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = $${paramIndex++}`);
      params.push(data[field]);
    }
  }

  if (fields.length === 0) {
    const existing = await findById(id);
    if (!existing) throw new Error(`Asset ${id} not found`);
    return existing;
  }

  fields.push(`updated_at = NOW()`);
  params.push(id);

  const result = await query<DataAsset>(
    `UPDATE data_assets SET ${fields.join(', ')} WHERE id = $${paramIndex} AND is_active = true RETURNING *`,
    params
  );

  if (result.rows.length === 0) {
    throw new Error(`Asset ${id} not found`);
  }
  return result.rows[0];
}

export async function softDelete(id: string): Promise<void> {
  await query(
    `UPDATE data_assets SET is_active = false, updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

export async function upsertByUrn(
  urn: string,
  data: Partial<DataAsset> & { name: string; entity_type: string; platform: string; fully_qualified_name: string }
): Promise<DataAsset> {
  return withTransaction(async (client) => {
    const existing = await client.query<DataAsset>(
      `SELECT * FROM data_assets WHERE urn = $1 FOR UPDATE`,
      [urn]
    );

    if (existing.rows.length > 0) {
      const asset = existing.rows[0];
      const result = await client.query<DataAsset>(
        `UPDATE data_assets SET
           name = COALESCE($2, name),
           fully_qualified_name = COALESCE($3, fully_qualified_name),
           description = COALESCE($4, description),
           domain_id = COALESCE($5, domain_id),
           sensitivity = COALESCE($6, sensitivity),
           tags = COALESCE($7, tags),
           custom_properties = COALESCE($8, custom_properties),
           last_ingested_at = NOW(),
           is_active = true,
           updated_at = NOW(),
           updated_by = $9
         WHERE id = $1
         RETURNING *`,
        [
          asset.id,
          data.name,
          data.fully_qualified_name,
          data.description || null,
          data.domain_id || null,
          data.sensitivity || null,
          data.tags || null,
          data.custom_properties ? JSON.stringify(data.custom_properties) : null,
          data.updated_by || null,
        ]
      );
      return result.rows[0];
    } else {
      const id = uuidv4();
      const result = await client.query<DataAsset>(
        `INSERT INTO data_assets (
           id, urn, entity_type, name, fully_qualified_name, platform,
           service_name, database_name, schema_name, description,
           domain_id, sensitivity, tags, custom_properties, source_id,
           last_ingested_at, created_by, updated_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, NOW(), $16, $16
         )
         RETURNING *`,
        [
          id,
          urn,
          data.entity_type,
          data.name,
          data.fully_qualified_name,
          data.platform,
          data.service_name || null,
          data.database_name || null,
          data.schema_name || null,
          data.description || null,
          data.domain_id || null,
          data.sensitivity || 'internal',
          data.tags || [],
          JSON.stringify(data.custom_properties || {}),
          data.source_id || null,
          data.created_by || null,
        ]
      );
      return result.rows[0];
    }
  });
}

export interface AssetStats {
  total: number;
  byType: Array<{ entity_type: string; count: number }>;
  byPlatform: Array<{ platform: string; count: number }>;
  byDomain: Array<{ domain_name: string | null; count: number }>;
}

export async function getStats(): Promise<AssetStats> {
  const [totalResult, byTypeResult, byPlatformResult, byDomainResult] = await Promise.all([
    query<{ count: string }>(`SELECT COUNT(*) as count FROM data_assets WHERE is_active = true`),
    query<{ entity_type: string; count: string }>(
      `SELECT entity_type, COUNT(*) as count FROM data_assets WHERE is_active = true GROUP BY entity_type ORDER BY count DESC`
    ),
    query<{ platform: string; count: string }>(
      `SELECT platform, COUNT(*) as count FROM data_assets WHERE is_active = true GROUP BY platform ORDER BY count DESC`
    ),
    query<{ domain_name: string | null; count: string }>(
      `SELECT domain_name, COUNT(*) as count FROM data_assets WHERE is_active = true GROUP BY domain_name ORDER BY count DESC`
    ),
  ]);

  return {
    total: parseInt(totalResult.rows[0]?.count || '0', 10),
    byType: byTypeResult.rows.map((r) => ({ entity_type: r.entity_type, count: parseInt(r.count, 10) })),
    byPlatform: byPlatformResult.rows.map((r) => ({ platform: r.platform, count: parseInt(r.count, 10) })),
    byDomain: byDomainResult.rows.map((r) => ({ domain_name: r.domain_name, count: parseInt(r.count, 10) })),
  };
}
