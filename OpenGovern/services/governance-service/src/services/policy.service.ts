/**
 * Policy Service — business logic for governance policy management.
 *
 * Policies are stored in PostgreSQL and deployed to OPA when activated.
 * Only active policies are evaluated. Inactive policies are stored but ignored.
 */
import * as policyModel from '../models/policy.model';
import { opaClient } from '../config/opa';
import { publishGovernanceEvent } from '../config/kafka';
import { OpaService } from './opa.service';
import type { Policy } from '../models/policy.model';

const opaService = new OpaService();

export class PolicyService {
  /**
   * Create a new policy (starts inactive — must be explicitly activated).
   * Validates that policy_type is valid and rego_code is syntactically correct.
   */
  async createPolicy(data: {
    name: string;
    description?: string;
    policy_type: string;
    rego_code: string;
    scope?: object;
    enforcement_mode?: string;
  }, userId: string): Promise<Policy> {
    const validation = await opaService.validateRego(data.rego_code);
    if (!validation.valid) {
      throw Object.assign(new Error('Invalid Rego syntax'), {
        code: 'INVALID_REGO',
        details: validation.errors,
      });
    }

    const policy = await policyModel.create({ ...data, created_by: userId });

    await publishGovernanceEvent('POLICY_CREATED', {
      policy_id: policy.id,
      name: policy.name,
      policy_type: policy.policy_type,
      created_by: userId,
    });

    return policy;
  }

  /**
   * Update a policy. If active, re-deploys the new Rego to OPA immediately.
   */
  async updatePolicy(id: string, data: Partial<{
    name: string;
    description: string;
    rego_code: string;
    scope: object;
    enforcement_mode: string;
  }>, userId: string): Promise<Policy> {
    const existing = await policyModel.findById(id);
    if (!existing) throw Object.assign(new Error('Policy not found'), { code: 'NOT_FOUND', status: 404 });

    if (data.rego_code) {
      const validation = await opaService.validateRego(data.rego_code);
      if (!validation.valid) {
        throw Object.assign(new Error('Invalid Rego syntax'), { code: 'INVALID_REGO', details: validation.errors });
      }
    }

    const updated = await policyModel.update(id, data);

    // If active, re-deploy immediately
    if (updated.is_active && updated.rego_code) {
      await opaClient.deployPolicy(id, updated.rego_code);
    }

    return updated;
  }

  /**
   * Activate a policy:
   * 1. Validate Rego syntax
   * 2. Deploy to OPA
   * 3. Mark active in DB
   */
  async activatePolicy(id: string, userId: string): Promise<Policy> {
    const policy = await policyModel.findById(id);
    if (!policy) throw Object.assign(new Error('Policy not found'), { code: 'NOT_FOUND', status: 404 });
    if (policy.is_active) throw Object.assign(new Error('Policy is already active'), { code: 'ALREADY_ACTIVE', status: 400 });

    const validation = await opaService.validateRego(policy.rego_code);
    if (!validation.valid) {
      throw Object.assign(new Error('Cannot activate: Rego syntax is invalid'), {
        code: 'INVALID_REGO',
        details: validation.errors,
      });
    }

    await opaClient.deployPolicy(id, policy.rego_code);
    const opaPolicyId = `opengovern_${id.replace(/-/g, '_')}`;
    const activated = await policyModel.activate(id, opaPolicyId);

    await publishGovernanceEvent('POLICY_ACTIVATED', { policy_id: id, activated_by: userId });
    return activated;
  }

  /**
   * Deactivate a policy — removes from OPA, marks inactive in DB.
   */
  async deactivatePolicy(id: string, userId: string): Promise<Policy> {
    const policy = await policyModel.findById(id);
    if (!policy) throw Object.assign(new Error('Policy not found'), { code: 'NOT_FOUND', status: 404 });

    if (policy.is_active) {
      await opaClient.deletePolicy(id);
    }

    const deactivated = await policyModel.deactivate(id);
    await publishGovernanceEvent('POLICY_DEACTIVATED', { policy_id: id, deactivated_by: userId });
    return deactivated;
  }

  /**
   * Delete a policy. Must be deactivated first.
   */
  async deletePolicy(id: string, userId: string): Promise<void> {
    const policy = await policyModel.findById(id);
    if (!policy) throw Object.assign(new Error('Policy not found'), { code: 'NOT_FOUND', status: 404 });
    if (policy.is_active) {
      throw Object.assign(new Error('Deactivate policy before deleting'), { code: 'POLICY_ACTIVE', status: 400 });
    }
    await policyModel.delete(id);
  }

  /**
   * Evaluate all active policies applicable to an asset.
   * Saves evaluation result to DB for audit trail.
   */
  async evaluateForAsset(
    assetUrn: string,
    user: { id: string; roles: string[]; permissions: string[] },
    action: string,
    assetContext: object
  ): Promise<{ allow: boolean; denied: boolean; reasons: any[]; warnings: any[] }> {
    const activePolicies = await policyModel.getActivePoliciesForAsset(assetUrn);
    if (activePolicies.length === 0) {
      return { allow: true, denied: false, reasons: [], warnings: [] };
    }

    const input = opaService.buildInput(user, { urn: assetUrn, entity_type: 'table', ...assetContext as any }, action);
    const decision = await opaService.evaluateAll(activePolicies.map(p => p.id), input);

    // Save evaluation to DB for compliance reporting
    for (const policy of activePolicies) {
      await policyModel.saveEvaluation(
        policy.id,
        assetUrn,
        user.id,
        decision.denied ? 'deny' : 'allow',
        decision
      );
    }

    if (decision.denied) {
      await publishGovernanceEvent('POLICY_VIOLATED', {
        asset_urn: assetUrn,
        user_id: user.id,
        action,
        reasons: decision.reasons,
      });
    }

    return decision;
  }
}
