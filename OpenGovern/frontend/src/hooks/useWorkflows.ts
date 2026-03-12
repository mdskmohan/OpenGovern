import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { WorkflowInstance, PaginatedResponse } from '@/types';

export function useWorkflowInstances(filters?: Record<string, unknown>) {
  return useQuery<PaginatedResponse<WorkflowInstance>>({
    queryKey: ['workflows', filters],
    queryFn: async () => {
      const res = await api.workflows.listInstances(filters);
      return res.data?.data ?? res.data;
    },
  });
}

export function useWorkflowInstance(id: string | null) {
  return useQuery<WorkflowInstance>({
    queryKey: ['workflow', id],
    queryFn: async () => {
      const res = await api.workflows.getInstance(id!);
      return res.data?.data ?? res.data;
    },
    enabled: !!id,
  });
}

export function useApproveWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      api.workflows.approve(id, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

export function useRejectWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      api.workflows.reject(id, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });
}

export function useCommentWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.workflows.comment(id, content),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', id] });
    },
  });
}
