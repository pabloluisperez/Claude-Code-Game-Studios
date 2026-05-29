import { Queue } from 'bullmq';
import { redis } from '../lib/redis.js';
import type { MatchJobPayload } from '../workers/match-worker.js';
import type { AiRotationJobPayload } from '../workers/ai-rotation-worker.js';

export const seasonTickQueue = new Queue('season-tick', { connection: redis });

export const matchQueue: Queue<MatchJobPayload> = new Queue<MatchJobPayload>(
  'match-tick',
  { connection: redis },
);

/**
 * AI Transfer Rotation queue — enqueued when a transfer window opens.
 *
 * Payload: AiRotationJobPayload { playthroughId, week }
 *
 * Trigger: resolved by the event-system on 'transfer_window_open' CalendarEvent
 * (advance-orchestrator or event resolver calls aiRotationQueue.add(...)).
 * Concurrency: 1 per worker process (sequential by design — clubs within a
 * single job are processed in deterministic order).
 */
export const aiRotationQueue: Queue<AiRotationJobPayload> = new Queue<AiRotationJobPayload>(
  'ai-rotation',
  { connection: redis },
);

export async function registerScheduledJobs(): Promise<void> {
  // Advance the in-game world clock once per real-time day at 04:00
  // In MVP, this triggers skip-by-event processing for all active saves
  await seasonTickQueue.upsertJobScheduler('daily-world-tick', {
    pattern: '0 4 * * *'
  });
}
