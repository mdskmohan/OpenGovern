'use client';

/**
 * Workflows — Unified automation + governance workflow control center.
 *
 * Tab 1 "Automation": Ingestion pipeline management — create, run, monitor
 *   data source workflows across 25+ connectors.
 * Tab 2 "Governance": Human-in-the-loop approval workflows —
 *   access requests, certifications, classification reviews, etc.
 *
 * Design: Linear + Notion aesthetic — flat tables, clean wizard overlay,
 * status dots instead of heavy badges, hover-reveal actions.
 */

import React, { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Plus,
  Search,
  ChevronDown,
  Play,
  Eye,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ChevronRight,
  X,
  Database,
  Zap,
  GitBranch,
  ShieldCheck,
  Tag,
  Settings,
  ArrowLeft,
  ArrowRight,
  Check,
  RefreshCw,
  MoreHorizontal,
  Key,
  Archive,
  AlertTriangle,
  UserCheck,
  Send,
  Filter,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/components/ui/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

type AutomationWorkflowType =
  | 'metadata_ingestion'
  | 'usage_ingestion'
  | 'lineage_extraction'
  | 'data_quality_scan'
  | 'pii_classification'
  | 'policy_compliance'
  | 'custom';

type IngestionStatus = 'active' | 'inactive' | 'running' | 'failed' | 'queued';

interface IngestionWorkflow {
  id: string;
  name: string;
  connector_type: string;
  workflow_type: AutomationWorkflowType;
  schedule?: string;
  status: IngestionStatus;
  last_run_at?: string;
  last_run_status?: 'success' | 'failed' | 'running';
  config?: Record<string, unknown>;
  filter_config?: {
    include_databases?: string[];
    exclude_databases?: string[];
    include_schemas?: string[];
    exclude_schemas?: string[];
    object_types?: string[];
  };
  lineage_config?: {
    lookback_days?: number;
  };
  created_at: string;
}

type GovWorkflowType =
  | 'access_request'
  | 'certification'
  | 'classification_review'
  | 'deprecation'
  | 'policy_exception';

type GovWorkflowStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'cancelled';

interface GovernanceWorkflow {
  id: string;
  workflow_type: GovWorkflowType;
  title: string;
  requested_by: string;
  asset_urn?: string;
  status: GovWorkflowStatus;
  due_date?: string;
  created_at: string;
  assigned_to?: string;
}

// ─── Connector Catalog ────────────────────────────────────────────────────────

const CONNECTOR_CATEGORIES = [
  { id: 'warehouses', label: 'Data Warehouses' },
  { id: 'databases', label: 'Databases' },
  { id: 'bi', label: 'BI & Analytics' },
  { id: 'pipelines', label: 'Pipelines & Orchestration' },
  { id: 'storage', label: 'Object Storage' },
  { id: 'streaming', label: 'Streaming' },
] as const;

const CONNECTORS = [
  // Warehouses
  { id: 'snowflake', label: 'Snowflake', emoji: '❄️', category: 'warehouses' },
  { id: 'bigquery', label: 'BigQuery', emoji: '🔵', category: 'warehouses' },
  { id: 'redshift', label: 'Redshift', emoji: '🔴', category: 'warehouses' },
  { id: 'databricks', label: 'Databricks', emoji: '⚡', category: 'warehouses' },
  { id: 'synapse', label: 'Azure Synapse', emoji: '🟦', category: 'warehouses' },
  { id: 'clickhouse', label: 'ClickHouse', emoji: '🟡', category: 'warehouses' },
  // Databases
  { id: 'postgres', label: 'PostgreSQL', emoji: '🐘', category: 'databases' },
  { id: 'mysql', label: 'MySQL', emoji: '🐬', category: 'databases' },
  { id: 'sqlserver', label: 'SQL Server', emoji: '🔷', category: 'databases' },
  { id: 'oracle', label: 'Oracle', emoji: '🔶', category: 'databases' },
  { id: 'mongodb', label: 'MongoDB', emoji: '🍃', category: 'databases' },
  { id: 'cassandra', label: 'Cassandra', emoji: '👁️', category: 'databases' },
  // BI
  { id: 'tableau', label: 'Tableau', emoji: '📊', category: 'bi' },
  { id: 'looker', label: 'Looker', emoji: '🔭', category: 'bi' },
  { id: 'powerbi', label: 'Power BI', emoji: '💛', category: 'bi' },
  { id: 'metabase', label: 'Metabase', emoji: '📈', category: 'bi' },
  { id: 'superset', label: 'Superset', emoji: '📉', category: 'bi' },
  { id: 'sigma', label: 'Sigma', emoji: '∑', category: 'bi' },
  // Pipelines
  { id: 'dbt', label: 'dbt', emoji: '🔧', category: 'pipelines' },
  { id: 'spark', label: 'Apache Spark', emoji: '✨', category: 'pipelines' },
  { id: 'airflow', label: 'Airflow', emoji: '🌊', category: 'pipelines' },
  { id: 'dagster', label: 'Dagster', emoji: '🎯', category: 'pipelines' },
  { id: 'prefect', label: 'Prefect', emoji: '🌀', category: 'pipelines' },
  { id: 'fivetran', label: 'Fivetran', emoji: '🔗', category: 'pipelines' },
  // Storage
  { id: 's3', label: 'Amazon S3', emoji: '🪣', category: 'storage' },
  { id: 'gcs', label: 'Google Cloud Storage', emoji: '☁️', category: 'storage' },
  { id: 'adls', label: 'Azure Data Lake', emoji: '🏔️', category: 'storage' },
  // Streaming
  { id: 'kafka', label: 'Apache Kafka', emoji: '📨', category: 'streaming' },
  { id: 'kinesis', label: 'Kinesis', emoji: '🌊', category: 'streaming' },
  { id: 'pubsub', label: 'Pub/Sub', emoji: '📡', category: 'streaming' },
] as const;

type ConnectorId = (typeof CONNECTORS)[number]['id'];

// Connector-specific credential fields
const CONNECTOR_CREDENTIAL_FIELDS: Record<string, { key: string; label: string; type: string; placeholder: string }[]> = {
  snowflake: [
    { key: 'account', label: 'Account Identifier', type: 'text', placeholder: 'myorg-myaccount' },
    { key: 'username', label: 'Username', type: 'text', placeholder: 'svc_opengovern' },
    { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
    { key: 'warehouse', label: 'Warehouse', type: 'text', placeholder: 'COMPUTE_WH' },
    { key: 'role', label: 'Role', type: 'text', placeholder: 'ACCOUNTADMIN' },
  ],
  bigquery: [
    { key: 'project_id', label: 'Project ID', type: 'text', placeholder: 'my-gcp-project' },
    { key: 'dataset_id', label: 'Dataset ID (optional)', type: 'text', placeholder: 'my_dataset' },
    { key: 'key_path', label: 'Service Account JSON', type: 'textarea', placeholder: '{"type": "service_account", ...}' },
  ],
  redshift: [
    { key: 'host', label: 'Host', type: 'text', placeholder: 'cluster.abc123.us-east-1.redshift.amazonaws.com' },
    { key: 'port', label: 'Port', type: 'text', placeholder: '5439' },
    { key: 'database', label: 'Database', type: 'text', placeholder: 'analytics' },
    { key: 'username', label: 'Username', type: 'text', placeholder: 'admin' },
    { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
  ],
  databricks: [
    { key: 'workspace_url', label: 'Workspace URL', type: 'text', placeholder: 'https://adb-xxxx.azuredatabricks.net' },
    { key: 'access_token', label: 'Personal Access Token', type: 'password', placeholder: 'dapi...' },
    { key: 'http_path', label: 'HTTP Path', type: 'text', placeholder: '/sql/1.0/warehouses/...' },
  ],
  postgres: [
    { key: 'host', label: 'Host', type: 'text', placeholder: 'localhost' },
    { key: 'port', label: 'Port', type: 'text', placeholder: '5432' },
    { key: 'database', label: 'Database', type: 'text', placeholder: 'postgres' },
    { key: 'username', label: 'Username', type: 'text', placeholder: 'postgres' },
    { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
  ],
  mysql: [
    { key: 'host', label: 'Host', type: 'text', placeholder: 'localhost' },
    { key: 'port', label: 'Port', type: 'text', placeholder: '3306' },
    { key: 'database', label: 'Database', type: 'text', placeholder: 'mydb' },
    { key: 'username', label: 'Username', type: 'text', placeholder: 'root' },
    { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
  ],
  sqlserver: [
    { key: 'host', label: 'Host', type: 'text', placeholder: 'myserver.database.windows.net' },
    { key: 'port', label: 'Port', type: 'text', placeholder: '1433' },
    { key: 'database', label: 'Database', type: 'text', placeholder: 'mydb' },
    { key: 'username', label: 'Username', type: 'text', placeholder: 'sa' },
    { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
  ],
  tableau: [
    { key: 'server_url', label: 'Server URL', type: 'text', placeholder: 'https://tableau.company.com' },
    { key: 'site_id', label: 'Site ID', type: 'text', placeholder: 'MySite' },
    { key: 'token_name', label: 'Personal Access Token Name', type: 'text', placeholder: 'opengovern_token' },
    { key: 'token_value', label: 'Personal Access Token Value', type: 'password', placeholder: '••••••••' },
  ],
};

// Default fields for connectors not specifically defined
const DEFAULT_CREDENTIAL_FIELDS = [
  { key: 'host', label: 'Host / URL', type: 'text', placeholder: 'https://...' },
  { key: 'username', label: 'Username', type: 'text', placeholder: 'username' },
  { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
];

// ─── Automation Workflow Types ─────────────────────────────────────────────────

const AUTOMATION_TYPES: { id: AutomationWorkflowType; label: string; description: string; icon: React.ElementType }[] = [
  { id: 'metadata_ingestion', label: 'Metadata Ingestion', description: 'Extract schemas, tables, columns, and asset metadata', icon: Database },
  { id: 'usage_ingestion', label: 'Usage Ingestion', description: 'Harvest query logs to understand table popularity', icon: Zap },
  { id: 'lineage_extraction', label: 'Lineage Extraction', description: 'Build end-to-end data lineage from query history', icon: GitBranch },
  { id: 'data_quality_scan', label: 'Data Quality Scan', description: 'Profile datasets and compute freshness, completeness', icon: CheckCircle2 },
  { id: 'pii_classification', label: 'PII Classification', description: 'Detect and tag sensitive personal data automatically', icon: Tag },
  { id: 'policy_compliance', label: 'Policy Compliance', description: 'Evaluate assets against governance policy rules', icon: ShieldCheck },
  { id: 'custom', label: 'Custom', description: 'Run a custom recipe or script against any source', icon: Settings },
];

const SCHEDULE_OPTIONS = [
  { id: 'manual', label: 'Manual only', cron: null },
  { id: 'hourly', label: 'Every hour', cron: '0 * * * *' },
  { id: 'daily_6am', label: 'Daily at 6 AM', cron: '0 6 * * *' },
  { id: 'daily_midnight', label: 'Daily at midnight', cron: '0 0 * * *' },
  { id: 'weekly', label: 'Weekly (Monday 6 AM)', cron: '0 6 * * 1' },
  { id: 'custom', label: 'Custom cron', cron: 'custom' },
] as const;

const LOOKBACK_OPTIONS = [
  { id: '1', label: '1 day', days: 1 },
  { id: '7', label: '7 days', days: 7 },
  { id: '30', label: '30 days', days: 30 },
  { id: '90', label: '90 days', days: 90 },
  { id: 'custom', label: 'Custom', days: null },
] as const;

const OBJECT_TYPES = [
  { id: 'tables', label: 'Tables', defaultOn: true },
  { id: 'views', label: 'Views', defaultOn: true },
  { id: 'materialized_views', label: 'Materialized Views', defaultOn: true },
  { id: 'columns', label: 'Columns', defaultOn: true },
  { id: 'stored_procedures', label: 'Stored Procedures', defaultOn: false },
  { id: 'functions', label: 'Functions', defaultOn: false },
  { id: 'streams', label: 'Streams', defaultOn: false },
  { id: 'tasks', label: 'Tasks', defaultOn: false },
];

// ─── Wizard State ──────────────────────────────────────────────────────────────

interface WizardState {
  step: number;
  workflowType: AutomationWorkflowType | null;
  connectorId: ConnectorId | null;
  name: string;
  credentials: Record<string, string>;
  connectionTestStatus: 'idle' | 'testing' | 'success' | 'failed';
  connectionTestError?: string;
  connectionTestLatency?: number;
  includeDatabase: string;
  excludeDatabase: string;
  includeSchema: string;
  excludeSchema: string;
  objectTypes: string[];
  lookback: string;
  customLookbackDays: string;
  schedule: string;
  customCron: string;
  categoryFilter: string;
}

const INITIAL_WIZARD: WizardState = {
  step: 1,
  workflowType: null,
  connectorId: null,
  name: '',
  credentials: {},
  connectionTestStatus: 'idle',
  includeDatabase: '',
  excludeDatabase: '',
  includeSchema: '',
  excludeSchema: '',
  objectTypes: OBJECT_TYPES.filter((o) => o.defaultOn).map((o) => o.id),
  lookback: '7',
  customLookbackDays: '',
  schedule: 'daily_6am',
  customCron: '',
  categoryFilter: 'warehouses',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getConnector(id: string | null) {
  return CONNECTORS.find((c) => c.id === id) ?? null;
}

function getStatusDot(status: IngestionStatus) {
  switch (status) {
    case 'active':
      return 'bg-green-500';
    case 'running':
      return 'bg-blue-500 animate-pulse';
    case 'failed':
      return 'bg-red-500';
    case 'queued':
      return 'bg-amber-400';
    case 'inactive':
    default:
      return 'bg-gray-300';
  }
}

function getStatusText(status: IngestionStatus) {
  const map: Record<IngestionStatus, string> = {
    active: 'Active',
    inactive: 'Inactive',
    running: 'Running',
    failed: 'Failed',
    queued: 'Queued',
  };
  return map[status] ?? status;
}

function govTypeLabel(type: GovWorkflowType) {
  const map: Record<GovWorkflowType, string> = {
    access_request: 'Access Request',
    certification: 'Certification',
    classification_review: 'Classification Review',
    deprecation: 'Deprecation',
    policy_exception: 'Policy Exception',
  };
  return map[type] ?? type;
}

function govStatusColor(status: GovWorkflowStatus) {
  switch (status) {
    case 'approved': return 'bg-green-500';
    case 'rejected': return 'bg-red-500';
    case 'in_review': return 'bg-blue-500';
    case 'cancelled': return 'bg-gray-300';
    case 'pending':
    default: return 'bg-amber-400';
  }
}

function govTypeIcon(type: GovWorkflowType): React.ElementType {
  const map: Record<GovWorkflowType, React.ElementType> = {
    access_request: Key,
    certification: ShieldCheck,
    classification_review: Tag,
    deprecation: Archive,
    policy_exception: AlertTriangle,
  };
  return map[type] ?? AlertCircle;
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const [activeTab, setActiveTab] = useState<'automation' | 'governance'>('automation');
  const [showWizard, setShowWizard] = useState(false);

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Workflows</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Manage data ingestion automation and governance approval workflows
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-5 -mb-px">
          {(['automation', 'governance'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-100 capitalize',
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {tab === 'automation' ? 'Automation' : 'Governance'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'automation' ? (
        <AutomationTab onCreateClick={() => setShowWizard(true)} />
      ) : (
        <GovernanceTab />
      )}

      {showWizard && <CreateWorkflowWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}

// ─── Automation Tab ────────────────────────────────────────────────────────────

function AutomationTab({ onCreateClick }: { onCreateClick: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.sources.list().then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.sources.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sources'] }),
  });

  const triggerMutation = useMutation({
    mutationFn: (id: string) => api.sources.triggerRun(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sources'] }),
  });

  const workflows: IngestionWorkflow[] = data?.sources ?? data?.data ?? data ?? [];

  const filtered = workflows.filter((w) => {
    const matchSearch =
      !search ||
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.connector_type.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || w.workflow_type === typeFilter;
    const matchStatus = statusFilter === 'all' || w.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  return (
    <div className="px-8 py-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onCreateClick}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} />
          Create Workflow
        </button>

        <div className="flex-1 relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workflows..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>

        <SelectFilter
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: 'all', label: 'All types' },
            ...AUTOMATION_TYPES.map((t) => ({ value: t.id, label: t.label })),
          ]}
        />

        <SelectFilter
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'running', label: 'Running' },
            { value: 'failed', label: 'Failed' },
          ]}
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : error ? (
          <TableError message="Failed to load workflows" />
        ) : filtered.length === 0 ? (
          <AutomationEmptyState hasFilters={!!search || typeFilter !== 'all' || statusFilter !== 'all'} onCreateClick={onCreateClick} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                {['Workflow Name', 'Type', 'System', 'Schedule', 'Last Run', 'Status', ''].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((w) => {
                const connector = getConnector(w.connector_type);
                const wfType = AUTOMATION_TYPES.find((t) => t.id === w.workflow_type);
                const scheduleLabel =
                  SCHEDULE_OPTIONS.find(
                    (s) =>
                      (typeof w.config === 'object' && w.config?.schedule === s.cron) ||
                      (s.id === 'manual' && !w.schedule)
                  )?.label ?? w.schedule ?? 'Manual';
                const isHovered = hoveredRow === w.id;

                return (
                  <tr
                    key={w.id}
                    onClick={() => router.push(`/workflows/${w.id}`)}
                    onMouseEnter={() => setHoveredRow(w.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors duration-100"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{w.name}</td>
                    <td className="px-4 py-3">
                      {wfType ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200">
                          <wfType.icon size={11} />
                          {wfType.label}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">{w.workflow_type}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {connector ? (
                        <span className="flex items-center gap-1.5 text-gray-700">
                          <span>{connector.emoji}</span>
                          <span className="text-sm">{connector.label}</span>
                        </span>
                      ) : (
                        <span className="text-gray-500">{w.connector_type}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{scheduleLabel}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {w.last_run_at
                        ? formatDistanceToNow(new Date(w.last_run_at), { addSuffix: true })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className={cn('w-2 h-2 rounded-full shrink-0', getStatusDot(w.status))} />
                        <span className="text-gray-600 text-xs">{getStatusText(w.status)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className={cn(
                          'flex items-center gap-1 transition-opacity duration-150',
                          isHovered ? 'opacity-100' : 'opacity-0'
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ActionButton
                          icon={Play}
                          title="Run now"
                          onClick={() => triggerMutation.mutate(w.id)}
                          loading={triggerMutation.isPending && triggerMutation.variables === w.id}
                        />
                        <ActionButton
                          icon={Eye}
                          title="View details"
                          onClick={() => router.push(`/workflows/${w.id}`)}
                        />
                        <ActionButton
                          icon={Trash2}
                          title="Delete"
                          variant="danger"
                          onClick={() => {
                            if (confirm(`Delete workflow "${w.name}"?`)) {
                              deleteMutation.mutate(w.id);
                            }
                          }}
                          loading={deleteMutation.isPending && deleteMutation.variables === w.id}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Governance Tab ────────────────────────────────────────────────────────────

function GovernanceTab() {
  const queryClient = useQueryClient();
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [actionModal, setActionModal] = useState<{
    id: string;
    action: 'approve' | 'reject';
    title: string;
  } | null>(null);
  const [actionComment, setActionComment] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['workflow-instances'],
    queryFn: () => api.workflows.listInstances().then((r) => r.data),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      api.workflows.approve(id, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-instances'] });
      setActionModal(null);
      setActionComment('');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      api.workflows.reject(id, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-instances'] });
      setActionModal(null);
      setActionComment('');
    },
  });

  const workflows: GovernanceWorkflow[] = data?.instances ?? data?.data ?? data ?? [];

  return (
    <div className="px-8 py-6">
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm text-gray-500">{workflows.length} requests</span>
        <button
          onClick={() => setShowNewRequest(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} />
          New Request
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={4} cols={7} />
        ) : error ? (
          <TableError message="Failed to load governance workflows" />
        ) : workflows.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldCheck size={28} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-600">No workflow requests</p>
            <p className="text-xs text-gray-400 mt-1">Requests for access, certification, and policy exceptions appear here</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                {['Name', 'Type', 'Requested by', 'Asset', 'Status', 'Due date', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {workflows.map((w) => {
                const TypeIcon = govTypeIcon(w.workflow_type);
                const isPending = w.status === 'pending' || w.status === 'in_review';

                return (
                  <tr key={w.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">{w.title}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-full border border-gray-200">
                        <TypeIcon size={11} />
                        {govTypeLabel(w.workflow_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{w.requested_by}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono truncate max-w-[180px]">
                      {w.asset_urn ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className={cn('w-2 h-2 rounded-full shrink-0', govStatusColor(w.status))} />
                        <span className="text-gray-600 text-xs capitalize">{w.status.replace('_', ' ')}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {w.due_date ? format(new Date(w.due_date), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {isPending && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setActionModal({ id: w.id, action: 'approve', title: w.title })}
                            className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setActionModal({ id: w.id, action: 'reject', title: w.title })}
                            className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Approve / Reject modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              {actionModal.action === 'approve' ? 'Approve request' : 'Reject request'}
            </h3>
            <p className="text-sm text-gray-500 mb-4 truncate">{actionModal.title}</p>

            <textarea
              value={actionComment}
              onChange={(e) => setActionComment(e.target.value)}
              placeholder={
                actionModal.action === 'approve'
                  ? 'Optional comment...'
                  : 'Reason for rejection (required)'
              }
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
            />

            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                onClick={() => { setActionModal(null); setActionComment(''); }}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              {actionModal.action === 'approve' ? (
                <button
                  onClick={() => approveMutation.mutate({ id: actionModal.id, comment: actionComment })}
                  disabled={approveMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {approveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Approve
                </button>
              ) : (
                <button
                  onClick={() => rejectMutation.mutate({ id: actionModal.id, comment: actionComment })}
                  disabled={rejectMutation.isPending || !actionComment.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {rejectMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                  Reject
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showNewRequest && <NewRequestModal onClose={() => setShowNewRequest(false)} />}
    </div>
  );
}

// ─── New Request Modal ─────────────────────────────────────────────────────────

function NewRequestModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    workflow_type: 'access_request' as GovWorkflowType,
    title: '',
    description: '',
    asset_urn: '',
  });

  const mutation = useMutation({
    mutationFn: () => api.workflows.initiate(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-instances'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">New workflow request</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Request type</label>
            <select
              value={form.workflow_type}
              onChange={(e) => setForm((f) => ({ ...f, workflow_type: e.target.value as GovWorkflowType }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
            >
              {(['access_request', 'certification', 'classification_review', 'deprecation', 'policy_exception'] as GovWorkflowType[]).map(
                (t) => (
                  <option key={t} value={t}>
                    {govTypeLabel(t)}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Brief description of the request"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Asset URN (optional)</label>
            <input
              value={form.asset_urn}
              onChange={(e) => setForm((f) => ({ ...f, asset_urn: e.target.value }))}
              placeholder="urn:opengovern:snowflake:table:prod.analytics.revenue"
              className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Provide context for the reviewers..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
            />
          </div>
        </div>

        {mutation.error && (
          <p className="mt-3 text-xs text-red-600">
            {(mutation.error as Error).message || 'Failed to create request'}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.title.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Submit request
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Workflow Wizard ────────────────────────────────────────────────────

function CreateWorkflowWizard({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<WizardState>(INITIAL_WIZARD);

  const update = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  const TOTAL_STEPS = 7;

  const createMutation = useMutation({
    mutationFn: (payload: unknown) => api.sources.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      onClose();
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: () =>
      api.sources.testConnection({
        connector_type: state.connectorId,
        config: state.credentials,
      }),
    onMutate: () => update('connectionTestStatus', 'testing'),
    onSuccess: (res) => {
      setState((s) => ({
        ...s,
        connectionTestStatus: 'success',
        connectionTestLatency: res.data?.latency_ms,
      }));
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      setState((s) => ({
        ...s,
        connectionTestStatus: 'failed',
        connectionTestError: err.response?.data?.error ?? err.message,
      }));
    },
  });

  const canAdvance = () => {
    switch (state.step) {
      case 1: return state.workflowType !== null;
      case 2: return state.connectorId !== null;
      case 3: return state.name.trim().length > 0;
      case 4: return true;
      case 5: return true;
      case 6: return true;
      case 7: return true;
      default: return false;
    }
  };

  const handleCreate = () => {
    const selectedSchedule = SCHEDULE_OPTIONS.find((s) => s.id === state.schedule);
    const cron =
      state.schedule === 'custom' ? state.customCron : selectedSchedule?.cron ?? null;

    const lookbackDays =
      state.lookback === 'custom'
        ? parseInt(state.customLookbackDays) || 7
        : parseInt(state.lookback) || 7;

    const payload = {
      name: state.name,
      connector_type: state.connectorId,
      workflow_type: state.workflowType,
      config: {
        ...state.credentials,
        schedule: cron,
      },
      filter_config: {
        include_databases: state.includeDatabase ? [state.includeDatabase] : [],
        exclude_databases: state.excludeDatabase ? [state.excludeDatabase] : [],
        include_schemas: state.includeSchema ? [state.includeSchema] : [],
        exclude_schemas: state.excludeSchema ? [state.excludeSchema] : [],
        object_types: state.objectTypes,
      },
      lineage_config: {
        lookback_days: lookbackDays,
      },
    };

    createMutation.mutate(payload);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-base font-semibold text-gray-900">Create Workflow</h2>
            {/* Step indicator */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
                <div
                  key={n}
                  className={cn(
                    'transition-all duration-150',
                    n === state.step
                      ? 'w-5 h-2 bg-blue-600 rounded-full'
                      : n < state.step
                      ? 'w-2 h-2 bg-blue-300 rounded-full'
                      : 'w-2 h-2 bg-gray-200 rounded-full'
                  )}
                />
              ))}
            </div>
            <span className="text-xs text-gray-400">
              Step {state.step} of {TOTAL_STEPS}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {state.step === 1 && (
            <WizardStep1 value={state.workflowType} onChange={(v) => update('workflowType', v)} />
          )}
          {state.step === 2 && (
            <WizardStep2
              value={state.connectorId}
              categoryFilter={state.categoryFilter}
              onCategoryChange={(v) => update('categoryFilter', v)}
              onChange={(v) => update('connectorId', v as ConnectorId)}
            />
          )}
          {state.step === 3 && (
            <WizardStep3
              connectorId={state.connectorId}
              name={state.name}
              credentials={state.credentials}
              testStatus={state.connectionTestStatus}
              testError={state.connectionTestError}
              testLatency={state.connectionTestLatency}
              onNameChange={(v) => update('name', v)}
              onCredentialChange={(key, val) =>
                setState((s) => ({ ...s, credentials: { ...s.credentials, [key]: val } }))
              }
              onTest={() => testConnectionMutation.mutate()}
            />
          )}
          {state.step === 4 && (
            <WizardStep4
              includeDatabase={state.includeDatabase}
              excludeDatabase={state.excludeDatabase}
              includeSchema={state.includeSchema}
              excludeSchema={state.excludeSchema}
              objectTypes={state.objectTypes}
              onChange={(key, val) => setState((s) => ({ ...s, [key]: val }))}
            />
          )}
          {state.step === 5 && (
            <WizardStep5
              value={state.lookback}
              customDays={state.customLookbackDays}
              onChange={(v) => update('lookback', v)}
              onCustomChange={(v) => update('customLookbackDays', v)}
            />
          )}
          {state.step === 6 && (
            <WizardStep6
              value={state.schedule}
              customCron={state.customCron}
              onChange={(v) => update('schedule', v)}
              onCustomCronChange={(v) => update('customCron', v)}
            />
          )}
          {state.step === 7 && (
            <WizardStep7 state={state} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 shrink-0">
          <button
            onClick={() => update('step', Math.max(1, state.step - 1))}
            disabled={state.step === 1}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={15} />
            Back
          </button>

          {state.step < TOTAL_STEPS ? (
            <button
              onClick={() => update('step', state.step + 1)}
              disabled={!canAdvance()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Next
              <ChevronRight size={15} />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Check size={13} />
              )}
              Create Workflow
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Wizard Steps ──────────────────────────────────────────────────────────────

function WizardStep1({
  value,
  onChange,
}: {
  value: AutomationWorkflowType | null;
  onChange: (v: AutomationWorkflowType) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Choose workflow type</h3>
      <p className="text-xs text-gray-500 mb-5">What kind of automation do you want to set up?</p>
      <div className="grid grid-cols-2 gap-3">
        {AUTOMATION_TYPES.map((t) => {
          const Icon = t.icon;
          const selected = value === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={cn(
                'flex items-start gap-3 p-4 border rounded-lg text-left transition-all duration-100',
                selected
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-0.5',
                  selected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                )}
              >
                <Icon size={16} />
              </div>
              <div>
                <p className={cn('text-sm font-medium', selected ? 'text-blue-700' : 'text-gray-800')}>
                  {t.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{t.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WizardStep2({
  value,
  categoryFilter,
  onCategoryChange,
  onChange,
}: {
  value: string | null;
  categoryFilter: string;
  onCategoryChange: (v: string) => void;
  onChange: (v: string) => void;
}) {
  const filtered = CONNECTORS.filter((c) => c.category === categoryFilter);

  return (
    <div className="flex gap-5">
      {/* Sidebar */}
      <div className="w-44 shrink-0 space-y-0.5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">Category</p>
        {CONNECTOR_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onCategoryChange(cat.id)}
            className={cn(
              'w-full text-left px-3 py-2 text-sm rounded-md transition-colors duration-100',
              categoryFilter === cat.id
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Select system</h3>
        <p className="text-xs text-gray-500 mb-4">Which system should this workflow connect to?</p>
        <div className="grid grid-cols-3 gap-2.5">
          {filtered.map((c) => {
            const selected = value === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onChange(c.id)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-3 border rounded-lg text-left transition-all duration-100',
                  selected
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                )}
              >
                <span className="text-xl leading-none">{c.emoji}</span>
                <span className={cn('text-sm font-medium truncate', selected ? 'text-blue-700' : 'text-gray-800')}>
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WizardStep3({
  connectorId,
  name,
  credentials,
  testStatus,
  testError,
  testLatency,
  onNameChange,
  onCredentialChange,
  onTest,
}: {
  connectorId: string | null;
  name: string;
  credentials: Record<string, string>;
  testStatus: 'idle' | 'testing' | 'success' | 'failed';
  testError?: string;
  testLatency?: number;
  onNameChange: (v: string) => void;
  onCredentialChange: (key: string, val: string) => void;
  onTest: () => void;
}) {
  const connector = getConnector(connectorId);
  const fields = (connectorId && CONNECTOR_CREDENTIAL_FIELDS[connectorId]) || DEFAULT_CREDENTIAL_FIELDS;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Connection settings</h3>
      <p className="text-xs text-gray-500 mb-5">
        Enter credentials for{' '}
        {connector ? (
          <span>
            {connector.emoji} {connector.label}
          </span>
        ) : (
          'this connector'
        )}
      </p>

      <div className="space-y-4 max-w-lg">
        {/* Workflow name */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Workflow name</label>
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={connector ? `${connector.label} — Metadata Ingestion` : 'My workflow'}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>

        {/* Credential fields */}
        {fields.map((field) => (
          <div key={field.key}>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">{field.label}</label>
            {field.type === 'textarea' ? (
              <textarea
                value={credentials[field.key] ?? ''}
                onChange={(e) => onCredentialChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={4}
                className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
              />
            ) : (
              <input
                type={field.type}
                value={credentials[field.key] ?? ''}
                onChange={(e) => onCredentialChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            )}
          </div>
        ))}

        {/* Test connection */}
        <div className="pt-1">
          <button
            onClick={onTest}
            disabled={testStatus === 'testing'}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {testStatus === 'testing' ? (
              <Loader2 size={13} className="animate-spin text-blue-600" />
            ) : testStatus === 'success' ? (
              <CheckCircle2 size={13} className="text-green-600" />
            ) : testStatus === 'failed' ? (
              <XCircle size={13} className="text-red-500" />
            ) : (
              <RefreshCw size={13} className="text-gray-500" />
            )}
            Test connection
          </button>

          {testStatus === 'success' && (
            <p className="mt-2 text-xs text-green-600 flex items-center gap-1.5">
              <CheckCircle2 size={12} />
              Connection successful
              {testLatency && <span className="text-gray-400">({testLatency}ms)</span>}
            </p>
          )}
          {testStatus === 'failed' && (
            <p className="mt-2 text-xs text-red-600 flex items-center gap-1.5">
              <XCircle size={12} />
              {testError ?? 'Connection failed'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function WizardStep4({
  includeDatabase,
  excludeDatabase,
  includeSchema,
  excludeSchema,
  objectTypes,
  onChange,
}: {
  includeDatabase: string;
  excludeDatabase: string;
  includeSchema: string;
  excludeSchema: string;
  objectTypes: string[];
  onChange: (key: string, val: unknown) => void;
}) {
  const toggleObjectType = (id: string) => {
    const next = objectTypes.includes(id)
      ? objectTypes.filter((t) => t !== id)
      : [...objectTypes, id];
    onChange('objectTypes', next);
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Scope configuration</h3>
      <p className="text-xs text-gray-500 mb-5">
        Define which databases, schemas, and objects to include or exclude.
      </p>

      <div className="space-y-5 max-w-lg">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Include databases</label>
            <input
              value={includeDatabase}
              onChange={(e) => onChange('includeDatabase', e.target.value)}
              placeholder="prod_*, analytics"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
            <p className="mt-1 text-xs text-gray-400">Comma-separated, supports * wildcard</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Exclude databases</label>
            <input
              value={excludeDatabase}
              onChange={(e) => onChange('excludeDatabase', e.target.value)}
              placeholder="test_*, dev"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Include schemas</label>
            <input
              value={includeSchema}
              onChange={(e) => onChange('includeSchema', e.target.value)}
              placeholder="public, reporting_*"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Exclude schemas</label>
            <input
              value={excludeSchema}
              onChange={(e) => onChange('excludeSchema', e.target.value)}
              placeholder="information_schema, pg_*"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-3">Object types</label>
          <div className="grid grid-cols-2 gap-2">
            {OBJECT_TYPES.map((ot) => (
              <label key={ot.id} className="flex items-center gap-2.5 cursor-pointer select-none group">
                <div
                  onClick={() => toggleObjectType(ot.id)}
                  className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer',
                    objectTypes.includes(ot.id)
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-gray-300 group-hover:border-gray-400'
                  )}
                >
                  {objectTypes.includes(ot.id) && <Check size={10} className="text-white" />}
                </div>
                <span className="text-sm text-gray-700">{ot.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WizardStep5({
  value,
  customDays,
  onChange,
  onCustomChange,
}: {
  value: string;
  customDays: string;
  onChange: (v: string) => void;
  onCustomChange: (v: string) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Lineage lookback window</h3>
      <p className="text-xs text-gray-500 mb-5">
        How far back should we scan query history to reconstruct lineage?
      </p>
      <div className="space-y-2.5 max-w-sm">
        {LOOKBACK_OPTIONS.map((opt) => (
          <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
            <div
              onClick={() => onChange(opt.id)}
              className={cn(
                'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer',
                value === opt.id ? 'border-blue-600' : 'border-gray-300 group-hover:border-gray-400'
              )}
            >
              {value === opt.id && <div className="w-2 h-2 rounded-full bg-blue-600" />}
            </div>
            <span className="text-sm text-gray-700">{opt.label}</span>
          </label>
        ))}

        {value === 'custom' && (
          <div className="ml-7 mt-2">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={365}
                value={customDays}
                onChange={(e) => onCustomChange(e.target.value)}
                placeholder="30"
                className="w-24 px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
              <span className="text-sm text-gray-500">days</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WizardStep6({
  value,
  customCron,
  onChange,
  onCustomCronChange,
}: {
  value: string;
  customCron: string;
  onChange: (v: string) => void;
  onCustomCronChange: (v: string) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Schedule</h3>
      <p className="text-xs text-gray-500 mb-5">How often should this workflow run?</p>
      <div className="space-y-2.5 max-w-sm">
        {SCHEDULE_OPTIONS.map((opt) => (
          <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
            <div
              onClick={() => onChange(opt.id)}
              className={cn(
                'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer',
                value === opt.id ? 'border-blue-600' : 'border-gray-300 group-hover:border-gray-400'
              )}
            >
              {value === opt.id && <div className="w-2 h-2 rounded-full bg-blue-600" />}
            </div>
            <div>
              <span className="text-sm text-gray-700">{opt.label}</span>
              {opt.cron && opt.id !== 'custom' && (
                <span className="ml-2 text-xs text-gray-400 font-mono">{opt.cron}</span>
              )}
            </div>
          </label>
        ))}

        {value === 'custom' && (
          <div className="ml-7 mt-2">
            <input
              value={customCron}
              onChange={(e) => onCustomCronChange(e.target.value)}
              placeholder="0 */4 * * *"
              className="w-48 px-3 py-1.5 text-sm font-mono border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
            <p className="mt-1.5 text-xs text-gray-400">Standard 5-field cron expression</p>
          </div>
        )}
      </div>
    </div>
  );
}

function WizardStep7({ state }: { state: WizardState }) {
  const connector = getConnector(state.connectorId);
  const wfType = AUTOMATION_TYPES.find((t) => t.id === state.workflowType);
  const scheduleOpt = SCHEDULE_OPTIONS.find((s) => s.id === state.schedule);
  const scheduleLabel =
    state.schedule === 'custom' ? state.customCron : scheduleOpt?.label ?? 'Manual';

  const lookbackLabel =
    state.lookback === 'custom' ? `${state.customLookbackDays} days` : `${state.lookback} days`;

  const rows: [string, React.ReactNode][] = [
    ['Workflow name', <span className="font-medium text-gray-900">{state.name}</span>],
    ['Type', wfType?.label ?? state.workflowType],
    [
      'System',
      connector ? (
        <span className="flex items-center gap-1.5">
          {connector.emoji} {connector.label}
        </span>
      ) : (
        state.connectorId
      ),
    ],
    ['Databases (include)', state.includeDatabase || <span className="text-gray-400">All</span>],
    ['Databases (exclude)', state.excludeDatabase || <span className="text-gray-400">None</span>],
    ['Schemas (include)', state.includeSchema || <span className="text-gray-400">All</span>],
    ['Schemas (exclude)', state.excludeSchema || <span className="text-gray-400">None</span>],
    ['Object types', state.objectTypes.join(', ')],
    ['Lineage lookback', lookbackLabel],
    ['Schedule', scheduleLabel],
  ];

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Review configuration</h3>
      <p className="text-xs text-gray-500 mb-5">
        Confirm the settings below before creating the workflow.
      </p>

      <div className="border border-gray-200 rounded-lg overflow-hidden max-w-lg">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {rows.map(([label, value]) => (
              <tr key={label} className="even:bg-gray-50/50">
                <td className="px-4 py-2.5 text-xs font-medium text-gray-500 w-44 shrink-0">{label}</td>
                <td className="px-4 py-2.5 text-sm text-gray-700">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Shared UI primitives ──────────────────────────────────────────────────────

function SelectFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
      />
    </div>
  );
}

function ActionButton({
  icon: Icon,
  title,
  onClick,
  loading,
  variant = 'default',
}: {
  icon: React.ElementType;
  title: string;
  onClick: () => void;
  loading?: boolean;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={loading}
      className={cn(
        'p-1.5 rounded transition-colors duration-100',
        variant === 'danger'
          ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
          : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
      )}
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
    </button>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="p-4 space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="h-8 bg-gray-100 rounded animate-pulse"
              style={{ flex: j === 0 ? 2 : 1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function TableError({ message }: { message: string }) {
  return (
    <div className="py-12 text-center">
      <AlertCircle size={24} className="mx-auto text-red-400 mb-2" />
      <p className="text-sm text-gray-600">{message}</p>
      <p className="text-xs text-gray-400 mt-1">Check that the API server is reachable</p>
    </div>
  );
}

function AutomationEmptyState({
  hasFilters,
  onCreateClick,
}: {
  hasFilters: boolean;
  onCreateClick: () => void;
}) {
  return (
    <div className="py-16 text-center">
      <Database size={28} className="mx-auto text-gray-300 mb-3" />
      <p className="text-sm font-medium text-gray-600">
        {hasFilters ? 'No workflows match your filters' : 'No workflows yet'}
      </p>
      <p className="text-xs text-gray-400 mt-1">
        {hasFilters
          ? 'Try adjusting the search or filters above'
          : 'Connect your first data source to start ingesting metadata'}
      </p>
      {!hasFilters && (
        <button
          onClick={onCreateClick}
          className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors mx-auto"
        >
          <Plus size={14} />
          Create your first workflow
        </button>
      )}
    </div>
  );
}
