'use client';

import React from 'react';
import { cn } from './cn';

/**
 * Status badge component. Pill shape. Used throughout the UI for:
 * - Certification status (certified=green, uncertified=gray, deprecated=red)
 * - Sensitivity (restricted=red, confidential=orange, internal=blue, public=green)
 * - Entity type (table=blue, dashboard=purple, pipeline=orange, ml_model=pink)
 * - Alert severity (critical=red, high=orange, medium=yellow, low=blue, info=gray)
 * - Policy enforcement (block=red, warn=yellow, report=gray)
 */

type BadgeVariant =
  // Certification
  | 'certified'
  | 'uncertified'
  | 'deprecated'
  | 'pending'
  // Sensitivity
  | 'restricted'
  | 'confidential'
  | 'internal'
  | 'public'
  // Entity types
  | 'table'
  | 'dashboard'
  | 'pipeline'
  | 'ml_model'
  | 'feature_group'
  | 'dataset'
  | 'view'
  | 'topic'
  // Alert severity
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'info'
  // Enforcement
  | 'block'
  | 'warn'
  | 'report'
  // Workflow status
  | 'pending_workflow'
  | 'in_progress'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  // Run status
  | 'running'
  | 'success'
  | 'failed'
  // Policy type
  | 'access'
  | 'quality'
  | 'retention'
  | 'classification'
  | 'masking'
  // Generic
  | 'default'
  | 'blue'
  | 'green'
  | 'red'
  | 'orange'
  | 'purple'
  | 'yellow'
  | 'gray';

const variantStyles: Record<BadgeVariant, string> = {
  // Certification
  certified: 'bg-green-50 text-green-700 border border-green-200',
  uncertified: 'bg-gray-100 text-gray-600 border border-gray-200',
  deprecated: 'bg-red-50 text-red-700 border border-red-200',
  pending: 'bg-yellow-50 text-yellow-700 border border-yellow-200',

  // Sensitivity
  restricted: 'bg-red-50 text-red-700 border border-red-200',
  confidential: 'bg-orange-50 text-orange-700 border border-orange-200',
  internal: 'bg-blue-50 text-blue-700 border border-blue-200',
  public: 'bg-green-50 text-green-700 border border-green-200',

  // Entity types
  table: 'bg-blue-50 text-blue-700 border border-blue-200',
  dashboard: 'bg-purple-50 text-purple-700 border border-purple-200',
  pipeline: 'bg-orange-50 text-orange-700 border border-orange-200',
  ml_model: 'bg-pink-50 text-pink-700 border border-pink-200',
  feature_group: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  dataset: 'bg-cyan-50 text-cyan-700 border border-cyan-200',
  view: 'bg-teal-50 text-teal-700 border border-teal-200',
  topic: 'bg-violet-50 text-violet-700 border border-violet-200',

  // Alert severity
  critical: 'bg-red-50 text-red-700 border border-red-200',
  high: 'bg-orange-50 text-orange-700 border border-orange-200',
  medium: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  low: 'bg-blue-50 text-blue-700 border border-blue-200',
  info: 'bg-gray-100 text-gray-600 border border-gray-200',

  // Enforcement
  block: 'bg-red-50 text-red-700 border border-red-200',
  warn: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  report: 'bg-gray-100 text-gray-600 border border-gray-200',

  // Workflow
  pending_workflow: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  in_progress: 'bg-blue-50 text-blue-700 border border-blue-200',
  approved: 'bg-green-50 text-green-700 border border-green-200',
  rejected: 'bg-red-50 text-red-700 border border-red-200',
  cancelled: 'bg-gray-100 text-gray-600 border border-gray-200',
  expired: 'bg-gray-100 text-gray-600 border border-gray-200',

  // Run status
  running: 'bg-blue-50 text-blue-700 border border-blue-200',
  success: 'bg-green-50 text-green-700 border border-green-200',
  failed: 'bg-red-50 text-red-700 border border-red-200',

  // Policy type
  access: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  quality: 'bg-cyan-50 text-cyan-700 border border-cyan-200',
  retention: 'bg-teal-50 text-teal-700 border border-teal-200',
  classification: 'bg-purple-50 text-purple-700 border border-purple-200',
  masking: 'bg-pink-50 text-pink-700 border border-pink-200',

  // Generic
  default: 'bg-gray-100 text-gray-600 border border-gray-200',
  blue: 'bg-blue-50 text-blue-700 border border-blue-200',
  green: 'bg-green-50 text-green-700 border border-green-200',
  red: 'bg-red-50 text-red-700 border border-red-200',
  orange: 'bg-orange-50 text-orange-700 border border-orange-200',
  purple: 'bg-purple-50 text-purple-700 border border-purple-200',
  yellow: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  gray: 'bg-gray-100 text-gray-600 border border-gray-200',
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium leading-none whitespace-nowrap',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// Helper to get badge variant from string values
export function getCertificationVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    certified: 'certified',
    uncertified: 'uncertified',
    deprecated: 'deprecated',
    pending: 'pending',
  };
  return map[status] ?? 'default';
}

export function getEntityTypeVariant(type: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    table: 'table',
    dashboard: 'dashboard',
    pipeline: 'pipeline',
    ml_model: 'ml_model',
    feature_group: 'feature_group',
    dataset: 'dataset',
    view: 'view',
    topic: 'topic',
  };
  return map[type] ?? 'default';
}

export function getSensitivityVariant(level: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    restricted: 'restricted',
    confidential: 'confidential',
    internal: 'internal',
    public: 'public',
  };
  return map[level] ?? 'default';
}

export function getAlertSeverityVariant(severity: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    critical: 'critical',
    high: 'high',
    medium: 'medium',
    low: 'low',
    info: 'info',
  };
  return map[severity] ?? 'default';
}

export function getWorkflowStatusVariant(status: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    pending: 'pending_workflow',
    in_progress: 'in_progress',
    approved: 'approved',
    rejected: 'rejected',
    cancelled: 'cancelled',
    expired: 'expired',
  };
  return map[status] ?? 'default';
}
