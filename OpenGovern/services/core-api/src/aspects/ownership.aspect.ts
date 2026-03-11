export type OwnerType = 'technical_owner' | 'business_owner' | 'data_steward' | 'stakeholder';

export interface Owner {
  userId: string;
  type: OwnerType;
  email?: string;
  name?: string;
}

export interface OwnershipPayload {
  owners: Owner[];
}

const VALID_OWNER_TYPES: OwnerType[] = ['technical_owner', 'business_owner', 'data_steward', 'stakeholder'];

export function validate(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.owners)) return false;
  for (const owner of p.owners) {
    if (!owner || typeof owner !== 'object') return false;
    const o = owner as Record<string, unknown>;
    if (typeof o.userId !== 'string' || !o.userId.trim()) return false;
    if (o.type !== undefined && !VALID_OWNER_TYPES.includes(o.type as OwnerType)) return false;
  }
  return true;
}

export function normalize(rawData: Record<string, unknown>): OwnershipPayload {
  const rawOwners = Array.isArray(rawData.owners) ? rawData.owners : [];

  const owners: Owner[] = rawOwners.map((owner: unknown) => {
    const o = (owner || {}) as Record<string, unknown>;
    return {
      userId: String(o.userId || o.user_id || ''),
      type: VALID_OWNER_TYPES.includes(o.type as OwnerType)
        ? (o.type as OwnerType)
        : 'technical_owner',
      email: o.email ? String(o.email) : undefined,
      name: o.name ? String(o.name) : undefined,
    };
  });

  return { owners };
}

export function getSearchText(payload: OwnershipPayload): string {
  return payload.owners
    .map((o) => [o.name, o.email].filter(Boolean).join(' '))
    .join(' ');
}
