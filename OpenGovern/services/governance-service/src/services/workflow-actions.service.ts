/**
 * Workflow Actions Service
 *
 * Implements the on_enter actions defined in workflow_definitions.definition.on_enter.
 * Each action is independently async — failures are logged but don't block other actions.
 *
 * Actions are dispatched by name string (e.g., "grant_platform_access").
 * New actions can be added without modifying the workflow state machine.
 */
import axios from 'axios';
import { publishGovernanceEvent } from '../config/kafka';
import { pool } from '../config/database';
import { env } from '../config/env';
import type { WorkflowInstance } from '../models/workflow.model';

type ActionFn = (instance: WorkflowInstance) => Promise<void>;

export class WorkflowActionsService {
  private readonly actions: Record<string, ActionFn> = {
    grant_platform_access: this.grantPlatformAccess.bind(this),
    revoke_platform_access: this.revokePlatformAccess.bind(this),
    notify_requester: this.notifyRequester.bind(this),
    notify_requester_rejection: this.notifyRequesterRejection.bind(this),
    notify_owner: this.notifyOwner.bind(this),
    notify_all_consumers: this.notifyAllConsumers.bind(this),
    apply_certified_tag: this.applyCertifiedTag.bind(this),
    remove_certified_tag: this.removeCertifiedTag.bind(this),
    apply_classification: this.applyClassification.bind(this),
    propagate_via_lineage: this.propagateViaLineage.bind(this),
    run_impact_analysis: this.runImpactAnalysis.bind(this),
    schedule_expiry: this.scheduleExpiry.bind(this),
    update_asset_certification_status: this.updateAssetCertificationStatus.bind(this),
    archive_asset: this.archiveAsset.bind(this),
    log_rejection: this.logRejection.bind(this),
    apply_deprecated_tag: this.applyDeprecatedTag.bind(this),
    activate_access_policies: this.activateAccessPolicies.bind(this),
    create_opa_exception_rule: this.createOpaExceptionRule.bind(this),
    revoke_opa_exception_rule: this.revokeOpaExceptionRule.bind(this),
    schedule_expiry_reminder: this.scheduleExpiryReminder.bind(this),
    notify_owner_of_expiry: this.notifyOwnerOfExpiry.bind(this),
    notify_submitter_with_feedback: this.notifySubmitterWithFeedback.bind(this),
    notify_requester_with_rejection: this.notifyRequesterRejection.bind(this),
  };

