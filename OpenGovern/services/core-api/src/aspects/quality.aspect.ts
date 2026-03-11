export interface QualityDimensions {
  completeness?: number;
  uniqueness?: number;
  validity?: number;
  freshness?: number;
  accuracy?: number;
}

export interface QualityPayload {
  overallScore: number;
  lastRunAt: string;
  dimensions: QualityDimensions;
  rowCount?: number;
  nullCount?: number;
  duplicateCount?: number;
  failedChecks?: Array<{
    checkName: string;
    dimension: string;
    result: number;
    threshold: number;
  }>;
}

export function validate(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.overallScore !== 'number' || p.overallScore < 0 || p.overallScore > 100) return false;
  if (typeof p.lastRunAt !== 'string') return false;
  if (!p.dimensions || typeof p.dimensions !== 'object') return false;
  const d = p.dimensions as Record<string, unknown>;
  for (const key of Object.keys(d)) {
    if (d[key] !== undefined && (typeof d[key] !== 'number' || (d[key] as number) < 0 || (d[key] as number) > 100)) {
      return false;
    }
  }
  return true;
}

export function normalize(rawData: Record<string, unknown>): QualityPayload {
  const rawDimensions = (rawData.dimensions || {}) as Record<string, unknown>;

  const normalizeDimension = (val: unknown): number | undefined => {
    if (val === undefined || val === null) return undefined;
    const n = Number(val);
    return isNaN(n) ? undefined : Math.max(0, Math.min(100, n));
  };

  const dimensions: QualityDimensions = {
    completeness: normalizeDimension(rawDimensions.completeness),
    uniqueness: normalizeDimension(rawDimensions.uniqueness),
    validity: normalizeDimension(rawDimensions.validity),
    freshness: normalizeDimension(rawDimensions.freshness),
    accuracy: normalizeDimension(rawDimensions.accuracy),
  };

  const definedScores = Object.values(dimensions).filter((v): v is number => v !== undefined);
  const computedOverall =
    definedScores.length > 0
      ? Math.round(definedScores.reduce((a, b) => a + b, 0) / definedScores.length)
      : 0;

  const overallScore =
    typeof rawData.overallScore === 'number'
      ? Math.max(0, Math.min(100, rawData.overallScore))
      : computedOverall;

  return {
    overallScore,
    lastRunAt: rawData.lastRunAt ? String(rawData.lastRunAt) : new Date().toISOString(),
    dimensions,
    rowCount: typeof rawData.rowCount === 'number' ? rawData.rowCount : undefined,
    nullCount: typeof rawData.nullCount === 'number' ? rawData.nullCount : undefined,
    duplicateCount: typeof rawData.duplicateCount === 'number' ? rawData.duplicateCount : undefined,
    failedChecks: Array.isArray(rawData.failedChecks) ? rawData.failedChecks as QualityPayload['failedChecks'] : undefined,
  };
}

export function getSearchText(_payload: QualityPayload): string {
  return '';
}
