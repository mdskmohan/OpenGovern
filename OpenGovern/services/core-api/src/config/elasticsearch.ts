import { Client } from '@elastic/elasticsearch';
import { env } from './env';

export const esClient = new Client({
  node: env.ELASTICSEARCH_URL,
  requestTimeout: 30000,
  sniffOnStart: false,
});

const INDEX_NAME = 'opengovern_assets';

const INDEX_MAPPINGS = {
  properties: {
    urn: { type: 'keyword' },
    entity_type: { type: 'keyword' },
    name: {
      type: 'text',
      analyzer: 'standard',
      fields: {
        keyword: { type: 'keyword', ignore_above: 512 },
      },
    },
    fully_qualified_name: {
      type: 'text',
      analyzer: 'standard',
      fields: {
        keyword: { type: 'keyword', ignore_above: 1024 },
      },
    },
    platform: { type: 'keyword' },
    service_name: { type: 'keyword' },
    database_name: { type: 'keyword' },
    schema_name: { type: 'keyword' },
    description: { type: 'text', analyzer: 'standard' },
    domain_name: { type: 'keyword' },
    owner_name: {
      type: 'text',
      analyzer: 'standard',
      fields: {
        keyword: { type: 'keyword', ignore_above: 256 },
      },
    },
    certification_status: { type: 'keyword' },
    sensitivity: { type: 'keyword' },
    quality_score: { type: 'float' },
    tags: { type: 'keyword' },
    last_ingested_at: { type: 'date' },
    created_at: { type: 'date' },
  },
};

export async function initializeElasticsearch(): Promise<void> {
  try {
    const exists = await esClient.indices.exists({ index: INDEX_NAME });
    if (!exists) {
      await esClient.indices.create({
        index: INDEX_NAME,
        mappings: INDEX_MAPPINGS as Record<string, unknown>,
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
          analysis: {
            analyzer: {
              standard: {
                type: 'standard',
                stopwords: '_none_',
              },
            },
          },
        },
      });
      console.log(`Elasticsearch index '${INDEX_NAME}' created`);
    } else {
      console.log(`Elasticsearch index '${INDEX_NAME}' already exists`);
    }
  } catch (err) {
    console.error('Failed to initialize Elasticsearch index:', err);
    throw err;
  }
}

export { INDEX_NAME };
