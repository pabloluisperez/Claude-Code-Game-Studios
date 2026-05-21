/**
 * Lightweight HTTP client for ComfyUI.
 *
 * Wraps the standard endpoints we use from the MCP server:
 *   - GET  /system_stats
 *   - GET  /object_info/<NodeType>
 *   - POST /prompt           (queue a workflow)
 *   - GET  /queue            (in-flight + pending)
 *   - GET  /history/{id}     (completed job results)
 *   - GET  /view             (image bytes)
 *
 * Pure HTTP — no PIXI, no DB. Easy to test against a mock.
 */

import { randomUUID } from 'node:crypto';

export type ComfyUIClientOptions = {
  baseUrl: string;
  timeoutMs?: number;
};

export type SystemStats = {
  system: {
    os: string;
    ram_total: number;
    ram_free: number;
    comfyui_version: string;
    python_version: string;
  };
  devices: Array<{
    name: string;
    type: string;
    vram_total: number;
    vram_free: number;
  }>;
};

export type QueueResponse = {
  prompt_id: string;
  number: number;
  node_errors: Record<string, unknown>;
};

export type QueueStatus = {
  queue_running: Array<[number, string, Record<string, unknown>, ...unknown[]]>;
  queue_pending: Array<[number, string, Record<string, unknown>, ...unknown[]]>;
};

export type HistoryEntry = {
  prompt: [number, string, Record<string, unknown>, ...unknown[]];
  outputs: Record<string, {
    images?: Array<{ filename: string; subfolder: string; type: string }>;
  }>;
  status: {
    status_str: 'success' | 'error';
    completed: boolean;
    messages: unknown[];
  };
};

export class ComfyUIClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly clientId: string;

  constructor(opts: ComfyUIClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.clientId = randomUUID();
  }

  private async fetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: ctrl.signal,
        headers: {
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers ?? {}),
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`ComfyUI ${path} → HTTP ${res.status}: ${body.slice(0, 300)}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Returns stats: ComfyUI version, RAM, VRAM, devices. */
  async getSystemStats(): Promise<SystemStats> {
    return this.fetch<SystemStats>('/system_stats');
  }

  /** Returns the schema (incl. enum values) of a single node type. */
  async getObjectInfo(nodeType: string): Promise<Record<string, unknown>> {
    return this.fetch(`/object_info/${encodeURIComponent(nodeType)}`);
  }

  /** Convenience: list checkpoints (model files) discovered by ComfyUI. */
  async listCheckpoints(): Promise<string[]> {
    const info = (await this.getObjectInfo('CheckpointLoaderSimple')) as {
      CheckpointLoaderSimple?: {
        input?: { required?: { ckpt_name?: [string[], ...unknown[]] } };
      };
    };
    return info.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
  }

  /** Convenience: list LoRAs. */
  async listLoras(): Promise<string[]> {
    const info = (await this.getObjectInfo('LoraLoader')) as {
      LoraLoader?: {
        input?: { required?: { lora_name?: [string[], ...unknown[]] } };
      };
    };
    return info.LoraLoader?.input?.required?.lora_name?.[0] ?? [];
  }

  /** Convenience: list samplers + schedulers. */
  async listSamplers(): Promise<{ samplers: string[]; schedulers: string[] }> {
    const info = (await this.getObjectInfo('KSampler')) as {
      KSampler?: {
        input?: {
          required?: {
            sampler_name?: [string[], ...unknown[]];
            scheduler?: [string[], ...unknown[]];
          };
        };
      };
    };
    return {
      samplers: info.KSampler?.input?.required?.sampler_name?.[0] ?? [],
      schedulers: info.KSampler?.input?.required?.scheduler?.[0] ?? [],
    };
  }

  /**
   * Queue a workflow for execution. The workflow is the standard ComfyUI
   * "prompt" JSON: a graph keyed by node id.
   */
  async queueWorkflow(workflow: Record<string, unknown>): Promise<QueueResponse> {
    return this.fetch<QueueResponse>('/prompt', {
      method: 'POST',
      body: JSON.stringify({ prompt: workflow, client_id: this.clientId }),
    });
  }

  /** Current queue (running + pending). */
  async getQueueStatus(): Promise<QueueStatus> {
    return this.fetch<QueueStatus>('/queue');
  }

  /** History for a specific prompt id. Empty object if not finished yet. */
  async getHistory(promptId: string): Promise<Record<string, HistoryEntry>> {
    return this.fetch(`/history/${encodeURIComponent(promptId)}`);
  }

  /**
   * Poll for completion of a prompt. Resolves with the HistoryEntry once
   * `status.completed === true`. Throws on timeout or status='error'.
   */
  async waitForComplete(promptId: string, opts: { intervalMs?: number; totalTimeoutMs?: number } = {}): Promise<HistoryEntry> {
    const interval = opts.intervalMs ?? 1500;
    const timeout = opts.totalTimeoutMs ?? 5 * 60_000;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const hist = await this.getHistory(promptId);
      const entry = hist[promptId];
      if (entry?.status?.completed) {
        if (entry.status.status_str === 'error') {
          throw new Error(`ComfyUI workflow ${promptId} ERRORED — see /history/${promptId} for messages`);
        }
        return entry;
      }
      await new Promise((r) => setTimeout(r, interval));
    }
    throw new Error(`ComfyUI workflow ${promptId} timed out after ${timeout}ms`);
  }

  /**
   * Fetch raw image bytes from a completed workflow.
   * Returns Uint8Array — caller writes to disk or processes.
   */
  async fetchImage(filename: string, subfolder = '', type: 'output' | 'temp' | 'input' = 'output'): Promise<Uint8Array> {
    const params = new URLSearchParams({ filename, subfolder, type });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/view?${params.toString()}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new Error(`ComfyUI /view → HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The client_id used in queueWorkflow — useful for WebSocket listeners. */
  getClientId(): string {
    return this.clientId;
  }
}
