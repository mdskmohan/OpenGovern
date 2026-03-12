import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Alert, PaginatedResponse } from '@/types';

export function useAlerts(filters?: Record<string, unknown>) {
  return useQuery<PaginatedResponse<Alert>>({
    queryKey: ['alerts', filters],
    queryFn: async () => {
      const res = await api.alerts.list(filters);
      return res.data?.data ?? res.data;
    },
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.alerts.acknowledge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useResolveAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      api.alerts.resolve(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}
