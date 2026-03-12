import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { AssetListParams, AssetSummary, FullAsset, AssetStats, LineageGraph, PaginatedResponse } from '@/types';

// All API responses are wrapped in { success: boolean, data: T }.
// These hooks unwrap the envelope so consumers get the typed payload directly.

export function useAssets(filters?: AssetListParams) {
  return useQuery<PaginatedResponse<AssetSummary>>({
    queryKey: ['assets', filters],
    queryFn: async () => {
      const res = await api.assets.list(filters);
      return res.data?.data ?? res.data;
    },
  });
}

export function useAsset(urn: string | null) {
  return useQuery<FullAsset>({
    queryKey: ['asset', urn],
    queryFn: async () => {
      const res = await api.assets.get(urn!);
      return res.data?.data ?? res.data;
    },
    enabled: !!urn,
  });
}

export function useAssetStats() {
  return useQuery<AssetStats>({
    queryKey: ['asset-stats'],
    queryFn: async () => {
      const res = await api.assets.stats();
      // Normalize server array format to the Record<string, number> shape the UI expects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any = res.data?.data ?? res.data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toRecord = (arr: any[], key: string): Record<string, number> =>
        Array.isArray(arr) ? Object.fromEntries(arr.map((x) => [x[key], Number(x.count)])) : (arr ?? {});
      return {
        total: raw.total ?? 0,
        certified: raw.certified ?? 0,
        byType: toRecord(raw.byType, 'entity_type'),
        byPlatform: toRecord(raw.byPlatform, 'platform'),
        qualityDistribution: raw.qualityDistribution ?? { excellent: 0, good: 0, fair: 0, poor: 0 },
      };
    },
  });
}

export function useLineageGraph(
  urn: string | null,
  depth = 3,
  direction = 'both'
) {
  return useQuery<LineageGraph>({
    queryKey: ['lineage', urn, depth, direction],
    queryFn: async () => {
      const res = await api.lineage.getGraph(urn!, depth, direction);
      return res.data?.data ?? res.data;
    },
    enabled: !!urn,
  });
}

export function useImpactAnalysis(urn: string | null) {
  return useQuery({
    queryKey: ['impact', urn],
    queryFn: async () => {
      const res = await api.lineage.getImpact(urn!);
      return res.data?.data ?? res.data;
    },
    enabled: !!urn,
  });
}
