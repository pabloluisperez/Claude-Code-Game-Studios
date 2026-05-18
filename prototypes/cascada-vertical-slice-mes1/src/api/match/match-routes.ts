// VERTICAL SLICE - NOT FOR PRODUCTION
// Date: 2026-05-18

import { Hono } from "hono";
import { z } from "zod";
import { decideMatch, startMatch } from "./match-controller.js";

export const matchRoutes = new Hono();

const StartBody = z.object({
  playthroughId: z.string().min(1),
});

matchRoutes.post("/start", async (c) => {
  const body = StartBody.parse(await c.req.json());
  try {
    const result = await startMatch(body.playthroughId);
    return c.json(result, 201);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

const DecisionBody = z.object({
  sessionId: z.string().min(1),
  decision: z
    .object({
      side: z.enum(["home", "away"]),
      playerOutId: z.string(),
      // slice — production validates against PlayerStats schema; here we trust input
      playerInStats: z.record(z.string(), z.any()),
    })
    .nullable(),
  playerDecisionsForCascade: z.record(z.string(), z.number()).optional(),
});

matchRoutes.post("/decision", async (c) => {
  const body = DecisionBody.parse(await c.req.json());
  try {
    const result = await decideMatch({
      sessionId: body.sessionId,
      // Cast — slice trusts the client; production would validate full PlayerStats shape
      decision: body.decision as Parameters<typeof decideMatch>[0]["decision"],
      playerDecisionsForCascade: body.playerDecisionsForCascade ?? {},
    });
    return c.json(result);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});
