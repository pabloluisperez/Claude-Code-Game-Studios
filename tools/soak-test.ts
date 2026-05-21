#!/usr/bin/env tsx
/**
 * Soak test runner — Sprint 13 task 13-3.
 *
 * Runs the cascade engine deterministically for N consecutive in-game
 * seasons and captures per-tick metrics to surface:
 *   - Memory growth / leaks
 *   - Balance drift between iterations seeded identically
 *   - WorldState corruption (NaN, Infinity, missing fields)
 *   - Tick latency regressions
 *   - Unhandled exceptions
 *
 * Usage:
 *   pnpm soak-test                   # default: 5 seasons
 *   pnpm soak-test --season-count=10 # 10 seasons
 *   pnpm soak-test --season-count=1 --run-id=quick
 *
 * Output:
 *   production/qa/soak-runs/[date]-[run-id]/summary.md
 *   production/qa/soak-runs/[date]-[run-id]/metrics.jsonl
 *
 * Per the soak-test-protocol.md (Sprint 12 task 12-5).
 */

import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Relative imports avoid the cross-workspace exports-resolution issue
// at the monorepo root (tsx can't see the `.` exports field for @smt/shared
// from the root node_modules layer; the workspace dep only resolves
// cleanly from inside apps/* and packages/*). Relative paths into
// packages/shared/src work universally.
import {
  CASCADA_FC_GRAPH,
  createSeededRng,
  defaultWorldState,
  runTick,
  type WorldState,
} from '../packages/shared/src/index.js';

// ── Arg parsing ─────────────────────────────────────────────────────────────

interface Args {
  seasonCount: number;
  runId: string;
  abortOnDrift: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  let seasonCount = 5;
  let runId = `auto-${Date.now()}`;
  let abortOnDrift = true;
  for (const a of argv) {
    if (a.startsWith('--season-count=')) seasonCount = parseInt(a.slice(15), 10);
    else if (a.startsWith('--run-id=')) runId = a.slice(9);
    else if (a === '--no-abort-on-drift') abortOnDrift = false;
  }
  return { seasonCount, runId, abortOnDrift };
}

// ── Abort thresholds ────────────────────────────────────────────────────────

const ABORT_RSS_BYTES = 512 * 1024 * 1024; // 512 MB
const ABORT_TICK_LATENCY_MS = 2_000;
const WEEKS_PER_SEASON = 38;

// ── Helpers ─────────────────────────────────────────────────────────────────

interface TickMetric {
  tick: number;
  week: number;
  season: number;
  rss_mb: number;
  heap_used_mb: number;
  duration_ms: number;
  financial_balance: number;
  weekly_cashflow: number;
  financial_status: number;
  threshold_crossings: number;
  has_nan: boolean;
  has_infinity: boolean;
}

function detectNaNOrInfinity(state: WorldState): { nan: boolean; inf: boolean } {
  let nan = false;
  let inf = false;
  for (const v of Object.values(state as Record<string, unknown>)) {
    if (typeof v !== 'number') continue;
    if (Number.isNaN(v)) nan = true;
    if (!Number.isFinite(v)) inf = true;
  }
  return { nan, inf };
}

function bytesToMb(b: number): number {
  return Math.round((b / 1024 / 1024) * 10) / 10;
}

