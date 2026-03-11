/**
 * Policies Controller — HTTP handlers for policy management endpoints.
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import * as policyModel from '../models/policy.model';
import { PolicyService } from '../services/policy.service';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

const policyService = new PolicyService();

const CreatePolicySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  policy_type: z.enum(['access', 'usage', 'quality', 'retention', 'classification', 'data_contract', 'consent']),
  rego_code: z.string().min(10),
  scope: z.object({
    entityTypes: z.array(z.string()).optional(),
    domains: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
  enforcement_mode: z.enum(['warn', 'block', 'report']).optional(),
});

const EvaluateSchema = z.object({
  assetUrn: z.string(),
  action: z.string().default('read'),
  assetContext: z.record(z.any()).optional(),
});

function handleError(res: Response, err: any) {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  res.status(status).json({ success: false, error: { code, message: err.message, details: err.details } });
}

export const policiesController = {
  async list(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const filters = {
        policyType: req.query.policyType as string,
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
        page,
        limit,
      };
      const result = await policyModel.list(filters);
      res.json({ success: true, data: result.items, meta: { total: result.total, page, limit } });
    } catch (err) { handleError(res, err); }
  },

  async get(req: Request, res: Response) {
    try {
      const policy = await policyModel.findById(req.params.id);
      if (!policy) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Policy not found' } });
      res.json({ success: true, data: policy });
    } catch (err) { handleError(res, err); }
  },

  async create(req: Request, res: Response) {
    try {
      const data = CreatePolicySchema.parse(req.body);
      const user = (req as AuthenticatedRequest).user;
      const policy = await policyService.createPolicy(data, user.id);
      res.status(201).json({ success: true, data: policy });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.errors } });
      handleError(res, err);
    }
  },

  async update(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user;
      const policy = await policyService.updatePolicy(req.params.id, req.body, user.id);
      res.json({ success: true, data: policy });
    } catch (err) { handleError(res, err); }
  },

  async delete(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user;
      await policyService.deletePolicy(req.params.id, user.id);
      res.json({ success: true, data: { deleted: true } });
    } catch (err) { handleError(res, err); }
  },

  async activate(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user;
      const policy = await policyService.activatePolicy(req.params.id, user.id);
      res.json({ success: true, data: policy });
    } catch (err) { handleError(res, err); }
  },

  async deactivate(req: Request, res: Response) {
    try {
      const user = (req as AuthenticatedRequest).user;
      const policy = await policyService.deactivatePolicy(req.params.id, user.id);
      res.json({ success: true, data: policy });
    } catch (err) { handleError(res, err); }
  },

  async evaluate(req: Request, res: Response) {
    try {
      const { assetUrn, action, assetContext } = EvaluateSchema.parse(req.body);
      const user = (req as AuthenticatedRequest).user;
      const result = await policyService.evaluateForAsset(assetUrn, user, action, assetContext || {});
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', details: err.errors } });
      handleError(res, err);
    }
  },
};
