import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as AlertModel from '../models/alert.model';
import type { AlertFilters, CreateAlertDefinitionData } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

function fail(res: Response, message: string, status = 400): void {
  res.status(status).json({ success: false, error: message });
}

function currentUser(req: Request): { id: string; email: string } {
  return { id: req.user?.id ?? 'system', email: req.user?.email ?? 'system' };
}

// ---------------------------------------------------------------------------
// Alert CRUD
// ---------------------------------------------------------------------------

const AlertListSchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
  status: z.enum(['open', 'acknowledged', 'resolved']).optional(),
  trigger_type: z.string().optional(),
  asset_urn: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * GET /alerts
 */
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = AlertListSchema.parse(req.query);
    const filters: AlertFilters = q;
    const result = await AlertModel.listAlerts(filters, q.page, q.limit);
    ok(res, result);
  } catch (err) {
    if (err instanceof z.ZodError) { fail(res, err.errors.map((e) => e.message).join(', ')); return; }
    next(err);
  }
}

/**
 * GET /alerts/:id
 */
export async function get(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const alert = await AlertModel.findAlertById(req.params.id);
    if (!alert) { fail(res, `Alert ${req.params.id} not found`, 404); return; }
    ok(res, alert);
  } catch (err) { next(err); }
}

/**
 * POST /alerts/:id/acknowledge
 */
export async function acknowledge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, email } = currentUser(req);
    const alert = await AlertModel.acknowledgeAlert(req.params.id, email || id);
    ok(res, alert);
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) { fail(res, err.message, 404); return; }
    next(err);
  }
}

/**
 * POST /alerts/:id/resolve
 */
export async function resolve(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const NoteSchema = z.object({ note: z.string().max(1000).optional() });
    const { note } = NoteSchema.parse(req.body);
    const { id, email } = currentUser(req);
    const alert = await AlertModel.resolveAlert(req.params.id, email || id, note);
    ok(res, alert);
  } catch (err) {
    if (err instanceof z.ZodError) { fail(res, err.errors.map((e) => e.message).join(', ')); return; }
    if (err instanceof Error && err.message.includes('not found')) { fail(res, err.message, 404); return; }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Alert Definitions
// ---------------------------------------------------------------------------

const ChannelSchema = z.object({
  type: z.enum(['email', 'slack', 'webhook']),
  config: z.record(z.string()),
});

const CreateDefinitionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  trigger_type: z.enum([
    'POLICY_VIOLATED', 'WORKFLOW_OVERDUE', 'WORKFLOW_APPROVED',
    'WORKFLOW_REJECTED', 'WORKFLOW_CREATED', 'QUALITY_SCORE_DROP',
    'QUALITY_RULE_FAILED', 'INGESTION_FAILED',
  ]),
  severity_filter: z.array(
    z.enum(['critical', 'high', 'medium', 'low', 'info'])
  ).optional(),
  channels: z.array(ChannelSchema).min(1),
  is_active: z.boolean().default(true),
});

/**
 * GET /alerts/definitions
 */
export async function listDefinitions(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const defs = await AlertModel.getDefinitions();
    ok(res, defs);
  } catch (err) { next(err); }
}

/**
 * POST /alerts/definitions
 */
export async function createDefinition(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CreateDefinitionSchema.parse(req.body);
    const def = await AlertModel.createDefinition(body as CreateAlertDefinitionData);
    ok(res, def, 201);
  } catch (err) {
    if (err instanceof z.ZodError) { fail(res, err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')); return; }
    next(err);
  }
}

/**
 * PUT /alerts/definitions/:id
 */
export async function updateDefinition(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CreateDefinitionSchema.partial().parse(req.body);
    const def = await AlertModel.updateDefinition(req.params.id, body as Partial<CreateAlertDefinitionData>);
    ok(res, def);
  } catch (err) {
    if (err instanceof z.ZodError) { fail(res, err.errors.map((e) => e.message).join(', ')); return; }
    if (err instanceof Error && err.message.includes('not found')) { fail(res, err.message, 404); return; }
    next(err);
  }
}

/**
 * DELETE /alerts/definitions/:id
 */
export async function deleteDefinition(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await AlertModel.deleteDefinition(req.params.id);
    ok(res, { deleted: true, id: req.params.id });
  } catch (err) {
    if (err instanceof Error && err.message.includes('not found')) { fail(res, err.message, 404); return; }
    next(err);
  }
}
