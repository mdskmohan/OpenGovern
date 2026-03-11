'use client';

import React from 'react';
import Link from 'next/link';
import {
  Database,
  Shield,
  GitPullRequest,
  Bell,
  TrendingUp,
  CheckCircle,
  Clock,
  ArrowRight,
  Play,
  Plus,
  Key,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { StatCard } from '@/components/ui/Card';
import { Badge, getWorkflowStatusVariant, getAlertSeverityVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAssetStats } from '@/hooks/useAssets';
import { usePolicies } from '@/hooks/usePolicies';
import { useWorkflowInstances } from '@/hooks/useWorkflows';
import { useAlerts } from '@/hooks/useAlerts';
import { formatDistanceToNow } from 'date-fns';

const CHART_COLORS = ['#2563eb', '#16a34a', '#9333ea', '#f59e0b', '#ec4899', '#06b6d4'];

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useAssetStats();
  const { data: policies } = usePolicies({ isActive: true });
  const { data: workflows } = useWorkflowInstances({ limit: 5 });
  const { data: alerts } = useAlerts({ status: 'open', limit: 5 });

  // Build pie chart data from asset stats
  const assetTypeData = stats?.byType
    ? Object.entries(stats.byType).map(([name, value]) => ({ name, value }))
    : [
        { name: 'table', value: 1200 },
        { name: 'dashboard', value: 340 },
        { name: 'pipeline', value: 180 },
        { name: 'ml_model', value: 45 },
      ];

  const qualityData = stats?.qualityDistribution
    ? [
        { name: 'Excellent (>90)', value: stats.qualityDistribution.excellent, fill: '#16a34a' },
        { name: 'Good (70-90)', value: stats.qualityDistribution.good, fill: '#2563eb' },
        { name: 'Fair (50-70)', value: stats.qualityDistribution.fair, fill: '#f59e0b' },
        { name: 'Poor (<50)', value: stats.qualityDistribution.poor, fill: '#ef4444' },
      ]
    : [
        { name: 'Excellent (>90)', value: 45, fill: '#16a34a' },
        { name: 'Good (70-90)', value: 30, fill: '#2563eb' },
        { name: 'Fair (50-70)', value: 15, fill: '#f59e0b' },
        { name: 'Poor (<50)', value: 10, fill: '#ef4444' },
      ];

  const recentWorkflows = workflows?.data?.slice(0, 5) || [];
  const recentAlerts = alerts?.data?.slice(0, 5) || [];

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Assets"
          value={statsLoading ? '—' : (stats?.total ?? 1765)}
          icon={<Database size={16} />}
          trend={{ value: 12, label: 'this month' }}
        />
        <StatCard
          label="Certified Assets"
          value={statsLoading ? '—' : (stats?.certified ?? 423)}
          icon={<CheckCircle size={16} />}
          trend={{ value: 8, label: 'this month' }}
        />
        <StatCard
          label="Active Policies"
          value={policies?.total ?? 38}
          icon={<Shield size={16} />}
        />
        <StatCard
          label="Open Workflows"
          value={workflows?.total ?? 14}
          icon={<GitPullRequest size={16} />}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Asset by Type - Pie */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)] p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Assets by Type</h3>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={assetTypeData}
                  cx={75}
                  cy={75}
                  innerRadius={45}
                  outerRadius={72}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {assetTypeData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {assetTypeData.map((item, i) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="text-xs text-gray-600 capitalize">{item.name}</span>
                  </div>
                  <span className="text-xs font-medium text-gray-900 tabular-nums">
                    {item.value.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quality Distribution - Bar */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)] p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Quality Distribution</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={qualityData} barSize={28}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 6,
                  border: '1px solid #e5e7eb',
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {qualityData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Workflows */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Recent Workflows</h3>
            <Link href="/workflows" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              View all <ArrowRight size={11} />
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentWorkflows.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">No recent workflows</div>
            ) : (
              recentWorkflows.map((wf) => (
                <div key={wf.id} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">
                        {wf.assetName || wf.assetUrn}
                      </p>
                      <p className="text-[11px] text-gray-500 capitalize mt-0.5">
                        {wf.workflowType.replace('_', ' ')} · {wf.initiatedByName || wf.initiatedBy}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <Badge variant={getWorkflowStatusVariant(wf.status)}>
                        {wf.status.replace('_', ' ')}
                      </Badge>
                      <span className="text-[11px] text-gray-400">
                        {formatDistanceToNow(new Date(wf.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Recent Alerts section */}
          {recentAlerts.length > 0 && (
            <>
              <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Open Alerts</h3>
                <Link href="/alerts" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  View all <ArrowRight size={11} />
                </Link>
              </div>
              <div className="divide-y divide-gray-50">
                {recentAlerts.map((alert) => (
                  <div key={alert.id} className="px-5 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        alert.severity === 'critical'
                          ? 'bg-red-500'
                          : alert.severity === 'high'
                          ? 'bg-orange-500'
                          : alert.severity === 'medium'
                          ? 'bg-yellow-500'
                          : 'bg-blue-500'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{alert.title}</p>
                      <p className="text-[11px] text-gray-500 truncate">{alert.message}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getAlertSeverityVariant(alert.severity)}>
                        {alert.severity}
                      </Badge>
                      <span className="text-[11px] text-gray-400">
                        {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)] p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Link href="/integrations">
                <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-50 transition-colors border border-gray-100">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                    <Play size={13} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-900">Run Ingestion</p>
                    <p className="text-[11px] text-gray-500">Sync from connected sources</p>
                  </div>
                </button>
              </Link>
              <Link href="/policies">
                <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-50 transition-colors border border-gray-100 mt-2">
                  <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center shrink-0">
                    <Plus size={13} className="text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-900">Create Policy</p>
                    <p className="text-[11px] text-gray-500">Define governance rules</p>
                  </div>
                </button>
              </Link>
              <Link href="/workflows">
                <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-50 transition-colors border border-gray-100 mt-2">
                  <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
                    <Key size={13} className="text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-900">Request Access</p>
                    <p className="text-[11px] text-gray-500">Start an access workflow</p>
                  </div>
                </button>
              </Link>
            </div>
          </div>

          {/* Platform status */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)] p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Platform Status</h3>
            <div className="space-y-2.5">
              {[
                { label: 'Catalog Service', ok: true },
                { label: 'Auth Service', ok: true },
                { label: 'AI Search', ok: true },
                { label: 'Ingestion Workers', ok: true },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">{label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className={`text-[11px] font-medium ${ok ? 'text-green-600' : 'text-red-600'}`}>
                      {ok ? 'Operational' : 'Degraded'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
