import axios from 'axios';
import * as assetModel from '../models/asset.model';
import * as aspectModel from '../models/aspect.model';
import * as searchService from './search.service';
import * as cacheService from './cache.service';
import * as auditService from './audit.service';
import { publishEvent, TOPICS } from '../config/kafka';
import { env } from '../config/env';
import {
  DataAsset,
  AssetAspect,
  AssetFilters,
  CreateAssetRequest,
  FullAsset,
  AssetSummary,
  PaginatedResponse,
  FullAssetWithGovernance,
  GovernancePolicy,
} from '../types';

// Aspect validators
import * as schemaAspect from '../aspects/schema.aspect';
import * as ownershipAspect from '../aspects/ownership.aspect';
import * as descriptionAspect from '../aspects/description.aspect';
import * as lineageAspect from '../aspects/lineage.aspect';
import * as classificationAspect from '../aspects/classification.aspect';
import * as qualityAspect from '../aspects/quality.aspect';

type AspectModule = {
  validate: (payload: unknown) => boolean;
  normalize: (rawData: Record<string, unknown>) => Record<string, unknown>;
};

const ASPECT_REGISTRY: Record<string, AspectModule> = {
  schema_metadata: schemaAspect as unknown as AspectModule,
  ownership: ownershipAspect as unknown as AspectModule,
  description: descriptionAspect as unknown as AspectModule,
  lineage_info: lineageAspect as unknown as AspectModule,
  classification: classificationAspect as unknown as AspectModule,
  quality_metrics: qualityAspect as unknown as AspectModule,
};

export async function getAsset(urn: string): Promise<FullAsset> {
  // Check cache first
  const cached = await cacheService.getAsset(urn);
  if (cached) return cached;

  const asset = await assetModel.findByUrn(urn);
  if (!asset) {
    const err = new Error(`Asset not found: ${urn}`);
    (err as NodeJS.ErrnoException).code = 'NOT_FOUND';
    throw err;
  }

  const allAspects = await aspectModel.getAllAspects(asset.id);

  const aspectMap: FullAsset['aspects'] = {};
  for (const aspect of allAspects) {
    (aspectMap as Record<string, unknown>)[aspect.aspect_type] = aspect.payload;
  }

  const fullAsset: FullAsset = { ...asset, aspects: aspectMap };

  await cacheService.setAsset(fullAsset);
  return fullAsset;
}

