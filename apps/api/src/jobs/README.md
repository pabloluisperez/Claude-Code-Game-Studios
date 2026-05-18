# BullMQ Jobs

Add new job workers here. Each worker lives in its own file.

## Adding a Worker

```ts
// apps/api/src/jobs/my-worker.ts
import { Worker } from 'bullmq';
import { redis } from '../lib/redis.js';

new Worker(
  'queue-name',
  async (job) => {
    // Do work — no side effects in the simulation engine
    // Call services from modules/, not direct DB queries
  },
  { connection: redis, concurrency: 1 }
);
```

Register the queue in `queues.ts` and import the worker in `server.ts`.

## Current Queues

| Queue | Schedule | Purpose |
|-------|----------|---------|
| `season-tick` | Daily 04:00 | Advance world clock, age players, tick injuries |
