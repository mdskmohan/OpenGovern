'use client';

/**
 * Run Detail — Full breakdown of a single ingestion run.
 *
 * Left column: Run overview + stats grid.
 * Right column: Execution timeline (GitHub Actions style) + searchable log viewer.
 *
 * We derive synthetic timeline steps from run metadata since the backend
 * doesn't yet expose per-step timings. When step-level data is added to the
 * API response it can be slotted directly into the timeline.
 */

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { format } from 'date-fns';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  Copy,
  Download,
  Search,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/components/ui/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

type RunStatus = 'running' | 'success' | 'failed' | 'queued' | 'cancelled';
type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

interface LogLine {
  ts: string;
  level: LogLevel;
  message: string;
}

interface TimelineStep {
  id: string;
  label: string;
  status: 'done' | 'running' | 'failed' | 'pending' | 'skipped';
  durationSeconds?: number;
  logs?: LogLine[];
}

interface IngestionRun {
  id: string;
  status: RunStatus;
  started_at: string;
  finished_at?: string;
  duration_seconds?: number;
  triggered_by?: string;
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
  stack_trace?: string;
  raw_logs?: string;
  steps?: TimelineStep[];
}

interface IngestionWorkflow {
  id: string;
  name: string;
  connector_type: string;
  workflow_type: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONNECTOR_EMOJIS: Record<string, string> = {
  snowflake: '❄️', bigquery: '🔵', redshift: '🔴', databricks: '⚡',
  postgres: '🐘', postgresql: '🐘', mysql: '🐬', sqlserver: '🔷',
  oracle: '🔶', clickhouse: '🟡', tableau: '📊', looker: '🔭',
  powerbi: '💛', metabase: '📈', dbt: '🔧', spark: '✨',
  airflow: '🌊', dagster: '🎯', kafka: '📨', s3: '🪣', gcs: '☁️',
};

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

function runStatusBadgeClass(status: RunStatus) {
  switch (status) {
    case 'success': return 'bg-green-50 text-green-700 border-green-200';
    case 'running': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'failed': return 'bg-red-50 text-red-700 border-red-200';
    case 'queued': return 'bg-amber-50 text-amber-700 border-amber-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

function runStatusLabel(status: RunStatus) {
  const map: Record<RunStatus, string> = {
    success: 'Success',
    running: 'Running',
    failed: 'Failed',
    queued: 'Queued',
    cancelled: 'Cancelled',
  };
  return map[status] ?? status;
}

/**
 * Derive synthetic timeline steps from run metadata.
 * The order reflects the actual execution sequence in the Python ingestion framework.
 * Each step's status is inferred from the overall run state and the existence of metrics.
 */
function deriveTimeline(run: IngestionRun): TimelineStep[] {
  // If the API provides pre-computed step data, use it directly
  if (run.steps && run.steps.length > 0) return run.steps;

  const isSuccess = run.status === 'success';
  const isFailed = run.status === 'failed';
  const isRunning = run.status === 'running';

  // Determine which step the run is currently on (or failed on)
  // We infer this from which metrics are populated
  let activeStep = 0;
  if (run.databases_discovered !== undefined) activeStep = 3;
  if (run.schemas_discovered !== undefined) activeStep = 4;
  if (run.tables_ingested !== undefined) activeStep = 5;
  if (run.columns_ingested !== undefined) activeStep = 6;
  if (run.lineage_edges_created !== undefined) activeStep = 8;

  const totalDur = run.duration_seconds ?? 0;

  // Rough duration distribution for illustration (proportional)
  const durations = [2, 3, 5, 8, totalDur * 0.4, totalDur * 0.3, 5, 4, 6, 2];

  const STEP_DEFS = [
    { id: 'init', label: 'Initialize Connector' },
    { id: 'test_conn', label: 'Test Connection' },
    { id: 'fetch_db', label: 'Fetch Databases' },
    { id: 'fetch_schemas', label: 'Fetch Schemas' },
    { id: 'fetch_tables', label: 'Fetch Tables' },
    { id: 'fetch_columns', label: 'Fetch Columns' },
    { id: 'extract_usage', label: 'Extract Usage' },
    { id: 'parse_queries', label: 'Parse Query History' },
    { id: 'gen_lineage', label: 'Generate Lineage' },
    { id: 'finalize', label: 'Finalize Run' },
  ];

  return STEP_DEFS.map((s, i) => {
    let status: TimelineStep['status'];
    if (isSuccess) {
      status = 'done';
    } else if (isFailed) {
      if (i < activeStep) {
        status = 'done';
      } else if (i === activeStep) {
        status = 'failed';
      } else {
        status = 'pending';
      }
    } else if (isRunning) {
      if (i < activeStep) {
        status = 'done';
      } else if (i === activeStep) {
        status = 'running';
      } else {
        status = 'pending';
      }
    } else {
      status = 'pending';
    }

    return {
      id: s.id,
      label: s.label,
      status,
      durationSeconds: status === 'done' || status === 'failed' ? Math.max(1, Math.round(durations[i])) : undefined,
    };
  });
}

/**
 * Parse raw_logs string into structured log lines.
 * Expects lines like: "2026-03-11T06:12:34.123Z [INFO] message..."
 */
function parseLogs(raw?: string): LogLine[] {
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map((line) => {
    const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.Z]+)/);
    const levelMatch = line.match(/\[(INFO|WARN|ERROR|DEBUG)\]/);
    const ts = tsMatch?.[1] ?? '';
    const level = (levelMatch?.[1] as LogLevel) ?? 'INFO';
    const message = line.replace(/^\S+\s+\[\w+\]\s*/, '').trim() || line;
    return { ts, level, message };
  });
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function RunDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const runId = params?.runId as string;

