import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { AssetListParams, AssetSummary, FullAsset, AssetStats, LineageGraph, PaginatedResponse } from '@/types';

export function useAssets(filters?: AssetListParams) {
  return useQuery<PaginatedResponse<AssetSummary>>({
    queryKey: ['assets', filters],
    queryFn: async () => {
      const res = await api.assets.list(filters);
      return res.data;
    },
  });
}

export function useAsset(urn: string | null) {
  return useQuery<FullAsset>({
    queryKey: ['asset', urn],
    queryFn: async () => {
      const res = await api.assets.get(urn!);
      return res.data;
    },
    enabled: !!urn,
  });
}

export function useAssetStats() {
  return useQuery<AssetStats>({
    queryKey: ['asset-stats'],
    queryFn: async () => {
      const res = await api.assets.stats();
      return res.data;
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
      return res.data;
    },
    enabled: !!urn,
  });
}

export function useImpactAnalysis(urn: string | null) {
  return useQuery({
    queryKey: ['impact', urn],
    queryFn: async () => {
      const res = await api.lineage.getImpact(urn!);
      return res.data;
    },
    enabled: !!urn,
  });
}
