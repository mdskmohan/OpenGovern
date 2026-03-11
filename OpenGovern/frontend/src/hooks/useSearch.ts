import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import type { SearchResult } from '@/types';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export function useSearch(query: string) {
  const debouncedQuery = useDebounce(query, 300);

  return useQuery<SearchResult[]>({
    queryKey: ['search', debouncedQuery],
    queryFn: async () => {
      const res = await api.search.query({ q: debouncedQuery });
      return res.data?.hits || [];
    },
    enabled: debouncedQuery.length > 2,
    staleTime: 30 * 1000,
  });
}

export function useAISearch(query: string) {
  const debouncedQuery = useDebounce(query, 300);

  return useQuery<SearchResult[]>({
    queryKey: ['ai-search', debouncedQuery],
    queryFn: async () => {
      const res = await api.ai.search(debouncedQuery, 10);
      return res.data?.results || [];
    },
    enabled: debouncedQuery.length > 2,
    staleTime: 30 * 1000,
  });
}
