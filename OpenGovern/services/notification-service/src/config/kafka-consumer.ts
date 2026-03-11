import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { env } from './env';

export const CONSUMED_TOPICS = {
  GOVERNANCE_EVENTS: 'governance.events',
  QUALITY_EVENTS: 'quality.events',
} as const;

const kafka = new Kafka({
  clientId: 'opengovern-notification-service',
  brokers: env.KAFKA_BROKERS.split(',').map((b) => b.trim()),
  logLevel: logLevel.WARN,
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

/**
 * Creates and returns a Kafka consumer subscribed to notification-relevant topics.
 *
 * Consumer group: notification-service (ensures each message is processed once).
 *
 * Topics consumed:
 *   governance.events — policy violations, workflow transitions
 *   quality.events    — quality score drops, rule failures
 */
export async function createKafkaConsumer(handlers: {
  onGovernanceEvent: (event: unknown) => Promise<void>;
  onQualityEvent: (event: unknown) => Promise<void>;
}): Promise<Consumer> {
  const consumer = kafka.consumer({
    groupId: 'notification-service',
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
    maxWaitTimeInMs: 5_000,
  });

  await consumer.connect();
  console.log('[kafka-consumer] Connected');

  await consumer.subscribe({
    topics: [CONSUMED_TOPICS.GOVERNANCE_EVENTS, CONSUMED_TOPICS.QUALITY_EVENTS],
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async (payload: EachMessagePayload) => {
      const { topic, message } = payload;
      const raw = message.value?.toString();
      if (!raw) return;

      let event: unknown;
      try {
        event = JSON.parse(raw);
      } catch {
        console.error(`[kafka-consumer] Failed to parse message on ${topic}:`, raw.slice(0, 200));
        return;
      }

      if (topic === CONSUMED_TOPICS.GOVERNANCE_EVENTS) {
        await handlers.onGovernanceEvent(event);
      } else if (topic === CONSUMED_TOPICS.QUALITY_EVENTS) {
        await handlers.onQualityEvent(event);
      }
    },
  });

  consumer.on('consumer.crash', ({ payload: { error } }) => {
    console.error('[kafka-consumer] Consumer crashed:', error);
  });

  consumer.on('consumer.disconnect', () => {
    console.warn('[kafka-consumer] Consumer disconnected');
  });

  return consumer;
}
