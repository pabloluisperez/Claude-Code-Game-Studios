// VERTICAL SLICE - NOT FOR PRODUCTION
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5180,
    proxy: {
      "/api": {
        target: process.env.SLICE_API_URL ?? "http://localhost:3010",
        changeOrigin: true,
      },
    },
  },
});
