#!/usr/bin/env -S npx tsx
/**
 * Direct test for the hi-res fix workflow — bypasses the MCP layer.
 *
 * Builds the workflow JSON, POSTs to ComfyUI directly, polls /history,
 * and downloads the resulting PNG. Used to validate the workflow before
 * the MCP server reconnects in the Claude Code session.
 *
 * Usage:
 *   npx tsx test-hires-fix.mjs <preset>
 *
 * Where <preset> is the stadium tier name: T0, T1, T2, T3 (default T3).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildHiResFixWorkflow } from './src/workflow-hires-fix.ts';

const COMFYUI_URL = process.env.COMFYUI_URL ?? 'http://bosgame.localdomain:8188';
const OUTPUT_DIR = resolve(
  process.cwd(),
  '../../assets/sprites/_raw',
);

const TIER_PRESETS = {
  T0: {
    filenamePrefix: 'stadium-T0-amateur-HD',
    positivePrompt:
      'frontal 3/4 view pixel art soccer stadium, amateur grassroots football pitch, patchy brown grass field with sparse green spots, dirt patches, simple wooden fence boundary, no stands at all, just dirt sidelines, dilapidated rundown, weeds growing, single sprite on transparent background, retro 16-bit pixel art, Stardew Valley style, sharp chunky pixels, pixel-art-xl, clean silhouette',
    negativePrompt:
      'modern stadium, big stands, bleachers, professional, blurry, anti-aliased, 3d render, smooth shading, gradient, realistic, photograph, soft edges, multiple buildings, tileset, top-down map',
  },
  T1: {
    filenamePrefix: 'stadium-T1-local-HD',
    positivePrompt:
      'frontal 3/4 view pixel art soccer stadium, semi-professional local football pitch, patchy green grass field with some brown spots, basic white chalk lines, small wooden bleacher on one side with about 50 wooden plank seats, modest amateur club, single sprite on transparent background, retro 16-bit pixel art, Stardew Valley style, sharp chunky pixels, pixel-art-xl, clean silhouette',
    negativePrompt:
      'brown dirt field, mega stadium, professional bowl, multiple tiers, blurry, anti-aliased, 3d render, smooth shading, gradient, realistic, photograph, soft edges, top-down map',
  },
  T2: {
    filenamePrefix: 'stadium-T2-regional-HD',
    positivePrompt:
      'frontal 3/4 view pixel art soccer stadium, professional regional football pitch, healthy lush green grass field with visible mowing stripe pattern, crisp white chalk lines, medium concrete stands on two sides with about 500 seats total, small floodlight poles, modest billboard advertising, single sprite on transparent background, retro 16-bit pixel art, Stardew Valley style, sharp chunky pixels, pixel-art-xl, clean silhouette',
    negativePrompt:
      'brown dirt field, mega stadium, full bowl, multiple tiers, dilapidated, wooden, blurry, anti-aliased, 3d render, smooth shading, gradient, realistic, photograph, soft edges, top-down map',
  },
  T3: {
    filenamePrefix: 'stadium-T3-premier-HD',
    positivePrompt:
      'frontal 3/4 view pixel art soccer stadium, top-tier premier league football pitch, pristine green grass field with perfect mowing stripes pattern, large covered stands all around forming complete bowl, 50000 seats, modern white roof structure, tall floodlight towers, giant LED billboards, sponsor logos, modern stadium architecture, single sprite on transparent background, retro 16-bit pixel art, Stardew Valley style, sharp chunky pixels, pixel-art-xl, clean silhouette, monumental scale, highly detailed',
    negativePrompt:
      'brown dirt field, amateur, wooden bleachers, small, dilapidated, rundown, blurry, anti-aliased, 3d render, smooth shading, gradient, realistic, photograph, soft edges, top-down map, duplicate',
  },

  // ── City buildings ──────────────────────────────────────────────────────
  OFFICE: {
    filenamePrefix: 'building-office-HD',
    positivePrompt:
      'frontal 3/4 view pixel art building, soccer club main office headquarters, two-story brick and glass structure, club logo on facade, large windows showing trophy room, modern administrative building, sign saying "FC" above entrance, parking spots visible, single sprite on transparent background, retro 16-bit pixel art, Stardew Valley style, sharp chunky pixels, pixel-art-xl, clean silhouette',
    negativePrompt:
      'stadium, soccer field, grass, bleachers, multiple buildings, blurry, anti-aliased, 3d render, smooth shading, gradient, realistic, photograph, soft edges, top-down map',
  },
  GYM: {
    filenamePrefix: 'building-gym-HD',
    positivePrompt:
      'frontal 3/4 view pixel art building, soccer club training gym fitness center, modern single-story structure with large windows showing treadmills weights and gym equipment inside, dumbbells barbells visible, sports facility, blue and white color scheme, single sprite on transparent background, retro 16-bit pixel art, Stardew Valley style, sharp chunky pixels, pixel-art-xl, clean silhouette',
    negativePrompt:
      'stadium, soccer field, grass, bleachers, multiple buildings, residential house, blurry, anti-aliased, 3d render, smooth shading, gradient, realistic, photograph, soft edges, top-down map',
  },
  MEDICAL: {
    filenamePrefix: 'building-medical-HD',
    positivePrompt:
      'frontal 3/4 view pixel art building, soccer club medical center clinic, clean white modern small building, large red medical cross on facade, ambulance parked beside, sterile clinical look, single-story structure, hospital-like windows, single sprite on transparent background, retro 16-bit pixel art, Stardew Valley style, sharp chunky pixels, pixel-art-xl, clean silhouette',
    negativePrompt:
      'stadium, soccer field, grass, bleachers, large hospital tower, multiple buildings, blurry, anti-aliased, 3d render, smooth shading, gradient, realistic, photograph, soft edges, top-down map',
  },
  ACADEMY: {
    filenamePrefix: 'building-academy-HD',
    positivePrompt:
      'frontal 3/4 view pixel art building, soccer youth academy school, two-story school-like brick building with green training pitch nearby, large windows, soccer balls and young players gear visible at entrance, ivy on walls, academy crest on facade, single sprite on transparent background, retro 16-bit pixel art, Stardew Valley style, sharp chunky pixels, pixel-art-xl, clean silhouette',
    negativePrompt:
      'main stadium, big stadium bowl, large grass field, bleachers, multiple buildings, blurry, anti-aliased, 3d render, smooth shading, gradient, realistic, photograph, soft edges, top-down map',
  },
};

const tier = process.argv[2] ?? 'T3';
const preset = TIER_PRESETS[tier];
if (!preset) {
  console.error(`Unknown tier: ${tier}. Use one of: ${Object.keys(TIER_PRESETS).join(', ')}`);
  process.exit(1);
}

const params = {
  checkpoint: 'sd_xl_base_1.0.safetensors',
  positivePrompt: preset.positivePrompt,
  negativePrompt: preset.negativePrompt,
  // Landscape matches the original tier renders (3/4 frontal for T3, top-down for T0-T2).
  baseWidth: 1024,
  baseHeight: 768,
  upscaleBy: 1.5,
  upscaleMethod: 'nearest-exact',
  steps: 28,
  secondPassSteps: 18,
  cfg: 7,
  sampler: 'euler',
  scheduler: 'karras',
  seed: 220522001,
  secondPassDenoise: 0.4,
  filenamePrefix: preset.filenamePrefix,
  loraStack: [{ name: 'pixel-art-xl.safetensors', strengthModel: 1, strengthClip: 1 }],
  secondPassLoraStack: [{ name: 'pixel-art-xl.safetensors', strengthModel: 0.6, strengthClip: 0.6 }],
};

console.log(`[test-hires-fix] tier=${tier} prefix=${preset.filenamePrefix}`);
console.log(`[test-hires-fix] base=${params.baseWidth}x${params.baseHeight} → x${params.upscaleBy} = ${params.baseWidth * params.upscaleBy}x${params.baseHeight * params.upscaleBy}`);

const wf = buildHiResFixWorkflow(params);
const clientId = randomUUID();

// Queue workflow
console.log('[test-hires-fix] queueing workflow…');
const queueRes = await fetch(`${COMFYUI_URL}/prompt`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: wf, client_id: clientId }),
});
if (!queueRes.ok) {
  console.error(`[test-hires-fix] queue failed: HTTP ${queueRes.status}`, await queueRes.text());
  process.exit(1);
}
const queueData = await queueRes.json();
const promptId = queueData.prompt_id;
console.log(`[test-hires-fix] queued promptId=${promptId}`);

// Poll for completion
console.log('[test-hires-fix] polling /history…');
const startMs = Date.now();
const timeoutMs = 10 * 60 * 1000;
let entry = null;
while (Date.now() - startMs < timeoutMs) {
  await new Promise((r) => setTimeout(r, 2000));
  const histRes = await fetch(`${COMFYUI_URL}/history/${promptId}`);
  if (!histRes.ok) continue;
  const hist = await histRes.json();
  const e = hist[promptId];
  if (e?.status?.completed) {
    if (e.status.status_str === 'error') {
      console.error('[test-hires-fix] workflow errored:', JSON.stringify(e.status.messages, null, 2));
      process.exit(1);
    }
    entry = e;
    break;
  }
  const elapsed = Math.round((Date.now() - startMs) / 1000);
  process.stdout.write(`\r[test-hires-fix] elapsed=${elapsed}s`);
}
console.log('');

if (!entry) {
  console.error('[test-hires-fix] timed out waiting for completion');
  process.exit(1);
}

// Find first image
let firstImg = null;
for (const out of Object.values(entry.outputs)) {
  if (out.images && out.images.length > 0) {
    firstImg = out.images[0];
    break;
  }
}
if (!firstImg) {
  console.error('[test-hires-fix] no image in output');
  process.exit(1);
}

// Download
console.log(`[test-hires-fix] downloading ${firstImg.filename}…`);
const viewUrl = `${COMFYUI_URL}/view?filename=${encodeURIComponent(firstImg.filename)}&subfolder=${encodeURIComponent(firstImg.subfolder ?? '')}&type=${firstImg.type ?? 'output'}`;
const imgRes = await fetch(viewUrl);
if (!imgRes.ok) {
  console.error(`[test-hires-fix] download failed: HTTP ${imgRes.status}`);
  process.exit(1);
}
const buf = Buffer.from(await imgRes.arrayBuffer());

mkdirSync(OUTPUT_DIR, { recursive: true });
const outPath = join(OUTPUT_DIR, firstImg.filename);
writeFileSync(outPath, buf);

const sizeKB = Math.round(buf.length / 1024);
const finalRes = `${Math.round(params.baseWidth * params.upscaleBy)}x${Math.round(params.baseHeight * params.upscaleBy)}`;
const elapsedSec = Math.round((Date.now() - startMs) / 1000);

console.log(`[test-hires-fix] ✓ saved: ${outPath}`);
console.log(`[test-hires-fix]   final=${finalRes} size=${sizeKB}KB elapsed=${elapsedSec}s`);
