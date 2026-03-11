/**
 * Shared TypeScript types for quality-service.
 *
 * These types mirror the PostgreSQL schema and are used throughout the
 * service layer, models, and controllers.
 */

import { Request } from 'express';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type RuleType =
  | 'completeness'
  | 'uniqueness'
  | 'validity'
  | 'freshness'
  | 'accuracy'
  | 'consistency'
  | 'custom_sql';

export type RuleDimension =
  | 'completeness'
  | 'uniqueness'
  | 'validity'
  | 'freshness'
  | 'accuracy'
  | 'consistency';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed';

// Rule configuration types – one per rule_type
export interface CompletenessConfig {
  threshold: number; // 0-100: minimum acceptable % of non-null values
  column?: string;   // optional specific column; if absent, checks all columns
}

export interface UniquenessConfig {
  threshold: number; // 0-100: minimum acceptable % of distinct values
  columns?: string[]; // columns to check; defaults to primary key
}

export interface ValidityConfig {
  pattern?: string;         // regex pattern rows must match
  allowedValues?: string[]; // enumeration of valid values
  minLength?: number;
  maxLength?: number;
  column?: string;
}

export interface FreshnessConfig {
  maxAgeHours: number; // data older than this many hours scores 0
}

export interface AccuracyConfig {
  minValue?: number;
  maxValue?: number;
  column?: string;
}

export interface ConsistencyConfig {
  referenceUrn: string;    // URN of the reference asset
  referenceColumn: string; // column in the reference asset
  sourceColumn?: string;   // column in the source asset
}

export interface CustomSqlConfig {
  expression: string; // SQL expression returning a score 0-100
}

export type RuleConfig =
  | CompletenessConfig
  | UniquenessConfig
  | ValidityConfig
  | FreshnessConfig
  | AccuracyConfig
  | ConsistencyConfig
  | CustomSqlConfig;

// ---------------------------------------------------------------------------
// Database row types (snake_case from PostgreSQL)
// ---------------------------------------------------------------------------

export interface QualityRuleRow {
  id: string;
  asset_urn: string;
  name: string;
  description: string | null;
  rule_type: RuleType;
  dimension: RuleDimension;
  config: RuleConfig;
  weight: number;
  is_active: boolean;
  schedule_cron: string | null;
  last_run_at: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface QualityScoreRow {
  id: string;
  asset_urn: string;
  overall_score: number;
  completeness_score: number | null;
  uniqueness_score: number | null;
  validity_score: number | null;
  freshness_score: number | null;
  accuracy_score: number | null;
  consistency_score: number | null;
  rule_results: QualityResult[];
  computed_at: Date;
  run_id: string | null;
}

export interface QualityRunRow {
  id: string;
  asset_urn: string;
  status: RunStatus;
  triggered_by: string;
  started_at: Date;
  completed_at: Date | null;
  results: QualityResult[] | null;
  error_message: string | null;
}

// ---------------------------------------------------------------------------
// Application-level types (camelCase)
// ---------------------------------------------------------------------------

export interface QualityRule {
  id: string;
  assetUrn: string;
  name: string;
  description: string | null;
  ruleType: RuleType;
  dimension: RuleDimension;
  config: RuleConfig;
  weight: number;
  isActive: boolean;
  scheduleCron: string | null;
  lastRunAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface QualityResult {
  ruleId: string;
  ruleName: string;
  ruleType: RuleType;
  dimension: RuleDimension;
  score: number;        // 0-100
  passed: boolean;      // true if score >= threshold
  details: string;      // human-readable explanation
  evaluatedAt: string;
}

export interface DimensionScores {
  completeness: number | null;
  uniqueness: number | null;
  validity: number | null;
  freshness: number | null;
  accuracy: number | null;
  consistency: number | null;
}

export interface QualityScore {
  id: string;
  assetUrn: string;
  overallScore: number;
  dimensions: DimensionScores;
  ruleResults: QualityResult[];
  computedAt: string;
  runId: string | null;
}

export interface QualityRun {
  id: string;
  assetUrn: string;
  status: RunStatus;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  results: QualityResult[] | null;
  errorMessage: string | null;
}

export interface DashboardStats {
  averageScore: number;
  assetsAbove80: number;
  assetsBelow60: number;
  byDomain: Array<{ domain: string; averageScore: number; assetCount: number }>;
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
