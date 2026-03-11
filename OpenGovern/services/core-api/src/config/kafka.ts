import { Kafka, Producer, CompressionTypes, logLevel } from 'kafkajs';
import { env } from './env';

export const TOPICS = {
  METADATA_CHANGES: 'metadata.changes',
  LINEAGE_EVENTS: 'lineage.events',
  AUDIT_EVENTS: 'audit.events',
} as const;

const kafka = new Kafka({
  clientId: 'opengovern-core-api',
  brokers: env.KAFKA_BROKERS.split(',').map((b) => b.trim()),
  logLevel: logLevel.WARN,
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

let producer: Producer;

export async function initKafkaProducer(): Promise<void> {
  producer = kafka.producer({
    idempotent: true,
    maxInFlightRequests: 5,
    transactionTimeout: 30000,
  });

  await producer.connect();
  console.log('Kafka producer connected');

  producer.on('producer.disconnect', () => {
    console.warn('Kafka producer disconnected');
  });
}

export async function publishEvent(
  topic: string,
  key: string,
  value: Record<string, unknown>
): Promise<void> {
  if (!producer) {
    console.warn('Kafka producer not initialized, skipping event publish');
    return;
  }

  try {
    await producer.send({
      topic,
      compression: CompressionTypes.GZIP,
      messages: [
        {
          key,
          value: JSON.stringify({
            ...value,
            timestamp: new Date().toISOString(),
            source: 'core-api',
          }),
        },
      ],
    });
  } catch (err) {
    console.error('Failed to publish Kafka event:', { topic, key, error: err });
    // Don't throw - event publishing should not break the main request flow
  }
}

export async function disconnectKafka(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    console.log('Kafka producer disconnected');
  }
}
