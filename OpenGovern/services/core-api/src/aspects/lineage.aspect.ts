export interface LineageInfoPayload {
  upstreamCount: number;
  downstreamCount: number;
  hasColumnLineage: boolean;
  lastComputedAt?: string;
}

export function validate(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.upstreamCount !== 'number' || p.upstreamCount < 0) return false;
  if (typeof p.downstreamCount !== 'number' || p.downstreamCount < 0) return false;
  if (typeof p.hasColumnLineage !== 'boolean') return false;
  return true;
}

export function normalize(rawData: Record<string, unknown>): LineageInfoPayload {
  return {
    upstreamCount: typeof rawData.upstreamCount === 'number' ? rawData.upstreamCount : 0,
    downstreamCount: typeof rawData.downstreamCount === 'number' ? rawData.downstreamCount : 0,
    hasColumnLineage: Boolean(rawData.hasColumnLineage),
    lastComputedAt: rawData.lastComputedAt ? String(rawData.lastComputedAt) : new Date().toISOString(),
  };
}

export function getSearchText(_payload: LineageInfoPayload): string {
  return '';
}
