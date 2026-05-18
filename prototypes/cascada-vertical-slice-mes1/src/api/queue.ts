// VERTICAL SLICE - NOT FOR PRODUCTION
// Validation Question: Can BullMQ orchestrate the weekly advance loop?
// Date: 2026-05-18

import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import type { PlayerDecisions } from "../sim/types.js";

const DEFAULT_REDIS_URL = "redis://localhost:6380";

let _connection: IORedis | null = null;

function getConnection(): IORedis {
  if (_connection) return _connection;
  const url = process.env.SLICE_REDIS_URL ?? DEFAULT_REDIS_URL;
  _connection = new IORedis(url, {
    maxRetriesPerRequest: null, // required for BullMQ
  });
  return _connection;
}

export function getRedisConnection(): ConnectionOptions {
  return getConnection() as ConnectionOptions;
}

export async function closeRedis(): Promise<void> {
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}

// ── Queues ──────────────────────────────────────────────────────────────────

export interface AdvanceJobData {
  playthroughId: string;
  decisions: PlayerDecisions;
}

export interface MatchJobData {
  playthroughId: string;
  fixtureId: string;
  /** True if this is the player's match — drives full cascade + UI flow. */
  isPlayerMatch: boolean;
  /** Optional: when the interactive flow (Day 6) re-enqueues a paused match. */
  resumeFromTick?: number;
}

let _advanceQueue: Queue<AdvanceJobData> | null = null;
let _matchQueue: Queue<MatchJobData> | null = null;

export function getAdvanceQueue(): Queue<AdvanceJobData> {
  if (_advanceQueue) return _advanceQueue;
  _advanceQueue = new Queue<AdvanceJobData>("advance", {
    connection: getRedisConnection(),
  });
  return _advanceQueue;
}

export function getMatchQueue(): Queue<MatchJobData> {
  if (_matchQueue) return _matchQueue;
  _matchQueue = new Queue<MatchJobData>("match", {
    connection: getRedisConnection(),
  });
  return _matchQueue;
}

export async function closeQueues(): Promise<void> {
  if (_advanceQueue) await _advanceQueue.close();
  if (_matchQueue) await _matchQueue.close();
  _advanceQueue = null;
  _matchQueue = null;
}
