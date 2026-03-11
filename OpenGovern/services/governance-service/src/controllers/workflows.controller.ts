/**
 * Workflows Controller — HTTP handlers for workflow management.
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { workflowModel } from '../models/workflow.model';
import { WorkflowService } from '../services/workflow.service';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

const workflowService = new WorkflowService();

const InitiateSchema = z.object({
  definitionId: z.string().uuid(),
  assetUrn: z.string().min(1),
  context: z.record(z.any()).optional().default({}),
  assignedTo: z.string().uuid().optional(),
});

function handleError(res: Response, err: any) {
  const status = err.status || 500;
  res.status(status).json({ success: false, error: { code: err.code || 'INTERNAL_ERROR', message: err.message } });
}

export const workflowsController = {
  async listDefinitions(req: Request, res: Response) {
    try {
      const definitions = await workflowModel.listDefinitions();
      res.json({ success: true, data: definitions });
    } catch (err) { handleError(res, err); }
  },

  async listInstances(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await workflowModel.listInstances({
        asset_urn: req.query.assetUrn as string,
        assigned_to: req.query.assignedTo === 'me' ? user.id : req.query.assignedTo as string,
        status: req.query.status as string,
        workflow_type: req.query.workflowType as string,
        page,
        limit,
      });
      res.json({ success: true, data: result.items, meta: { total: result.total, page, limit } });
    } catch (err) { handleError(res, err); }
  },

  async getInstance(req: Request, res: Response) {
    try {
      const instance = await workflowModel.getInstance(req.params.id);
      if (!instance) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workflow not found' } });
      const events = await workflowModel.getEvents(req.params.id);
      res.json({ success: true, data: { ...instance, events } });
    } catch (err) { handleError(res, err); }
  },

  async initiate(req: Request, res: Response) {
    try {
      const { definitionId, assetUrn, context, assignedTo } = InitiateSchema.parse(req.body);
      const user = (req as AuthenticatedRequest).user;
      const instance = await workflowService.initiateWorkflow(definitionId, assetUrn, user.id, context, assignedTo);
      res.status(201).json({ success: true, data: instance });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', details: err.errors } });
      handleError(res, err);
    }
  },

  async approve(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user;
      const instance = await workflowService.transition(req.params.id, 'approve', user.id, user.roles, req.body.comment);
      res.json({ success: true, data: instance });
    } catch (err) { handleError(res, err); }
  },

  async reject(req: Request, res: Response) {
    try {
      if (!req.body.comment) return res.status(400).json({ success: false, error: { code: 'COMMENT_REQUIRED', message: 'A comment is required when rejecting' } });
      const user = (req as AuthenticatedRequest).user;
      const instance = await workflowService.transition(req.params.id, 'reject', user.id, user.roles, req.body.comment);
      res.json({ success: true, data: instance });
    } catch (err) { handleError(res, err); }
  },

  async comment(req: Request, res: Response) {
    try {
      if (!req.body.content) return res.status(400).json({ success: false, error: { code: 'CONTENT_REQUIRED', message: 'Comment content is required' } });
      const user = (req as AuthenticatedRequest).user;
      const event = await workflowService.addComment(req.params.id, user.id, req.body.content);
      res.json({ success: true, data: event });
    } catch (err) { handleError(res, err); }
  },

  async reassign(req: Request, res: Response) {
    try {
      if (!req.body.userId) return res.status(400).json({ success: false, error: { code: 'USER_REQUIRED', message: 'userId is required' } });
      const user = (req as AuthenticatedRequest).user;
      const instance = await workflowService.reassign(req.params.id, req.body.userId, user.id);
      res.json({ success: true, data: instance });
    } catch (err) { handleError(res, err); }
  },

  async cancel(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user;
      const instance = await workflowService.transition(req.params.id, 'cancel', user.id, user.roles, req.body.comment);
      res.json({ success: true, data: instance });
    } catch (err) { handleError(res, err); }
  },
};
