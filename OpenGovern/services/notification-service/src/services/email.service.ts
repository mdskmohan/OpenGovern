/**
 * Email notification service using Nodemailer.
 *
 * In development (no SMTP_USER set): connects to Mailhog on SMTP_HOST:1025, no auth.
 * In production: uses SMTP credentials from env (SMTP_USER + SMTP_PASS).
 */

import nodemailer, { Transporter } from 'nodemailer';
import { env, isDevelopment } from '../config/env';
import type { Alert, WorkflowInstance } from '../types';

// Severity → hex colour mapping for email badges
const SEVERITY_COLOURS: Record<string, string> = {
  critical: '#dc2626',
  high:     '#ea580c',
  medium:   '#ca8a04',
  low:      '#2563eb',
  info:     '#6b7280',
};

export class EmailService {
  private transporter: Transporter;

  constructor() {
    if (isDevelopment && !env.SMTP_USER) {
      // Mailhog / local SMTP relay — no authentication
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: false,
        auth: undefined,
        ignoreTLS: true,
      });
    } else {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    }
  }

  /**
   * Send an alert notification email.
   * Uses an HTML template with severity-coloured badge.
   */
  async sendAlertEmail(alert: Alert, recipients: string[]): Promise<void> {
    const colour = SEVERITY_COLOURS[alert.severity] ?? '#6b7280';
    const assetSection = alert.asset_urn
      ? `<p style="margin:8px 0;">
           <a href="${env.CORE_API_URL}/assets/${encodeURIComponent(alert.asset_urn)}"
              style="background:#1d4ed8;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;font-size:14px;">
             View Asset in OpenGovern →
           </a>
         </p>`
      : '';

    const content = `
      <h2 style="margin:0 0 12px;color:#111827;">
        <span style="background:${colour};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;text-transform:uppercase;margin-right:8px;">
          ${alert.severity}
        </span>
        ${this.esc(alert.title)}
      </h2>
      <p style="color:#374151;line-height:1.6;">${this.esc(alert.message)}</p>
      ${assetSection}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="color:#6b7280;font-size:12px;">
        Alert ID: ${alert.id} &nbsp;|&nbsp; Created: ${new Date(alert.created_at).toUTCString()}
      </p>
    `;

    await this.send(
      recipients,
      `[OpenGovern] ${alert.severity.toUpperCase()}: ${alert.title}`,
      this.buildBaseTemplate(content),
    );
  }

  /**
   * Send a workflow notification email.
   * Supported types: approval_needed, approved, rejected, overdue, comment_added
   */
  async sendWorkflowEmail(
    type: string,
    instance: WorkflowInstance,
    recipients: string[],
  ): Promise<void> {
    type WorkflowTemplate = { subject: string; heading: string; body: string };
    const templates: Record<string, WorkflowTemplate> = {
      approval_needed: {
        subject: `[OpenGovern] Action Required: ${instance.workflow_name}`,
        heading: 'Approval Required',
        body: `A workflow request requires your approval: <strong>${this.esc(instance.workflow_name)}</strong>.`,
      },
      approved: {
        subject: `[OpenGovern] Approved: ${instance.workflow_name}`,
        heading: 'Workflow Approved',
        body: `Your request for <strong>${this.esc(instance.workflow_name)}</strong> has been approved.`,
      },
      rejected: {
        subject: `[OpenGovern] Rejected: ${instance.workflow_name}`,
        heading: 'Workflow Rejected',
        body: `Your request for <strong>${this.esc(instance.workflow_name)}</strong> has been rejected.`,
      },
      overdue: {
        subject: `[OpenGovern] Overdue: ${instance.workflow_name}`,
        heading: 'Workflow Overdue',
        body: `The workflow <strong>${this.esc(instance.workflow_name)}</strong> is overdue and requires immediate attention.`,
      },
      comment_added: {
        subject: `[OpenGovern] Comment on: ${instance.workflow_name}`,
        heading: 'New Comment',
        body: `A new comment was added to workflow <strong>${this.esc(instance.workflow_name)}</strong>.`,
      },
    };

    const tpl = templates[type] ?? {
      subject: `[OpenGovern] Workflow Update: ${instance.workflow_name}`,
      heading: 'Workflow Update',
      body: `Workflow <strong>${this.esc(instance.workflow_name)}</strong> has been updated (${type}).`,
    };

    const assetSection = instance.asset_urn
      ? `<p style="color:#6b7280;font-size:13px;">Asset: <code>${this.esc(instance.asset_urn)}</code></p>`
      : '';

    const content = `
      <h2 style="margin:0 0 12px;color:#111827;">${tpl.heading}</h2>
      <p style="color:#374151;line-height:1.6;">${tpl.body}</p>
      ${assetSection}
      <p style="margin-top:20px;">
        <a href="${env.CORE_API_URL}/workflows/${instance.id}"
           style="background:#1d4ed8;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;font-size:14px;">
          View Workflow →
        </a>
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="color:#6b7280;font-size:12px;">Workflow ID: ${instance.id}</p>
    `;

    await this.send(recipients, tpl.subject, this.buildBaseTemplate(content));
  }

  /**
   * Send an email to a list of recipients.
   */
  private async send(to: string[], subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({
      from: env.SMTP_FROM,
      to: to.join(', '),
      subject,
      html,
    });
  }

  /**
   * Wrap content in the base HTML email template.
   * All CSS is inlined for email client compatibility.
   */
  private buildBaseTemplate(content: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenGovern Notification</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#1e3a5f;padding:20px 32px;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">
                OpenGovern
              </p>
              <p style="margin:4px 0 0;color:#93c5fd;font-size:12px;">
                Data Governance Platform
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
                This is an automated message from OpenGovern. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /** HTML-escape a string for safe inline content. */
  private esc(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
