/**
 * OPA Service — builds evaluation inputs and calls OPA for policy decisions.
 *
 * This is the only place in the codebase that constructs OPA inputs.
 * All services that need policy decisions call governance-service,
 * not OPA directly.
 */
import { opaClient } from '../config/opa';

export interface PolicyEvaluationInput {
  user: {
    id: string;
    roles: string[];
    permissions: string[];
    approved_requests?: Array<{ asset_urn: string; expires_at_ms: number }>;
  };
  resource: {
    urn: string;
    entity_type: string;
    classifications: string[];
    sensitivity: string;
    quality_score?: number;
    has_owner: boolean;
    has_data_contract?: boolean;
    upstream_count?: number;
    downstream_count?: number;
  };
  action: string;
  context?: Record<string, any>;
}

export interface PolicyDecision {
  allow: boolean;
  denied: boolean;
  reasons: Array<{ code: string; message: string; workflow_type?: string }>;
  warnings: Array<{ code: string; message: string }>;
}

export class OpaService {
  /**
   * Build the standard OPA input from user + asset + action context.
   * All policy evaluations use this same input shape.
   */
  buildInput(
    user: { id: string; roles: string[]; permissions: string[] },
    asset: {
      urn: string;
      entity_type: string;
      classifications?: string[];
      sensitivity?: string;
      quality_score?: number;
      has_owner?: boolean;
      has_data_contract?: boolean;
      upstream_count?: number;
      downstream_count?: number;
    },
    action: string,
    context?: Record<string, any>
  ): PolicyEvaluationInput {
    return {
      user: {
        id: user.id,
        roles: user.roles,
        permissions: user.permissions,
        approved_requests: [],  // populated from DB by caller if needed
      },
      resource: {
        urn: asset.urn,
        entity_type: asset.entity_type,
        classifications: asset.classifications || [],
        sensitivity: asset.sensitivity || 'internal',
        quality_score: asset.quality_score,
        has_owner: asset.has_owner ?? false,
        has_data_contract: asset.has_data_contract,
        upstream_count: asset.upstream_count,
        downstream_count: asset.downstream_count,
      },
      action,
      context,
    };
  }

  /**
   * Evaluate a list of active policies against an input.
   * Calls OPA for each policy path, then combines results.
   * Any deny → overall deny. All warnings collected.
   */
  async evaluateAll(policyIds: string[], input: PolicyEvaluationInput): Promise<PolicyDecision> {
    const decision: PolicyDecision = { allow: true, denied: false, reasons: [], warnings: [] };

    const results = await Promise.allSettled(
      policyIds.map(async (id) => {
        const result = await opaClient.evaluate(`opengovern_policies_${id.replace(/-/g, '_')}`, input);
        return { id, result };
      })
    );

    for (const settled of results) {
      if (settled.status === 'rejected') continue;
      const { result } = settled.value;
      if (!result) continue;

      // Collect denies
      if (result.deny && Array.isArray(result.deny)) {
        for (const reason of result.deny) {
          decision.denied = true;
          decision.allow = false;
          decision.reasons.push(reason);
        }
      }

      // Collect warnings
      if (result.warn && Array.isArray(result.warn)) {
        for (const warning of result.warn) {
          decision.warnings.push(warning);
        }
      }
    }

    return decision;
  }

  /**
   * Validate Rego syntax without deploying.
   * Called before activating a policy to ensure it's valid.
   */
  async validateRego(regoCode: string): Promise<{ valid: boolean; errors: string[] }> {
    return opaClient.validateRego(regoCode);
  }
}
