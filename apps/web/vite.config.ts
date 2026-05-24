import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// svelte-range-slider-pips ships raw .svelte sources under the "svelte"
// export condition; those use `@layer base` which breaks our Tailwind
// pipeline. The precompiled bundle isn't listed in the package's `exports`
// field, so we alias to an absolute filesystem path (which bypasses exports).
const rangeSliderCompiled = path.resolve(
  __dirname,
  'node_modules/svelte-range-slider-pips/dist/range-slider-pips.mjs'
);

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: [
      // Exact-match only: must not capture
      // `svelte-range-slider-pips/dist/range-slider-pips.css`.
      { find: /^svelte-range-slider-pips$/, replacement: rangeSliderCompiled }
    ]
  },
  ssr: {
    noExternal: ['@smt/db', '@smt/shared']
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      }
    }
  },
  test: {
    include: ['tests/**/*.test.ts']
  }
});
