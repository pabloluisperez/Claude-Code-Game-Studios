import { Queue } from 'bullmq';
import { redis } from '../lib/redis.js';

export const seasonTickQueue = new Queue('season-tick', { connection: redis });

export async function registerScheduledJobs(): Promise<void> {
  // Advance the in-game world clock once per real-time day at 04:00
  // In MVP, this triggers skip-by-event processing for all active saves
  await seasonTickQueue.upsertJobScheduler('daily-world-tick', {
    pattern: '0 4 * * *'
  });
}