export async function listAssets(
  filters: AssetFilters,
  page: number,
  limit: number
): Promise<PaginatedResponse<AssetSummary>> {
  const { items, total } = await assetModel.list(filters, page, limit);
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function createAsset(
  data: CreateAssetRequest,
  userId: string
): Promise<DataAsset> {
  // Check for duplicate URN
  const existing = await assetModel.findByUrn(data.urn);
  if (existing) {
    const err = new Error(`Asset with URN '${data.urn}' already exists`);
    (err as NodeJS.ErrnoException).code = 'CONFLICT';
    throw err;
  }

  const asset = await assetModel.create({ ...data, created_by: userId, updated_by: userId });

  // Publish event
  await publishEvent(TOPICS.METADATA_CHANGES, asset.urn, {
    eventType: 'ASSET_CREATED',
    assetUrn: asset.urn,
    entityType: asset.entity_type,
    platform: asset.platform,
    userId,
  });

  // Index in Elasticsearch (non-blocking)
  searchService.indexAsset(asset).catch((err) =>
    console.error('Failed to index new asset:', err)
  );

  // Audit log
  await auditService.log('ASSET_CREATED', 'data_asset', asset.id, userId, {
    urn: asset.urn,
    name: asset.name,
  });

  return asset;
}

export async function upsertAsset(
  data: CreateAssetRequest & { updated_by?: string },
  userId: string
): Promise<DataAsset> {
  const asset = await assetModel.upsertByUrn(data.urn, {
    ...data,
    created_by: userId,
    updated_by: userId,
  });

  await publishEvent(TOPICS.METADATA_CHANGES, asset.urn, {
    eventType: 'ASSET_UPSERTED',
    assetUrn: asset.urn,
    entityType: asset.entity_type,
    platform: asset.platform,
    userId,
  });

  searchService.indexAsset(asset).catch((err) =>
    console.error('Failed to index upserted asset:', err)
  );

  await auditService.log('ASSET_UPSERTED', 'data_asset', asset.id, userId, {
    urn: asset.urn,
  });

  return asset;
}

export async function updateAspect(
  assetUrn: string,
  aspectType: string,
  payload: Record<string, unknown>,
  userId: string
): Promise<AssetAspect> {
  const aspectModule = ASPECT_REGISTRY[aspectType];
  if (!aspectModule) {
    const err = new Error(`Unknown aspect type: ${aspectType}`);
    (err as NodeJS.ErrnoException).code = 'BAD_REQUEST';
    throw err;
  }

  if (!aspectModule.validate(payload)) {
    const err = new Error(`Invalid payload for aspect type: ${aspectType}`);
    (err as NodeJS.ErrnoException).code = 'BAD_REQUEST';
    throw err;
  }

  const normalizedPayload = aspectModule.normalize(payload);

  const asset = await assetModel.findByUrn(assetUrn);
  if (!asset) {
    const err = new Error(`Asset not found: ${assetUrn}`);
    (err as NodeJS.ErrnoException).code = 'NOT_FOUND';
    throw err;
  }

  const savedAspect = await aspectModel.upsertAspect(asset.id, aspectType, normalizedPayload, userId);

  // If it's a quality update, also update the quality_score on the asset itself
  if (aspectType === 'quality_metrics') {
    const qp = normalizedPayload as unknown as qualityAspect.QualityPayload;
    await assetModel.update(asset.id, { quality_score: qp.overallScore, updated_by: userId });
  }

  // If it's an ownership update, update owner_name on the asset
  if (aspectType === 'ownership') {
    const op = normalizedPayload as unknown as ownershipAspect.OwnershipPayload;
    const primaryOwner = op.owners.find(
      (o) => o.type === 'technical_owner' || o.type === 'business_owner'
    ) || op.owners[0];
    if (primaryOwner) {
      await assetModel.update(asset.id, {
        owner_name: primaryOwner.name || primaryOwner.email || null,
        updated_by: userId,
      });
    }
  }

  // Invalidate cache
  await cacheService.invalidateAsset(assetUrn);

  // Re-index in Elasticsearch
  const updatedAsset = await assetModel.findByUrn(assetUrn);
  if (updatedAsset) {
    searchService.indexAsset(updatedAsset).catch((err) =>
      console.error('Failed to re-index asset after aspect update:', err)
    );
  }

  // Publish event
  await publishEvent(TOPICS.METADATA_CHANGES, assetUrn, {
    eventType: 'ASPECT_UPDATED',
    assetUrn,
    aspectType,
    version: savedAspect.version,
    userId,
  });

  await auditService.log('ASPECT_UPDATED', 'asset_aspect', savedAspect.id, userId, {
    assetUrn,
    aspectType,
    version: savedAspect.version,
  });

  return savedAspect;
}

export async function deleteAsset(id: string, userId: string): Promise<void> {
  const asset = await assetModel.findById(id);
  if (!asset) {
    const err = new Error(`Asset not found: ${id}`);
    (err as NodeJS.ErrnoException).code = 'NOT_FOUND';
    throw err;
  }

  await assetModel.softDelete(id);
  await cacheService.invalidateAsset(asset.urn);
  await searchService.deleteFromIndex(asset.urn);

  await publishEvent(TOPICS.METADATA_CHANGES, asset.urn, {
    eventType: 'ASSET_DELETED',
    assetUrn: asset.urn,
    userId,
  });

  await auditService.log('ASSET_DELETED', 'data_asset', id, userId, { urn: asset.urn });
}

export async function getAssetWithGovernance(
  urn: string,
  requestingUserId: string
): Promise<FullAssetWithGovernance> {
  const asset = await getAsset(urn);

  let policies: GovernancePolicy[] = [];
  let complianceStatus: 'compliant' | 'warning' | 'violation' = 'compliant';
  let accessAllowed = true;
  const reasons: string[] = [];

  try {
    const response = await axios.post(
      `${env.GOVERNANCE_SERVICE_URL}/api/policies/evaluate`,
      {
        assetUrn: urn,
        userId: requestingUserId,
        action: 'read',
        asset: {
          urn: asset.urn,
          entityType: asset.entity_type,
          sensitivity: asset.sensitivity,
          certificationStatus: asset.certification_status,
          qualityScore: asset.quality_score,
          classifications: (asset.aspects?.classification as { classifications?: unknown[] } | undefined)?.classifications || [],
        },
      },
      { timeout: 5000 }
    );

    const govResult = response.data as {
      policies: GovernancePolicy[];
      allowed: boolean;
      reasons: string[];
    };
    policies = govResult.policies || [];

    if (policies.some((p) => p.decision === 'deny')) {
      complianceStatus = 'violation';
      accessAllowed = govResult.allowed;
    } else if (policies.some((p) => p.decision === 'warn')) {
      complianceStatus = 'warning';
    }

    reasons.push(...(govResult.reasons || []));
  } catch (err) {
    // Governance service unavailable - fail open for reads but log it
    console.warn('Governance service unavailable for policy check:', err);
    reasons.push('Governance service unavailable - access granted by default');
  }

  return {
    ...asset,
    governance: {
      policies,
      complianceStatus,
      accessAllowed,
      reasons,
    },
  };
}
