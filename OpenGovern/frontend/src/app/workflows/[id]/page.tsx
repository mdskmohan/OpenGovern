'use client';

/**
 * Workflow Detail — Shows configuration summary + full run history for an
 * ingestion workflow. Auto-refreshes every 5 seconds when a run is active
 * so operators see live status without a manual reload.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatDistanceToNow, format, differenceInSeconds } from 'date-fns';
import {
  ArrowLeft,
  Play,
  Edit3,
  Trash2,
  ChevronDown,
  ChevronRight,
  Database,
  GitBranch,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  Calendar,
  Tag,
  Filter,
  ShieldCheck,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/components/ui/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

type RunStatus = 'running' | 'success' | 'failed' | 'queued' | 'cancelled';

interface IngestionRun {
  id: string;
  status: RunStatus;
  started_at: string;
  finished_at?: string;
  duration_seconds?: number;
  assets_discovered?: number;
  assets_created?: number;
  assets_updated?: number;
  assets_failed?: number;
  databases_discovered?: number;
  schemas_discovered?: number;
  tables_ingested?: number;
  views_ingested?: number;
  columns_ingested?: number;
  lineage_edges_created?: number;
  error_message?: string;
  triggered_by?: string;
}

interface IngestionWorkflow {
  id: string;
  name: string;
  connector_type: string;
  workflow_type: string;
  schedule?: string;
  status: 'active' | 'inactive' | 'running' | 'failed' | 'queued';
  last_run_at?: string;
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

// ─── Connector / type lookup helpers ──────────────────────────────────────────

const CONNECTOR_EMOJIS: Record<string, string> = {
  snowflake: '❄️',
  bigquery: '🔵',
  redshift: '🔴',
  databricks: '⚡',
  postgres: '🐘',
  postgresql: '🐘',
  mysql: '🐬',
  sqlserver: '🔷',
  oracle: '🔶',
  clickhouse: '🟡',
  tableau: '📊',
  looker: '🔭',
  powerbi: '💛',
  metabase: '📈',
  dbt: '🔧',
  spark: '✨',
  airflow: '🌊',
  dagster: '🎯',
  kafka: '📨',
  s3: '🪣',
  gcs: '☁️',
};

const WORKFLOW_TYPE_ICONS: Record<string, React.ElementType> = {
  metadata_ingestion: Database,
  usage_ingestion: Zap,
  lineage_extraction: GitBranch,
  data_quality_scan: CheckCircle2,
  pii_classification: Tag,
  policy_compliance: ShieldCheck,
  custom: Settings,
};

const WORKFLOW_TYPE_LABELS: Record<string, string> = {
  metadata_ingestion: 'Metadata Ingestion',
  usage_ingestion: 'Usage Ingestion',
  lineage_extraction: 'Lineage Extraction',
  data_quality_scan: 'Data Quality Scan',
  pii_classification: 'PII Classification',
  policy_compliance: 'Policy Compliance',
  custom: 'Custom',
};

// ─── Status helpers ────────────────────────────────────────────────────────────

function runStatusDot(status: RunStatus) {
  switch (status) {
    case 'success': return 'bg-green-500';
    case 'running': return 'bg-blue-500 animate-pulse';
    case 'failed': return 'bg-red-500';
    case 'queued': return 'bg-amber-400';
    case 'cancelled': return 'bg-gray-300';
    default: return 'bg-gray-300';
  }
}

function runStatusText(status: RunStatus) {
  const map: Record<RunStatus, string> = {
    success: 'Success',
    running: 'Running',
    failed: 'Failed',
    queued: 'Queued',
    cancelled: 'Cancelled',
  };
  return map[status] ?? status;
}

function runStatusBg(status: RunStatus) {
  switch (status) {
    case 'success': return 'bg-green-50 text-green-700 border-green-200';
    case 'running': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'failed': return 'bg-red-50 text-red-700 border-red-200';
    case 'queued': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'cancelled': return 'bg-gray-100 text-gray-600 border-gray-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function num(v?: number): string {
  if (v === undefined || v === null) return '—';
  return v.toLocaleString();
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function WorkflowDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const queryClient = useQueryClient();
  const [configOpen, setConfigOpen] = useState(false);

  const { data: workflowData, isLoading: wfLoading } = useQuery({
    queryKey: ['source', id],
    queryFn: () => api.sources.get(id).then((r) => r.data),
    enabled: !!id,
  });

  const workflow: IngestionWorkflow | null = workflowData?.source ?? workflowData ?? null;

  // Determine whether any run is active to decide polling cadence
  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ['source-runs', id],
    queryFn: () => api.sources.getRuns(id).then((r) => r.data),
    enabled: !!id,
    refetchInterval: (query) => {
      const runs: IngestionRun[] = query.state.data?.runs ?? query.state.data?.data ?? query.state.data ?? [];
      const hasActive = runs.some((r) => r.status === 'running' || r.status === 'queued');
      // Poll every 5 s while a run is in-flight, otherwise let staleTime handle it
      return hasActive ? 5000 : false;
    },
  });

  const runs: IngestionRun[] = runsData?.runs ?? runsData?.data ?? runsData ?? [];

  const triggerMutation = useMutation({
    mutationFn: () => api.sources.triggerRun(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['source-runs', id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.sources.delete(id),
    onSuccess: () => router.push('/workflows'),
  });

  // Stats summary
  const totalRuns = runs.length;
  const successRuns = runs.filter((r) => r.status === 'success').length;
  const failedRuns = runs.filter((r) => r.status === 'failed').length;
  const avgDuration =
    runs.filter((r) => r.duration_seconds).reduce((sum, r) => sum + (r.duration_seconds ?? 0), 0) /
      (runs.filter((r) => r.duration_seconds).length || 1);
  const lastDiscovered = runs[0]?.assets_discovered;

  if (wfLoading) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center">
        <Loader2 size={22} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex flex-col items-center justify-center gap-3">
        <AlertCircle size={28} className="text-gray-300" />
        <p className="text-sm text-gray-600">Workflow not found</p>
        <button
          onClick={() => router.push('/workflows')}
          className="text-sm text-blue-600 hover:underline"
        >
          Back to Workflows
        </button>
      </div>
    );
  }

  const TypeIcon = WORKFLOW_TYPE_ICONS[workflow.workflow_type] ?? Database;
  const connectorEmoji = CONNECTOR_EMOJIS[workflow.connector_type] ?? '🔌';

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/workflows')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={14} />
            Workflows
          </button>
          <span className="text-gray-300">/</span>

          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <h1 className="text-base font-semibold text-gray-900 truncate">{workflow.name}</h1>

            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200 shrink-0">
              <TypeIcon size={11} />
              {WORKFLOW_TYPE_LABELS[workflow.workflow_type] ?? workflow.workflow_type}
            </span>

            <span className="text-sm text-gray-500 shrink-0">
              {connectorEmoji} {workflow.connector_type}
            </span>

            <span className="flex items-center gap-1.5 shrink-0">
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  workflow.status === 'active'
                    ? 'bg-green-500'
                    : workflow.status === 'running'
                    ? 'bg-blue-500 animate-pulse'
                    : workflow.status === 'failed'
                    ? 'bg-red-500'
                    : 'bg-gray-300'
                )}
              />
              <span className="text-xs text-gray-500 capitalize">{workflow.status}</span>
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => triggerMutation.mutate()}
              disabled={triggerMutation.isPending || workflow.status === 'running'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {triggerMutation.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Play size={13} />
              )}
              Run Now
            </button>

            <button
              onClick={() => {
                if (confirm(`Delete workflow "${workflow.name}"? This cannot be undone.`)) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete workflow"
            >
              {deleteMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-5">
        {/* Configuration — collapsible */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setConfigOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="text-sm font-medium text-gray-900">Configuration</span>
            <ChevronDown
              size={15}
              className={cn(
                'text-gray-400 transition-transform duration-150',
                configOpen ? 'rotate-180' : ''
              )}
            />
          </button>

          {configOpen && (
            <div className="border-t border-gray-200 px-5 py-4">
              <div className="grid grid-cols-3 gap-x-8 gap-y-4 text-sm">
                <ConfigRow label="Connector type" value={<span>{connectorEmoji} {workflow.connector_type}</span>} />
                <ConfigRow
                  label="Schedule"
                  value={
                    workflow.schedule ? (
                      <span className="font-mono text-xs">{workflow.schedule}</span>
                    ) : (
                      'Manual'
                    )
                  }
                />
                <ConfigRow
                  label="Lineage lookback"
                  value={
                    workflow.lineage_config?.lookback_days
                      ? `${workflow.lineage_config.lookback_days} days`
                      : '7 days'
                  }
                />
                <ConfigRow
                  label="Object types"
                  value={
                    workflow.filter_config?.object_types?.length
                      ? workflow.filter_config.object_types.join(', ')
                      : 'All types'
                  }
                />
                <ConfigRow
                  label="Include databases"
                  value={
                    workflow.filter_config?.include_databases?.length
                      ? workflow.filter_config.include_databases.join(', ')
                      : <span className="text-gray-400">All</span>
                  }
                />
                <ConfigRow
                  label="Exclude databases"
                  value={
                    workflow.filter_config?.exclude_databases?.length
                      ? workflow.filter_config.exclude_databases.join(', ')
                      : <span className="text-gray-400">None</span>
                  }
                />
                <ConfigRow
                  label="Include schemas"
                  value={
                    workflow.filter_config?.include_schemas?.length
                      ? workflow.filter_config.include_schemas.join(', ')
                      : <span className="text-gray-400">All</span>
                  }
                />
                <ConfigRow
                  label="Exclude schemas"
                  value={
                    workflow.filter_config?.exclude_schemas?.length
                      ? workflow.filter_config.exclude_schemas.join(', ')
                      : <span className="text-gray-400">None</span>
                  }
                />
                <ConfigRow
                  label="Created"
                  value={workflow.created_at ? format(new Date(workflow.created_at), 'MMM d, yyyy') : '—'}
                />
              </div>
            </div>
          )}
        </div>

        {/* Run History */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-900">Run History</h2>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['source-runs', id] })}
              className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={13} />
            </button>
          </div>

          {/* Summary stats */}
          {runs.length > 0 && (
            <div className="grid grid-cols-5 divide-x divide-gray-100 border-b border-gray-200">
              <StatCell label="Total runs" value={String(totalRuns)} />
              <StatCell label="Successful" value={String(successRuns)} valueColor="text-green-600" />
              <StatCell label="Failed" value={String(failedRuns)} valueColor={failedRuns > 0 ? 'text-red-600' : undefined} />
              <StatCell label="Avg duration" value={formatDuration(Math.round(avgDuration))} />
              <StatCell label="Last discovered" value={lastDiscovered !== undefined ? num(lastDiscovered) : '—'} />
            </div>
          )}

          {/* Runs table */}
          {runsLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <div className="py-14 text-center">
              <Clock size={24} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No runs yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Click "Run Now" to start the first ingestion
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  {['Run ID', 'Status', 'Started', 'Duration', 'Discovered', 'Created', 'Updated', 'Failed', 'Error'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => router.push(`/workflows/${id}/runs/${run.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {run.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border',
                          runStatusBg(run.status)
                        )}
                      >
                        <span className={cn('w-1.5 h-1.5 rounded-full', runStatusDot(run.status))} />
                        {runStatusText(run.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {run.started_at ? formatDistanceToNow(new Date(run.started_at), { addSuffix: true }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDuration(run.duration_seconds)}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{num(run.assets_discovered)}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{num(run.assets_created)}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{num(run.assets_updated)}</td>
                    <td className="px-4 py-3 text-xs">
                      {run.assets_failed ? (
                        <span className="text-red-600 font-medium">{num(run.assets_failed)}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                      {run.error_message ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Config row ────────────────────────────────────────────────────────────────

function ConfigRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-700">{value}</p>
    </div>
  );
}

// ─── Stat cell ─────────────────────────────────────────────────────────────────

function StatCell({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="px-5 py-4 text-center">
      <p className={cn('text-xl font-semibold tabular-nums', valueColor ?? 'text-gray-900')}>
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
