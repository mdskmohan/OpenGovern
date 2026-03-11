/**
 * Slack notification service using incoming webhooks and Block Kit.
 */

import axios from 'axios';
import { env } from '../config/env';
import type { Alert, SlackMessage, SlackBlock, WorkflowInstance } from '../types';

export class SlackService {
  /**
   * Send an alert notification to a Slack channel via webhook.
   *
   * Message format:
   *   [severity emoji] *Alert Title*
   *   Description text
   *   [View in OpenGovern →] button
   */
  async sendAlertNotification(alert: Alert, webhookUrl: string): Promise<void> {
    const emoji = this.severityEmoji(alert.severity);
    const assetText = alert.asset_urn ? `\n*Asset:* \`${alert.asset_urn}\`` : '';

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${alert.title}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${alert.message}${assetText}`,
        },
        fields: [
          { type: 'mrkdwn', text: `*Severity:*\n${alert.severity.toUpperCase()}` },
          { type: 'mrkdwn', text: `*Status:*\n${alert.status}` },
          { type: 'mrkdwn', text: `*Type:*\n${alert.trigger_type}` },
          { type: 'mrkdwn', text: `*Created:*\n${new Date(alert.created_at).toUTCString()}` },
        ],
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View in OpenGovern →', emoji: true },
            url: `${env.CORE_API_URL}/alerts/${alert.id}`,
            action_id: `view_alert_${alert.id}`,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Alert ID: \`${alert.id}\`` },
        ],
      },
    ];

    const message: SlackMessage = {
      text: `${emoji} [${alert.severity.toUpperCase()}] ${alert.title}`,
      blocks,
    };

    await this.postToWebhook(webhookUrl, message);
  }

  /**
   * Send a workflow notification to a Slack channel.
   * Supports: approval_needed, approved, rejected.
   */
  async sendWorkflowNotification(
    type: string,
    instance: WorkflowInstance,
    webhookUrl: string,
  ): Promise<void> {
    type Template = { emoji: string; heading: string; body: string };
    const templates: Record<string, Template> = {
      approval_needed: {
        emoji: '📋',
        heading: 'Approval Required',
        body: `Workflow *${instance.workflow_name}* requires your approval.`,
      },
      approved: {
        emoji: '✅',
        heading: 'Workflow Approved',
        body: `Workflow *${instance.workflow_name}* has been approved.`,
      },
      rejected: {
        emoji: '❌',
        heading: 'Workflow Rejected',
        body: `Workflow *${instance.workflow_name}* has been rejected.`,
      },
      overdue: {
        emoji: '⏰',
        heading: 'Workflow Overdue',
        body: `Workflow *${instance.workflow_name}* is overdue and requires attention.`,
      },
    };

    const tpl = templates[type] ?? {
      emoji: 'ℹ️',
      heading: 'Workflow Update',
      body: `Workflow *${instance.workflow_name}* has been updated (${type}).`,
    };

    const assetField = instance.asset_urn
      ? [{ type: 'mrkdwn' as const, text: `*Asset:*\n\`${instance.asset_urn}\`` }]
      : [];

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${tpl.emoji} ${tpl.heading}`, emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: tpl.body },
        fields: [
          { type: 'mrkdwn', text: `*Status:*\n${instance.status}` },
          ...assetField,
        ],
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Workflow →', emoji: true },
            url: `${env.CORE_API_URL}/workflows/${instance.id}`,
            action_id: `view_workflow_${instance.id}`,
          },
        ],
      },
    ];

    const message: SlackMessage = {
      text: `${tpl.emoji} ${tpl.heading}: ${instance.workflow_name}`,
      blocks,
    };

    await this.postToWebhook(webhookUrl, message);
  }

  private async postToWebhook(webhookUrl: string, message: SlackMessage): Promise<void> {
    await axios.post(webhookUrl, message, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10_000,
    });
  }

  /** Map severity string to an appropriate emoji. */
  severityEmoji(severity: string): string {
    const map: Record<string, string> = {
      critical: '🔴',
      high:     '🟠',
      medium:   '🟡',
      low:      '🔵',
      info:     '⚪',
    };
    return map[severity] ?? 'ℹ️';
  }
}
