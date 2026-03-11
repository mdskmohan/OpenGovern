/**
 * Quality rule service – business logic for creating and managing rules.
 *
 * Validates that the rule configuration matches the declared rule_type before
 * persisting. Each rule type has a distinct configuration schema enforced here
 * so invalid configs never reach the scoring engine.
 */

import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import * as RuleModel from '../models/rule.model';
import {
  QualityRule,
  RuleType,
  RuleDimension,
  RuleConfig,
  CompletenessConfig,
  UniquenessConfig,
  ValidityConfig,
  FreshnessConfig,
  AccuracyConfig,
  ConsistencyConfig,
  CustomSqlConfig,
} from '../types';

// ---------------------------------------------------------------------------
// Config validators per rule type
// ---------------------------------------------------------------------------

const completenessSchema = z.object({
  threshold: z.number().min(0).max(100),
  column: z.string().optional(),
});

const uniquenessSchema = z.object({
  threshold: z.number().min(0).max(100),
  columns: z.array(z.string()).optional(),
});

const validitySchema = z.object({
  pattern: z.string().optional(),
  allowedValues: z.array(z.string()).optional(),
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(0).optional(),
  column: z.string().optional(),
}).refine(
  (v) => v.pattern !== undefined || v.allowedValues !== undefined || v.minLength !== undefined || v.maxLength !== undefined,
  { message: 'validity rule requires at least one of: pattern, allowedValues, minLength, maxLength' },
);

const freshnessSchema = z.object({
  maxAgeHours: z.number().positive(),
});

const accuracySchema = z.object({
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  column: z.string().optional(),
}).refine(
  (v) => v.minValue !== undefined || v.maxValue !== undefined,
  { message: 'accuracy rule requires at least one of: minValue, maxValue' },
);

const consistencySchema = z.object({
  referenceUrn: z.string().min(1, 'referenceUrn is required'),
  referenceColumn: z.string().min(1, 'referenceColumn is required'),
  sourceColumn: z.string().optional(),
});

const customSqlSchema = z.object({
  expression: z.string().min(1, 'SQL expression is required'),
});

/**
 * Dimension inferred from rule type when caller doesn't specify one.
 */
const DEFAULT_DIMENSION: Record<RuleType, RuleDimension> = {
  completeness: 'completeness',
  uniqueness: 'uniqueness',
  validity: 'validity',
  freshness: 'freshness',
  accuracy: 'accuracy',
  consistency: 'consistency',
  custom_sql: 'validity', // custom SQL maps to validity by default
};

/**
 * Validate the config object against the schema for the given rule type.
 * Throws a descriptive error if validation fails.
 */
function validateConfig(ruleType: RuleType, config: unknown): RuleConfig {
  const validators: Record<RuleType, z.ZodTypeAny> = {
    completeness: completenessSchema,
    uniqueness: uniquenessSchema,
    validity: validitySchema,
    freshness: freshnessSchema,
    accuracy: accuracySchema,
    consistency: consistencySchema,
    custom_sql: customSqlSchema,
  };

  const schema = validators[ruleType];
  const result = schema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid config for rule type '${ruleType}': ${issues}`);
  }

  return result.data as RuleConfig;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export interface CreateRuleInput {
  assetUrn: string;
  name: string;
  description?: string;
  ruleType: RuleType;
  dimension?: RuleDimension;
  config: unknown;
  weight?: number;
  scheduleCron?: string;
}

export async function createRule(
  data: CreateRuleInput,
  userId: string,
): Promise<QualityRule> {
  // Validate config against the declared rule type
  const validatedConfig = validateConfig(data.ruleType, data.config);

  const dimension = data.dimension ?? DEFAULT_DIMENSION[data.ruleType];

  return RuleModel.create({
    id: uuidv4(),
    assetUrn: data.assetUrn,
    name: data.name.trim(),
    description: data.description?.trim(),
    ruleType: data.ruleType,
    dimension,
    config: validatedConfig,
    weight: data.weight,
    scheduleCron: data.scheduleCron,
    createdBy: userId,
  });
}

export interface UpdateRuleInput {
  name?: string;
  description?: string;
  config?: unknown;
  weight?: number;
  isActive?: boolean;
  scheduleCron?: string | null;
}

export async function updateRule(
  id: string,
  data: UpdateRuleInput,
  _userId: string,
): Promise<QualityRule> {
  // If a new config is supplied we need to know the rule type to validate it.
  // Fetch the existing rule first.
  if (data.config !== undefined) {
    const existing = await RuleModel.findById(id);
    if (!existing) throw new Error(`Quality rule ${id} not found`);
    data.config = validateConfig(existing.ruleType, data.config);
  }

  return RuleModel.update(id, {
    name: data.name?.trim(),
    description: data.description?.trim(),
    config: data.config as RuleConfig | undefined,
    weight: data.weight,
    isActive: data.isActive,
    scheduleCron: data.scheduleCron,
  });
}

export async function deleteRule(id: string): Promise<void> {
  return RuleModel.deleteRule(id);
}

export async function getRule(id: string): Promise<QualityRule> {
  const rule = await RuleModel.findById(id);
  if (!rule) throw new Error(`Quality rule ${id} not found`);
  return rule;
}

export async function listRules(filters: {
  assetUrn?: string;
  ruleType?: RuleType;
  isActive?: boolean;
}): Promise<QualityRule[]> {
  return RuleModel.list(filters);
}
