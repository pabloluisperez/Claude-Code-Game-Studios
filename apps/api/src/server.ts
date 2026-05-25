import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as pinoLogger } from './lib/logger.js';
import { captureException, initObservability } from './lib/observability.js';
import { env } from './env.js';
import { authRoutes } from './auth/routes.js';
import { clubRoutes } from './modules/clubs/routes.js';
import { createEconomyRoutes } from './modules/economy/routes.js';
import { createEventRoutes } from './modules/event-system/routes.js';
import { createMatchRoutes } from './modules/match/routes.js';
import { createManagerRpgRoutes } from './modules/manager-rpg/routes.js';
import { createStaffRoutes } from './modules/staff/routes.js';
import { createTVRightsRoutes } from './modules/tv-rights/routes.js';
import { createMeRoutes } from './modules/me/routes.js';
import { createSocketServer } from './socket/index.js';
import { registerScheduledJobs, matchQueue } from './jobs/queues.js';
import { loadCatalog as loadStadiumCatalog } from './modules/stadium-upgrades/catalog.js';

const app = new Hono()
  .use(
    cors({
      origin: 'http://localhost:5173',
      credentials: true
    })
  )
  // Story 14-7: unhandled errors propagate to Sentry via the wrapper. Hono's
  // .onError fires for HTTPException + uncaught throws inside handlers.
  .onError((err, c) => {
    captureException(err, {
      path: c.req.path,
      method: c.req.method,
    });
    if (err.name === 'HTTPException') throw err;
    return c.json({ error: 'Internal server error' }, 500);
  })
  .route('/auth', authRoutes)
  .route('/clubs', clubRoutes)
  .route('/economy', createEconomyRoutes())
  .route('/events', createEventRoutes())
  .route('/matches', createMatchRoutes({ matchQueue }))
  .route('/manager-rpg', createManagerRpgRoutes())
  .route('/staff', createStaffRoutes())
  .route('/tv', createTVRightsRoutes())
  .route('/me', createMeRoutes())
  .get('/health', (c) => c.json({ status: 'ok' }));

export type AppType = typeof app;

async function main(): Promise<void> {
  initObservability();

  // Load static catalogs before listening. Fails fast on invariant violation
  // (per ADR-029 §D3: stadium-upgrades catalog must satisfy 40-item + slug-unique
  // + 2-per-(track,tier) invariants).
  const stadiumCatalog = await loadStadiumCatalog();
  pinoLogger.info({ stadiumCatalogItems: stadiumCatalog.length }, 'Stadium upgrades catalog loaded');

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
  captureException(err, { phase: 'startup' });
  process.exit(1);
});

export { app };
