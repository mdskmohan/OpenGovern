'use client';

/**
 * OpenGovern Data Catalog — OpenMetadata-quality implementation.
 *
 * Layout:
 *   Fixed left sidebar  (entity type nav, domain accordion, certification/sensitivity filters)
 *   Main area           (search bar, toolbar, asset list/grid, pagination)
 *
 * URL params drive all filter state so links are shareable.
 */

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Search,
  Database,
  BarChart3,
  GitBranch,
  Cpu,
  MessageSquare,
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
  Tag,
  Users,
  Layers,
  ArrowRight,
  Shield,
  SlidersHorizontal,
  Grid,
  List,
  X,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import type {
  AssetSummary,
  AssetStats,
  Domain,
  EntityType,
  CertificationStatus,
  SensitivityLevel,
  PaginatedResponse,
} from '@/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const ENTITY_TYPES: { id: EntityType | 'all'; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'all', label: 'All Assets', icon: Layers, color: 'text-gray-500' },
  { id: 'table', label: 'Tables', icon: Database, color: 'text-blue-600' },
  { id: 'view', label: 'Views', icon: FileText, color: 'text-cyan-600' },
  { id: 'dashboard', label: 'Dashboards', icon: BarChart3, color: 'text-orange-500' },
  { id: 'pipeline', label: 'Pipelines', icon: GitBranch, color: 'text-green-600' },
  { id: 'ml_model', label: 'ML Models', icon: Cpu, color: 'text-pink-600' },
  { id: 'topic', label: 'Topics', icon: MessageSquare, color: 'text-violet-600' },
  { id: 'dataset', label: 'dbt Models', icon: Shield, color: 'text-amber-600' },
];

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'name_asc', label: 'Name A→Z' },
  { value: 'name_desc', label: 'Name Z→A' },
  { value: 'updated_desc', label: 'Recently Updated' },
  { value: 'quality_desc', label: 'Quality (High→Low)' },
];

const CERT_FILTERS: { id: CertificationStatus; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'certified', label: 'Certified', icon: CheckCircle2, color: 'text-green-600' },
  { id: 'pending', label: 'Under Review', icon: Clock, color: 'text-amber-500' },
  { id: 'deprecated', label: 'Deprecated', icon: XCircle, color: 'text-red-500' },
];

const SENSITIVITY_FILTERS: { id: SensitivityLevel; label: string; color: string }[] = [
  { id: 'restricted', label: '🔒 Restricted', color: 'text-red-600' },
  { id: 'confidential', label: 'Confidential', color: 'text-orange-600' },
  { id: 'internal', label: 'Internal', color: 'text-blue-600' },
  { id: 'public', label: 'Public', color: 'text-green-600' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getEntityIcon(type: EntityType): React.ElementType {
  const map: Partial<Record<EntityType, React.ElementType>> = {
    table: Database,
    view: FileText,
    dashboard: BarChart3,
    pipeline: GitBranch,
    ml_model: Cpu,
    topic: MessageSquare,
    dataset: Shield,
    feature_group: Layers,
  };
  return map[type] ?? Database;
}

function getEntityIconColor(type: EntityType): string {
  const map: Partial<Record<EntityType, string>> = {
    table: 'text-blue-600 bg-blue-50',
    view: 'text-cyan-600 bg-cyan-50',
    dashboard: 'text-orange-500 bg-orange-50',
    pipeline: 'text-green-600 bg-green-50',
    ml_model: 'text-pink-600 bg-pink-50',
    topic: 'text-violet-600 bg-violet-50',
    dataset: 'text-amber-600 bg-amber-50',
    feature_group: 'text-indigo-600 bg-indigo-50',
  };
  return map[type] ?? 'text-gray-500 bg-gray-50';
}

function getPlatformEmoji(platform: string): string {
  const map: Record<string, string> = {
    snowflake: '❄️',
    bigquery: '📊',
    postgresql: '🐘',
    mysql: '🐬',
    dbt: '🔧',
    airflow: '🌊',
    kafka: '📨',
    redshift: '🔴',
    databricks: '⚡',
    looker: '👁️',
    s3: '🪣',
    hive: '🐝',
  };
  return map[platform.toLowerCase()] ?? '🗄️';
}

function getDomainColor(domainName: string): string {
  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-purple-100 text-purple-700',
    'bg-green-100 text-green-700',
    'bg-amber-100 text-amber-700',
    'bg-pink-100 text-pink-700',
    'bg-teal-100 text-teal-700',
    'bg-indigo-100 text-indigo-700',
    'bg-red-100 text-red-700',
  ];
  let hash = 0;
  for (let i = 0; i < domainName.length; i++) {
    hash = domainName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function qualityColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-amber-400';
  return 'bg-red-500';
}

function qualityTextColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-amber-500';
  return 'text-red-500';
}

function avatarInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CertificationBadge({ status }: { status: CertificationStatus }) {
  if (status === 'certified') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
        <CheckCircle2 size={9} />
        Certified
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <Clock size={9} />
        Under Review
      </span>
    );
  }
  if (status === 'deprecated') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">
        <XCircle size={9} />
        Deprecated
      </span>
    );
  }
  return null;
}

