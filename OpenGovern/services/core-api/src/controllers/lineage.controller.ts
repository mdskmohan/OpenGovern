import { Request, Response } from 'express';
import { z } from 'zod';
import * as lineageService from '../services/lineage.service';
import { AuthenticatedRequest, OpenLineageEvent, LineageOptions } from '../types';

function handleError(res: Response, err: unknown): void {
  const error = err as NodeJS.ErrnoException;
  if (error.code === 'NOT_FOUND') {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: error.message } });
  } else {
    console.error('[LineageController]', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
}

const addEdgeSchema = z.object({
  upstream_urn: z.string().min(1, 'upstream_urn is required'),
  downstream_urn: z.string().min(1, 'downstream_urn is required'),
  transformation_type: z.string().optional(),
  transformation_description: z.string().optional(),
  field_mappings: z
    .array(
      z.object({
        sourceField: z.string(),
        targetField: z.string(),
        transformationLogic: z.string().optional(),
      })
    )
    .optional(),
  confidence: z.number().min(0).max(1).optional(),
  source_type: z.enum(['manual', 'ingestion', 'openlineage', 'inferred']).optional(),
  source_job_id: z.string().optional(),
});

export async function getGraph(req: Request, res: Response): Promise<void> {
  try {
    const urn = decodeURIComponent(req.params.urn);
    const depth = Math.min(10, Math.max(1, parseInt(req.query.depth as string || '3', 10)));
    const direction = (req.query.direction as LineageOptions['direction']) ?? 'both';

    if (!['upstream', 'downstream', 'both'].includes(direction)) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'direction must be upstream, downstream, or both' },
      });
      return;
    }

    const graph = await lineageService.getLineageGraph(urn, { depth, direction });
    res.json({ success: true, data: graph });
  } catch (err) {
    handleError(res, err);
  }
}

export async function addEdge(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as AuthenticatedRequest).user;
    const userId = user?.id ?? 'anonymous';

    const parsed = addEdgeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors.map((e) => e.message).join('; ') },
      });
      return;
    }

    const edge = await lineageService.addEdge(parsed.data, userId);
    res.status(201).json({ success: true, data: edge });
  } catch (err) {
    handleError(res, err);
  }
}

export async function getImpact(req: Request, res: Response): Promise<void> {
  try {
    const urn = decodeURIComponent(req.params.urn);
    const analysis = await lineageService.getImpactAnalysis(urn);
    res.json({ success: true, data: analysis });
  } catch (err) {
    handleError(res, err);
  }
}

export async function openlineageWebhook(req: Request, res: Response): Promise<void> {
  try {
    // API key validation (optional but recommended)
    const apiKey = req.headers['x-openlineage-api-key'] as string | undefined;
    if (process.env.OPENLINEAGE_API_KEY && apiKey !== process.env.OPENLINEAGE_API_KEY) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid OpenLineage API key' } });
      return;
    }

    const event = req.body as OpenLineageEvent;

    if (!event.eventType || !event.job || !Array.isArray(event.inputs) || !Array.isArray(event.outputs)) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid OpenLineage event format' },
      });
      return;
    }

    // Process asynchronously — respond immediately to prevent timeout
    lineageService.processOpenLineageEvent(event).catch((err) =>
      console.error('[LineageController] OpenLineage processing error:', err)
    );

    res.status(202).json({ success: true, data: { message: 'Event accepted for processing' } });
  } catch (err) {
    handleError(res, err);
  }
}
