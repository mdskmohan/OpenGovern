/**
 * DataHub GMS Proxy Controller
 *
 * Implements a subset of DataHub's GMS REST API so that the `datahub-rest`
 * sink can emit metadata directly into OpenGovern's PostgreSQL store without
 * running a real DataHub GMS server.
 *
 * DataHub REST emitter calls:
 *   GET  /config                           → server capability handshake
 *   POST /aspects?action=ingestProposal    → primary metadata write path (MCPs)
 *   POST /entities?action=ingest           → legacy v1 write path
 *
 * We parse the MCP, extract the relevant fields, and upsert into
 * data_assets + asset_aspects tables.
 */

import { Request, Response } from 'express';
import { query } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

// ─── URN parsing ──────────────────────────────────────────────────────────────
// DataHub URN format: urn:li:dataset:(urn:li:dataPlatform:snowflake,db.schema.table,PROD)

interface ParsedUrn {
  entityType: string;     // dataset, dashboard, dataJob, dataFlow, mlModel, chart, dataFlow
  platform: string;       // snowflake, bigquery, postgresql, looker, dbt …
  name: string;           // fully qualified name
  env: string;            // PROD, DEV, …
}

function parseDataHubUrn(urn: string): ParsedUrn | null {
  try {
    // urn:li:dataset:(urn:li:dataPlatform:snowflake,mydb.schema.table,PROD)
    const datasetMatch = urn.match(
      /^urn:li:dataset:\(urn:li:dataPlatform:([^,]+),([^,]+),([^)]+)\)$/
    );
    if (datasetMatch) {
      return {
        entityType: 'table',
        platform: datasetMatch[1].toLowerCase(),
        name: datasetMatch[2],
        env: datasetMatch[3],
      };
    }

    // urn:li:dashboard:(looker,dashboards/123)
    const dashMatch = urn.match(/^urn:li:dashboard:\(([^,]+),([^)]+)\)$/);
    if (dashMatch) {
      return { entityType: 'dashboard', platform: dashMatch[1], name: dashMatch[2], env: 'PROD' };
    }

    // urn:li:chart:(looker,charts/123)
    const chartMatch = urn.match(/^urn:li:chart:\(([^,]+),([^)]+)\)$/);
    if (chartMatch) {
      return { entityType: 'dashboard', platform: chartMatch[1], name: chartMatch[2], env: 'PROD' };
    }

    // urn:li:dataJob:(urn:li:dataFlow:(airflow,dag_id,PROD),task_id)
    const jobMatch = urn.match(/^urn:li:dataJob:\(urn:li:dataFlow:\(([^,]+),([^,]+),[^)]+\),([^)]+)\)$/);
    if (jobMatch) {
      return { entityType: 'pipeline', platform: jobMatch[1], name: `${jobMatch[2]}.${jobMatch[3]}`, env: 'PROD' };
    }

    // urn:li:dataFlow:(airflow,dag_id,PROD)
    const flowMatch = urn.match(/^urn:li:dataFlow:\(([^,]+),([^,]+),[^)]+\)$/);
    if (flowMatch) {
      return { entityType: 'pipeline', platform: flowMatch[1], name: flowMatch[2], env: 'PROD' };
    }

    // urn:li:mlModel:(urn:li:dataPlatform:sagemaker,model_name,GLOBAL)
    const mlMatch = urn.match(/^urn:li:mlModel:\(urn:li:dataPlatform:([^,]+),([^,]+),[^)]+\)$/);
    if (mlMatch) {
      return { entityType: 'ml_model', platform: mlMatch[1], name: mlMatch[2], env: 'PROD' };
    }

    return null;
  } catch {
    return null;
  }
}

function entityTypeFromDataHub(dhType: string): string {
  const map: Record<string, string> = {
    dataset:   'table',
    dashboard: 'dashboard',
    chart:     'dashboard',
    dataJob:   'pipeline',
    dataFlow:  'pipeline',
    mlModel:   'ml_model',
    mlFeatureTable: 'table',
    notebook:  'report',
  };
  return map[dhType] || 'table';
}

// ─── Aspect parsers ───────────────────────────────────────────────────────────

function safeJson(val: string | object): Record<string, unknown> {
  if (typeof val === 'object') return val as Record<string, unknown>;
  try { return JSON.parse(val); } catch { return {}; }
}

