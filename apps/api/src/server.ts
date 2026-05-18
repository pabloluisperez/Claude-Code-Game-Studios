import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as pinoLogger } from './lib/logger.js';
import { env } from './env.js';
import { authRoutes } from './auth/routes.js';
import { clubRoutes } from './modules/clubs/routes.js';
import { createSocketServer } from './socket/index.js';
import { registerScheduledJobs } from './jobs/queues.js';

const app = new Hono()
  .use(
    cors({
      origin: 'http://localhost:5173',
      credentials: true
    })
  )
  .route('/auth', authRoutes)
  .route('/clubs', clubRoutes)
  .get('/health', (c) => c.json({ status: 'ok' }));

export type AppType = typeof app;

async function main(): Promise<void> {
  const server = serve(
    {
      fetch: app.fetch,
      port: env.PORT
    },
    (info) => {
      pinoLogger.info({ port: info.port }, 'API server started');
    }
  );

  createSocketServer(server);

  await registerScheduledJobs();
  pinoLogger.info('BullMQ jobs registered');
}

main().catch((err) => {
  pinoLogger.error(err, 'Server startup failed');
  process.exit(1);
});

export { app };