  /** Execute all on_enter actions for a state transition. Runs in parallel; failures don't block. */
  async executeActions(actions: string[], instance: WorkflowInstance): Promise<void> {
    const results = await Promise.allSettled(
      actions.map(async (actionName) => {
        const fn = this.actions[actionName];
        if (!fn) {
          console.warn(`Unknown workflow action: ${actionName}`);
          return;
        }
        await fn(instance);
      })
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Workflow action failed:', result.reason);
      }
    }
  }

  private async grantPlatformAccess(instance: WorkflowInstance): Promise<void> {
    const expiryDays = (instance.context as any).duration_days || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    await pool.query(
      `INSERT INTO access_grants (workflow_instance_id, asset_urn, user_id, granted_at, expires_at)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (workflow_instance_id) DO UPDATE SET expires_at = $4`,
      [instance.id, instance.asset_urn, instance.initiated_by, expiresAt]
    ).catch(() => {
      // Table may not exist yet — log and continue
      console.log('access_grants table not ready, skipping grant record');
    });
  }

  private async revokePlatformAccess(instance: WorkflowInstance): Promise<void> {
    await pool.query(
      `UPDATE access_grants SET revoked_at = NOW() WHERE workflow_instance_id = $1`,
      [instance.id]
    ).catch(() => {});
  }

  private async notifyRequester(instance: WorkflowInstance): Promise<void> {
    await publishGovernanceEvent('WORKFLOW_APPROVED', {
      workflow_id: instance.id,
      asset_urn: instance.asset_urn,
      notify_user_id: instance.initiated_by,
      context: instance.context,
    });
  }

  private async notifyRequesterRejection(instance: WorkflowInstance): Promise<void> {
    await publishGovernanceEvent('WORKFLOW_REJECTED', {
      workflow_id: instance.id,
      asset_urn: instance.asset_urn,
      notify_user_id: instance.initiated_by,
      context: instance.context,
    });
  }

  private async notifyOwner(instance: WorkflowInstance): Promise<void> {
    await publishGovernanceEvent('NOTIFY_OWNER', {
      workflow_id: instance.id,
      asset_urn: instance.asset_urn,
      context: instance.context,
    });
  }

  private async applyCertifiedTag(instance: WorkflowInstance): Promise<void> {
    await axios.put(
      `${env.CORE_API_URL}/api/v1/assets/${encodeURIComponent(instance.asset_urn)}/aspects/classification`,
      { action: 'add_classification', classification: 'CERTIFIED' },
      { headers: { 'X-Internal-Service': 'governance-service' } }
    ).catch(err => console.error('Failed to apply certified tag:', err.message));
  }

  private async removeCertifiedTag(instance: WorkflowInstance): Promise<void> {
    await axios.put(
      `${env.CORE_API_URL}/api/v1/assets/${encodeURIComponent(instance.asset_urn)}/aspects/classification`,
      { action: 'remove_classification', classification: 'CERTIFIED' },
      { headers: { 'X-Internal-Service': 'governance-service' } }
    ).catch(err => console.error('Failed to remove certified tag:', err.message));
  }

  private async applyDeprecatedTag(instance: WorkflowInstance): Promise<void> {
    await axios.put(
      `${env.CORE_API_URL}/api/v1/assets/${encodeURIComponent(instance.asset_urn)}/aspects/classification`,
      { action: 'add_classification', classification: 'DEPRECATED' },
      { headers: { 'X-Internal-Service': 'governance-service' } }
    ).catch(err => console.error('Failed to apply deprecated tag:', err.message));
  }

  private async applyClassification(instance: WorkflowInstance): Promise<void> {
    const ctx = instance.context as any;
    if (!ctx.suggested_classification) return;

    await axios.put(
      `${env.CORE_API_URL}/api/v1/assets/${encodeURIComponent(instance.asset_urn)}/aspects/classification`,
      { classifications: [{ type: ctx.suggested_classification, confidence: ctx.confidence || 1.0, confirmedAt: new Date().toISOString() }] },
      { headers: { 'X-Internal-Service': 'governance-service' } }
    ).catch(err => console.error('Failed to apply classification:', err.message));
  }

  private async propagateViaLineage(instance: WorkflowInstance): Promise<void> {
    try {
      const response = await axios.get(
        `${env.CORE_API_URL}/api/v1/assets/${encodeURIComponent(instance.asset_urn)}/lineage?direction=downstream&depth=2`,
        { headers: { 'X-Internal-Service': 'governance-service' } }
      );
      await publishGovernanceEvent('CLASSIFICATION_PROPAGATION', {
        source_urn: instance.asset_urn,
        downstream_assets: response.data?.data?.nodes?.map((n: any) => n.urn) || [],
      });
    } catch (err: any) {
      console.error('Failed to propagate via lineage:', err.message);
    }
  }

  private async runImpactAnalysis(instance: WorkflowInstance): Promise<void> {
    try {
      const response = await axios.get(
        `${env.CORE_API_URL}/api/v1/assets/${encodeURIComponent(instance.asset_urn)}/impact`,
        { headers: { 'X-Internal-Service': 'governance-service' } }
      );
      // Store impact analysis in instance context for display in UI
      await pool.query(
        `UPDATE workflow_instances SET context = context || $1::jsonb WHERE id = $2`,
        [JSON.stringify({ impact_analysis: response.data?.data }), instance.id]
      );
    } catch (err: any) {
      console.error('Failed to run impact analysis:', err.message);
    }
  }

  private async notifyAllConsumers(instance: WorkflowInstance): Promise<void> {
    await publishGovernanceEvent('NOTIFY_ALL_CONSUMERS', {
      asset_urn: instance.asset_urn,
      workflow_id: instance.id,
      message: `Dataset ${instance.asset_urn} is being deprecated`,
    });
  }

  private async scheduleExpiry(instance: WorkflowInstance): Promise<void> {
    const ctx = instance.context as any;
    if (!ctx.duration_days) return;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(ctx.duration_days));
    await pool.query(
      'UPDATE workflow_instances SET access_expires_at = $1 WHERE id = $2',
      [expiresAt, instance.id]
    );
  }

  private async updateAssetCertificationStatus(instance: WorkflowInstance): Promise<void> {
    const status = instance.current_state === 'certified' ? 'certified' : 'uncertified';
    await axios.put(
      `${env.CORE_API_URL}/api/v1/assets/${encodeURIComponent(instance.asset_urn)}`,
      { certification_status: status },
      { headers: { 'X-Internal-Service': 'governance-service' } }
    ).catch(err => console.error('Failed to update certification status:', err.message));
  }

  private async archiveAsset(instance: WorkflowInstance): Promise<void> {
    await axios.put(
      `${env.CORE_API_URL}/api/v1/assets/${encodeURIComponent(instance.asset_urn)}`,
      { certification_status: 'deprecated', is_active: false },
      { headers: { 'X-Internal-Service': 'governance-service' } }
    ).catch(err => console.error('Failed to archive asset:', err.message));
  }

  private async activateAccessPolicies(instance: WorkflowInstance): Promise<void> {
    await publishGovernanceEvent('ACTIVATE_ACCESS_POLICIES', {
      asset_urn: instance.asset_urn,
      classification: (instance.context as any).suggested_classification,
    });
  }

  private async createOpaExceptionRule(instance: WorkflowInstance): Promise<void> {
    await publishGovernanceEvent('OPA_EXCEPTION_CREATED', {
      workflow_id: instance.id,
      asset_urn: instance.asset_urn,
      user_id: instance.initiated_by,
    });
  }

  private async revokeOpaExceptionRule(instance: WorkflowInstance): Promise<void> {
    await publishGovernanceEvent('OPA_EXCEPTION_REVOKED', {
      workflow_id: instance.id,
      asset_urn: instance.asset_urn,
    });
  }

  private async scheduleExpiryReminder(instance: WorkflowInstance): Promise<void> {
    // Reminder fires 3 days before expiry — handled by notification-service
    await publishGovernanceEvent('SCHEDULE_EXPIRY_REMINDER', {
      workflow_id: instance.id,
      asset_urn: instance.asset_urn,
      user_id: instance.initiated_by,
      expires_at: instance.access_expires_at,
    });
  }

  private async notifyOwnerOfExpiry(instance: WorkflowInstance): Promise<void> {
    await publishGovernanceEvent('NOTIFY_OWNER_EXPIRY', {
      workflow_id: instance.id,
      asset_urn: instance.asset_urn,
    });
  }

  private async notifySubmitterWithFeedback(instance: WorkflowInstance): Promise<void> {
    await publishGovernanceEvent('WORKFLOW_REJECTED_WITH_FEEDBACK', {
      workflow_id: instance.id,
      asset_urn: instance.asset_urn,
      notify_user_id: instance.initiated_by,
      context: instance.context,
    });
  }

  private async logRejection(instance: WorkflowInstance): Promise<void> {
    console.log(`Classification rejected for ${instance.asset_urn}: ${JSON.stringify(instance.context)}`);
  }
}