async function upsertAsset(urn: string, parsed: ParsedUrn): Promise<string> {
  // Check if asset already exists
  const existing = await query<{ id: string }>(
    `SELECT id FROM data_assets WHERE urn = $1`, [urn]
  );

  if (existing.rows[0]) return existing.rows[0].id;

  // Derive a short name from the FQN
  const nameParts = parsed.name.split('.');
  const shortName = nameParts[nameParts.length - 1];

  const id = uuidv4();
  await query(
    `INSERT INTO data_assets
       (id, urn, name, fully_qualified_name, entity_type, platform, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     ON CONFLICT (urn) DO UPDATE SET
       name = EXCLUDED.name,
       entity_type = EXCLUDED.entity_type,
       platform = EXCLUDED.platform,
       last_ingested_at = NOW()`,
    [id, urn, shortName, parsed.name, parsed.entityType, parsed.platform]
  );
  return id;
}

async function storeAspect(assetId: string, aspectName: string, aspectData: Record<string, unknown>) {
  await query(
    `INSERT INTO asset_aspects (id, asset_id, aspect_type, aspect_data)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (asset_id, aspect_type) DO UPDATE SET
       aspect_data = EXCLUDED.aspect_data,
       updated_at = NOW()`,
    [uuidv4(), assetId, aspectName, JSON.stringify(aspectData)]
  );
}

async function applyAspect(assetId: string, urn: string, aspectName: string, rawAspect: Record<string, unknown>) {
  // Always store the raw aspect for audit
  await storeAspect(assetId, aspectName, rawAspect);

  // Also apply well-known aspects to the data_assets row directly for fast querying
  switch (aspectName) {
    case 'datasetProperties': {
      const props = rawAspect as { description?: string; name?: string; customProperties?: Record<string, string> };
      await query(
        `UPDATE data_assets SET
           description = COALESCE($2, description),
           last_ingested_at = NOW()
         WHERE id = $1`,
        [assetId, props.description ?? null]
      );
      break;
    }

    case 'ownership': {
      const owners = (rawAspect as { owners?: Array<{ owner: string; type: string }> }).owners ?? [];
      if (owners.length > 0) {
        // Extract display name from urn:li:corpuser:email@company.com
        const ownerUrn = owners[0].owner;
        const ownerName = ownerUrn.replace(/^urn:li:corpuser:/, '').replace(/^urn:li:corpGroup:/, '');
        await query(
          `UPDATE data_assets SET owner_name = $2 WHERE id = $1`,
          [assetId, ownerName]
        );
      }
      break;
    }

    case 'schemaMetadata': {
      // Schema metadata has column-level info — store as aspect, update asset
      const schema = rawAspect as {
        fields?: Array<{ fieldPath: string; nativeDataType: string; description?: string }>;
        platform?: string;
      };
      if (schema.fields) {
        await query(
          `UPDATE data_assets SET column_count = $2, last_ingested_at = NOW() WHERE id = $1`,
          [assetId, schema.fields.length]
        );
      }
      break;
    }

    case 'globalTags': {
      const tags = (rawAspect as { tags?: Array<{ tag: string }> }).tags ?? [];
      const tagNames = tags.map(t => t.tag.replace(/^urn:li:tag:/, ''));
      if (tagNames.length > 0) {
        await query(
          `UPDATE data_assets SET tags = $2 WHERE id = $1`,
          [assetId, JSON.stringify(tagNames)]
        );
      }
      break;
    }

    case 'status': {
      const removed = (rawAspect as { removed?: boolean }).removed ?? false;
      await query(
        `UPDATE data_assets SET is_active = $2 WHERE id = $1`,
        [assetId, !removed]
      );
      break;
    }

    case 'upstreamLineage': {
      // Store lineage edges
      const upstreams = (rawAspect as {
        upstreams?: Array<{ dataset: string; type: string }>
      }).upstreams ?? [];

      for (const up of upstreams) {
        const upUrn = up.dataset;
        // Ensure the upstream asset row exists (may be ingested later)
        const parsed = parseDataHubUrn(upUrn);
        if (parsed) {
          try {
            const upId = await upsertAsset(upUrn, parsed);
            await query(
              `INSERT INTO lineage_edges (id, upstream_urn, downstream_urn, upstream_id, downstream_id, lineage_type)
               VALUES ($1, $2, $3, $4, $5, 'TRANSFORMED')
               ON CONFLICT (upstream_urn, downstream_urn) DO NOTHING`,
              [uuidv4(), upUrn, urn, upId, assetId]
            );
          } catch { /* skip bad URNs */ }
        }
      }
      break;
    }

    case 'datasetProfile': {
      const profile = rawAspect as { rowCount?: number; columnCount?: number };
      await query(
        `UPDATE data_assets SET
           row_count = COALESCE($2, row_count),
           column_count = COALESCE($3, column_count)
         WHERE id = $1`,
        [assetId, profile.rowCount ?? null, profile.columnCount ?? null]
      );
      break;
    }

    case 'domains': {
      const domains = (rawAspect as { domains?: string[] }).domains ?? [];
      if (domains.length > 0) {
        const domainUrn = domains[0];
        const domainName = domainUrn.replace(/^urn:li:domain:/, '');
        const domainRow = await query<{ id: string }>(
          `SELECT id FROM domains WHERE name ILIKE $1 LIMIT 1`, [domainName]
        );
        if (domainRow.rows[0]) {
          await query(
            `UPDATE data_assets SET domain_id = $2 WHERE id = $1`,
            [assetId, domainRow.rows[0].id]
          );
        }
      }
      break;
    }
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/**
 * GET /config
 * DataHub GMS capability handshake — the REST emitter calls this first.
 */
export function getConfig(_req: Request, res: Response): void {
  res.json({
    versions: {
      'linkedin.datahub.gms': { version: '0.12.0', build: 'opengovern-proxy' },
    },
    'facets': {},
    'noCode': 'true',
    'retention': 'true',
  });
}

/**
 * POST /aspects?action=ingestProposal
 * Primary DataHub v2 metadata write path.
 * Each call carries one MetadataChangeProposal (MCP).
 */
export async function ingestProposal(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      proposal?: {
        entityType?: string;
        entityUrn?: string;
        aspectName?: string;
        changeType?: string;
        aspect?: { value?: string; contentType?: string };
      };
    };

    const proposal = body.proposal;
    if (!proposal?.entityUrn || !proposal?.aspectName) {
      res.status(400).json({ error: 'Missing proposal.entityUrn or proposal.aspectName' });
      return;
    }

    const urn = proposal.entityUrn;
    const aspectName = proposal.aspectName;
    const aspectValue = proposal.aspect?.value;

    // Parse the URN to determine asset type and platform
    const parsed = parseDataHubUrn(urn);
    if (!parsed && proposal.entityType) {
      // Fallback: use entityType from proposal
      parsed !== null || console.warn(`[DataHub proxy] Unrecognised URN: ${urn}`);
    }

    if (!parsed) {
      // Unknown URN format — accept but skip
      res.json({ urn, status: 'SKIPPED', reason: 'Unrecognised URN format' });
      return;
    }

    // Upsert the asset row
    const assetId = await upsertAsset(urn, parsed);

    // Parse and apply the aspect
    const aspectData = aspectValue ? safeJson(aspectValue) : {};
    await applyAspect(assetId, urn, aspectName, aspectData);

    res.json({ urn, status: 'UPSERTED', assetId });
  } catch (err) {
    console.error('[DataHub proxy] ingestProposal error:', err);
    res.status(500).json({ error: 'Internal proxy error', detail: String(err) });
  }
}

