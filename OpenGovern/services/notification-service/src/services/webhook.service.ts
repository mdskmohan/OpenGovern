/**
 * Generic HTTP webhook delivery with retry logic and HMAC-SHA256 signing.
 *
 * Retry strategy: 3 attempts with exponential backoff (1s, 2s, 4s).
 * Includes signature header: X-OpenGovern-Signature: sha256=<hex>
 */

import axios, { AxiosError } from 'axios';
import { createHmac } from 'crypto';
import type { WebhookPayload } from '../types';

export class WebhookService {
  private readonly MAX_ATTEMPTS = 3;

  async deliver(url: string, payload: object, secret?: string): Promise<void> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-OpenGovern-Source': 'notification-service',
    };

    if (secret) {
      headers['X-OpenGovern-Signature'] = `sha256=${this.computeSignature(body, secret)}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_ATTEMPTS; attempt++) {
      try {
        await axios.post(url, body, {
          headers,
          timeout: 15_000,
          validateStatus: (status) => status >= 200 && status < 300,
        });
        return; // Success
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const isAxiosErr = err instanceof AxiosError;
        const statusCode = isAxiosErr ? err.response?.status : undefined;

        console.warn(
          `[WebhookService] Attempt ${attempt}/${this.MAX_ATTEMPTS} failed for ${url}` +
          (statusCode ? ` (HTTP ${statusCode})` : '') +
          `: ${lastError.message}`,
        );

        if (attempt < this.MAX_ATTEMPTS) {
          // Exponential backoff: 1s, 2s, 4s
          await this.sleep(1000 * 2 ** (attempt - 1));
        }
      }
    }

    throw new Error(
      `[WebhookService] Delivery to ${url} failed after ${this.MAX_ATTEMPTS} attempts: ${lastError?.message}`,
    );
  }

  computeSignature(body: string, secret: string): string {
    return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
