export type ClassificationType =
  | 'pii'
  | 'financial'
  | 'health'
  | 'sensitive'
  | 'gdpr'
  | 'ccpa'
  | 'hipaa'
  | 'internal'
  | 'public';

export interface Classification {
  type: ClassificationType;
  confidence: number;
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface ClassificationPayload {
  classifications: Classification[];
}

const VALID_TYPES: ClassificationType[] = [
  'pii', 'financial', 'health', 'sensitive', 'gdpr', 'ccpa', 'hipaa', 'internal', 'public',
];

export function validate(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.classifications)) return false;
  for (const cls of p.classifications) {
    if (!cls || typeof cls !== 'object') return false;
    const c = cls as Record<string, unknown>;
    if (!VALID_TYPES.includes(c.type as ClassificationType)) return false;
    if (typeof c.confidence !== 'number' || c.confidence < 0 || c.confidence > 1) return false;
  }
  return true;
}

export function normalize(rawData: Record<string, unknown>): ClassificationPayload {
  const rawClassifications = Array.isArray(rawData.classifications) ? rawData.classifications : [];

  const classifications: Classification[] = rawClassifications
    .map((cls: unknown): Classification | undefined => {
      const c = (cls || {}) as Record<string, unknown>;
      if (!VALID_TYPES.includes(c.type as ClassificationType)) return undefined;
      return {
        type: c.type as ClassificationType,
        confidence: typeof c.confidence === 'number' ? Math.max(0, Math.min(1, c.confidence)) : 1.0,
        confirmedBy: c.confirmedBy ? String(c.confirmedBy) : undefined,
        confirmedAt: c.confirmedAt ? String(c.confirmedAt) : undefined,
      };
    })
    .filter((c): c is Classification => c !== undefined);

  return { classifications };
}

export function getSearchText(payload: ClassificationPayload): string {
  return payload.classifications.map((c) => c.type).join(' ');
}
