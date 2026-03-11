/**
 * Core alert processing service.
 *
 * Receives events from Kafka, decides whether to create alerts,
 * and routes notifications to configured channels.
 */

import axios from 'axios';
import { env } from '../config/env';
import * as AlertModel from '../models/alert.model';
import type {
  Alert,
  AlertSeverity,
  CreateAlertData,
  GovernanceKafkaEvent,
  NotificationChannel,
  QualityKafkaEvent,
} from '../types';
import { EmailService } from './email.service';
import { SlackService } from './slack.service';
import { WebhookService } from './webhook.service';

export class AlertService {
  constructor(
    private readonly email: EmailService,
    private readonly slack: SlackService,
    private readonly webhook: WebhookService,
  ) {}

  /**
   * Create an alert and fire notifications via all configured channels.
   *
   * 1. Persist alert to DB
   * 2. Find matching alert definitions by trigger_type
   * 3. For each definition, deliver to each configured channel
   * 4. Record delivery attempts in notification_deliveries
   */
  async createAlert(data: CreateAlertData): Promise<Alert> {
    const alert = await AlertModel.createAlert(data);

    const definitions = await AlertModel.getMatchingDefinitions(data.trigger_type);
    if (definitions.length === 0) {
      console.log(`[AlertService] No definitions matched trigger_type=${data.trigger_type} — alert saved but no notifications sent`);
      return alert;
    }

    for (const def of definitions) {
      // Apply severity filter if configured
      if (
        def.severity_filter &&
        def.severity_filter.length > 0 &&
        !def.severity_filter.includes(alert.severity)
      ) {
        continue;
      }

      const recipientMap = await this.getRecipients(alert, def.channels);

      for (const channel of def.channels) {
        const recipients = recipientMap.get(channel.type) ?? [];

        for (const recipient of recipients) {
          const deliveryId = await AlertModel.createDeliveryAndReturnId(
            alert.id,
            channel.type,
            recipient,
          );

          try {
            await this.deliver(channel, recipient, alert);
            await AlertModel.updateDelivery(deliveryId, 'sent');
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(
              `[AlertService] Delivery failed: channel=${channel.type} recipient=${recipient}:`,
              errorMsg,
            );
            await AlertModel.updateDelivery(deliveryId, 'failed', errorMsg);
          }
        }
      }
    }

    return alert;
  }

  /**
   * Process a governance.events Kafka message.
   */
  async processGovernanceEvent(event: GovernanceKafkaEvent): Promise<void> {
    const type = event.event_type;

    let data: CreateAlertData | null = null;

    if (type === 'POLICY_VIOLATED') {
      const severity: AlertSeverity =
        event.enforcement_mode === 'BLOCK'
          ? 'critical'
          : event.enforcement_mode === 'WARN'
          ? 'high'
          : 'medium';

      data = {
        title: `Policy Violation: ${event.policy_name ?? event.policy_id ?? 'Unknown Policy'}`,
        message: `A policy violation was detected${event.asset_urn ? ` on asset ${event.asset_urn}` : ''}.
Mode: ${event.enforcement_mode ?? 'UNKNOWN'}`,
        severity,
        trigger_type: 'POLICY_VIOLATED',
        asset_urn: event.asset_urn,
        metadata: event as Record<string, unknown>,
      };
    } else if (type === 'WORKFLOW_OVERDUE') {
      data = {
        title: `Workflow Overdue: ${event.workflow_name ?? event.workflow_id ?? 'Unknown'}`,
        message: `A workflow approval request is overdue and requires immediate attention.`,
        severity: 'high',
        trigger_type: 'WORKFLOW_OVERDUE',
        asset_urn: event.asset_urn,
        metadata: event as Record<string, unknown>,
      };
    } else if (type === 'WORKFLOW_APPROVED') {
      data = {
        title: `Workflow Approved: ${event.workflow_name ?? event.workflow_id ?? 'Unknown'}`,
        message: `Your workflow request has been approved.`,
        severity: 'info',
        trigger_type: 'WORKFLOW_APPROVED',
        asset_urn: event.asset_urn,
        metadata: event as Record<string, unknown>,
      };
    } else if (type === 'WORKFLOW_REJECTED') {
      data = {
        title: `Workflow Rejected: ${event.workflow_name ?? event.workflow_id ?? 'Unknown'}`,
        message: `Your workflow request has been rejected.`,
        severity: 'medium',
        trigger_type: 'WORKFLOW_REJECTED',
        asset_urn: event.asset_urn,
        metadata: event as Record<string, unknown>,
      };
    } else if (type === 'WORKFLOW_CREATED') {
      data = {
        title: `New Workflow: ${event.workflow_name ?? event.workflow_id ?? 'Unknown'}`,
        message: `A new workflow request requires your approval.`,
        severity: 'info',
        trigger_type: 'WORKFLOW_CREATED',
        asset_urn: event.asset_urn,
        metadata: event as Record<string, unknown>,
      };
    }

    if (data) {
      await this.createAlert(data);
    } else {
      console.debug(`[AlertService] Ignored governance event type: ${type}`);
    }
  }

