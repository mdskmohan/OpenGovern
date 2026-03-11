/**
 * Alert model — all DB query logic for alerts, alert_definitions, and notification_deliveries.
 */

import { pool } from '../config/database';
import type {
  Alert,
  AlertDefinition,
  AlertFilters,
  CreateAlertData,
  CreateAlertDefinitionData,
  DeliveryStatus,
  NotificationChannelType,
} from '../types';

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export async function createAlert(data: CreateAlertData): Promise<Alert> {
  const result = await pool.query<Alert>(
    `INSERT INTO alerts
       (title, message, severity, status, trigger_type, asset_urn, metadata)
     VALUES ($1, $2, $3, 'open', $4, $5, $6)
     RETURNING *`,
    [
      data.title,
      data.message,
      data.severity,
      data.trigger_type,
      data.asset_urn ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  return result.rows[0];
}

export async function findAlertById(id: string): Promise<Alert | null> {
  const result = await pool.query<Alert>(
    `SELECT * FROM alerts WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function listAlerts(
  filters: AlertFilters,
  page = 1,
  limit = 20,
): Promise<{ items: Alert[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.severity) {
    conditions.push(`severity = $${idx++}`);
    params.push(filters.severity);
  }
  if (filters.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.trigger_type) {
    conditions.push(`trigger_type = $${idx++}`);
    params.push(filters.trigger_type);
  }
  if (filters.asset_urn) {
    conditions.push(`asset_urn = $${idx++}`);
    params.push(filters.asset_urn);
  }
  if (filters.from) {
    conditions.push(`created_at >= $${idx++}`);
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`created_at <= $${idx++}`);
    params.push(filters.to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const [countResult, rowsResult] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM alerts ${where}`, params),
    pool.query<Alert>(
      `SELECT * FROM alerts ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset],
    ),
  ]);

  return {
    items: rowsResult.rows,
    total: parseInt(countResult.rows[0].count, 10),
  };
}

export async function acknowledgeAlert(id: string, userId: string): Promise<Alert> {
  const result = await pool.query<Alert>(
    `UPDATE alerts
     SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $2
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [id, userId],
  );
  if (result.rows.length === 0) {
    throw new Error(`Alert ${id} not found or already acknowledged`);
  }
  return result.rows[0];
}

export async function resolveAlert(
  id: string,
  userId: string,
  note?: string,
): Promise<Alert> {
  const result = await pool.query<Alert>(
    `UPDATE alerts
     SET status = 'resolved', resolved_at = NOW(), resolved_by = $2, resolution_note = $3
     WHERE id = $1 AND status != 'resolved'
     RETURNING *`,
    [id, userId, note ?? null],
  );
  if (result.rows.length === 0) {
    throw new Error(`Alert ${id} not found or already resolved`);
  }
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Notification deliveries
// ---------------------------------------------------------------------------

export async function createDelivery(
  alertId: string,
  channelType: NotificationChannelType,
  recipient: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO notification_deliveries (alert_id, channel_type, recipient, status)
     VALUES ($1, $2, $3, 'pending')`,
    [alertId, channelType, recipient],
  );
}

export async function updateDelivery(
  id: string,
  status: DeliveryStatus,
  error?: string,
): Promise<void> {
  await pool.query(
    `UPDATE notification_deliveries
     SET status = $2, error = $3, sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE NULL END
     WHERE id = $1`,
    [id, status, error ?? null],
  );
}

export async function createDeliveryAndReturnId(
  alertId: string,
  channelType: NotificationChannelType,
  recipient: string,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO notification_deliveries (alert_id, channel_type, recipient, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id`,
    [alertId, channelType, recipient],
  );
  return result.rows[0].id;
}

// ---------------------------------------------------------------------------
// Alert definitions
// ---------------------------------------------------------------------------

export async function getDefinitions(): Promise<AlertDefinition[]> {
  const result = await pool.query<AlertDefinition>(
    `SELECT * FROM alert_definitions ORDER BY created_at DESC`,
  );
  return result.rows;
}

export async function getMatchingDefinitions(triggerType: string): Promise<AlertDefinition[]> {
  const result = await pool.query<AlertDefinition>(
    `SELECT * FROM alert_definitions
     WHERE trigger_type = $1 AND is_active = true`,
    [triggerType],
  );
  return result.rows;
}

export async function createDefinition(data: CreateAlertDefinitionData): Promise<AlertDefinition> {
  const result = await pool.query<AlertDefinition>(
    `INSERT INTO alert_definitions
       (name, description, trigger_type, severity_filter, channels, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.name,
      data.description ?? null,
      data.trigger_type,
      JSON.stringify(data.severity_filter ?? []),
      JSON.stringify(data.channels),
      data.is_active ?? true,
    ],
  );
  return result.rows[0];
}

export async function updateDefinition(
  id: string,
  data: Partial<CreateAlertDefinitionData>,
): Promise<AlertDefinition> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name); }
  if (data.description !== undefined) { fields.push(`description = $${idx++}`); params.push(data.description); }
  if (data.trigger_type !== undefined) { fields.push(`trigger_type = $${idx++}`); params.push(data.trigger_type); }
  if (data.severity_filter !== undefined) { fields.push(`severity_filter = $${idx++}`); params.push(JSON.stringify(data.severity_filter)); }
  if (data.channels !== undefined) { fields.push(`channels = $${idx++}`); params.push(JSON.stringify(data.channels)); }
  if (data.is_active !== undefined) { fields.push(`is_active = $${idx++}`); params.push(data.is_active); }

  if (fields.length === 0) throw new Error('No fields to update');
  fields.push(`updated_at = NOW()`);
  params.push(id);

  const result = await pool.query<AlertDefinition>(
    `UPDATE alert_definitions SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    params,
  );
  if (result.rows.length === 0) throw new Error(`AlertDefinition ${id} not found`);
  return result.rows[0];
}

export async function deleteDefinition(id: string): Promise<void> {
  const result = await pool.query(
    `DELETE FROM alert_definitions WHERE id = $1 RETURNING id`,
    [id],
  );
  if (result.rows.length === 0) throw new Error(`AlertDefinition ${id} not found`);
}
