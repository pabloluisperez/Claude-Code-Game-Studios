# Active Session — Sprint 25 kickoff (v1.1 debt cleanup)

Pablo 2026-05-27. Survives context compaction — read this to resume.

## Goal

Sprint 25 (2026-05-26 → 2026-06-09): Close ALL v1.1 backlog from Sprints 22-24.

### Stories created (2026-05-27)
All 8 Must Have stories in `production/sprints/stories/sprint-25/`:
- [x] 25-1: Drizzle snapshot drift reset (0.5d) — BLOCKS 25-2
- [x] 25-2: Free-agent contractStatus + migration 0030 backfill (0.5d) — blocked by 25-1
- [x] 25-3: Market windows lifecycle (transfer_window_open event) (1.0d) — completed 2026-05-29
- [x] 25-4: Offer service unit tests + frontend wire-up — completed 2026-05-29
- [x] 25-5: AI club rotation BullMQ worker — completed 2026-05-29
- [x] 25-6: Counter-offer UI flow en /scouting — completed 2026-05-29
- [x] 25-7: tickAllClubsWithActiveUpgrades wire-up — completed 2026-05-29
- [x] 25-8: GDPR data-export endpoint — completed 2026-05-29

### Sprint 25 CLOSED 2026-05-29 (all 8 Must Have done, piloto automático batch)
Implemented in parallel by web-backend + web-frontend specialists, then orchestrator-verified.
- **25-7**: new helper `apps/web/src/lib/server/ai-clubs-stadium-tick.ts` ticks AI clubs' obras
  (player club already ticked by orchestrator Phase 3b); `tickAllClubsWithActiveUpgrades` gained
  `excludeClubId`. `tickClub` now zeroes `weeksRemaining` on completion (canonical state).