  /**
   * Process a quality.events Kafka message.
   */
  async processQualityEvent(event: QualityKafkaEvent): Promise<void> {
    const type = event.event_type;
    let data: CreateAlertData | null = null;

    if (type === 'QUALITY_SCORE_DROP') {
      const drop = event.drop ?? 0;
      const severity: AlertSeverity =
        drop >= 30 ? 'critical' : drop >= 20 ? 'high' : drop >= 10 ? 'medium' : 'low';

      data = {
        title: `Quality Score Drop: ${event.asset_urn ?? 'Unknown Asset'}`,
        message: `Quality score dropped by ${drop.toFixed(1)} points` +
          ` (${event.previous_score?.toFixed(1)} → ${event.current_score?.toFixed(1)})` +
          (event.asset_urn ? ` on asset ${event.asset_urn}` : '.'),
        severity,
        trigger_type: 'QUALITY_SCORE_DROP',
        asset_urn: event.asset_urn,
        metadata: event as Record<string, unknown>,
      };
    } else if (type === 'QUALITY_RULE_FAILED') {
      data = {
        title: `Quality Rule Failed: ${event.rule_name ?? event.rule_id ?? 'Unknown Rule'}`,
        message: `A critical quality rule failed${event.asset_urn ? ` on asset ${event.asset_urn}` : ''}.`,
        severity: 'critical',
        trigger_type: 'QUALITY_RULE_FAILED',
        asset_urn: event.asset_urn,
        metadata: event as Record<string, unknown>,
      };
    } else if (type === 'INGESTION_FAILED') {
      data = {
        title: `Ingestion Failed: ${event.asset_urn ?? 'Unknown Asset'}`,
        message: `An ingestion job failed${event.asset_urn ? ` for asset ${event.asset_urn}` : ''}.`,
        severity: 'high',
        trigger_type: 'INGESTION_FAILED',
        asset_urn: event.asset_urn,
        metadata: event as Record<string, unknown>,
      };
    }

    if (data) {
      await this.createAlert(data);
    } else {
      console.debug(`[AlertService] Ignored quality event type: ${type}`);
    }
  }

  /**
   * Route a notification to the appropriate delivery method.
   */
  private async deliver(
    channel: NotificationChannel,
    recipient: string,
    alert: Alert,
  ): Promise<void> {
    if (channel.type === 'email') {
      await this.email.sendAlertEmail(alert, [recipient]);
    } else if (channel.type === 'slack') {
      const webhookUrl = channel.config.webhook_url ?? env.SLACK_WEBHOOK_URL ?? recipient;
      await this.slack.sendAlertNotification(alert, webhookUrl);
    } else if (channel.type === 'webhook') {
      const webhookUrl = channel.config.url ?? recipient;
      const secret = channel.config.secret;
      await this.webhook.deliver(
        webhookUrl,
        {
          event: `alert.${alert.trigger_type}`,
          alert,
          timestamp: new Date().toISOString(),
          source: 'opengovern-notification-service',
        },
        secret,
      );
    }
  }

  /**
   * Determine the recipient addresses/URLs for each channel type.
   *
   * Priority:
   * 1. Explicit recipients in channel.config
   * 2. Asset owner and domain steward (fetched from core-api)
   * 3. Fallback: empty (delivery skipped)
   */
  private async getRecipients(
    alert: Alert,
    channels: NotificationChannel[],
  ): Promise<Map<string, string[]>> {
    const recipientMap = new Map<string, string[]>();

    // Collect explicit recipients from channel configs
    for (const channel of channels) {
      const explicit: string[] = [];
      if (channel.type === 'email' && channel.config.recipients) {
        explicit.push(...channel.config.recipients.split(',').map((e) => e.trim()).filter(Boolean));
      } else if (channel.type === 'slack' && channel.config.webhook_url) {
        explicit.push(channel.config.webhook_url);
      } else if (channel.type === 'webhook' && channel.config.url) {
        explicit.push(channel.config.url);
      }
      if (explicit.length > 0) {
        recipientMap.set(channel.type, explicit);
      }
    }

    // For email channels without explicit recipients, look up asset owner + steward
    const emailChannel = channels.find((c) => c.type === 'email');
    if (emailChannel && !recipientMap.has('email') && alert.asset_urn) {
      try {
        const response = await axios.get<{
          data: { owners: Array<{ email: string }> };
        }>(
          `${env.CORE_API_URL}/api/v1/assets/${encodeURIComponent(alert.asset_urn)}`,
          { timeout: 5_000 },
        );
        const owners = response.data?.data?.owners ?? [];
        const emails = owners.map((o) => o.email).filter(Boolean);
        if (emails.length > 0) {
          recipientMap.set('email', emails);
        }
      } catch {
        console.warn(`[AlertService] Could not fetch asset owners for ${alert.asset_urn}`);
      }
    }

    return recipientMap;
  }
}
