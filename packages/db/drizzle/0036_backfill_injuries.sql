-- v1.2 Sprint 27 — backfill narrative injuries (Pablo 2026-05-26
-- "se me ha lesionado un jugador y luego estaba disponible para el 11 inicial").
-- Hand-authored per project convention.
--
-- Root cause: applyInjuryEvent() was defined but never called. Injury events
-- appeared in match_outcome_data narratively but never updated player rows.
-- Phase persistence is now wired (match-day-runner applyInjuries), but pre-fix
-- injuries left players in inconsistent state: availability='available' with
-- recent injury events.
--
-- This migration looks at the LATEST played fixture per club and:
--   - For each 'injury' event with a playerId
--   - If that player is currently 'available' (still inconsistent)
--   - Set availability='injured' + injuredUntilWeek = fx.week + 1..6 weeks
--     (deterministic via hashtext)
--
-- Future injuries from new matches will persist correctly via the live code path.

UPDATE "players" p
SET
  "availability" = 'injured',
  "injured_until_week" = sub.week + 1 + (abs(hashtext(p."id"::text || ':inj')) % 6)
FROM (
  SELECT DISTINCT ON (e->>'playerId')
    (e->>'playerId')::uuid AS player_id,
    f.week
  FROM "fixtures" f,
       jsonb_array_elements(COALESCE(f."match_outcome_data"->'events', '[]'::jsonb)) AS e
  WHERE f."status" = 'played'
    AND e->>'type' = 'injury'
    AND e->>'playerId' IS NOT NULL
  ORDER BY e->>'playerId', f.week DESC
) AS sub
WHERE p."id" = sub.player_id
  AND p."availability" = 'available';