- **25-8**: `exportUserData` expanded to bundle clubs/players/staff/stadium/tv/sponsors/fixtures/
  standings/milestones/manager-rpg/snapshots/events; privacy page links to `/api/me/export`
  (Vite proxy /api/* → :3001 strips /api). gdpr.test.ts → 12 tests.
- **25-4**: `apps/api/tests/scouting-market/offer.test.ts` — 9 makeOffer cases (FA accept/reject,
  AI accept/counter/reject, Bosman, NO_SCOUT, INSUFFICIENT_BALANCE, ALREADY_PENDING_OFFER).
  Frontend: scouting `offer`/`respondOffer` actions + inline offer/counter modal + incoming offers.
- **25-5**: `apps/api/src/workers/ai-rotation-worker.ts` (deps-injected `processAiRotationJob`,
  seeded `${pt}:${week}:${clubId}`, error-isolated per club, ALREADY_PENDING_OFFER = no-op);
  `aiRotationQueue` registered in queues.ts. 9 DB-free unit tests.

#### Fixes applied during verification (pre-existing breakage, not from the stories)
- `packages/db/src/schema/*` had ALL relative imports corrupted `./x.js` → `./x.ts` (prior 25-1
  drizzle work) — broke `tsc`. Restored to `.js` across 18 files (45 imports).
- DB volume was missing `playthroughs.transfer_window_open` (migration 0044 never applied) —
  applied `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. Was failing 90 api tests.
- `@smt/db` now re-exports `isNull`/`isNotNull` (worker needed it).
- advance-orchestrator ptUpdate `.set()` cast fixed to a typed literal (was a bad
  `Parameters<…>[1]` cast from 25-3).

#### Verification (Postgres+Redis via docker compose, DATABASE_URL :5433)
- shared: 1165/1165 ✓ · api: 156/156 ✓ · web: 217/217 ✓ (5 todo) · svelte-check: 0 errors
- Fixed the 5 pre-existing web reds (all stale guards vs deliberate prior-session changes,
  NOT regressions): 3× removed obsolete /finance + /league tab-bar a11y guards (tab bars
  were removed → sidebar-driven nav; /league `view` state is now dead); 1× league h1 became
  dynamic divisionName + h2 gained `text-sm` (relaxed regexes to assert heading structure);
  1× VAR rate intentionally bumped 8%→18% (updated assertion + renamed test).

#### COMMITTED + PUSHED to origin/project/SoccerManagerTotal (2026-05-29)
- 61f7f4b feat(sprint-25): close v1.1 backlog (83 files, .mcp.json + scratch .cjs excluded)
- 1b8852e test(web): fix 2 pre-existing test-drift reds (VAR rate, league headings)
- 22a6450 docs(retro): Sprint 25 retrospective

---

## Sprint 26 kickoff (2026-05-29) — piloto automático

### Phase A — retro action items (DONE, committed 687f3e1)
- A1 ✅ `.mcp.json` → `${SSH_BOSGAME_PASSWORD}`; untracked + gitignored; `.mcp.json.example` added.
      ⚠️ Password still in git HISTORY — user must rotate the real SSH credential on the server
      and (optionally) scrub history. And `export SSH_BOSGAME_PASSWORD=...` before next CC restart
      or the ssh-bosgame MCP server won't connect.
- A2 ✅ `typecheck` task in turbo + api/web/shared scripts; CI runs `pnpm typecheck` (real gate,
      replacing `pnpm build` which skipped web/shared type errors).
- A3 ✅ vitest globalSetup schema guard (apps/api/vitest.config.ts + tests/global-setup.ts).
- A4 ✅ removed dead `view` $state in /league.
- A5 ✅ sprint-status.yaml reconciled to Sprint 25 closed.
- Verified: pnpm typecheck 3/3 clean; shared 1165, api 156, web 217 — all green.

### Phase B — Sprint 26 Must-Have COMPLETE (2026-05-29, piloto automático)
All 8 Must Have done + verified. shared 1199 · api 156 · web 217 · typecheck 3/3 · 0 errors.
48 narrative tests (engine 14 + qa 15 + golden 19).

- **26-1**: ADR-032 (Accepted) — deterministic generator. ADR-004 + 025-028 → Superseded.
  ⚠️ KEY: LLM integration DISCARDED for the project, NOT deferred (Pablo correction this
  session). The "LLM-optional future" framing was removed from ADR-032. Reopening = new ADR.
- **26-2**: GDD `narrative-generator.md` → Approved. systems-index reconciled (narrative-ai
  row replaced; ADR-004 Superseded, ADR-032 Accepted).
- **26-3**: `requiredVars` on every group (types.ts); slot helpers in engine.ts
  (`extractSlots`, `coverageGaps`, `allReferencedVariables`, `referencedVocabCategories`);
  `''` fallback documented. Exported from @smt/shared.
- **26-4**: vocab.ts — all categories ≥8; new axes (rumor_source/verb, adj_rumor, noun_board,
  adj_board_high/low, noun_finance). Singularized subjects for verb agreement.
- **26-5**: library.ts +6 groups: rumor, transferWindow (open/close), sponsorRenewal,
  contractRenewal, promotionRelegation, boardConfidence. `ALL_TEMPLATE_GROUPS` registry.
  Spanish gender/number agreement fixed (Triunfo/revés/Correctivo/Un final; "confianza" for
  feminine board adjectives).
- **26-6**: advance-orchestrator Phase 6c derby press (same-city heuristic, NO schema change
  per plan mitigation) + Phase 6d rumor mill (seeded gate ~40%, window-open, transfer-listed).
- **26-7**: Phase 6e transfer-window open/close blurb. Audit doc
  `production/qa/narrative-hardcoded-audit-2026-05-29.md` — 4 remaining inline strings are
  operational data notifications (no covering group). sponsor/contract/promo/board groups
  ready but emitted elsewhere (decision handlers / rollover) → future wiring.
- **26-8**: golden snapshots (19) + qa suite (slot-coverage, determinism, denylist, variety
  enumeration ≥200 high-freq / documented floors rare, tonal no-leak, fallback).

### Sprint 26 Should/Nice + playtest UX COMPLETE (2026-05-29) — commits afa6dc5 + (next)
- Inbox UX (playtest Pablo): ambient noise filter (mid suprimido, good news 1/4 semanas,
  `week` param), bad news rojo+negrita (tono por templateKey en inbox), cuadro "Eventos
  actuales" boxed. +6 tests ambient.
- 26-NH1: tab "🗞️ Rumores" en /inbox (filtra rumor:*). rumorCount $derived.
- 26-9: ambient-staff renderiza via renderNarrative (3 variantes/bucket low+high, seeded
  week+idHash(staffId)). Mata repetición exacta. Variedad test.
- 26-10: locale scaffolding — Locale/DEFAULT_LOCALE (types), VOCAB_BY_LOCALE+getVocab,
  LIBRARY_BY_LOCALE+getLibrary+TemplateGroupRegistry. Engine intacto. +5 locale tests.
- Verificado: typecheck 3/3 · shared 1204 · api 156 · web 223 (+5 todo).
- "Open bugs: 2" del session-start = falso positivo (ambos CLOSED Sprint 13).

NEXT: commit Should-Haves batch + push. Sprint 26 100% (Must+Should+Nice). Pendiente:
retro/milestone v1.2 cuando Pablo quiera. Verificación VISUAL del inbox no hecha en vivo.

### Previously completed (2026-05-27)
- [x] Migration 0040 + schema columns
- [x] Sidebar restructure (El club submenu + Tienda)
- [x] Remove /finance + /finance/tv-rights tab bars
- [x] /shop route (load + UI + actions)
- [x] economy-tick commercialRevenue (additive) + commercial.ts + tests
- [x] svelte-check 0 errors + 1139 shared tests pass + commit

## Part 1 — Sidebar "El club" group (order matters)

New children of "El club":
1. **Finanzas** → `/finance` (was the "Resumen" tab; now the page's main content — first, it's a summary)
2. **Patrocinadores** → `/finance?tab=patrocinadores`
3. **Abonos** → `/finance?tab=abonos`
4. **Derechos TV** → `/finance/tv-rights`
5. **Tienda** → `/shop` (NEW)
6. **Fichajes** → `/scouting`
7. **Empleados del club** → `/staff`
8. **Estadio** → `/stadium`
9. **Museo** → `/city`

Implementation: /finance already reads `?tab=` (activeTab). Keep logic; REMOVE the
visible in-page tab bar (sidebar drives the section). Same for /finance/tv-rights.

## Part 2 — Tienda (#39 economy)

### Schema (migration 0040_club_commercial.sql) — additive columns on clubs
- merch_scarf_price/stock, merch_cap_price/stock, merch_shirt_price/stock
- concession_food_price, concession_soda_price, concession_beer_price, concession_water_price
Defaults: scarf 15/cap 12/shirt 40 (price €, stock 0); food 4/soda 3/beer 5/water 2.

### Manufacture cost (economies of scale)
unitCost = max(floor, base × (1 - log10(qty)/10)). scarf base 6, cap 5, shirt 18.

### /shop route
3 merch cards (stock + price + fabricar N → manufactureStock action),
4 concession cards (price → setConcessionPrice action).

### economy-tick (ADDITIVE, isolated — new commercialRevenue line)
Home match only: merch sold = min(stock, attendance × propensity × priceFactor),
revenue += sold×price, decrement stock. Concessions: attendance × avgSpend.

## Part 1 — Sidebar "El club" group (order matters)

New children of "El club":
1. **Finanzas** → `/finance` (was the "Resumen" tab; now the page's main content — first, it's a summary)
2. **Patrocinadores** → `/finance?tab=patrocinadores`
3. **Abonos** → `/finance?tab=abonos`
4. **Derechos TV** → `/finance/tv-rights`
5. **Tienda** → `/shop` (NEW)
6. **Fichajes** → `/scouting`
7. **Empleados del club** → `/staff`
8. **Estadio** → `/stadium`
9. **Museo** → `/city`

Implementation: /finance already reads `?tab=` (activeTab). Keep logic; REMOVE the
visible in-page tab bar (sidebar drives the section). Same for /finance/tv-rights.

## Part 2 — Tienda (#39 economy)

### Schema (migration 0040_club_commercial.sql) — additive columns on clubs
- merch_scarf_price/stock, merch_cap_price/stock, merch_shirt_price/stock
- concession_food_price, concession_soda_price, concession_beer_price, concession_water_price
Defaults: scarf 15/cap 12/shirt 40 (price €, stock 0); food 4/soda 3/beer 5/water 2.

### Manufacture cost (economies of scale)
unitCost = max(floor, base × (1 - log10(qty)/10)). scarf base 6, cap 5, shirt 18.

### /shop route
3 merch cards (stock + price + fabricar N → manufactureStock action),
4 concession cards (price → setConcessionPrice action).

### economy-tick (ADDITIVE, isolated — new commercialRevenue line)
Home match only: merch sold = min(stock, attendance × propensity × priceFactor),
revenue += sold×price, decrement stock. Concessions: attendance × avgSpend.

## Status checklist — ALL DONE 2026-05-27
- [x] Migration 0040 + schema columns
- [x] Sidebar restructure (El club submenu + Tienda)
- [x] Remove /finance + /finance/tv-rights tab bars
- [x] /shop route (load + UI + actions)
- [x] economy-tick commercialRevenue (additive) + commercial.ts + tests
- [x] svelte-check 0 errors + 1139 shared tests pass + commit

## Recovery notes
- Migrations hand-authored; append _journal.json manually. NO drizzle generate.
- DATABASE_URL='postgres://smt:smt@localhost:5433/smt' for db:migrate.
- .mcp.json has plaintext SSH password — never stage it.

### Story 25-2 completed (2026-05-27)
- Extracted `classifyContractStatus()` pure function to `packages/shared/src/sim/scouting/contract-status.ts`
- Added 11 unit tests in `packages/shared/tests/scouting/contract-status.test.ts`
- Wired into `scouting-market/service.ts`: `getMarket()` and `makeOffer()` now use shared function
- Exported from `@smt/shared` index
- Migration 0030 was already applied; 0042 marked as applied (drizzle-generated reset migration can't run on hand-built DB)

### Story 25-3 completed (2026-05-29)
- Phase 0.5 added to `advance-orchestrator.ts`: resolves NOTIFY calendar events (transfer_window_open/close + auto-resolve other NOTIFY)
- `playthroughs.transferWindowOpen` persisted in the same DB transaction
- `/api/scouting/market` now returns `transferWindowOpen` boolean
- Frontend `/scouting` shows window status badge, disables Scout/Deep/Ofertar actions when closed
- 9 unit tests in `packages/shared/tests/event-system/transfer-window.test.ts`
- 1165 shared tests pass, 0 type errors

### Story 25-1 completed (implicitly)
- `pnpm db:generate` works — schema in sync with DB
- 0042 "reset" migration marked as applied (drizzle-generated DROP CONSTRAINT can't run on hand-built DB — constraints already exist)
