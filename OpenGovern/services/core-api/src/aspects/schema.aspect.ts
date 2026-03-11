export interface SchemaColumn {
  name: string;
  type: string;
  description?: string;
  nullable?: boolean;
  tags?: string[];
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  position?: number;
}

export interface SchemaMetadataPayload {
  columns: SchemaColumn[];
  primaryKey?: string[];
  partitionColumns?: string[];
  clusteringColumns?: string[];
  tableType?: string;
}

export function validate(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.columns)) return false;
  for (const col of p.columns) {
    if (!col || typeof col !== 'object') return false;
    const c = col as Record<string, unknown>;
    if (typeof c.name !== 'string' || !c.name.trim()) return false;
    if (typeof c.type !== 'string' || !c.type.trim()) return false;
  }
  return true;
}

export function normalize(rawData: Record<string, unknown>): SchemaMetadataPayload {
  const rawColumns = Array.isArray(rawData.columns) ? rawData.columns : [];

  const columns: SchemaColumn[] = rawColumns.map((col: unknown, index: number) => {
    const c = (col || {}) as Record<string, unknown>;
    return {
      name: String(c.name || ''),
      type: String(c.type || c.dataType || 'unknown'),
      description: c.description ? String(c.description) : undefined,
      nullable: c.nullable !== undefined ? Boolean(c.nullable) : true,
      tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
      isPrimaryKey: Boolean(c.isPrimaryKey || c.is_primary_key),
      isForeignKey: Boolean(c.isForeignKey || c.is_foreign_key),
      position: typeof c.position === 'number' ? c.position : index,
    };
  });

  return {
    columns,
    primaryKey: Array.isArray(rawData.primaryKey) ? rawData.primaryKey.map(String) : undefined,
    partitionColumns: Array.isArray(rawData.partitionColumns) ? rawData.partitionColumns.map(String) : undefined,
    clusteringColumns: Array.isArray(rawData.clusteringColumns) ? rawData.clusteringColumns.map(String) : undefined,
    tableType: rawData.tableType ? String(rawData.tableType) : undefined,
  };
}

export function getSearchText(payload: SchemaMetadataPayload): string {
  const parts: string[] = [];
  for (const col of payload.columns) {
    parts.push(col.name);
    if (col.description) parts.push(col.description);
    if (col.tags) parts.push(...col.tags);
  }
  return parts.join(' ');
}
