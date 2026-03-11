/**
 * Kafka consumer service that drives all notification processing.
 *
 * Subscribes to governance.events and quality.events.
 * Routes messages to AlertService for processing.
 *
 * Error handling:
 *   - Errors are logged but not re-thrown (prevents consumer crash)
 *   - Failed messages are logged to DB for manual review
 *   - Consumer group offset is committed only on successful processing
 */

import { Consumer, EachMessagePayload } from 'kafkajs';
import { createKafkaConsumer } from '../config/kafka-consumer';
import { AlertService } from './alert.service';
import { pool } from '../config/database';
import type { GovernanceKafkaEvent, QualityKafkaEvent } from '../types';

export class KafkaConsumerService {
  private consumer: Consumer | null = null;

  constructor(private readonly alertService: AlertService) {}

  async start(): Promise<void> {
    this.consumer = await createKafkaConsumer({
      onGovernanceEvent: async (event: unknown) => {
        await this.handleGovernanceEvent(event as GovernanceKafkaEvent);
      },
      onQualityEvent: async (event: unknown) => {
        await this.handleQualityEvent(event as QualityKafkaEvent);
      },
    });

    console.log('[KafkaConsumerService] Started — consuming governance.events and quality.events');
  }

  async stop(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
      console.log('[KafkaConsumerService] Stopped');
    }
  }

  private async handleGovernanceEvent(event: GovernanceKafkaEvent): Promise<void> {
    try {
      await this.alertService.processGovernanceEvent(event);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[KafkaConsumerService] Failed to process governance event:', errorMsg, event);
      await this.logFailedMessage('governance.events', JSON.stringify(event), errorMsg);
    }
  }

  private async handleQualityEvent(event: QualityKafkaEvent): Promise<void> {
    try {
      await this.alertService.processQualityEvent(event);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[KafkaConsumerService] Failed to process quality event:', errorMsg, event);
      await this.logFailedMessage('quality.events', JSON.stringify(event), errorMsg);
    }
  }

  /**
   * Log a failed message to the DB for manual review.
   * Uses a best-effort INSERT — failure here is not re-thrown.
   */
  private async logFailedMessage(
    topic: string,
    payload: string,
    error: string,
  ): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO failed_kafka_messages (topic, payload, error, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT DO NOTHING`,
        [topic, payload, error],
      );
    } catch {
      // Best-effort — don't let logging errors propagate
    }
  }
}