/**
 * POST /entities?action=ingest (DataHub v1 legacy path)
 * Some connectors still use this endpoint.
 */
export async function ingestEntities(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      entity?: {
        value?: {
          'com.linkedin.metadata.snapshot.DatasetSnapshot'?: {
            urn?: string;
            aspects?: Array<Record<string, unknown>>;
          };
        };
      };
    };

    const snapshot = body.entity?.value?.['com.linkedin.metadata.snapshot.DatasetSnapshot'];
    if (!snapshot?.urn) {
      res.json({ status: 'SKIPPED' });
      return;
    }

    const urn = snapshot.urn;
    const parsed = parseDataHubUrn(urn);
    if (!parsed) { res.json({ status: 'SKIPPED' }); return; }

    const assetId = await upsertAsset(urn, parsed);
    for (const aspect of (snapshot.aspects ?? [])) {
      const [aspectName, aspectData] = Object.entries(aspect)[0] ?? [];
      if (aspectName && aspectData) {
        await applyAspect(assetId, urn, aspectName, aspectData as Record<string, unknown>);
      }
    }

    res.json({ urn, status: 'UPSERTED', assetId });
  } catch (err) {
    console.error('[DataHub proxy] ingestEntities error:', err);
    res.status(500).json({ error: 'Internal proxy error', detail: String(err) });
  }
}

/** Health endpoint that DataHub REST emitter may ping */
export function proxyHealth(_req: Request, res: Response): void {
  res.json({ status: 'ok', service: 'opengovern-datahub-proxy' });
}
