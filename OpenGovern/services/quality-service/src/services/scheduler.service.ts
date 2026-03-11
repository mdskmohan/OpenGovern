/**
 * Quality Scheduler
 *
 * Manages automated quality check scheduling.
 * Two cron jobs:
 *   1. Every 5 minutes — check assets with due quality runs (based on rule schedule_cron)
 *   2. Every hour — trigger assets that haven't had a quality check in 24 hours
 */

import cron from 'node-cron';
import { pool } from '../config/database';
import { ScorerService } from './scorer.service';

export class QualityScheduler {
  private scorer: ScorerService;
  private running = false;
  private jobs: cron.ScheduledTask[] = [];

  constructor(scorer: ScorerService) {
    this.scorer = scorer;
  }

  /**
   * Start the scheduler.
   * Job 1 (every 5 min): find and run assets with due quality checks.
   * Job 2 (every hour):  find and run stale assets with no recent check.
   */
  start(): void {
    if (this.running) {
      console.warn('[QualityScheduler] Already running — skipping start');
      return;
    }

    this.running = true;

    // Job 1: every 5 minutes — assets with overdue rule schedules
    const job1 = cron.schedule('*/5 * * * *', async () => {
      console.log('[QualityScheduler] Running due-asset check');
      try {
        const urns = await this.getDueAssets();
        for (const urn of urns) {
          await this.safeRunCheck(urn, 'scheduler:due');
        }
      } catch (err) {
        console.error('[QualityScheduler] Error in due-asset job:', err);
      }
    });

    // Job 2: every hour — assets with no check in the last 24 hours
    const job2 = cron.schedule('0 * * * *', async () => {
      console.log('[QualityScheduler] Running stale-asset check');
      try {
        const urns = await this.getStaleAssets();
        for (const urn of urns) {
          await this.safeRunCheck(urn, 'scheduler:stale');
        }
      } catch (err) {
        console.error('[QualityScheduler] Error in stale-asset job:', err);
      }
    });

    this.jobs = [job1, job2];
    console.log('[QualityScheduler] Started (job1=*/5min, job2=hourly)');
  }

  /**
   * Stop all scheduled jobs gracefully.
   */
  stop(): void {
    for (const job of this.jobs) {
      job.stop();
    }
    this.jobs = [];
    this.running = false;
    console.log('[QualityScheduler] Stopped');
  }

  /**
   * Find assets whose quality rule schedule_cron is due.
   *
   * Strategy: select distinct asset_urns from quality_rules where
   * last_run_at is null or the next fire time computed from schedule_cron
   * is before NOW(). We approximate "due" by comparing last_run_at
   * against a simple interval derived from the cron string.
   */
  private async getDueAssets(): Promise<string[]> {
    // We use a heuristic: if the rule has a schedule_cron and last_run_at
    // is more than 5 minutes ago (or null), treat the asset as due.
    // A production implementation would parse the cron expression to compute
    // the exact next-fire time.
    const result = await pool.query<{ asset_urn: string }>(
      `SELECT DISTINCT qr.asset_urn
       FROM quality_rules qr
       WHERE qr.is_active = true
         AND qr.schedule_cron IS NOT NULL
         AND (
           qr.last_run_at IS NULL
           OR qr.last_run_at < NOW() - INTERVAL '5 minutes'
         )
       LIMIT 50`,
    );
    return result.rows.map((r) => r.asset_urn);
  }

  /**
   * Find assets that haven't had a quality check in 24 hours.
   * These get a scheduled check even if they have no explicit rules.
   */
  private async getStaleAssets(): Promise<string[]> {
    const result = await pool.query<{ urn: string }>(
      `SELECT a.urn
       FROM assets a
       WHERE a.is_active = true
         AND NOT EXISTS (
           SELECT 1 FROM quality_runs qr
           WHERE qr.asset_urn = a.urn
             AND qr.completed_at > NOW() - INTERVAL '24 hours'
         )
       LIMIT 100`,
    );
    return result.rows.map((r) => r.urn);
  }

  /**
   * Run a quality check, catching errors so one failure doesn't block others.
   */
  private async safeRunCheck(assetUrn: string, triggeredBy: string): Promise<void> {
    try {
      console.log(`[QualityScheduler] Running check for ${assetUrn} (${triggeredBy})`);
      await this.scorer.runQualityCheck(assetUrn, triggeredBy);
    } catch (err) {
      console.error(`[QualityScheduler] Quality check failed for ${assetUrn}:`, err);
    }
  }
}
