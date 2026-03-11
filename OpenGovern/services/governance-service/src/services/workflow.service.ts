/**
 * Workflow Service — state machine engine for governance workflows.
 *
 * Manages lifecycle of workflow instances: creation, state transitions,
 * comments, reassignment, and overdue detection.
 *
 * The state machine is defined in workflow_definitions.definition (JSONB).
 * This service is generic — adding a new workflow type only requires a new
 * definition row, not code changes.
 */
import { workflowModel, WorkflowInstance } from '../models/workflow.model';
import { WorkflowActionsService } from './workflow-actions.service';
import { publishGovernanceEvent } from '../config/kafka';

const actionsService = new WorkflowActionsService();

export class WorkflowService {
  /**
   * Initiate a new workflow instance.
   * Sets initial state, calculates SLA due date, assigns to asset owner.
   */
  async initiateWorkflow(
    definitionId: string,
    assetUrn: string,
    initiatedBy: string,
    context: object,
    assignedTo?: string
  ): Promise<WorkflowInstance> {
    const definition = await workflowModel.getDefinition(definitionId);

    const dueAt = new Date();
    dueAt.setHours(dueAt.getHours() + definition.sla_hours);

    const instance = await workflowModel.createInstance({
      definition_id: definitionId,
      asset_urn: assetUrn,
      initiated_by: initiatedBy,
      initial_state: definition.definition.initial_state,
      context,
      assigned_to: assignedTo,
      due_at: dueAt,
    });

    await workflowModel.addEvent(instance.id, {
      user_id: initiatedBy,
      event_type: 'state_transition',
      to_state: definition.definition.initial_state,
      trigger: 'initiate',
      content: 'Workflow initiated',
    });

    await publishGovernanceEvent('WORKFLOW_CREATED', {
      workflow_id: instance.id,
      workflow_type: definition.workflow_type,
      asset_urn: assetUrn,
      initiated_by: initiatedBy,
      assigned_to: assignedTo,
      due_at: dueAt,
    });

    // Execute initial on_enter actions for the initial state
    const onEnterActions = definition.definition.on_enter?.[definition.definition.initial_state] || [];
    if (onEnterActions.length > 0) {
      await actionsService.executeActions(onEnterActions, instance);
    }

    return instance;
  }

  /**
   * Execute a state transition.
   * Validates that the trigger is allowed from the current state,
   * and that the actor has the required role.
   */
  async transition(
    instanceId: string,
    trigger: string,
    userId: string,
    userRoles: string[],
    comment?: string
  ): Promise<WorkflowInstance> {
    const instance = await workflowModel.getInstance(instanceId);
    if (!instance) throw Object.assign(new Error('Workflow not found'), { code: 'NOT_FOUND', status: 404 });
    if (instance.status !== 'active' && instance.status !== 'overdue') {
      throw Object.assign(new Error(`Cannot transition a ${instance.status} workflow`), { code: 'INVALID_STATUS', status: 400 });
    }

    // Cast to get definition fields
    const inst = instance as any;
    const definition = inst.definition;
    if (!definition) throw new Error('Workflow definition not found on instance');

    // Find matching transition
    const transition = definition.transitions.find(
      (t: any) => t.from === instance.current_state && t.trigger === trigger
    );
    if (!transition) {
      throw Object.assign(
        new Error(`Trigger '${trigger}' is not allowed from state '${instance.current_state}'`),
        { code: 'INVALID_TRANSITION', status: 400 }
      );
    }

    // Validate actor role (system trigger is always allowed)
    const allowedRoles: string[] = transition.allowed_roles || [];
    const isSystemAction = allowedRoles.includes('system');
    const isRequester = allowedRoles.includes('requester') && instance.initiated_by === userId;
    const hasRole = userRoles.some(r => allowedRoles.includes(r));

    if (!isSystemAction && !isRequester && !hasRole) {
      throw Object.assign(new Error('You do not have permission to perform this action'), { code: 'FORBIDDEN', status: 403 });
    }

    const isTerminal = ['approved', 'rejected', 'certified', 'deprecated', 'cancelled', 'confirmed', 'expired'].includes(transition.to);
    const newStatus = isTerminal ? 'completed' : 'active';

    // Update instance state
    const updated = await workflowModel.updateInstance(instanceId, {
      current_state: transition.to,
      status: newStatus,
      completed_at: isTerminal ? new Date() : undefined,
    });

    // Record the transition event
    await workflowModel.addEvent(instanceId, {
      user_id: userId,
      event_type: 'state_transition',
      from_state: instance.current_state,
      to_state: transition.to,
      trigger,
      content: comment,
    });

    // Execute on_enter actions for the new state
    const onEnterActions: string[] = definition.on_enter?.[transition.to] || [];
    if (onEnterActions.length > 0) {
      await actionsService.executeActions(onEnterActions, updated);
    }

    await publishGovernanceEvent('WORKFLOW_TRANSITIONED', {
      workflow_id: instanceId,
      from_state: instance.current_state,
      to_state: transition.to,
      trigger,
      triggered_by: userId,
      asset_urn: instance.asset_urn,
    });

    return updated;
  }

  /** Add a comment without changing state. */
  async addComment(instanceId: string, userId: string, content: string) {
    const instance = await workflowModel.getInstance(instanceId);
    if (!instance) throw Object.assign(new Error('Workflow not found'), { code: 'NOT_FOUND', status: 404 });

    const event = await workflowModel.addEvent(instanceId, {
      user_id: userId,
      event_type: 'comment',
      content,
    });

    await publishGovernanceEvent('WORKFLOW_COMMENT', {
      workflow_id: instanceId,
      user_id: userId,
      asset_urn: instance.asset_urn,
    });

    return event;
  }

  /** Reassign a workflow instance to a different user. */
  async reassign(instanceId: string, newAssigneeId: string, userId: string): Promise<WorkflowInstance> {
    const instance = await workflowModel.getInstance(instanceId);
    if (!instance) throw Object.assign(new Error('Workflow not found'), { code: 'NOT_FOUND', status: 404 });

    const updated = await workflowModel.updateInstance(instanceId, { assigned_to: newAssigneeId });

    await workflowModel.addEvent(instanceId, {
      user_id: userId,
      event_type: 'assignment',
      content: `Reassigned to user ${newAssigneeId}`,
    });

    await publishGovernanceEvent('WORKFLOW_REASSIGNED', {
      workflow_id: instanceId,
      new_assignee: newAssigneeId,
      reassigned_by: userId,
    });

    return updated;
  }

  /** Mark overdue workflows. Called by cron job every hour. */
  async checkOverdueWorkflows(): Promise<void> {
    const overdue = await workflowModel.getOverdueInstances();
    for (const instance of overdue) {
      await workflowModel.updateInstance(instance.id, { status: 'overdue' });
      await publishGovernanceEvent('WORKFLOW_OVERDUE', {
        workflow_id: instance.id,
        asset_urn: instance.asset_urn,
        assigned_to: instance.assigned_to,
        due_at: instance.due_at,
      });
    }
    if (overdue.length > 0) {
      console.log(`Marked ${overdue.length} workflows as overdue`);
    }
  }

  async getWorkflowsForAsset(assetUrn: string) {
    return workflowModel.listInstances({ asset_urn: assetUrn });
  }
}
