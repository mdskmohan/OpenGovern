/**
 * Kafka producer configuration for quality-service.
 *
 * The quality-service publishes events to quality.events so that downstream
 * consumers (notification-service) can react to score drops and rule failures.
 */

import { Kafka, Producer, CompressionTypes, logLevel } from 'kafkajs';
import { env } from './env';

export const TOPICS = {
  QUALITY_EVENTS: 'quality.events',
  AUDIT_EVENTS: 'audit.events',
} as const;

const kafka = new Kafka({
  clientId: 'opengovern-quality-service',
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
  console.log('[kafka] Producer connected');

  producer.on('producer.disconnect', () => {
    console.warn('[kafka] Producer disconnected');
  });
}

export async function publishEvent(
  topic: string,
  key: string,
  value: Record<string, unknown>,
): Promise<void> {
  if (!producer) {
    console.warn('[kafka] Producer not initialized, skipping event publish');
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
            source: 'quality-service',
          }),
        },
      ],
    });
  } catch (err) {
    console.error('[kafka] Failed to publish event:', { topic, key, error: err });
    // Don't throw – event publishing must not break the main request flow
  }
}

export async function disconnectKafka(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    console.log('[kafka] Producer disconnected');
  }
}
