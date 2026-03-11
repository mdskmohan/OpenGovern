import { Request, Response } from 'express';
import * as assetService from '../services/asset.service';
import * as assetModel from '../models/asset.model';
import * as aspectModel from '../models/aspect.model';
import { AssetFilters, CreateAssetRequest, AuthenticatedRequest } from '../types';

function handleError(res: Response, err: unknown): void {
  const error = err as NodeJS.ErrnoException;
  if (error.code === 'NOT_FOUND') {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: error.message } });
  } else if (error.code === 'CONFLICT') {
    res.status(409).json({ success: false, error: { code: 'CONFLICT', message: error.message } });
  } else if (error.code === 'BAD_REQUEST') {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: error.message } });
  } else {
    console.error('[AssetsController]', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '20', 10)));

    const filters: AssetFilters = {
      entityType: req.query.entity_type as string | undefined,
      platform: req.query.platform as string | undefined,
      domainId: req.query.domain_id as string | undefined,
      ownerId: req.query.owner_id as string | undefined,
      certificationStatus: req.query.certification_status as string | undefined,
      sensitivity: req.query.sensitivity as string | undefined,
      search: req.query.search as string | undefined,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      isActive: true,
    };

    const result = await assetService.listAssets(filters, page, limit);
    res.json({ success: true, data: result });
  } catch (err) {
    handleError(res, err);
  }
}

export async function get(req: Request, res: Response): Promise<void> {
  try {
    const urn = decodeURIComponent(req.params.urn);
    const asset = await assetService.getAsset(urn);
    res.json({ success: true, data: asset });
  } catch (err) {
    handleError(res, err);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as AuthenticatedRequest).user;
    const userId = user?.id ?? 'anonymous';

    const body = req.body as CreateAssetRequest;
    if (!body.urn || !body.entity_type || !body.name || !body.platform || !body.fully_qualified_name) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'urn, entity_type, name, platform, fully_qualified_name are required' },
      });
      return;
    }

    const asset = await assetService.createAsset(body, userId);
    res.status(201).json({ success: true, data: asset });
  } catch (err) {
    handleError(res, err);
  }
}

export async function upsert(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as AuthenticatedRequest).user;
    const userId = user?.id ?? 'ingestion-service';

    const body = req.body as CreateAssetRequest;
    if (!body.urn || !body.entity_type || !body.name || !body.platform || !body.fully_qualified_name) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'urn, entity_type, name, platform, fully_qualified_name are required' },
      });
      return;
    }

    const asset = await assetService.upsertAsset(body, userId);
    res.json({ success: true, data: asset });
  } catch (err) {
    handleError(res, err);
  }
}

export async function updateAspect(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as AuthenticatedRequest).user;
    const userId = user?.id ?? 'anonymous';
    const urn = decodeURIComponent(req.params.urn);
    const { aspectType } = req.params;

    if (!req.body?.payload || typeof req.body.payload !== 'object') {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Request body must contain a "payload" object' },
      });
      return;
    }

    const aspect = await assetService.updateAspect(urn, aspectType, req.body.payload, userId);
    res.json({ success: true, data: aspect });
  } catch (err) {
    handleError(res, err);
  }
}

export async function softDelete(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as AuthenticatedRequest).user;
    const userId = user?.id ?? 'anonymous';
    await assetService.deleteAsset(req.params.id, userId);
    res.json({ success: true, data: { message: 'Asset deleted successfully' } });
  } catch (err) {
    handleError(res, err);
  }
}

export async function getSchema(req: Request, res: Response): Promise<void> {
  try {
    const urn = decodeURIComponent(req.params.urn);
    const asset = await assetModel.findByUrn(urn);
    if (!asset) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Asset not found: ${urn}` } });
      return;
    }
    const aspect = await aspectModel.getLatestAspect(asset.id, 'schema_metadata');
    if (!aspect) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No schema_metadata aspect found' } });
      return;
    }
    res.json({ success: true, data: aspect.payload });
  } catch (err) {
    handleError(res, err);
  }
}

export async function getOwnership(req: Request, res: Response): Promise<void> {
  try {
    const urn = decodeURIComponent(req.params.urn);
    const asset = await assetModel.findByUrn(urn);
    if (!asset) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Asset not found: ${urn}` } });
      return;
    }
    const aspect = await aspectModel.getLatestAspect(asset.id, 'ownership');
    if (!aspect) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No ownership aspect found' } });
      return;
    }
    res.json({ success: true, data: aspect.payload });
  } catch (err) {
    handleError(res, err);
  }
}

export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const stats = await assetModel.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    handleError(res, err);
  }
}
