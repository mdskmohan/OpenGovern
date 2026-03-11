// ─── Policy Types ─────────────────────────────────────────────────────────────

export type PolicyType =
  | 'access_control'
  | 'data_quality'
  | 'classification'
  | 'retention'
  | 'ownership'
  | 'schema_change'
  | 'lineage'
  | 'custom';

export type PolicyEnforcementMode = 'block' | 'warn' | 'info' | 'audit';

export interface PolicyScope {
  entity_types?: string[];
  platforms?: string[];
  domain_ids?: string[];
  tags?: string[];
  sensitivity_levels?: string[];
}

export interface Policy {
  id: string;
  name: string;
  description: string | null;
  policy_type: PolicyType;
  enforcement_mode: PolicyEnforcementMode;
  rego_code: string;
  scope: PolicyScope;
  is_active: boolean;
  opa_policy_id: string | null;
  created_by: string;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface PolicyEvaluation {
  id: string;
  policy_id: string;
  asset_urn: string;
  user_id: string;
  result: PolicyEvaluationResult;
  decision_log: Record<string, unknown>;
  created_at: Date;
}

export interface CreatePolicyRequest {
  name: string;
  description?: string;
  policy_type: PolicyType;
  enforcement_mode: PolicyEnforcementMode;
  rego_code: string;
  scope?: PolicyScope;
}

export interface UpdatePolicyRequest {
  name?: string;
  description?: string;
  enforcement_mode?: PolicyEnforcementMode;
  rego_code?: string;
  scope?: PolicyScope;
}

export interface PolicyEvaluationInput {
  user: {
    id: string;
    roles: string[];
    approved_requests?: Array<{ asset_urn: string; expires_at_ms: number }>;
  };
  resource: {
    urn: string;
    entityType: string;
    classifications: string[];
    sensitivity: string;
    qualityScore?: number | null;
    hasOwner?: boolean;
    hasRetentionPolicy?: boolean;
    hasDataContract?: boolean;
    upstreamCount?: number;
    downstreamCount?: number;
    changeNoticeSatisfied?: boolean;
  };
  action: string;
  context?: Record<string, unknown>;
}

export interface PolicyViolation {
  code: string;
  message: string;
  workflow_type?: string;
  severity: 'error' | 'warning' | 'info';
}

export interface PolicyEvaluationResult {
  allow: boolean;
  violations: PolicyViolation[];
  warnings: PolicyViolation[];
  infos: PolicyViolation[];
  evaluatedPolicies: number;
  deniedBy?: string[];
}

// ─── Workflow Types ───────────────────────────────────────────────────────────

export type WorkflowStatus = 'active' | 'completed' | 'rejected' | 'cancelled' | 'overdue';

export interface WorkflowTransition {
  trigger: string;
  from: string;
  to: string;
  allowed_roles: string[];
  on_enter?: string[];   // action handler names
  requires_comment?: boolean;
}

export interface WorkflowState {
  name: string;
  label: string;
  terminal?: boolean;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string | null;
  workflow_type: string;
  initial_state: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
  sla_hours: number | null;
  created_at: Date;
}

export interface WorkflowInstance {
  id: string;
  definition_id: string;
  asset_urn: string;
  current_state: string;
  status: WorkflowStatus;
  initiated_by: string;
  assigned_to: string | null;
  context: Record<string, unknown>;
  due_at: Date | null;
  completed_at: Date | null;
  access_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type WorkflowEventType =
  | 'INITIATED'
  | 'STATE_TRANSITION'
  | 'COMMENT'
  | 'REASSIGNMENT'
  | 'SYSTEM_ACTION';

export interface WorkflowEvent {
  id: string;
  instance_id: string;
  user_id: string | null;
  event_type: WorkflowEventType;
  from_state: string | null;
  to_state: string | null;
  trigger: string | null;
  content: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface InitiateWorkflowRequest {
  definition_id: string;
  asset_urn: string;
  context?: Record<string, unknown>;
}

export interface TransitionWorkflowRequest {
  trigger: string;
  comment?: string;
}

// ─── Kafka Event Types ────────────────────────────────────────────────────────

export interface GovernanceKafkaEvent {
  eventType:
    | 'WORKFLOW_CREATED'
    | 'WORKFLOW_TRANSITIONED'
    | 'WORKFLOW_APPROVED'
    | 'WORKFLOW_REJECTED'
    | 'WORKFLOW_CANCELLED'
    | 'WORKFLOW_OVERDUE'
    | 'WORKFLOW_COMMENT'
    | 'POLICY_CREATED'
    | 'POLICY_ACTIVATED'
    | 'POLICY_DEACTIVATED'
    | 'POLICY_DELETED'
    | 'NOTIFY_OWNER'
    | 'NOTIFY_CONSUMER';
  instanceId?: string;
  policyId?: string;
  assetUrn?: string;
  userId?: string;
  payload: Record<string, unknown>;
  timestamp: string;
  source: string;
}
