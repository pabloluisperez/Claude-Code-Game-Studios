// VERTICAL SLICE - NOT FOR PRODUCTION
// Date: 2026-05-18

import { Hono } from "hono";
import { z } from "zod";
import { advanceOneWeek } from "./advance.js";
import * as repo from "../db/repo.js";
import { allocateSkillPoint, type ManagerSkillId, type ManagerState } from "../sim/manager-rpg.js";

export const advanceRoutes = new Hono();

const AdvanceBody = z.object({
  playthroughId: z.string().min(1),
  decisions: z.record(z.string(), z.number()).default({}),
});

advanceRoutes.post("/", async (c) => {
  const body = AdvanceBody.parse(await c.req.json());
  try {
    const result = await advanceOneWeek(body.playthroughId, body.decisions);
    return c.json(result);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

advanceRoutes.get("/state/:playthroughId", async (c) => {
  const id = c.req.param("playthroughId");
  const playthrough = await repo.getPlaythrough(id);
  if (!playthrough) return c.json({ error: "not_found" }, 404);
  const snapshot = await repo.loadLatestSnapshot(id);
  return c.json({
    playthrough,
    snapshot,
  });
});

advanceRoutes.get("/standings/:playthroughId", async (c) => {
  const id = c.req.param("playthroughId");
  const standings = await repo.getStandings(id);
  return c.json(standings);
});

advanceRoutes.get("/staff-messages/:playthroughId", async (c) => {
  const id = c.req.param("playthroughId");
  const limit = Number(c.req.query("limit") ?? 50);
  const messages = await repo.getStaffMessages(id, limit);
  return c.json(messages);
});

advanceRoutes.get("/fixtures/:playthroughId/week/:week", async (c) => {
  const id = c.req.param("playthroughId");
  const week = Number(c.req.param("week"));
  const fixtures = await repo.getFixturesForWeek(id, week);
  return c.json(fixtures);
});

const AllocateBody = z.object({
  playthroughId: z.string().min(1),
  skill: z.enum(["tactics", "finance"]),
});

advanceRoutes.post("/allocate-skill", async (c) => {
  const body = AllocateBody.parse(await c.req.json());
  const latest = await repo.loadLatestSnapshot(body.playthroughId);
  if (!latest) return c.json({ error: "no_snapshot" }, 400);
  const mgr = latest.managerState as ManagerState | null;
  if (!mgr) return c.json({ error: "no_manager_state" }, 400);
  const updated = allocateSkillPoint(mgr, body.skill as ManagerSkillId);
  await repo.saveSnapshot(
    body.playthroughId,
    latest.week,
    latest.state,
    latest.delayedBuffer,
    updated,
  );
  return c.json({ managerState: updated });
});
