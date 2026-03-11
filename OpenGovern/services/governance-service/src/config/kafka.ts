import { Kafka, Producer, CompressionTypes, logLevel } from 'kafkajs';
import { env } from './env';

export const GOVERNANCE_TOPICS = {
  GOVERNANCE_EVENTS: 'governance.events',
  AUDIT_EVENTS: 'audit.events',
} as const;

const kafka = new Kafka({
  clientId: 'opengovern-governance-service',
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
    transactionTimeout: 30_000,
  });

  await producer.connect();
  console.log('[GovernanceKafka] Producer connected');

  producer.on('producer.disconnect', () => {
    console.warn('[GovernanceKafka] Producer disconnected');
  });
}

export async function publishGovernanceEvent(
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!producer) {
    console.warn('[GovernanceKafka] Producer not initialized, skipping event publish');
    return;
  }

  const key = payload.instanceId ?? payload.policyId ?? payload.assetUrn ?? 'governance';

  try {
    await producer.send({
      topic: GOVERNANCE_TOPICS.GOVERNANCE_EVENTS,
      compression: CompressionTypes.GZIP,
      messages: [
        {
          key: String(key),
          value: JSON.stringify({
            eventType,
            ...payload,
            timestamp: new Date().toISOString(),
            source: 'governance-service',
          }),
        },
      ],
    });
  } catch (err) {
    // Event publishing must not break primary request flow
    console.error('[GovernanceKafka] Failed to publish event:', { eventType, error: err });
  }
}

export async function disconnectKafka(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    console.log('[GovernanceKafka] Producer disconnected');
  }
}
