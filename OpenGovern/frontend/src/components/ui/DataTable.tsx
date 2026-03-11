'use client';

import React, { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from './cn';
import { EmptyState } from './EmptyState';

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  cell: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  emptyState?: {
    icon: React.ReactNode;
    title: string;
    description?: string;
  };
  getRowKey?: (row: T) => string;
  onRowClick?: (row: T) => void;
  pagination?: {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
}

type SortDirection = 'asc' | 'desc' | null;

function SkeletonRow({ columns }: { columns: number }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className="h-4 bg-gray-100 rounded animate-pulse"
            style={{ width: `${60 + Math.random() * 30}%` }}
          />
        </td>
      ))}
    </tr>
  );
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  isLoading = false,
  emptyState,
  getRowKey,
  onRowClick,
  pagination,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc'));
      if (sortDir === 'desc') setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortKey !== colKey || sortDir === null) {
      return <ChevronsUpDown size={12} className="text-gray-400" />;
    }
    return sortDir === 'asc' ? (
      <ChevronUp size={12} className="text-blue-600" />
    ) : (
      <ChevronDown size={12} className="text-blue-600" />
    );
  };

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap',
                    col.sortable && 'cursor-pointer select-none hover:text-gray-700',
                    col.width
                  )}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && <SortIcon colKey={col.key} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} columns={columns.length} />
              ))
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  {emptyState ? (
                    <EmptyState {...emptyState} />
                  ) : (
                    <div className="py-12 text-center text-sm text-gray-500">
                      No data available
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              sortedData.map((row, idx) => (
                <tr
                  key={getRowKey ? getRowKey(row) : idx}
                  className={cn(
                    'border-b border-gray-100 transition-colors',
                    onRowClick
                      ? 'cursor-pointer hover:bg-gray-50'
                      : 'hover:bg-gray-50/50'
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-gray-700">
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (pagination.totalPages <= 7) {
                pageNum = i + 1;
              } else if (pagination.page <= 4) {
                pageNum = i + 1;
              } else if (pagination.page >= pagination.totalPages - 3) {
                pageNum = pagination.totalPages - 6 + i;
              } else {
                pageNum = pagination.page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => pagination.onPageChange(pageNum)}
                  className={cn(
                    'w-7 h-7 text-xs rounded transition-colors',
                    pagination.page === pageNum
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
