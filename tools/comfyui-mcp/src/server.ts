#!/usr/bin/env -S npx tsx
/**
 * ComfyUI MCP Server — custom-built for Cascada FC asset pipeline.
 *
 * Exposes ComfyUI HTTP capabilities as MCP tools so Claude can:
 *   1. Discover what models/LoRAs/samplers are available
 *   2. Queue txt2img workflows with our standard parameters
 *   3. Poll job status
 *   4. Fetch the resulting PNG to disk
 *
 * Configuration (env vars):
 *   - COMFYUI_URL: base URL of ComfyUI (default http://localhost:8188)
 *   - COMFYUI_OUTPUT_DIR: where to save fetched PNGs (default assets/sprites/_raw/)
 *
 * Transport: stdio (standard for Claude Code MCPs).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { ComfyUIClient } from './comfyui-client.js';
import { buildTxt2ImgWorkflow, type WorkflowParams } from './workflow-builder.js';

const COMFYUI_URL = process.env['COMFYUI_URL'] ?? 'http://localhost:8188';
const OUTPUT_DIR = process.env['COMFYUI_OUTPUT_DIR'] ?? 'assets/sprites/_raw';

const client = new ComfyUIClient({ baseUrl: COMFYUI_URL, timeoutMs: 30_000 });

const server = new Server(
  { name: 'cascada-comfyui', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

// ── Tool definitions ────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'comfyui_system_stats',
      description:
        'Get ComfyUI server stats: version, RAM, VRAM, GPU device. Useful to confirm the server is reachable and has capacity.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'comfyui_list_checkpoints',
      description:
        'List all checkpoint (model) files discovered by ComfyUI. Use this to pick the base model for txt2img.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'comfyui_list_loras',
      description:
        'List all LoRA files discovered by ComfyUI. Returns empty array if none installed.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'comfyui_list_samplers',
      description:
        'List supported KSampler `sampler_name` and `scheduler` enum values for the current ComfyUI version.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'comfyui_queue_status',
      description:
        'Get the current queue: which workflows are running, which are pending. Useful for monitoring.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'comfyui_generate_image',
      description:
        'Build + queue + wait + save a txt2img workflow. End-to-end image generation. Saves PNG to COMFYUI_OUTPUT_DIR and returns the local path. Blocks until the workflow completes (up to 5min timeout).',
      inputSchema: {
        type: 'object',
        required: [
          'checkpoint',
          'positivePrompt',
          'negativePrompt',
          'width',
          'height',
          'seed',
          'filenamePrefix',
        ],
        properties: {
          checkpoint: { type: 'string', description: 'Checkpoint filename (from comfyui_list_checkpoints).' },
          positivePrompt: { type: 'string', description: 'Positive prompt text.' },
          negativePrompt: { type: 'string', description: 'Negative prompt text.' },
          width: { type: 'integer', minimum: 64, maximum: 4096, description: 'Output width in pixels (recommend 512 for SD1.5, 1024 for SDXL).' },
          height: { type: 'integer', minimum: 64, maximum: 4096, description: 'Output height in pixels.' },
          steps: { type: 'integer', minimum: 1, maximum: 200, default: 25, description: 'Sampling steps.' },
          cfg: { type: 'number', minimum: 0, maximum: 30, default: 7.0, description: 'Classifier-free guidance scale.' },
          sampler: { type: 'string', default: 'dpmpp_2m', description: 'KSampler sampler_name (from comfyui_list_samplers).' },
          scheduler: { type: 'string', default: 'karras', description: 'KSampler scheduler.' },
          seed: { type: 'integer', description: 'Deterministic seed (use assetIdToSeed for repeatable generation).' },
          filenamePrefix: { type: 'string', description: 'Filename prefix for the saved PNG (kebab-case).' },
          loraStack: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'strengthModel', 'strengthClip'],
              properties: {
                name: { type: 'string' },
                strengthModel: { type: 'number' },
                strengthClip: { type: 'number' },
              },
            },
            description: 'Optional list of LoRAs to apply in order. Each with model + clip strength 0..1 typically.',
          },
        },
      },
    },
    {
      name: 'comfyui_fetch_image',
      description:
        'Re-fetch an image from a previously completed workflow. Use the `filename` from the workflow output. Returns local path to saved PNG.',
      inputSchema: {
        type: 'object',
        required: ['filename'],
        properties: {
          filename: { type: 'string' },
          subfolder: { type: 'string', default: '' },
          type: { type: 'string', enum: ['output', 'temp', 'input'], default: 'output' },
          saveAs: { type: 'string', description: 'Optional local filename; default uses the ComfyUI filename.' },
        },
      },
    },
  ],
}));

// ── Tool implementations ────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case 'comfyui_system_stats': {
        const stats = await client.getSystemStats();
        return ok(JSON.stringify(stats, null, 2));
      }
      case 'comfyui_list_checkpoints': {
        const checkpoints = await client.listCheckpoints();
        return ok(JSON.stringify({ checkpoints, count: checkpoints.length }, null, 2));
      }
      case 'comfyui_list_loras': {
        const loras = await client.listLoras();
        return ok(JSON.stringify({ loras, count: loras.length }, null, 2));
      }
      case 'comfyui_list_samplers': {
        const samplers = await client.listSamplers();
        return ok(JSON.stringify(samplers, null, 2));
      }
      case 'comfyui_queue_status': {
        const status = await client.getQueueStatus();
        return ok(
          JSON.stringify(
            {
              running: status.queue_running.length,
              pending: status.queue_pending.length,
              runningPromptIds: status.queue_running.map((q) => q[1]),
              pendingPromptIds: status.queue_pending.map((q) => q[1]),
            },
            null,
            2,
          ),
        );
      }
      case 'comfyui_generate_image': {
        const params = parseGenerateParams(args);
        const wf = buildTxt2ImgWorkflow(params);
        const queued = await client.queueWorkflow(wf);
        const entry = await client.waitForComplete(queued.prompt_id, { totalTimeoutMs: 5 * 60_000 });

        // Find the first image output
        let firstImg: { filename: string; subfolder: string; type: string } | undefined;
        for (const out of Object.values(entry.outputs)) {
          if (out.images && out.images.length > 0) {
            firstImg = out.images[0];
            break;
          }
        }
        if (!firstImg) {
          throw new Error(`Workflow completed but no image output found in ${queued.prompt_id}`);
        }

        const bytes = await client.fetchImage(firstImg.filename, firstImg.subfolder, firstImg.type as 'output');
        const localPath = saveImageToDisk(bytes, firstImg.filename);

        return ok(
          JSON.stringify(
            {
              promptId: queued.prompt_id,
              comfyuiFilename: firstImg.filename,
              localPath,
              sizeBytes: bytes.length,
            },
            null,
            2,
          ),
        );
      }
      case 'comfyui_fetch_image': {
        const filename = mustString(args, 'filename');
        const subfolder = typeof args['subfolder'] === 'string' ? args['subfolder'] : '';
        const type = (typeof args['type'] === 'string' ? args['type'] : 'output') as 'output' | 'temp' | 'input';
        const bytes = await client.fetchImage(filename, subfolder, type);
        const saveAs = typeof args['saveAs'] === 'string' ? args['saveAs'] : filename;
        const localPath = saveImageToDisk(bytes, saveAs);
        return ok(JSON.stringify({ localPath, sizeBytes: bytes.length }, null, 2));
      }
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof McpError) throw err;
    throw new McpError(ErrorCode.InternalError, (err as Error).message);
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function mustString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new McpError(ErrorCode.InvalidParams, `Missing required string param: ${key}`);
  }
  return v;
}

function mustNumber(args: Record<string, unknown>, key: string): number {
  const v = args[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new McpError(ErrorCode.InvalidParams, `Missing required numeric param: ${key}`);
  }
  return v;
}

function parseGenerateParams(args: Record<string, unknown>): WorkflowParams {
  const stack = Array.isArray(args['loraStack']) ? (args['loraStack'] as Array<Record<string, unknown>>) : [];
  return {
    checkpoint: mustString(args, 'checkpoint'),
    positivePrompt: mustString(args, 'positivePrompt'),
    negativePrompt: mustString(args, 'negativePrompt'),
    width: mustNumber(args, 'width'),
    height: mustNumber(args, 'height'),
    steps: typeof args['steps'] === 'number' ? (args['steps'] as number) : 25,
    cfg: typeof args['cfg'] === 'number' ? (args['cfg'] as number) : 7.0,
    sampler: typeof args['sampler'] === 'string' ? (args['sampler'] as string) : 'dpmpp_2m',
    scheduler: typeof args['scheduler'] === 'string' ? (args['scheduler'] as string) : 'karras',
    seed: mustNumber(args, 'seed'),
    filenamePrefix: mustString(args, 'filenamePrefix'),
    loraStack: stack.map((l) => ({
      name: String(l['name']),
      strengthModel: typeof l['strengthModel'] === 'number' ? (l['strengthModel'] as number) : 1.0,
      strengthClip: typeof l['strengthClip'] === 'number' ? (l['strengthClip'] as number) : 1.0,
    })),
  };
}

function saveImageToDisk(bytes: Uint8Array, filename: string): string {
  const outDir = resolve(process.cwd(), OUTPUT_DIR);
  mkdirSync(outDir, { recursive: true });
  // Sanitize filename to keep just the basename
  const safe = filename.replace(/^.*[\\/]/, '');
  const out = join(outDir, safe);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  return out;
}

// ── Boot ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

// Log to stderr (stdout is reserved for JSON-RPC).
process.stderr.write(`comfyui-mcp ready · ComfyUI=${COMFYUI_URL} · output=${OUTPUT_DIR}\n`);
