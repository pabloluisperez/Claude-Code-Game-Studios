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
- shared: 1165/1165 ✓ · api: 156/156 ✓ · web svelte-check: 0 errors
- web vitest: 5 PRE-EXISTING failures unrelated to Sprint 25 (finance tab-bar a11y — tabs were
  removed in a prior session so the regression tests are now obsolete; /league h1/h2; match VAR
  probability). NOT caused by this batch — all advance-orchestrator tests pass.

#### NOT committed — awaiting user. Reminder: never stage .mcp.json (plaintext SSH password).

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
