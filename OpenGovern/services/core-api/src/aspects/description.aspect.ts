export interface DescriptionPayload {
  description: string;
  readme?: string;
}

export function validate(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.description !== 'string') return false;
  if (p.readme !== undefined && typeof p.readme !== 'string') return false;
  return true;
}

export function normalize(rawData: Record<string, unknown>): DescriptionPayload {
  return {
    description: String(rawData.description || '').trim(),
    readme: rawData.readme ? String(rawData.readme).trim() : undefined,
  };
}

export function getSearchText(payload: DescriptionPayload): string {
  const parts: string[] = [payload.description];
  if (payload.readme) parts.push(payload.readme);
  return parts.join(' ');
}
