import { query } from '../config/database';
import { LineageEdge, LineageNode, ImpactAnalysis } from '../types';
import { v4 as uuidv4 } from 'uuid';

export async function getDirectUpstream(urn: string): Promise<LineageEdge[]> {
  const result = await query<LineageEdge>(
    `SELECT * FROM lineage_edges
     WHERE downstream_urn = $1 AND is_active = true
     ORDER BY created_at DESC`,
    [urn]
  );
  return result.rows;
}

export async function getDirectDownstream(urn: string): Promise<LineageEdge[]> {
  const result = await query<LineageEdge>(
    `SELECT * FROM lineage_edges
     WHERE upstream_urn = $1 AND is_active = true
     ORDER BY created_at DESC`,
    [urn]
  );
  return result.rows;
}

export async function getFullUpstream(
  urn: string,
  maxDepth: number
): Promise<LineageNode[]> {
  try {
    const result = await query<LineageNode>(
      `SELECT * FROM get_upstream_lineage($1, $2)`,
      [urn, maxDepth]
    );
    return result.rows;
  } catch {
    // Fallback to recursive CTE if stored function doesn't exist
    const result = await query<LineageNode>(
      `WITH RECURSIVE upstream AS (
         SELECT upstream_urn AS urn, 1 AS depth
         FROM lineage_edges
         WHERE downstream_urn = $1 AND is_active = true
         UNION ALL
         SELECT le.upstream_urn, u.depth + 1
         FROM lineage_edges le
         INNER JOIN upstream u ON le.downstream_urn = u.urn
         WHERE u.depth < $2 AND le.is_active = true
       )
       SELECT DISTINCT urn, depth FROM upstream ORDER BY depth`,
      [urn, maxDepth]
    );
    return result.rows;
  }
}

export async function getFullDownstream(
  urn: string,
  maxDepth: number
): Promise<LineageNode[]> {
  try {
    const result = await query<LineageNode>(
      `SELECT * FROM get_downstream_lineage($1, $2)`,
      [urn, maxDepth]
    );
    return result.rows;
  } catch {
    // Fallback to recursive CTE
    const result = await query<LineageNode>(
      `WITH RECURSIVE downstream AS (
         SELECT downstream_urn AS urn, 1 AS depth
         FROM lineage_edges
         WHERE upstream_urn = $1 AND is_active = true
         UNION ALL
         SELECT le.downstream_urn, d.depth + 1
         FROM lineage_edges le
         INNER JOIN downstream d ON le.upstream_urn = d.urn
         WHERE d.depth < $2 AND le.is_active = true
       )
       SELECT DISTINCT urn, depth FROM downstream ORDER BY depth`,
      [urn, maxDepth]
    );
    return result.rows;
  }
}

export async function createEdge(data: {
  upstream_urn: string;
  downstream_urn: string;
  transformation_type?: string;
  transformation_description?: string;
  field_mappings?: unknown[];
  confidence?: number;
  source_type?: string;
  source_job_id?: string;
}): Promise<LineageEdge> {
  const id = uuidv4();
  const result = await query<LineageEdge>(
    `INSERT INTO lineage_edges (
       id, upstream_urn, downstream_urn, transformation_type,
       transformation_description, field_mappings, confidence,
       source_type, source_job_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (upstream_urn, downstream_urn)
     DO UPDATE SET
       transformation_type = EXCLUDED.transformation_type,
       transformation_description = EXCLUDED.transformation_description,
       field_mappings = EXCLUDED.field_mappings,
       confidence = EXCLUDED.confidence,
       source_type = EXCLUDED.source_type,
       source_job_id = EXCLUDED.source_job_id,
       is_active = true,
       updated_at = NOW()
     RETURNING *`,
    [
      id,
      data.upstream_urn,
      data.downstream_urn,
      data.transformation_type || null,
      data.transformation_description || null,
      data.field_mappings ? JSON.stringify(data.field_mappings) : null,
      data.confidence ?? 1.0,
      data.source_type || 'manual',
      data.source_job_id || null,
    ]
  );
  return result.rows[0];
}

export async function softDeleteEdge(id: string): Promise<void> {
  await query(
    `UPDATE lineage_edges SET is_active = false, updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

export async function getImpactAnalysis(urn: string): Promise<ImpactAnalysis> {
  const [directUpstream, directDownstream, allDownstream] = await Promise.all([
    getDirectUpstream(urn),
    getDirectDownstream(urn),
    getFullDownstream(urn, 10),
  ]);

  // Enrich downstream nodes with asset metadata
  const downstreamUrns = allDownstream.map((n) => n.urn);
  let enrichedDownstream: Array<{
    urn: string;
    name: string;
    entityType: string;
    ownerName: string | null;
    qualityScore: number | null;
  }> = [];

  if (downstreamUrns.length > 0) {
    const assetResult = await query<{
      urn: string;
      name: string;
      entity_type: string;
      owner_name: string | null;
      quality_score: number | null;
    }>(
      `SELECT urn, name, entity_type, owner_name, quality_score
       FROM data_assets
       WHERE urn = ANY($1) AND is_active = true`,
      [downstreamUrns]
    );

    const assetMap = new Map(assetResult.rows.map((a) => [a.urn, a]));
    enrichedDownstream = downstreamUrns.map((u) => {
      const asset = assetMap.get(u);
      return {
        urn: u,
        name: asset?.name || u,
        entityType: asset?.entity_type || 'unknown',
        ownerName: asset?.owner_name || null,
        qualityScore: asset?.quality_score || null,
      };
    });
  }

  return {
    urn,
    directUpstreamCount: directUpstream.length,
    directDownstreamCount: directDownstream.length,
    totalDownstreamCount: allDownstream.length,
    downstreamAssets: enrichedDownstream,
  };
}
