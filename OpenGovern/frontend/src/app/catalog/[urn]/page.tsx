'use client';

import React, { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import * as Tabs from '@radix-ui/react-tabs';
import {
  ArrowLeft,
  Key,
  Shield,
  Tag as TagIcon,
  User,
  Globe,
  Hash,
  AlertCircle,
  PlayCircle,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import ReactFlow, {
  Background,
  Controls,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { formatDistanceToNow, format } from 'date-fns';
import {
  RadialBarChart,
  RadialBar,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

import { Badge, getEntityTypeVariant, getCertificationVariant, getSensitivityVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAsset, useLineageGraph } from '@/hooks/useAssets';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { QualityScore, SchemaField } from '@/types';

const TABS = ['overview', 'schema', 'lineage', 'quality', 'governance', 'history'] as const;
type TabId = typeof TABS[number];

function TabLabel({ id }: { id: TabId }) {
  const labels: Record<TabId, string> = {
    overview: 'Overview',
    schema: 'Schema',
    lineage: 'Lineage',
    quality: 'Quality',
    governance: 'Governance',
    history: 'History',
  };
  return <>{labels[id]}</>;
}

function SchemaTab({ fields }: { fields: SchemaField[] }) {
  if (!fields.length) {
    return (
      <EmptyState
        icon={<Hash size={36} />}
        title="No schema available"
        description="Schema metadata has not been ingested yet."
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {['#', 'Column', 'Type', 'Nullable', 'Description', 'Tags'].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr
              key={field.name}
              className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
            >
              <td className="px-4 py-3 text-xs text-gray-400 font-mono">{field.position}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {field.isPrimaryKey && (
                    <Key size={11} className="text-yellow-500 shrink-0" />
                  )}
                  <span className="text-sm font-medium text-gray-900">{field.name}</span>
                  {field.isPii && (
                    <Badge variant="restricted" className="text-[10px]">PII</Badge>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                  {field.type}
                </code>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs ${field.nullable ? 'text-gray-400' : 'text-gray-700 font-medium'}`}>
                  {field.nullable ? 'Yes' : 'No'}
                </span>
              </td>
              <td className="px-4 py-3 max-w-[240px]">
                <p className="text-xs text-gray-600 truncate">{field.description || '—'}</p>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {field.tags?.map((tag) => (
                    <Badge key={tag} variant="gray">{tag}</Badge>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineageTab({ urn }: { urn: string }) {
  const [depth, setDepth] = useState(3);
  const [direction, setDirection] = useState('both');
  const { data: lineage, isLoading } = useLineageGraph(urn, depth, direction);

  const nodes: Node[] = (lineage?.nodes || []).map((n, i) => ({
    id: n.urn,
    data: { label: n.name, type: n.entityType, platform: n.platform },
    position: { x: (i % 4) * 220, y: Math.floor(i / 4) * 120 },
    style: {
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
      fontWeight: n.urn === urn ? 600 : 400,
      borderColor: n.urn === urn ? '#2563eb' : '#e5e7eb',
    },
  }));

  const edges: Edge[] = (lineage?.edges || []).map((e, i) => ({
    id: `e-${i}`,
    source: e.fromUrn,
    target: e.toUrn,
    style: { stroke: '#9ca3af', strokeWidth: 1 },
    animated: false,
  }));

  const [rfNodes, , onNodesChange] = useNodesState(nodes);
  const [rfEdges, , onEdgesChange] = useEdgesState(edges);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-md p-0.5">
          {(['upstream', 'both', 'downstream'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                direction === d
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Depth:</span>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-md p-0.5">
            {[1, 2, 3, 4, 5].map((d) => (
              <button
                key={d}
                onClick={() => setDepth(d)}
                className={`w-7 h-7 text-xs rounded transition-colors ${
                  depth === d
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Graph */}
      <div className="h-[450px] border border-gray-200 rounded-lg overflow-hidden">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
        >
          <Background color="#f3f4f6" gap={16} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

function QualityTab({ urn }: { urn: string }) {
  const { data: score, isLoading, refetch } = useQuery<QualityScore>({
    queryKey: ['quality-score', urn],
    queryFn: async () => {
      const res = await api.quality.scores.latest(urn);
      return res.data;
    },
  });

  const triggerMutation = useMutation({
    mutationFn: () => api.quality.scores.triggerRun(urn),
    onSuccess: () => refetch(),
  });

  if (isLoading) return <LoadingSpinner />;

  const dimensions = score?.dimensionScores
    ? Object.entries(score.dimensionScores).map(([name, value]) => ({ name, value }))
    : [];

  const overallScore = score?.overallScore ?? 0;
  const scoreColor =
    overallScore >= 80 ? '#16a34a' : overallScore >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Quality Score</h3>
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshCw size={12} />}
          loading={triggerMutation.isPending}
          onClick={() => triggerMutation.mutate()}
        >
          Run Quality Check
        </Button>
      </div>

      {!score ? (
        <EmptyState
          icon={<AlertCircle size={36} />}
          title="No quality data"
          description="Run a quality check to see results."
        />
      ) : (
        <>
          {/* Overall score gauge */}
          <div className="flex items-center gap-8">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle
                  cx="18" cy="18" r="15.9"
                  fill="none" stroke="#e5e7eb" strokeWidth="3"
                />
                <circle
                  cx="18" cy="18" r="15.9"
                  fill="none"
                  stroke={scoreColor}
                  strokeWidth="3"
                  strokeDasharray={`${overallScore} ${100 - overallScore}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold" style={{ color: scoreColor }}>
                  {overallScore.toFixed(0)}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">
                Overall Quality Score
              </p>
              <p className="text-xs text-gray-500">
                Last run: {format(new Date(score.runAt), 'MMM d, yyyy h:mm a')}
              </p>
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: scoreColor }}
                />
                <span className="text-xs text-gray-600">
                  {overallScore >= 80 ? 'Excellent' : overallScore >= 60 ? 'Good' : 'Needs Attention'}
                </span>
              </div>
            </div>
          </div>

          {/* Dimension bars */}
          {dimensions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Dimensions
              </h4>
              <div className="space-y-3">
                {dimensions.map(({ name, value }) => (
                  <div key={name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700 capitalize">{name}</span>
                      <span
                        className={`text-xs font-semibold ${
                          value >= 80 ? 'text-green-600' : value >= 60 ? 'text-yellow-600' : 'text-red-600'
                        }`}
                      >
                        {value.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          width: `${value}%`,
                          backgroundColor:
                            value >= 80 ? '#16a34a' : value >= 60 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rule results table */}
          {score.ruleResults?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Rule Results
              </h4>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      {['Rule', 'Dimension', 'Status', 'Observed', 'Threshold'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {score.ruleResults.map((r) => (
                      <tr key={r.ruleId} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-xs font-medium text-gray-900">{r.ruleName}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-gray-600 capitalize">{r.dimension}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={r.status === 'pass' ? 'green' : r.status === 'fail' ? 'red' : 'gray'}>
                            {r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-700 tabular-nums">
                          {r.observedValue?.toFixed(2) ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-700 tabular-nums">
                          {r.threshold?.toFixed(2) ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AssetDetailPage() {
  const params = useParams();
  const urn = decodeURIComponent(params.urn as string);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const { data: asset, isLoading } = useAsset(urn);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (!asset) {
    return (
      <EmptyState
        icon={<AlertCircle size={40} />}
        title="Asset not found"
        description="This asset may have been deleted or you don't have access."
        action={
          <Link href="/catalog">
            <Button variant="secondary" size="sm" icon={<ArrowLeft size={13} />}>
              Back to Catalog
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link
        href="/catalog"
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft size={13} />
        Catalog
      </Link>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={getEntityTypeVariant(asset.entityType)}>
                {asset.entityType.replace('_', ' ')}
              </Badge>
              <Badge variant={getCertificationVariant(asset.certificationStatus)}>
                {asset.certificationStatus}
              </Badge>
              {asset.sensitivity && (
                <Badge variant={getSensitivityVariant(asset.sensitivity)}>
                  {asset.sensitivity}
                </Badge>
              )}
              <span className="text-xs text-gray-400 capitalize">{asset.platform}</span>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">{asset.name}</h1>
            <code className="mt-1 text-[11px] text-gray-400 font-mono">{asset.urn}</code>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" size="sm" icon={<TagIcon size={12} />}>
              Add Tag
            </Button>
            <Button variant="secondary" size="sm" icon={<Shield size={12} />}>
              Edit Description
            </Button>
            <Button variant="primary" size="sm" icon={<Key size={12} />}>
              Request Access
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs.Root
        value={activeTab}
        onValueChange={(v: string) => setActiveTab(v as TabId)}
      >
        <Tabs.List className="flex border-b border-gray-200 bg-white rounded-t-lg overflow-hidden -mb-px">
          {TABS.map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className="px-5 py-3 text-sm font-medium border-b-2 transition-colors data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=inactive]:border-transparent data-[state=inactive]:text-gray-500 hover:text-gray-700 -mb-px"
            >
              <TabLabel id={tab} />
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* Overview */}
        <Tabs.Content value="overview">
          <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg p-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left */}
              <div className="lg:col-span-2 space-y-5">
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Description
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {asset.description || (
                      <span className="text-gray-400 italic">No description available.</span>
                    )}
                  </p>
                </div>
                {asset.tags && asset.tags.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Tags
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {asset.tags.map((tag) => (
                        <Badge key={tag.id} variant="gray">{tag.name}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {asset.customMetadata && Object.keys(asset.customMetadata).length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Custom Properties
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(asset.customMetadata).map(([k, v]) => (
                        <div key={k} className="flex flex-col">
                          <span className="text-xs text-gray-500">{k}</span>
                          <span className="text-sm text-gray-900">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right sidebar */}
              <div className="space-y-4">
                {/* Ownership */}
                <Card className="p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Ownership
                  </h3>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 uppercase shrink-0">
                      {asset.ownerName ? asset.ownerName.charAt(0) : 'U'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {asset.ownerName || 'Unassigned'}
                      </p>
                      {asset.ownerEmail && (
                        <p className="text-xs text-gray-500">{asset.ownerEmail}</p>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Domain */}
                {asset.domainName && (
                  <Card className="p-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Domain
                    </h3>
                    <Badge variant="blue">{asset.domainName}</Badge>
                  </Card>
                )}

                {/* Key stats */}
                <Card className="p-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Statistics
                  </h3>
                  <div className="space-y-2.5">
                    {[
                      { label: 'Row Count', value: asset.rowCount?.toLocaleString() ?? '—' },
                      { label: 'Column Count', value: asset.columnCount?.toString() ?? (asset.schemaFields?.length.toString() || '—') },
                      { label: 'Platform', value: asset.platform },
                      {
                        label: 'Last Ingested',
                        value: asset.lastIngestedAt
                          ? formatDistanceToNow(new Date(asset.lastIngestedAt), { addSuffix: true })
                          : '—',
                      },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{label}</span>
                        <span className="text-xs font-medium text-gray-900">{value}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </Tabs.Content>

        {/* Schema */}
        <Tabs.Content value="schema">
          <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg overflow-hidden">
            <SchemaTab fields={asset.schemaFields || []} />
          </div>
        </Tabs.Content>

        {/* Lineage */}
        <Tabs.Content value="lineage">
          <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg p-5">
            <LineageTab urn={urn} />
          </div>
        </Tabs.Content>

        {/* Quality */}
        <Tabs.Content value="quality">
          <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg p-5">
            <QualityTab urn={urn} />
          </div>
        </Tabs.Content>

        {/* Governance */}
        <Tabs.Content value="governance">
          <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg p-5">
            <EmptyState
              icon={<Shield size={36} />}
              title="No governance data"
              description="No active policies or workflow instances found for this asset."
              action={
                <Button variant="primary" size="sm" icon={<Key size={12} />}>
                  Request Access
                </Button>
              }
            />
          </div>
        </Tabs.Content>

        {/* History */}
        <Tabs.Content value="history">
          <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg p-5">
            {asset.aspects && asset.aspects.length > 0 ? (
              <div className="space-y-3">
                {asset.aspects.map((aspect, i) => (
                  <div key={i} className="flex gap-3 pb-3 border-b border-gray-100 last:border-0">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0 uppercase">
                      {aspect.updatedBy.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900">
                        {aspect.updatedBy} updated{' '}
                        <span className="font-mono text-blue-600">{aspect.aspectType}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDistanceToNow(new Date(aspect.updatedAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Globe size={36} />}
                title="No history"
                description="No aspect changes have been recorded for this asset."
              />
            )}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
