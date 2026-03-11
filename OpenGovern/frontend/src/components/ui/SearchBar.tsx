'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Sparkles } from 'lucide-react';
import { Badge, getEntityTypeVariant } from './Badge';
import { cn } from './cn';
import { api } from '@/lib/api-client';
import type { SearchResult } from '@/types';

export function SearchBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 3) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    try {
      const res = await api.ai.search(q, 8);
      setResults(res.data?.results || []);
    } catch {
      // Fallback to catalog search
      try {
        const res = await api.search.query({ q, size: 8 });
        setResults(res.data?.hits || []);
      } catch {
        setResults([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => search(val), 300);
  };

  const handleResultClick = (result: SearchResult) => {
    const encodedUrn = encodeURIComponent(result.urn);
    router.push(`/catalog/${encodedUrn}`);
    setOpen(false);
    setQuery('');
    setResults([]);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div
        className={cn(
          'flex items-center gap-2 px-3 h-9 bg-white border rounded-lg cursor-text transition-colors',
          open ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200 hover:border-gray-300'
        )}
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
      >
        <Search size={14} className="text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          placeholder="Search assets... (⌘K)"
          className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400"
        />
        {!query && (
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-gray-400 bg-gray-100 border border-gray-200 rounded font-mono">
            ⌘K
          </kbd>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {query.length < 3 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Type at least 3 characters to search
            </div>
          ) : isLoading ? (
            <div className="px-4 py-6 text-center">
              <div className="inline-flex items-center gap-2 text-sm text-gray-500">
                <span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                Searching...
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No results found for &quot;{query}&quot;
            </div>
          ) : (
            <ul>
              {results.map((result) => (
                <li key={result.urn}>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors"
                    onClick={() => handleResultClick(result)}
                  >
                    <Search size={13} className="text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {result.name}
                        </span>
                        <Badge variant={getEntityTypeVariant(result.entityType)}>
                          {result.entityType}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-xs text-gray-500">{result.platform}</span>
                        {result.domainName && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-xs text-gray-500">{result.domainName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Footer */}
          <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-1.5">
            <Sparkles size={11} className="text-blue-500" />
            <span className="text-[11px] text-gray-400">Search powered by AI</span>
          </div>
        </div>
      )}
    </div>
  );
}
