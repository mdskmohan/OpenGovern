import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Policy, PolicyListParams, PaginatedResponse } from '@/types';

export function usePolicies(params?: PolicyListParams) {
  return useQuery<PaginatedResponse<Policy>>({
    queryKey: ['policies', params],
    queryFn: async () => {
      const res = await api.policies.list(params);
      return res.data;
    },
  });
}

export function usePolicy(id: string | null) {
  return useQuery<Policy>({
    queryKey: ['policy', id],
    queryFn: async () => {
      const res = await api.policies.get(id!);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useActivatePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.policies.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
  });
}

export function useDeactivatePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.policies.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
  });
}

export function useCreatePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => api.policies.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
  });
}
