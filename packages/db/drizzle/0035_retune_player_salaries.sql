-- v1.2 Sprint 27 — economy retune (Pablo 2026-05-25 "muy difícil compensar pérdidas").
-- Hand-authored per project convention.
--
-- Root cause: migration 0032 used skill × 0.1 × variation[0.3..2.5] → mean ~1.5× of
-- skill×0.1, producing avg salary ~7.7 €K/sem for Quinta squad (= ~32K€/month per
-- player = Champions League). Real Quinta wages are ~100-400€/sem. We were 30-40×
-- off.
--
-- New formula: salary = max(1, round(skill × 0.04 × variation))
--   variation ∈ [0.3, 2.5] same as 0032 (paquetes / chollos preserved)
--   mean salary @ skill=55 → 55 × 0.04 × 1.4 ≈ 3.1 €K (≈ 12K€/month — real Quinta range)
--   max @ skill=80 × 2.5 → 8 €K (≈ 32K€/month — top players still rewarded)
--   min @ skill=40 × 0.3 → 1 €K
--
-- Applies to ALL players (every club). AI clubs were also overpaying, so this
-- corrects the simulated league economy at the same time.

UPDATE "players" SET
  "salary_eur_k" = GREATEST(1, LEAST(20,
    ROUND("skill"::numeric * 0.04 * (0.3 + (abs(hashtext("id"::text || 'sal3')) % 221)::numeric / 100.0))::int
  ));
