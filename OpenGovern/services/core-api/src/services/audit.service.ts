import { publishEvent, TOPICS } from '../config/kafka';
import { query } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export async function log(
  action: string,
  resourceType: string,
  resourceId: string,
  userId: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const id = uuidv4();
  const timestamp = new Date().toISOString();

  // Write to audit_logs table
  try {
    await query(
      `INSERT INTO audit_logs (id, action, resource_type, resource_id, user_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [id, action, resourceType, resourceId, userId, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error('Failed to write audit log to DB:', { action, resourceType, resourceId, error: err });
  }

  // Also publish to Kafka
  await publishEvent(TOPICS.AUDIT_EVENTS, `${resourceType}:${resourceId}`, {
    id,
    action,
    resourceType,
    resourceId,
    userId,
    metadata,
    timestamp,
  });
}
