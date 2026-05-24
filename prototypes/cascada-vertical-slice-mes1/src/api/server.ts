// VERTICAL SLICE - NOT FOR PRODUCTION
// Date: 2026-05-18

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { advanceRoutes } from "./advance-routes.js";
import { matchRoutes } from "./match/match-routes.js";

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

app.route("/api/advance", advanceRoutes);
app.route("/api/matches", matchRoutes);

const PORT = Number(process.env.SLICE_API_PORT ?? 3010);

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: PORT });
  console.log(`Cascada slice API listening on :${PORT}`);
}