  const { data: workflowData } = useQuery({
    queryKey: ['source', id],
    queryFn: () => api.sources.get(id).then((r) => r.data),
    enabled: !!id,
  });

  const workflow: IngestionWorkflow | null = workflowData?.source ?? workflowData ?? null;

  const { data: runsData, isLoading } = useQuery({
    queryKey: ['source-runs', id],
    queryFn: () => api.sources.getRuns(id).then((r) => r.data),
    enabled: !!id,
    refetchInterval: (query) => {
      const runs: IngestionRun[] = query.state.data?.runs ?? query.state.data?.data ?? query.state.data ?? [];
      const current = runs.find((r) => r.id === runId);
      return current?.status === 'running' || current?.status === 'queued' ? 5000 : false;
    },
  });

  const allRuns: IngestionRun[] = runsData?.runs ?? runsData?.data ?? runsData ?? [];
  const run = allRuns.find((r) => r.id === runId) ?? null;

  const timeline = useMemo(() => (run ? deriveTimeline(run) : []), [run]);
  const logs = useMemo(() => parseLogs(run?.raw_logs), [run?.raw_logs]);

  const triggerMutation = useMutation({
    mutationFn: () => api.sources.triggerRun(id),
    onSuccess: () => router.push(`/workflows/${id}`),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center">
        <Loader2 size={22} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex flex-col items-center justify-center gap-3">
        <AlertCircle size={28} className="text-gray-300" />
        <p className="text-sm text-gray-600">Run not found</p>
        <button
          onClick={() => router.push(`/workflows/${id}`)}
          className="text-sm text-blue-600 hover:underline"
        >
          Back to workflow
        </button>
      </div>
    );
  }