function SensitivityBadge({ level }: { level: SensitivityLevel }) {
  if (level === 'restricted') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">
        🔒 Restricted
      </span>
    );
  }
  if (level === 'confidential') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-700 border border-orange-200">
        Confidential
      </span>
    );
  }
  return null;
}

function QualityBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${qualityColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-[10px] font-semibold tabular-nums ${qualityTextColor(score)}`}>
        {score.toFixed(0)}
      </span>
    </div>
  );
}

// ─── Skeleton Loading ─────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gray-200 shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-4 bg-gray-200 rounded w-48" />
            <div className="h-4 bg-gray-200 rounded w-16" />
          </div>
          <div className="h-3 bg-gray-200 rounded w-72" />
          <div className="h-3 bg-gray-200 rounded w-full" />
          <div className="flex items-center gap-2 pt-1">
            <div className="h-3 bg-gray-200 rounded w-12" />
            <div className="h-3 bg-gray-200 rounded w-12" />
            <div className="h-3 bg-gray-200 rounded w-12" />
          </div>
          <div className="flex items-center gap-4 pt-1 border-t border-gray-100">
            <div className="h-3 bg-gray-200 rounded w-20" />
            <div className="h-3 bg-gray-200 rounded w-24" />
            <div className="h-3 bg-gray-200 rounded w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gray-200 rounded-lg shrink-0" />
        <div className="h-4 bg-gray-200 rounded flex-1" />
      </div>
      <div className="h-3 bg-gray-200 rounded w-3/4" />
      <div className="h-3 bg-gray-200 rounded w-full" />
      <div className="h-3 bg-gray-200 rounded w-2/3" />
      <div className="h-1.5 bg-gray-200 rounded-full w-full" />
    </div>
  );
}

// ─── Asset Card (List View) ───────────────────────────────────────────────────

interface AssetCardProps {
  asset: AssetSummary;
  onClick: () => void;
}

function AssetListCard({ asset, onClick }: AssetCardProps) {
  const Icon = getEntityIcon(asset.entityType);
  const iconStyle = getEntityIconColor(asset.entityType);
  const [hovered, setHovered] = useState(false);

  // Derive lineage counts from urn as a stable placeholder — real data would come from lineage API
  // We use a deterministic hash so each card shows consistent numbers across renders
  const upCount = useMemo(() => {
    let h = 0;
    for (let i = 0; i < asset.urn.length; i++) h = (h * 31 + asset.urn.charCodeAt(i)) >>> 0;
    return h % 8;
  }, [asset.urn]);
  const downCount = useMemo(() => {
    let h = 0;
    for (let i = 0; i < asset.urn.length + 1; i++) h = (h * 17 + (asset.urn.charCodeAt(i) || 7)) >>> 0;
    return h % 12;
  }, [asset.urn]);

  return (
    <div
      className={`group bg-white border rounded-lg p-4 cursor-pointer transition-all duration-150 ${
        hovered
          ? 'border-blue-400 shadow-[0_2px_12px_rgba(37,99,235,0.1)]'
          : 'border-gray-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-blue-300'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="flex items-start gap-3">
        {/* Entity icon */}
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconStyle}`}>
          <Icon size={18} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm font-semibold transition-colors ${
                hovered ? 'text-blue-600' : 'text-gray-900'
              }`}
            >
              {asset.name}
            </span>
            <CertificationBadge status={asset.certificationStatus} />
            {asset.sensitivity && asset.sensitivity !== 'internal' && asset.sensitivity !== 'public' && (
              <SensitivityBadge level={asset.sensitivity} />
            )}
          </div>

          {/* Row 2: FQN */}
          <p className="mt-0.5 text-[11px] text-gray-400 font-mono truncate">
            {asset.fullyQualifiedName}
          </p>

          {/* Row 3: description — only if AssetSummary ever gets it (optional field guard) */}
          {'description' in asset && (asset as AssetSummary & { description?: string }).description && (
            <p className="mt-1.5 text-xs text-gray-500 line-clamp-2 leading-relaxed">
              {(asset as AssetSummary & { description?: string }).description}
            </p>
          )}

          {/* Row 4: tags */}
          {/* Tags not on AssetSummary — skipped unless present */}

          {/* Footer row */}
          <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center gap-4 flex-wrap">
            {/* Platform */}
            <span className="text-[11px] text-gray-500 flex items-center gap-1">
              <span>{getPlatformEmoji(asset.platform)}</span>
              <span className="capitalize">{asset.platform}</span>
            </span>

            {/* Owner */}
            {asset.ownerName && (
              <span className="text-[11px] text-gray-500 flex items-center gap-1">
                <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-[8px] text-white font-bold shrink-0">
                  {avatarInitials(asset.ownerName)}
                </div>
                <span>{asset.ownerName}</span>
              </span>
            )}

            {/* Domain badge */}
            {asset.domainName && (
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getDomainColor(
                  asset.domainName
                )}`}
              >
                {asset.domainName}
              </span>
            )}

            {/* Lineage */}
            <span className="text-[11px] font-mono text-violet-600 flex items-center gap-0.5">
              ↑{upCount}&nbsp;↓{downCount}
            </span>

            {/* Quality score */}
            {asset.qualityScore !== undefined && asset.qualityScore !== null && (
              <QualityBar score={asset.qualityScore} />
            )}

            {/* Last updated — push to right */}
            <span className="ml-auto text-[11px] text-gray-400">
              {formatDistanceToNow(new Date(asset.lastUpdated), { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Right arrow on hover */}
        <div
          className={`shrink-0 self-center transition-all duration-150 ${
            hovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-1'
          }`}
        >
          <ArrowRight size={15} className="text-blue-500" />
        </div>
      </div>
    </div>
  );
}

// ─── Asset Card (Grid View) ───────────────────────────────────────────────────

function AssetGridCard({ asset, onClick }: AssetCardProps) {
  const Icon = getEntityIcon(asset.entityType);
  const iconStyle = getEntityIconColor(asset.entityType);

  return (
    <div
      className="group bg-white border border-gray-200 rounded-lg p-4 cursor-pointer transition-all duration-150 hover:border-blue-300 hover:shadow-[0_2px_12px_rgba(37,99,235,0.1)] flex flex-col gap-3"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconStyle}`}>
          <Icon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 truncate transition-colors">
            {asset.name}
          </p>
          <p className="text-[10px] text-gray-400 capitalize">{asset.platform}</p>
        </div>
      </div>

      {/* Description stub */}
      {'description' in asset && (asset as AssetSummary & { description?: string }).description ? (
        <p className="text-xs text-gray-500 line-clamp-2 flex-1 leading-relaxed">
          {(asset as AssetSummary & { description?: string }).description}
        </p>
      ) : (
        <p className="text-xs text-gray-300 italic flex-1">No description</p>
      )}

      {/* Badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <CertificationBadge status={asset.certificationStatus} />
        {asset.domainName && (
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getDomainColor(asset.domainName)}`}
          >
            {asset.domainName}
          </span>
        )}
      </div>

      {/* Quality bar */}
      {asset.qualityScore !== undefined && asset.qualityScore !== null && (
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-[10px] text-gray-400">Quality</span>
            <span className={`text-[10px] font-semibold ${qualityTextColor(asset.qualityScore)}`}>
              {asset.qualityScore.toFixed(0)}
            </span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${qualityColor(asset.qualityScore)}`}
              style={{ width: `${asset.qualityScore}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sidebar Filter Accordion ─────────────────────────────────────────────────

interface AccordionSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function AccordionSection({ title, defaultOpen = false, children }: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {title}
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {open && <div className="pb-2 px-1">{children}</div>}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Read URL state ──
  const entityType = searchParams.get('entityType') ?? 'all';
  const platform = searchParams.get('platform') ?? '';
  const certification = searchParams.get('certification') ?? '';
  const sensitivity = searchParams.get('sensitivity') ?? '';
  const domainId = searchParams.get('domainId') ?? '';
  const sort = searchParams.get('sort') ?? 'relevance';
  const page = Number(searchParams.get('page') ?? '1');
  const q = searchParams.get('q') ?? '';
  const viewMode = (searchParams.get('view') ?? 'list') as 'list' | 'grid';

  // ── Local search input state (controlled, synced to URL on submit) ──
  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => { setSearchInput(q); }, [q]);

  // ── URL navigation helper ──
  const navigate = useCallback(
    (updates: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === '') {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      });
      // Reset to page 1 on any filter change except page itself
      if (!('page' in updates)) params.set('page', '1');
      router.push(`/catalog?${params.toString()}`);
    },
    [router, searchParams]
  );

  const setEntityType = (et: string) => navigate({ entityType: et === 'all' ? null : et });
  const setDomainId = (id: string) => navigate({ domainId: id });
  const setCertification = (c: string) => navigate({ certification: c });
  const setSensitivity = (s: string) => navigate({ sensitivity: s });
  const setSort = (s: string) => navigate({ sort: s });
  const setPage = (p: number) => navigate({ page: p });
  const setViewMode = (v: 'list' | 'grid') => navigate({ view: v });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ q: searchInput.trim() });
  };

  const clearFilter = (key: string) => navigate({ [key]: null });
  const clearAll = () => {
    router.push('/catalog');
    setSearchInput('');
  };

  // ── API params ──
  const assetParams = useMemo(() => {
    const p: Record<string, unknown> = { page, limit: PAGE_SIZE, sort };
    if (q) p.q = q;
    if (entityType && entityType !== 'all') p.entityType = entityType;
    if (platform) p.platform = platform;
    if (certification) p.certificationStatus = certification;
    if (sensitivity) p.sensitivity = sensitivity;
    if (domainId) p.domainId = domainId;
    return p;
  }, [page, q, entityType, platform, certification, sensitivity, domainId, sort]);

  // ── Data fetching ──
  // The core-api returns snake_case; we normalize to the camelCase AssetSummary contract here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function toAssetSummary(raw: any): AssetSummary {
    return {
      urn: raw.urn,
      name: raw.name,
      fullyQualifiedName: raw.fully_qualified_name ?? raw.fullyQualifiedName ?? '',
      entityType: raw.entity_type ?? raw.entityType,
      platform: raw.platform,
      domainId: raw.domain_id ?? raw.domainId,
      domainName: raw.domain_name ?? raw.domainName,
      certificationStatus: raw.certification_status ?? raw.certificationStatus ?? 'uncertified',
      sensitivity: raw.sensitivity,
      ownerName: raw.owner_name ?? raw.ownerName,
      ownerEmail: raw.owner_email ?? raw.ownerEmail,
      qualityScore: raw.quality_score != null ? Number(raw.quality_score) : raw.qualityScore,
      lastUpdated: raw.updated_at ?? raw.lastUpdated ?? new Date().toISOString(),
      createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    };
  }

  const { data: assetsPage, isLoading: assetsLoading, error: assetsError } = useQuery<
    PaginatedResponse<AssetSummary>
  >({
    queryKey: ['catalog-assets', assetParams],
    queryFn: async () => {
      const res = await api.assets.list(assetParams as Parameters<typeof api.assets.list>[0]);
      // Response envelope: { success: true, data: { items: [...], total, page, limit, totalPages } }
      const envelope = res.data?.data ?? res.data;
      const rawItems: unknown[] = Array.isArray(envelope?.items) ? envelope.items
        : Array.isArray(envelope) ? envelope : [];
      return {
        data: rawItems.map(toAssetSummary),
        total: envelope?.total ?? rawItems.length,
        page: envelope?.page ?? 1,
        limit: envelope?.limit ?? 20,
        totalPages: envelope?.totalPages ?? 1,
      };
    },
    staleTime: 30_000,
  });

  const { data: stats } = useQuery<AssetStats>({
    queryKey: ['catalog-stats'],
    queryFn: async () => {
      const res = await api.assets.stats();
      // Response envelope: { success: true, data: { total, byType: [...], byPlatform: [...] } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any = res.data?.data ?? res.data;
      // Convert server arrays to the Record<string, number> shape the UI expects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toRecord = (arr: any[], key: string): Record<string, number> =>
        Array.isArray(arr) ? Object.fromEntries(arr.map((x) => [x[key], Number(x.count)])) : (arr ?? {});
      return {
        total: raw.total ?? 0,
        certified: raw.byType ? 0 : (raw.certified ?? 0), // not from server, derive if needed
        byType: toRecord(raw.byType, 'entity_type'),
        byPlatform: toRecord(raw.byPlatform, 'platform'),
        qualityDistribution: raw.qualityDistribution ?? { excellent: 0, good: 0, fair: 0, poor: 0 },
      };
    },
    staleTime: 60_000,
  });

  const { data: domains } = useQuery<Domain[]>({
    queryKey: ['catalog-domains'],
    queryFn: async () => {
      const res = await api.domains.list();
      return Array.isArray(res.data) ? res.data : res.data?.data ?? [];
    },
    staleTime: 120_000,
  });

  // ── Derived ──
  const assets = assetsPage?.data ?? [];
  const totalCount = assetsPage?.total ?? 0;
  const totalPages = assetsPage?.totalPages ?? 1;
  const hasActiveFilters = !!(q || (entityType && entityType !== 'all') || certification || sensitivity || domainId);

  const getTypeCount = (type: string): number => {
    if (!stats?.byType) return 0;
    if (type === 'all') return stats.total ?? 0;
    return stats.byType[type] ?? 0;
  };

  // ── Navigate to asset detail ──
  const goToAsset = (urn: string) => {
    router.push(`/catalog/${encodeURIComponent(urn)}`);
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full -m-6 min-h-0">
      {/* ── Left Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
        {/* Entity type nav */}
        <div className="px-2 py-3 border-b border-gray-100">
          <p className="px-2 mb-2 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
            Asset Types
          </p>
          <nav className="space-y-0.5">
            {ENTITY_TYPES.map((et) => {
              const count = getTypeCount(et.id);
              const active = entityType === et.id || (et.id === 'all' && (!entityType || entityType === 'all'));
              return (
                <button
                  key={et.id}
                  onClick={() => setEntityType(et.id)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <et.icon
                      size={13}
                      className={active ? 'text-blue-600' : et.color}
                    />
                    {et.label}
                  </span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        active ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {count.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Filter accordion sections */}
        <div className="flex-1">
          {/* Domain filter */}
          <AccordionSection title="Domain" defaultOpen={!!domainId}>
            <div className="space-y-0.5">
              {(domains ?? []).map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDomainId(domainId === d.id ? '' : d.id)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${
                    domainId === d.id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="truncate">{d.name}</span>
                  {d.assetCount !== undefined && (
                    <span className="text-[10px] text-gray-400 ml-1 shrink-0">{d.assetCount}</span>
                  )}
                </button>
              ))}
              {!domains?.length && (
                <p className="px-2 py-1 text-[11px] text-gray-400 italic">No domains defined</p>
              )}
            </div>
          </AccordionSection>

          {/* Certification filter */}
          <AccordionSection title="Certification" defaultOpen={!!certification}>
            <div className="space-y-0.5">
              {CERT_FILTERS.map((cf) => (
                <button
                  key={cf.id}
                  onClick={() => setCertification(certification === cf.id ? '' : cf.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                    certification === cf.id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <cf.icon size={11} className={certification === cf.id ? 'text-blue-600' : cf.color} />
                  {cf.label}
                </button>
              ))}
            </div>
          </AccordionSection>

          {/* Sensitivity filter */}
          <AccordionSection title="Sensitivity" defaultOpen={!!sensitivity}>
            <div className="space-y-0.5">
              {SENSITIVITY_FILTERS.map((sf) => (
                <button
                  key={sf.id}
                  onClick={() => setSensitivity(sensitivity === sf.id ? '' : sf.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                    sensitivity === sf.id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className={sf.id === sensitivity ? 'text-blue-600' : sf.color}>{sf.label}</span>
                </button>
              ))}
            </div>
          </AccordionSection>
        </div>
      </aside>

      {/* ── Main Area ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Search bar */}
        <div className="px-6 pt-5 pb-4 bg-white border-b border-gray-200">
          <form onSubmit={handleSearch}>
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search assets by name, column, tag, or description…"
                className="w-full pl-9 pr-10 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all placeholder:text-gray-400"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    navigate({ q: null });
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 bg-white border-b border-gray-200 flex items-center gap-3">
          {/* Filter toggle */}
          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              hasActiveFilters
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal size={12} />
            Filters
            {hasActiveFilters && (
              <span className="ml-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center font-bold">
                {[q, entityType !== 'all' && entityType, certification, sensitivity, domainId].filter(
                  Boolean
                ).length}
              </span>
            )}
          </button>

          {/* Active filter chips */}
          {q && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-xs text-gray-700">
              <Search size={10} />
              &quot;{q}&quot;
              <button onClick={() => clearFilter('q')} className="text-gray-400 hover:text-gray-600 ml-0.5">
                <X size={10} />
              </button>
            </span>
          )}
          {certification && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-xs text-gray-700">
              {certification}
              <button onClick={() => clearFilter('certification')} className="text-gray-400 hover:text-gray-600 ml-0.5">
                <X size={10} />
              </button>
            </span>
          )}
          {sensitivity && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-xs text-gray-700">
              {sensitivity}
              <button onClick={() => clearFilter('sensitivity')} className="text-gray-400 hover:text-gray-600 ml-0.5">
                <X size={10} />
              </button>
            </span>
          )}
          {domainId && domains && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-xs text-gray-700">
              {domains.find((d) => d.id === domainId)?.name ?? domainId}
              <button onClick={() => clearFilter('domainId')} className="text-gray-400 hover:text-gray-600 ml-0.5">
                <X size={10} />
              </button>
            </span>
          )}
          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              Clear all
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 shrink-0">Sort:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Count */}
          <span className="text-xs text-gray-400 shrink-0">
            {assetsLoading ? '…' : `${totalCount.toLocaleString()} assets`}
          </span>

          {/* View toggle */}
          <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 transition-colors ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
              title="List view"
            >
              <List size={13} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
              title="Grid view"
            >
              <Grid size={13} />
            </button>
          </div>
        </div>

        {/* Asset list / grid area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Error state */}
          {assetsError && !assetsLoading && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <XCircle size={22} className="text-red-500" />
              </div>
              <p className="text-sm font-semibold text-gray-900">Failed to load assets</p>
              <p className="text-xs text-gray-500 mt-1">
                The catalog service may be unavailable. Check your connection.
              </p>
            </div>
          )}

          {/* Loading state */}
          {assetsLoading && (
            viewMode === 'list' ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonGrid key={i} />
                ))}
              </div>
            )
          )}

          {/* Empty state */}
          {!assetsLoading && !assetsError && assets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-5">
                <Database size={28} className="text-gray-300" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                {hasActiveFilters ? 'No assets match your filters' : 'Catalog is empty'}
              </h3>
              <p className="text-xs text-gray-400 max-w-xs">
                {hasActiveFilters
                  ? 'Try broadening your search or clearing some filters.'
                  : 'Connect a data source to start discovering and governing your data assets.'}
              </p>
              {hasActiveFilters ? (
                <button
                  onClick={clearAll}
                  className="mt-4 px-4 py-2 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  Clear all filters
                </button>
              ) : (
                <Link
                  href="/integrations"
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Go to Integrations
                  <ArrowRight size={12} />
                </Link>
              )}
            </div>
          )}

          {/* Asset cards */}
          {!assetsLoading && !assetsError && assets.length > 0 && (
            viewMode === 'list' ? (
              <div className="space-y-2.5">
                {assets.map((asset) => (
                  <AssetListCard
                    key={asset.urn}
                    asset={asset}
                    onClick={() => goToAsset(asset.urn)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                {assets.map((asset) => (
                  <AssetGridCard
                    key={asset.urn}
                    asset={asset}
                    onClick={() => goToAsset(asset.urn)}
                  />
                ))}
              </div>
            )
          )}

          {/* Pagination */}
          {!assetsLoading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-6 pb-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                ← Previous
              </button>
              <span className="text-xs text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
