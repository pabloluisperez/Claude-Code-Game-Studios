import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Schema drift guard — fails fast if the local DB is behind on migrations.
    // See tests/global-setup.ts (Sprint 26 retro action item A3).
    globalSetup: ['./tests/global-setup.ts'],
  },
});
