import { query, withTransaction } from '../config/database';
import { publishEvent, TOPICS } from '../config/kafka';
import {
  LineageGraph,
  LineageGraphNode,
  LineageGraphEdge,
  ImpactAnalysis,
  OpenLineageEvent,
  LineageEdge,
  DataAsset,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toReactFlowNode(
  urn: string,
  depth: number,
  asset: Partial<DataAsset> | null,
  isRoot: boolean
): LineageGraphNode {
  // Position nodes in a simple grid; the frontend can run its own layout
  const x = depth * 300;
  const y = isRoot ? 0 : (Math.random() - 0.5) * 600;

  return {
    id: urn,
    type: 'assetNode',
    data: {
      urn,
      name: asset?.name ?? urn,
      entityType: asset?.entity_type ?? 'unknown',
      platform: asset?.platform ?? 'unknown',
      qualityScore: asset?.quality_score ?? null,
      certificationStatus: asset?.certification_status ?? 'uncertified',
      isRoot,
    },
    position: { x, y },
  };
}

async function enrichAssets(urns: string[]): Promise<Map<string, DataAsset>> {
  if (urns.length === 0) return new Map();
  const result = await query<DataAsset>(
    `SELECT * FROM data_assets WHERE urn = ANY($1::text[]) AND is_active = true`,
    [urns]
  );
  const map = new Map<string, DataAsset>();
  for (const row of result.rows) map.set(row.urn, row);
  return map;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getLineageGraph(
  urn: string,
  options: { depth?: number; direction?: 'upstream' | 'downstream' | 'both' } = {}
): Promise<LineageGraph> {
  const depth = options.depth ?? 3;
  const direction = options.direction ?? 'both';

  const upstreamRows: Array<{ urn: string; depth: number; upstream_urn: string; downstream_urn: string; transformation_type: string | null; confidence: number }> = [];
  const downstreamRows: typeof upstreamRows = [];

  if (direction === 'upstream' || direction === 'both') {
    const res = await query<{
      urn: string;
      depth: number;
      upstream_urn: string;
      downstream_urn: string;
      transformation_type: string | null;
      confidence: number;
    }>(
      `SELECT * FROM get_upstream_lineage($1, $2)`,
      [urn, depth]
    );
    upstreamRows.push(...res.rows);
  }

  if (direction === 'downstream' || direction === 'both') {
    const res = await query<{
      urn: string;
      depth: number;
      upstream_urn: string;
      downstream_urn: string;
      transformation_type: string | null;
      confidence: number;
    }>(
      `SELECT * FROM get_downstream_lineage($1, $2)`,
      [urn, depth]
    );
    downstreamRows.push(...res.rows);
  }

  const allRows = [...upstreamRows, ...downstreamRows];

  // Collect all unique URNs
  const urnSet = new Set<string>([urn]);
  for (const row of allRows) {
    urnSet.add(row.upstream_urn);
    urnSet.add(row.downstream_urn);
  }

  // Enrich with asset details
  const assetMap = await enrichAssets(Array.from(urnSet));

  // Build depth map: negative for upstream, positive for downstream
  const depthMap = new Map<string, number>();
  depthMap.set(urn, 0);
  for (const row of upstreamRows) {
    const d = -(row.depth);
    if (!depthMap.has(row.urn)) depthMap.set(row.urn, d);
  }
  for (const row of downstreamRows) {
    if (!depthMap.has(row.urn)) depthMap.set(row.urn, row.depth);
  }

  // Build nodes
  const nodes: LineageGraphNode[] = [];
  const seenNodes = new Set<string>();
  for (const u of urnSet) {
    if (seenNodes.has(u)) continue;
    seenNodes.add(u);
    const d = depthMap.get(u) ?? 0;
    nodes.push(toReactFlowNode(u, d, assetMap.get(u) ?? null, u === urn));
  }

  // Build edges (deduplicate)
  const edgeSet = new Set<string>();
  const edges: LineageGraphEdge[] = [];
  for (const row of allRows) {
    const edgeId = `${row.upstream_urn}→${row.downstream_urn}`;
    if (edgeSet.has(edgeId)) continue;
    edgeSet.add(edgeId);
    edges.push({
      id: edgeId,
      source: row.upstream_urn,
      target: row.downstream_urn,
      data: {
        transformationType: row.transformation_type,
        confidence: row.confidence,
      },
    });
  }

  return { nodes, edges };
}

export async function getImpactAnalysis(urn: string): Promise<ImpactAnalysis> {
  // Direct upstream/downstream counts
  const [upResult, downResult] = await Promise.all([
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM lineage_edges WHERE downstream_urn = $1 AND is_active = true`,
      [urn]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM lineage_edges WHERE upstream_urn = $1 AND is_active = true`,
      [urn]
    ),
  ]);

  // Full downstream traversal using DB function
  const downstreamRes = await query<{
    urn: string;
    depth: number;
    upstream_urn: string;
    downstream_urn: string;
    transformation_type: string | null;
    confidence: number;
  }>(
    `SELECT * FROM get_downstream_lineage($1, 10)`,
    [urn]
  );

  const downstreamUrns = [...new Set(downstreamRes.rows.map((r) => r.urn))].filter((u) => u !== urn);
  const assetMap = await enrichAssets(downstreamUrns);

  const downstreamAssets = downstreamUrns.map((u) => {
    const a = assetMap.get(u);
    return {
      urn: u,
      name: a?.name ?? u,
      entityType: a?.entity_type ?? 'unknown',
      ownerName: a?.owner_name ?? null,
      qualityScore: a?.quality_score ?? null,
    };
  });

  return {
    urn,
    directUpstreamCount: parseInt(upResult.rows[0]?.count ?? '0', 10),
    directDownstreamCount: parseInt(downResult.rows[0]?.count ?? '0', 10),
    totalDownstreamCount: downstreamUrns.length,
    downstreamAssets,
  };
}

export interface AddEdgeRequest {
  upstream_urn: string;
  downstream_urn: string;
  transformation_type?: string;
  transformation_description?: string;
  field_mappings?: Array<{ sourceField: string; targetField: string; transformationLogic?: string }>;
  confidence?: number;
  source_type?: string;
  source_job_id?: string;
}

export async function addEdge(
  data: AddEdgeRequest,
  userId: string
): Promise<LineageEdge> {
  const id = uuidv4();
  const result = await query<LineageEdge>(
    `INSERT INTO lineage_edges (
       id, upstream_urn, downstream_urn, transformation_type, transformation_description,
       field_mappings, confidence, source_type, source_job_id
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
      data.transformation_type ?? null,
      data.transformation_description ?? null,
      data.field_mappings ? JSON.stringify(data.field_mappings) : null,
      data.confidence ?? 1.0,
      data.source_type ?? 'manual',
      data.source_job_id ?? null,
    ]
  );

  const edge = result.rows[0];

  await publishEvent(TOPICS.LINEAGE_EVENTS, `${data.upstream_urn}→${data.downstream_urn}`, {
    eventType: 'LINEAGE_EDGE_ADDED',
    upstreamUrn: data.upstream_urn,
    downstreamUrn: data.downstream_urn,
    transformationType: data.transformation_type,
    sourceType: data.source_type ?? 'manual',
    userId,
  });

  return edge;
}

export async function processOpenLineageEvent(event: OpenLineageEvent): Promise<void> {
  if (event.eventType !== 'COMPLETE') {
    // Only process completed jobs to avoid partial lineage
    return;
  }

  const jobUrn = `urn:openlineage:job:${event.job.namespace}:${event.job.name}`;

  const edgePromises: Promise<LineageEdge>[] = [];

  for (const input of event.inputs) {
    const upstreamUrn = `urn:openlineage:dataset:${input.namespace}:${input.name}`;

    for (const output of event.outputs) {
      const downstreamUrn = `urn:openlineage:dataset:${output.namespace}:${output.name}`;

      edgePromises.push(
        addEdge(
          {
            upstream_urn: upstreamUrn,
            downstream_urn: downstreamUrn,
            transformation_type: 'openlineage',
            transformation_description: `Job: ${event.job.namespace}/${event.job.name}`,
            confidence: 1.0,
            source_type: 'openlineage',
            source_job_id: event.run.runId,
          },
          'openlineage-webhook'
        )
      );
    }
  }

  const results = await Promise.allSettled(edgePromises);
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.error(
      `[LineageService] ${failures.length}/${edgePromises.length} OpenLineage edges failed:`,
      failures.map((f) => (f as PromiseRejectedResult).reason)
    );
  }
}