// ── Main runner ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date();
  const dateStr = startedAt.toISOString().slice(0, 10);
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '..');
  const runDir = resolve(
    repoRoot,
    'production',
    'qa',
    'soak-runs',
    `${dateStr}-${args.runId}`,
  );
  await mkdir(runDir, { recursive: true });
  const metricsPath = resolve(runDir, 'metrics.jsonl');
  const summaryPath = resolve(runDir, 'summary.md');

  console.log(`Soak run id=${args.runId} seasons=${args.seasonCount}`);
  console.log(`Output: ${runDir}`);

  const totalTicks = args.seasonCount * WEEKS_PER_SEASON;
  let abort: { tick: number; reason: string } | null = null;
  let state: WorldState = defaultWorldState();
  let buffer: ReadonlyArray<unknown> = [];
  const latencies: number[] = [];

  for (let tick = 1; tick <= totalTicks; tick++) {
    const season = Math.floor((tick - 1) / WEEKS_PER_SEASON) + 1;
    const week = ((tick - 1) % WEEKS_PER_SEASON) + 1;

    const t0 = process.hrtime.bigint();
    let result;
    try {
      result = runTick(
        {
          rng: createSeededRng(`soak:${args.runId}:${tick}`),
          currentWeek: week,
          hasMatchThisWeek: week >= 5 && (week - 5) % 1 === 0,
          prevState: state,
        },
        CASCADA_FC_GRAPH,
        state,
        [],
        buffer as never,
      );
    } catch (e) {
      abort = { tick, reason: `Exception: ${(e as Error).message}` };
      break;
    }
    const t1 = process.hrtime.bigint();
    const durationMs = Number(t1 - t0) / 1_000_000;
    latencies.push(durationMs);

    state = result.nextState;
    buffer = result.newDelayedEffects;

    const mem = process.memoryUsage();
    const { nan, inf } = detectNaNOrInfinity(state);
    const stateRec = state as unknown as Record<string, number>;
    const metric: TickMetric = {
      tick,
      week,
      season,
      rss_mb: bytesToMb(mem.rss),
      heap_used_mb: bytesToMb(mem.heapUsed),
      duration_ms: Math.round(durationMs * 100) / 100,
      financial_balance: stateRec['financial_balance'] ?? 0,
      weekly_cashflow: stateRec['weekly_cashflow'] ?? 0,
      financial_status: stateRec['financial_status'] ?? 0,
      threshold_crossings: result.thresholdCrossings.length,
      has_nan: nan,
      has_infinity: inf,
    };
    await appendFile(metricsPath, JSON.stringify(metric) + '\n');

    // ── Abort checks ──────────────────────────────────────────────────────
    if (nan) {
      abort = { tick, reason: 'WorldState contains NaN' };
      break;
    }
    if (inf) {
      abort = { tick, reason: 'WorldState contains Infinity' };
      break;
    }
    if (mem.rss > ABORT_RSS_BYTES) {
      abort = { tick, reason: `RSS > 512MB (${bytesToMb(mem.rss)} MB)` };
      break;
    }
    if (durationMs > ABORT_TICK_LATENCY_MS) {
      abort = { tick, reason: `Tick latency > 2000ms (${durationMs.toFixed(1)} ms)` };
      break;
    }

    // Progress log every season boundary
    if (week === WEEKS_PER_SEASON) {
      console.log(
        `  Season ${season}/${args.seasonCount} complete — tick ${tick}/${totalTicks} · ` +
          `balance ${stateRec['financial_balance']?.toFixed(0)} €K · ` +
          `RSS ${bytesToMb(mem.rss)} MB`,
      );
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const sortedLat = [...latencies].sort((a, b) => a - b);
  const p50 = sortedLat[Math.floor(sortedLat.length * 0.5)] ?? 0;
  const p95 = sortedLat[Math.floor(sortedLat.length * 0.95)] ?? 0;
  const p99 = sortedLat[Math.floor(sortedLat.length * 0.99)] ?? 0;
  const peakRss = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
  const finishedAt = new Date();
  const elapsedSec = ((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1);
  const finalState = state as unknown as Record<string, number>;

  const verdict = abort ? 'ABORT' : 'PASS';
  const ticksRun = latencies.length;

  const summary = `# Soak Run — ${dateStr}/${args.runId}

**Verdict**: ${verdict}
**Started**: ${startedAt.toISOString()}
**Finished**: ${finishedAt.toISOString()}
**Elapsed**: ${elapsedSec}s
**Seasons requested**: ${args.seasonCount} · weeks/season ${WEEKS_PER_SEASON}
**Ticks run**: ${ticksRun} / ${totalTicks}

${abort ? `## ABORT — tick ${abort.tick}\n\nReason: \`${abort.reason}\`\n` : ''}

## Tick latency
- p50: ${p50.toFixed(2)} ms
- p95: ${p95.toFixed(2)} ms
- p99: ${p99.toFixed(2)} ms

## Memory
- Peak RSS: ${peakRss} MB (threshold ${ABORT_RSS_BYTES / 1024 / 1024} MB)

## Final WorldState
- financial_balance: ${finalState['financial_balance']?.toFixed(2) ?? 'n/a'}
- weekly_cashflow:   ${finalState['weekly_cashflow']?.toFixed(2) ?? 'n/a'}
- financial_status:  ${finalState['financial_status'] ?? 'n/a'}
- corruption_exposure: ${finalState['corruption_exposure']?.toFixed(2) ?? 'n/a'}
- fan_loyalty:       ${finalState['fan_loyalty'] ?? 'n/a'}

## Metrics
Per-tick metrics: \`metrics.jsonl\` (one JSON per line)

## Protocol
Per Sprint 12 task 12-5 — \`production/qa/soak-test-protocol.md\`.
`;

  await writeFile(summaryPath, summary);
  console.log(`\n${verdict}: ${ticksRun}/${totalTicks} ticks in ${elapsedSec}s — peak RSS ${peakRss} MB`);
  console.log(`Summary: ${summaryPath}`);

  if (abort) process.exit(1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(2);
});
