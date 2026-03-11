import { query, withTransaction } from '../config/database';
import {
  Policy,
  PolicyEvaluation,
  PolicyEvaluationResult,
  CreatePolicyRequest,
  UpdatePolicyRequest,
  PolicyScope,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

// ─── List / Find ──────────────────────────────────────────────────────────────

export async function list(filters: {
  policyType?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}): Promise<{ items: Policy[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.policyType) {
    conditions.push(`policy_type = $${idx++}`);
    params.push(filters.policyType);
  }
  if (filters.isActive !== undefined) {
    conditions.push(`is_active = $${idx++}`);
    params.push(filters.isActive);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (filters.page - 1) * filters.limit;

  const [countRes, dataRes] = await Promise.all([
    query<{ count: string }>(`SELECT COUNT(*) as count FROM governance_policies ${where}`, params),
    query<Policy>(
      `SELECT * FROM governance_policies ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, filters.limit, offset]
    ),
  ]);

  return {
    items: dataRes.rows,
    total: parseInt(countRes.rows[0]?.count ?? '0', 10),
  };
}

export async function findById(id: string): Promise<Policy | null> {
  const res = await query<Policy>(`SELECT * FROM governance_policies WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

// ─── Create / Update ─────────────────────────────────────────────────────────

export async function create(
  data: CreatePolicyRequest & { created_by: string }
): Promise<Policy> {
  const id = uuidv4();
  const res = await query<Policy>(
    `INSERT INTO governance_policies
       (id, name, description, policy_type, enforcement_mode, rego_code, scope, is_active, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $8)
     RETURNING *`,
    [
      id,
      data.name,
      data.description ?? null,
      data.policy_type,
      data.enforcement_mode,
      data.rego_code,
      JSON.stringify(data.scope ?? {}),
      data.created_by,
    ]
  );
  return res.rows[0];
}

export async function update(id: string, data: UpdatePolicyRequest & { updated_by: string }): Promise<Policy> {
  const fields: string[] = ['updated_by = $2', 'updated_at = NOW()'];
  const params: unknown[] = [id, data.updated_by];
  let idx = 3;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name); }
  if (data.description !== undefined) { fields.push(`description = $${idx++}`); params.push(data.description); }
  if (data.enforcement_mode !== undefined) { fields.push(`enforcement_mode = $${idx++}`); params.push(data.enforcement_mode); }
  if (data.rego_code !== undefined) { fields.push(`rego_code = $${idx++}`); params.push(data.rego_code); }
  if (data.scope !== undefined) { fields.push(`scope = $${idx++}`); params.push(JSON.stringify(data.scope)); }

  const res = await query<Policy>(
    `UPDATE governance_policies SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  if (res.rows.length === 0) throw Object.assign(new Error('Policy not found'), { code: 'NOT_FOUND' });
  return res.rows[0];
}

export async function activate(id: string, opaPolicyId: string): Promise<Policy> {
  const res = await query<Policy>(
    `UPDATE governance_policies SET is_active = true, opa_policy_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, opaPolicyId]
  );
  if (res.rows.length === 0) throw Object.assign(new Error('Policy not found'), { code: 'NOT_FOUND' });
  return res.rows[0];
}

export async function deactivate(id: string): Promise<Policy> {
  const res = await query<Policy>(
    `UPDATE governance_policies SET is_active = false, opa_policy_id = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  if (res.rows.length === 0) throw Object.assign(new Error('Policy not found'), { code: 'NOT_FOUND' });
  return res.rows[0];
}

export async function deletePermanent(id: string): Promise<void> {
  await query(`DELETE FROM governance_policies WHERE id = $1`, [id]);
}

// ─── Policy Matching ─────────────────────────────────────────────────────────

/**
 * Returns active policies that match the given asset.
 * A policy matches if its scope is empty (applies globally) OR
 * at least one scope dimension matches.
 */
export async function getActivePoliciesForAsset(
  assetUrn: string,
  entityType: string,
  domainId?: string | null,
  tags?: string[]
): Promise<Policy[]> {
  // Fetch all active policies — scope matching is done in JS for flexibility
  const res = await query<Policy>(
    `SELECT * FROM governance_policies WHERE is_active = true ORDER BY created_at ASC`
  );

  return res.rows.filter((policy) => {
    const scope = policy.scope as PolicyScope;
    if (!scope || Object.keys(scope).length === 0) return true; // global policy

    if (scope.entity_types && scope.entity_types.length > 0) {
      if (!scope.entity_types.includes(entityType)) return false;
    }
    if (scope.domain_ids && scope.domain_ids.length > 0 && domainId) {
      if (!scope.domain_ids.includes(domainId)) return false;
    }
    if (scope.tags && scope.tags.length > 0 && tags && tags.length > 0) {
      const hasOverlap = scope.tags.some((t) => tags.includes(t));
      if (!hasOverlap) return false;
    }
    return true;
  });
}

// ─── Evaluation Persistence ───────────────────────────────────────────────────

export async function saveEvaluation(
  policyId: string,
  assetUrn: string,
  userId: string,
  result: PolicyEvaluationResult,
  decisionLog: Record<string, unknown>
): Promise<void> {
  const id = uuidv4();
  await query(
    `INSERT INTO policy_evaluations (id, policy_id, asset_urn, user_id, result, decision_log)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, policyId, assetUrn, userId, JSON.stringify(result), JSON.stringify(decisionLog)]
  );
}
