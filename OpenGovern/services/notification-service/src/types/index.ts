// ---------------------------------------------------------------------------
// Alert types
// ---------------------------------------------------------------------------

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';
export type TriggerType =
  | 'POLICY_VIOLATED'
  | 'WORKFLOW_OVERDUE'
  | 'WORKFLOW_APPROVED'
  | 'WORKFLOW_REJECTED'
  | 'WORKFLOW_CREATED'
  | 'QUALITY_SCORE_DROP'
  | 'QUALITY_RULE_FAILED'
  | 'INGESTION_FAILED';

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  status: AlertStatus;
  trigger_type: TriggerType;
  asset_urn?: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  acknowledged_at?: Date;
  acknowledged_by?: string;
  resolved_at?: Date;
  resolved_by?: string;
  resolution_note?: string;
}

export interface CreateAlertData {
  title: string;
  message: string;
  severity: AlertSeverity;
  trigger_type: TriggerType;
  asset_urn?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertFilters {
  severity?: AlertSeverity;
  status?: AlertStatus;
  trigger_type?: TriggerType;
  asset_urn?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Alert definitions (routing rules)
// ---------------------------------------------------------------------------

export type NotificationChannelType = 'email' | 'slack' | 'webhook';

export interface NotificationChannel {
  type: NotificationChannelType;
  // email: comma-separated recipients
  // slack: webhook URL
  // webhook: URL + optional secret
  config: Record<string, string>;
}

export interface AlertDefinition {
  id: string;
  name: string;
  description?: string;
  trigger_type: TriggerType;
  severity_filter?: AlertSeverity[];
  channels: NotificationChannel[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAlertDefinitionData {
  name: string;
  description?: string;
  trigger_type: TriggerType;
  severity_filter?: AlertSeverity[];
  channels: NotificationChannel[];
  is_active?: boolean;
}

// ---------------------------------------------------------------------------
// Notification delivery record
// ---------------------------------------------------------------------------

export type DeliveryStatus = 'pending' | 'sent' | 'failed';

export interface NotificationDelivery {
  id: string;
  alert_id: string;
  channel_type: NotificationChannelType;
  recipient: string;
  status: DeliveryStatus;
  error?: string;
  sent_at?: Date;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Email payload
// ---------------------------------------------------------------------------

export interface EmailPayload {
  to: string[];
  subject: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Slack Block Kit types
// ---------------------------------------------------------------------------

export interface SlackTextObject {
  type: 'mrkdwn' | 'plain_text';
  text: string;
  emoji?: boolean;
}

export interface SlackSectionBlock {
  type: 'section';
  text: SlackTextObject;
  fields?: SlackTextObject[];
}

export interface SlackHeaderBlock {
  type: 'header';
  text: SlackTextObject;
}

export interface SlackDividerBlock {
  type: 'divider';
}

export interface SlackActionBlock {
  type: 'actions';
  elements: Array<{
    type: 'button';
    text: SlackTextObject;
    url?: string;
    action_id: string;
  }>;
}

export interface SlackContextBlock {
  type: 'context';
  elements: SlackTextObject[];
}

export type SlackBlock =
  | SlackSectionBlock
  | SlackHeaderBlock
  | SlackDividerBlock
  | SlackActionBlock
  | SlackContextBlock;

export interface SlackMessage {
  text: string; // Fallback text for notifications
  blocks: SlackBlock[];
}

// ---------------------------------------------------------------------------
// Webhook payload
// ---------------------------------------------------------------------------

export interface WebhookPayload {
  event: string;
  alert: Alert;
  timestamp: string;
  source: 'opengovern-notification-service';
}

// ---------------------------------------------------------------------------
// Kafka event shapes (inbound)
// ---------------------------------------------------------------------------

export interface GovernanceKafkaEvent {
  event_type: TriggerType;
  policy_id?: string;
  policy_name?: string;
  workflow_id?: string;
  workflow_name?: string;
  instance_id?: string;
  asset_urn?: string;
  user_id?: string;
  user_email?: string;
  enforcement_mode?: 'BLOCK' | 'WARN' | 'LOG';
  timestamp: string;
  [key: string]: unknown;
}

export interface QualityKafkaEvent {
  event_type: TriggerType;
  asset_urn?: string;
  run_id?: string;
  previous_score?: number;
  current_score?: number;
  drop?: number;
  rule_id?: string;
  rule_name?: string;
  timestamp: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Workflow instance (minimal shape for email templates)
// ---------------------------------------------------------------------------

export interface WorkflowInstance {
  id: string;
  workflow_name: string;
  asset_urn?: string;
  requester_email?: string;
  assignee_email?: string;
  status: string;
  created_at: string;
}
