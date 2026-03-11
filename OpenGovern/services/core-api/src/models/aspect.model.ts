import { query, withTransaction } from '../config/database';
import { AssetAspect } from '../types';
import { v4 as uuidv4 } from 'uuid';

export async function getLatestAspect(
  assetId: string,
  aspectType: string
): Promise<AssetAspect | null> {
  const result = await query<AssetAspect>(
    `SELECT * FROM asset_aspects
     WHERE asset_id = $1 AND aspect_type = $2
     ORDER BY version DESC
     LIMIT 1`,
    [assetId, aspectType]
  );
  return result.rows[0] || null;
}

export async function getAllAspects(assetId: string): Promise<AssetAspect[]> {
  // Return the latest version of each aspect type for this asset
  const result = await query<AssetAspect>(
    `SELECT DISTINCT ON (aspect_type)
       id, asset_id, aspect_type, version, payload, created_at, created_by
     FROM asset_aspects
     WHERE asset_id = $1
     ORDER BY aspect_type, version DESC`,
    [assetId]
  );
  return result.rows;
}

export async function getAspectHistory(
  assetId: string,
  aspectType: string
): Promise<AssetAspect[]> {
  const result = await query<AssetAspect>(
    `SELECT * FROM asset_aspects
     WHERE asset_id = $1 AND aspect_type = $2
     ORDER BY version DESC`,
    [assetId, aspectType]
  );
  return result.rows;
}

export async function upsertAspect(
  assetId: string,
  aspectType: string,
  payload: Record<string, unknown>,
  createdBy: string | null
): Promise<AssetAspect> {
  return withTransaction(async (client) => {
    const versionResult = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
       FROM asset_aspects
       WHERE asset_id = $1 AND aspect_type = $2`,
      [assetId, aspectType]
    );

    const nextVersion = versionResult.rows[0].next_version;
    const id = uuidv4();

    const result = await client.query<AssetAspect>(
      `INSERT INTO asset_aspects (id, asset_id, aspect_type, version, payload, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, assetId, aspectType, nextVersion, JSON.stringify(payload), createdBy]
    );

    return result.rows[0];
  });
}
