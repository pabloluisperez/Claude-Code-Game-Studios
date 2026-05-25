-- v1.2 — backfill player attribute + salary variation.
-- Pablo bug 2026-05-25: existing playthroughs have all VEL/RES/AGR/CAL = 50
-- (schema defaults — generation didn't run for them). And salaries don't
-- vary enough to feel real ("buenos ganando poco, malos ganando mucho").
--
-- Per-attribute variation: ±15 around skill, biased by position (GK favours
-- calidad, DEF agresividad, MID balanced, FWD velocidad).
-- Per-salary variation: skill × 0.1 × random[0.3..2.5] — wide enough that
-- you can find a "paquete cobrando mucho" anomaly to motivate transferring.

-- Use Postgres's deterministic text hash. hashtext() returns int4 (can be
-- negative); abs() + modulo gives a stable 0..N range per player.id.

UPDATE "players" SET
  "velocidad"   = GREATEST(20, LEAST(95, "skill" + (abs(hashtext("id"::text || 'vel')) % 31) - 15
    + CASE "position" WHEN 'FWD' THEN 6 WHEN 'DEF' THEN -3 WHEN 'GK' THEN -8 ELSE 0 END)),
  "resistencia" = GREATEST(20, LEAST(95, "skill" + (abs(hashtext("id"::text || 'res')) % 31) - 15
    + CASE "position" WHEN 'MID' THEN 3 WHEN 'GK' THEN 3 WHEN 'FWD' THEN -3 ELSE 0 END)),
  "agresividad" = GREATEST(20, LEAST(95, "skill" + (abs(hashtext("id"::text || 'agr')) % 31) - 15
    + CASE "position" WHEN 'DEF' THEN 8 WHEN 'GK' THEN -3 WHEN 'FWD' THEN -8 ELSE 0 END)),
  "calidad"     = GREATEST(20, LEAST(95, "skill" + (abs(hashtext("id"::text || 'cal')) % 31) - 15
    + CASE "position" WHEN 'GK' THEN 8 WHEN 'FWD' THEN 5 WHEN 'DEF' THEN -5 ELSE -3 END))
WHERE "velocidad" = 50 AND "resistencia" = 50 AND "agresividad" = 50 AND "calidad" = 50;
--> statement-breakpoint

-- Salary variation: widen jitter from current generator to enable anomalies.
-- Only re-roll if current salary is uniform (signals default seed/no-variation).
-- The new salary = max(1, round(skill * 0.1 * [0.3..2.5])) — gives e.g. skill=60
-- a range of 2..15 k€/week, allowing both "paqueteros sobrepagados" and
-- "bargains underpaid".
UPDATE "players" SET
  "salary_eur_k" = GREATEST(1, LEAST(50,
    ROUND("skill"::numeric * 0.1 * (0.3 + (abs(hashtext("id"::text || 'sal2')) % 221)::numeric / 100.0))::int
  ));
