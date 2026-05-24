import { hc } from 'hono/client';
import type { AppType } from '../../../api/src/server';

// Typed RPC client — routes map directly to apps/api Hono handlers.
// Vite proxies /api → http://localhost:3001 in dev (see vite.config.ts).
export const api = hc<AppType>(
  typeof window !== 'undefined' ? '/api' : 'http://localhost:3001'
);
