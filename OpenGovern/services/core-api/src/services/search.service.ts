import { esClient, INDEX_NAME } from '../config/elasticsearch';
import { SearchResult, DataAsset } from '../types';
import { query } from '../config/database';

interface ESSearchFilters {
  type?: string;
  platform?: string;
  domain?: string;
  sensitivity?: string;
  certificationStatus?: string;
  tags?: string[];
}

export async function search(
  searchQuery: string,
  filters: ESSearchFilters,
  from: number = 0,
  size: number = 20
): Promise<{ results: SearchResult[]; total: number }> {
  const mustClauses: unknown[] = [];
  const filterClauses: unknown[] = [];

  if (searchQuery && searchQuery.trim()) {
    mustClauses.push({
      multi_match: {
        query: searchQuery.trim(),
        fields: [
          'name^4',
          'name.keyword^5',
          'fully_qualified_name^3',
          'description^2',
          'owner_name',
          'tags',
        ],
        type: 'best_fields',
        fuzziness: 'AUTO',
      },
    });
  } else {
    mustClauses.push({ match_all: {} });
  }

  if (filters.type) {
    filterClauses.push({ term: { entity_type: filters.type } });
  }
  if (filters.platform) {
    filterClauses.push({ term: { platform: filters.platform } });
  }
  if (filters.domain) {
    filterClauses.push({ term: { domain_name: filters.domain } });
  }
  if (filters.sensitivity) {
    filterClauses.push({ term: { sensitivity: filters.sensitivity } });
  }
  if (filters.certificationStatus) {
    filterClauses.push({ term: { certification_status: filters.certificationStatus } });
  }
  if (filters.tags && filters.tags.length > 0) {
    filterClauses.push({ terms: { tags: filters.tags } });
  }

  const esQuery = {
    bool: {
      must: mustClauses,
      filter: filterClauses,
    },
  };

  const response = await esClient.search({
    index: INDEX_NAME,
    from,
    size,
    query: esQuery as Record<string, unknown>,
    highlight: {
      fields: {
        name: {},
        description: {},
        fully_qualified_name: {},
      },
      pre_tags: ['<em>'],
      post_tags: ['</em>'],
      fragment_size: 150,
      number_of_fragments: 3,
    },
    sort: [
      { _score: { order: 'desc' } },
      { 'name.keyword': { order: 'asc' } },
    ],
  });

  const hits = response.hits.hits;
  const total = typeof response.hits.total === 'number'
    ? response.hits.total
    : (response.hits.total?.value || 0);

  const results: SearchResult[] = hits.map((hit) => {
    const source = hit._source as Record<string, unknown>;
    return {
      urn: source.urn as string,
      name: source.name as string,
      fullyQualifiedName: source.fully_qualified_name as string,
      entityType: source.entity_type as string,
      platform: source.platform as string,
      description: (source.description as string) || null,
      domainName: (source.domain_name as string) || null,
      certificationStatus: source.certification_status as string,
      sensitivity: source.sensitivity as string,
      qualityScore: (source.quality_score as number) || null,
      tags: (source.tags as string[]) || [],
      score: hit._score || 0,
      highlights: (hit.highlight || {}) as Record<string, string[]>,
    };
  });

  return { results, total };
}

export async function indexAsset(asset: DataAsset & { aspects?: Record<string, Record<string, unknown>> }): Promise<void> {
  const ownerName = asset.owner_name ||
    (asset.aspects?.ownership?.owners as Array<{ name?: string }> | undefined)?.[0]?.name ||
    null;

  const description = asset.description ||
    (asset.aspects?.description?.description as string | undefined) ||
    null;

  const doc = {
    urn: asset.urn,
    entity_type: asset.entity_type,
    name: asset.name,
    fully_qualified_name: asset.fully_qualified_name,
    platform: asset.platform,
    service_name: asset.service_name,
    database_name: asset.database_name,
    schema_name: asset.schema_name,
    description,
    domain_name: asset.domain_name,
    owner_name: ownerName,
    certification_status: asset.certification_status,
    sensitivity: asset.sensitivity,
    quality_score: asset.quality_score,
    tags: asset.tags || [],
    last_ingested_at: asset.last_ingested_at,
    created_at: asset.created_at,
  };

  await esClient.index({
    index: INDEX_NAME,
    id: asset.urn,
    document: doc,
    refresh: 'wait_for',
  });
}

export async function deleteFromIndex(urn: string): Promise<void> {
  try {
    await esClient.delete({
      index: INDEX_NAME,
      id: urn,
      refresh: 'wait_for',
    });
  } catch (err: unknown) {
    // Ignore not found errors
    if ((err as { meta?: { statusCode?: number } })?.meta?.statusCode !== 404) {
      throw err;
    }
  }
}

export async function reindexAll(): Promise<{ indexed: number; errors: number }> {
  let indexed = 0;
  let errors = 0;
  let offset = 0;
  const batchSize = 100;

  while (true) {
    const result = await query<DataAsset>(
      `SELECT * FROM data_assets WHERE is_active = true ORDER BY created_at LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    );

    if (result.rows.length === 0) break;

    // Bulk index
    const operations = result.rows.flatMap((asset) => [
      { index: { _index: INDEX_NAME, _id: asset.urn } },
      {
        urn: asset.urn,
        entity_type: asset.entity_type,
        name: asset.name,
        fully_qualified_name: asset.fully_qualified_name,
        platform: asset.platform,
        service_name: asset.service_name,
        database_name: asset.database_name,
        schema_name: asset.schema_name,
        description: asset.description,
        domain_name: asset.domain_name,
        owner_name: asset.owner_name,
        certification_status: asset.certification_status,
        sensitivity: asset.sensitivity,
        quality_score: asset.quality_score,
        tags: asset.tags || [],
        last_ingested_at: asset.last_ingested_at,
        created_at: asset.created_at,
      },
    ]);

    const bulkResponse = await esClient.bulk({ operations, refresh: false });

    if (bulkResponse.errors) {
      const errorItems = bulkResponse.items.filter(
        (item: Record<string, { error?: unknown }>) => item.index?.error
      );
      errors += errorItems.length;
      indexed += bulkResponse.items.length - errorItems.length;
    } else {
      indexed += bulkResponse.items.length;
    }

    offset += batchSize;
    if (result.rows.length < batchSize) break;
  }

  console.log(`Reindex complete: ${indexed} indexed, ${errors} errors`);
  return { indexed, errors };
}