  const connectorEmoji = CONNECTOR_EMOJIS[workflow?.connector_type ?? ''] ?? '🔌';

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/workflows/${id}`)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={14} />
            {workflow?.name ?? 'Workflow'}
          </button>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-900 font-mono">{runId.slice(0, 8)}…</span>

          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border',
              runStatusBadgeClass(run.status)
            )}
          >
            {run.status === 'running' && <Loader2 size={10} className="animate-spin" />}
            {run.status === 'success' && <CheckCircle2 size={10} />}
            {run.status === 'failed' && <XCircle size={10} />}
            {runStatusLabel(run.status)}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-8 py-6 flex gap-6">
        {/* Left column — overview + stats */}
        <div className="w-80 shrink-0 space-y-4">
          {/* Run overview card */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Run Overview</h2>

            <OverviewRow label="Workflow" value={workflow?.name ?? '—'} />
            <OverviewRow
              label="Run ID"
              value={
                <span className="font-mono text-xs text-gray-600 break-all">{run.id}</span>
              }
            />
            <OverviewRow
              label="System"
              value={
                <span>
                  {connectorEmoji} {workflow?.connector_type ?? '—'}
                </span>
              }
            />
            <OverviewRow
              label="Status"
              value={
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border',
                    runStatusBadgeClass(run.status)
                  )}
                >
                  {runStatusLabel(run.status)}
                </span>
              }
            />
            <OverviewRow label="Triggered by" value={run.triggered_by ?? 'schedule'} />
            <OverviewRow
              label="Started"
              value={run.started_at ? format(new Date(run.started_at), 'MMM d, yyyy h:mm:ss a') : '—'}
            />
            <OverviewRow
              label="Ended"
              value={
                run.finished_at
                  ? (run.finished_at ? format(new Date(run.finished_at), 'MMM d, yyyy h:mm:ss a') : '—')
                  : run.status === 'running'
                  ? 'In progress…'
                  : '—'
              }
            />
            <OverviewRow label="Duration" value={formatDuration(run.duration_seconds)} />
          </div>

          {/* Stats grid */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Stats</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Databases', value: num(run.databases_discovered) },
                { label: 'Schemas', value: num(run.schemas_discovered) },
                { label: 'Tables', value: num(run.tables_ingested) },
                { label: 'Views', value: num(run.views_ingested) },
                { label: 'Columns', value: num(run.columns_ingested) },
                { label: 'Lineage edges', value: num(run.lineage_edges_created) },
                { label: 'Assets created', value: num(run.assets_created) },
                { label: 'Assets updated', value: num(run.assets_updated) },
              ].map((s) => (
                <div key={s.label} className="bg-gray-50 rounded-md px-3 py-2.5">
                  <p className="text-sm font-semibold text-gray-900 tabular-nums">{s.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Error / retry (if failed) */}
          {run.status === 'failed' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <XCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-red-700 mb-1">Run failed</p>
                  <p className="text-xs text-red-600 leading-relaxed">
                    {run.error_message ?? 'An unexpected error occurred'}
                  </p>
                </div>
              </div>

              {run.stack_trace && (
                <details>
                  <summary className="text-xs text-red-600 cursor-pointer hover:text-red-700 select-none">
                    View stack trace
                  </summary>
                  <pre className="mt-2 text-[10px] text-red-600 whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto">
                    {run.stack_trace}
                  </pre>
                </details>
              )}

              <button
                onClick={() => triggerMutation.mutate()}
                disabled={triggerMutation.isPending}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {triggerMutation.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RotateCcw size={12} />
                )}
                Retry run
              </button>
            </div>
          )}
        </div>

        {/* Right column — timeline + logs */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Execution timeline */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 className="text-sm font-medium text-gray-900">Execution Timeline</h2>
            </div>
            <div className="px-5 py-4">
              <div className="space-y-0">
                {timeline.map((step, idx) => (
                  <TimelineStepRow
                    key={step.id}
                    step={step}
                    isLast={idx === timeline.length - 1}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Log viewer */}
          <LogViewer logs={logs} runStatus={run.status} rawLogs={run.raw_logs} />
        </div>
      </div>
    </div>
  );
}

// ─── Timeline step row ─────────────────────────────────────────────────────────

function TimelineStepRow({ step, isLast }: { step: TimelineStep; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const circleClass = {
    done: 'bg-green-500 text-white',
    running: 'bg-blue-500 text-white animate-pulse',
    failed: 'bg-red-500 text-white',
    pending: 'bg-gray-100 text-gray-400 border border-gray-200',
    skipped: 'bg-gray-100 text-gray-400 border border-gray-200',
  }[step.status];

  const CircleIcon = {
    done: CheckCircle2,
    running: Loader2,
    failed: XCircle,
    pending: Clock,
    skipped: Clock,
  }[step.status];

  const labelColor = {
    done: 'text-gray-800',
    running: 'text-blue-700 font-medium',
    failed: 'text-red-700 font-medium',
    pending: 'text-gray-400',
    skipped: 'text-gray-400',
  }[step.status];

  return (
    <div className="flex gap-3">
      {/* Left: circle + vertical line */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10',
            circleClass
          )}
        >
          <CircleIcon
            size={12}
            className={step.status === 'running' ? 'animate-spin' : ''}
          />
        </div>
        {!isLast && (
          <div
            className={cn(
              'w-px flex-1 min-h-[20px]',
              step.status === 'done' ? 'bg-green-200' : 'bg-gray-200'
            )}
          />
        )}
      </div>

      {/* Right: content */}
      <div className="flex-1 pb-4 min-w-0">
        <div className="flex items-center gap-3 mt-0.5">
          <span className={cn('text-sm', labelColor)}>{step.label}</span>
          {step.durationSeconds !== undefined && (
            <span className="text-xs text-gray-400">{formatDuration(step.durationSeconds)}</span>
          )}
          {step.status === 'running' && (
            <span className="text-xs text-blue-500">Running…</span>
          )}
          {step.logs && step.logs.length > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
            >
              {expanded ? 'Hide' : 'View'} logs
              <ChevronDown
                size={11}
                className={cn('transition-transform', expanded ? 'rotate-180' : '')}
              />
            </button>
          )}
        </div>

        {expanded && step.logs && (
          <div className="mt-2 bg-[#0d1117] rounded-md p-3 max-h-40 overflow-y-auto">
            {step.logs.map((line, i) => (
              <div key={i} className="flex items-start gap-2 py-0.5">
                <span className="text-gray-500 font-mono text-[10px] shrink-0 w-20">{line.ts.slice(11, 19)}</span>
                <LogLevelBadge level={line.level} />
                <span className="text-gray-300 font-mono text-[11px] leading-relaxed">{line.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Log viewer ────────────────────────────────────────────────────────────────

function LogViewer({
  logs,
  runStatus,
  rawLogs,
}: {
  logs: LogLine[];
  runStatus: RunStatus;
  rawLogs?: string;
}) {
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'ALL'>('ALL');
  const [copied, setCopied] = useState(false);

  const filtered = logs.filter((l) => {
    const matchSearch = !search || l.message.toLowerCase().includes(search.toLowerCase());
    const matchLevel = levelFilter === 'ALL' || l.level === levelFilter;
    return matchSearch && matchLevel;
  });

  const handleCopy = () => {
    const text = filtered.map((l) => `${l.ts} [${l.level}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const text = (rawLogs ?? filtered.map((l) => `${l.ts} [${l.level}] ${l.message}`).join('\n'));
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `run-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-3">
        <h2 className="text-sm font-medium text-gray-900 shrink-0">Logs</h2>

        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs…"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>

        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as LogLevel | 'ALL')}
          className="px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none bg-white text-gray-700"
        >
          <option value="ALL">All levels</option>
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Copy size={11} />
            {copied ? 'Copied!' : 'Copy all'}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Download size={11} />
            Download
          </button>
        </div>
      </div>

      {/* Log body */}
      <div className="bg-[#0d1117] min-h-[280px] max-h-[480px] overflow-y-auto p-4 font-mono">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-gray-600 text-xs">
              {runStatus === 'running' ? 'Waiting for log output…' : 'No logs available for this run'}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-gray-600 text-xs">No log lines match your filters</p>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((line, i) => (
              <div key={i} className="flex items-start gap-3 py-0.5 group">
                <span className="text-gray-600 text-[10px] w-20 shrink-0 select-none">
                  {line.ts ? line.ts.slice(11, 23) : ''}
                </span>
                <LogLevelBadge level={line.level} />
                <span
                  className={cn(
                    'text-[11px] leading-relaxed flex-1 break-all',
                    line.level === 'ERROR' ? 'text-red-400' : 'text-gray-300'
                  )}
                >
                  {line.message}
                </span>
              </div>
            ))}
            {runStatus === 'running' && (
              <div className="flex items-center gap-2 py-1">
                <span className="text-gray-600 text-[10px] w-20 shrink-0" />
                <Loader2 size={10} className="animate-spin text-blue-500" />
                <span className="text-blue-500 text-[11px]">Running…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer count */}
      {logs.length > 0 && (
        <div className="px-5 py-2 border-t border-gray-200 flex items-center gap-3 bg-gray-50">
          <span className="text-xs text-gray-400">
            {filtered.length} of {logs.length} lines
          </span>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-xs text-blue-600 hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function OverviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-gray-400 w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-xs text-gray-700 flex-1 min-w-0">{value}</span>
    </div>
  );
}

function LogLevelBadge({ level }: { level: LogLevel }) {
  const classes: Record<LogLevel, string> = {
    INFO: 'text-gray-400 bg-gray-800',
    DEBUG: 'text-blue-400 bg-blue-900/40',
    WARN: 'text-amber-400 bg-amber-900/40',
    ERROR: 'text-red-400 bg-red-900/40',
  };
  return (
    <span
      className={cn(
        'inline-block px-1.5 py-0 text-[9px] font-bold rounded uppercase shrink-0 leading-4',
        classes[level]
      )}
    >
      {level}
    </span>
  );
}
