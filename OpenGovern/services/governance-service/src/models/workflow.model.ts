/**
 * Workflow Model — database query layer
 *
 * All workflow-related DB operations: definitions, instances, events.
 * Uses parameterized queries throughout — no string interpolation.
 */
import { pool } from '../config/database';

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  workflow_type: string;
  definition: {
    states: string[];
    initial_state: string;
    transitions: Array<{ from: string; to: string; trigger: string; allowed_roles: string[] }>;
    on_enter: Record<string, string[]>;
  };
  sla_hours: number;
  is_active: boolean;
  created_at: Date;
}

export interface WorkflowInstance {
  id: string;
  definition_id: string;
  asset_urn: string;
  current_state: string;
  status: string;
  context: Record<string, any>;
  initiated_by: string;
  assigned_to: string | null;
  due_at: Date | null;
  completed_at: Date | null;
  access_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface WorkflowEvent {
  id: string;
  instance_id: string;
  user_id: string | null;
  event_type: string;
  from_state: string | null;
  to_state: string | null;
  trigger: string | null;
  content: string | null;
  created_at: Date;
}

export const workflowModel = {
  async listDefinitions(): Promise<WorkflowDefinition[]> {
    const { rows } = await pool.query(
      'SELECT * FROM workflow_definitions WHERE is_active = TRUE ORDER BY name ASC'
    );
    return rows;
  },

  async getDefinition(id: string): Promise<WorkflowDefinition> {
    const { rows } = await pool.query(
      'SELECT * FROM workflow_definitions WHERE id = $1',
      [id]
    );
    if (!rows[0]) throw new Error(`Workflow definition ${id} not found`);
    return rows[0];
  },

  async createInstance(data: {
    definition_id: string;
    asset_urn: string;
    initiated_by: string;
    initial_state: string;
    context: object;
    assigned_to?: string;
    due_at?: Date;
  }): Promise<WorkflowInstance> {
    const { rows } = await pool.query(
      `INSERT INTO workflow_instances
        (definition_id, asset_urn, current_state, status, context, initiated_by, assigned_to, due_at)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7)
       RETURNING *`,
      [
        data.definition_id,
        data.asset_urn,
        data.initial_state,
        JSON.stringify(data.context),
        data.initiated_by,
        data.assigned_to || null,
        data.due_at || null,
      ]
    );
    return rows[0];
  },

  async getInstance(id: string): Promise<WorkflowInstance | null> {
    const { rows } = await pool.query(
      `SELECT wi.*, wd.name as definition_name, wd.workflow_type, wd.definition, wd.sla_hours
       FROM workflow_instances wi
       JOIN workflow_definitions wd ON wd.id = wi.definition_id
       WHERE wi.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async listInstances(filters: {
    asset_urn?: string;
    assigned_to?: string;
    status?: string;
    workflow_type?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: WorkflowInstance[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.asset_urn) { conditions.push(`wi.asset_urn = $${idx++}`); params.push(filters.asset_urn); }
    if (filters.assigned_to) { conditions.push(`wi.assigned_to = $${idx++}`); params.push(filters.assigned_to); }
    if (filters.status) { conditions.push(`wi.status = $${idx++}`); params.push(filters.status); }
    if (filters.workflow_type) { conditions.push(`wd.workflow_type = $${idx++}`); params.push(filters.workflow_type); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM workflow_instances wi JOIN workflow_definitions wd ON wd.id = wi.definition_id ${where}`,
      params
    );

    const { rows } = await pool.query(
      `SELECT wi.*, wd.name as definition_name, wd.workflow_type
       FROM workflow_instances wi
       JOIN workflow_definitions wd ON wd.id = wi.definition_id
       ${where} ORDER BY wi.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    return { items: rows, total: parseInt(countResult.rows[0].count) };
  },

  async updateInstance(
    id: string,
    updates: {
      current_state?: string;
      status?: string;
      assigned_to?: string;
      completed_at?: Date;
      access_expires_at?: Date;
      context?: object;
    }
  ): Promise<WorkflowInstance> {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (updates.current_state !== undefined) { sets.push(`current_state = $${idx++}`); params.push(updates.current_state); }
    if (updates.status !== undefined) { sets.push(`status = $${idx++}`); params.push(updates.status); }
    if (updates.assigned_to !== undefined) { sets.push(`assigned_to = $${idx++}`); params.push(updates.assigned_to); }
    if (updates.completed_at !== undefined) { sets.push(`completed_at = $${idx++}`); params.push(updates.completed_at); }
    if (updates.access_expires_at !== undefined) { sets.push(`access_expires_at = $${idx++}`); params.push(updates.access_expires_at); }
    if (updates.context !== undefined) { sets.push(`context = $${idx++}`); params.push(JSON.stringify(updates.context)); }

    sets.push(`updated_at = NOW()`);
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE workflow_instances SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return rows[0];
  },

  async addEvent(instanceId: string, data: {
    user_id?: string;
    event_type: string;
    from_state?: string;
    to_state?: string;
    trigger?: string;
    content?: string;
  }): Promise<WorkflowEvent> {
    const { rows } = await pool.query(
      `INSERT INTO workflow_events
        (instance_id, user_id, event_type, from_state, to_state, trigger, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        instanceId,
        data.user_id || null,
        data.event_type,
        data.from_state || null,
        data.to_state || null,
        data.trigger || null,
        data.content || null,
      ]
    );
    return rows[0];
  },

  async getEvents(instanceId: string): Promise<WorkflowEvent[]> {
    const { rows } = await pool.query(
      `SELECT we.*, u.full_name as user_name, u.avatar_url as user_avatar
       FROM workflow_events we
       LEFT JOIN users u ON u.id = we.user_id
       WHERE we.instance_id = $1
       ORDER BY we.created_at ASC`,
      [instanceId]
    );
    return rows;
  },

  async getOverdueInstances(): Promise<WorkflowInstance[]> {
    const { rows } = await pool.query(
      `SELECT wi.*, wd.workflow_type
       FROM workflow_instances wi
       JOIN workflow_definitions wd ON wd.id = wi.definition_id
       WHERE wi.status = 'active'
         AND wi.due_at IS NOT NULL
         AND wi.due_at < NOW()`
    );
    return rows;
  },
};
