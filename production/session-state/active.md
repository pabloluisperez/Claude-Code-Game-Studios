# Active Session — El club restructure + Tienda (#39)

Pablo 2026-05-27. Survives context compaction — read this to resume.

## Goal

1. **Sidebar restructure**: split /finance tabs into "El club" submenu items + add Tienda.
2. **Tienda (#39)**: merchandise stock + concessions economy subsystem.

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
