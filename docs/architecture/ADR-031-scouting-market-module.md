# ADR-031: Scouting & Transfer Market Module — Schema, API, and AI Club Rotation

## Status

Proposed (v1.1 design — 2026-05-24 autonomous authoring)

## Date

2026-05-24 — created alongside `scouting-market.md` GDD.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Backend (Drizzle schema + Hono routes + BullMQ event triggers) + Frontend (SvelteKit `/scouting`) |
| **Knowledge Risk** | LOW — reuses existing patterns from player-management + event-system |
| **References Consulted** | scouting-market.md, ADR-008 (World Clock), ADR-015 (Special Event Decision Schema), ADR-016 (Player Lifecycle), ADR-029 (Stadium Upgrades pattern reference) |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | Migration 0027 clean apply; AI club rotation deterministic with seed; scout delay countdown integrates with world clock |

## Context

`scouting-market.md` (v1.1) introduces a new system that:
- Reads existing `scouting_points` + `scouting_network_level` to gate information visibility
- Tracks per-player visibility tiers (T0/T1/T2/T3) per manager per transfer window
- Implements free agent + AI club auction transfer flows
- Runs an AI club rotation mini-loop at each `transfer_window_open` event
- Defines a new Scout Director role in staff-system.md

Without this ADR, the implementing programmer must invent: where the new schema lives (visibility tracking, pending offers, saved searches), how the AI club rotation runs deterministically, how the auction state machine handles concurrent operations, and how the scout delay countdown integrates with the world clock advance pipeline.

## Decision

### D1. Module location & naming

New module: `apps/api/src/modules/scouting-market/`. Follows the established pattern from stadium-upgrades (ADR-029):

```
apps/api/src/modules/scouting-market/
├── routes.ts             # Hono routes at /api/scouting
├── service.ts            # Domain logic
├── repo.ts               # Drizzle queries
├── ai-club-rotation.ts   # AI club mini-loop (§3.5 of GDD)
└── visibility.ts         # F1 tier computation

packages/shared/src/sim/scouting/
├── formulas.ts          # F2-F6 pure functions
├── auction.ts           # F3 acceptance + counter-offer logic
└── types.ts             # Type contracts

packages/db/src/schema/scouting-market.ts  # Drizzle tables
```

### D2. Database schema (Drizzle, migration 0027+)

```typescript
// packages/db/src/schema/scouting-market.ts

// Per-manager-per-window scouting state
export const scoutingActions = pgTable('scouting_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').references(() => clubs.id).notNull(),
  playerId: uuid('player_id').references(() => players.id).notNull(),
  windowId: uuid('window_id').notNull(), // FK to transfer_window event
  actionType: text('action_type').notNull(), // 'scout' | 'deep_scout'
  costPaidEurK: integer('cost_paid_eur_k').notNull(),
  initiatedAt: timestamp('initiated_at').notNull().defaultNow(),
  completesAtWeek: integer('completes_at_week').notNull(),
  completedAt: timestamp('completed_at'),
  refundedEurK: integer('refunded_eur_k'),
  status: text('status').notNull(), // 'pending' | 'completed' | 'refunded' | 'expired'
});

// Pending offers (free agent + AI club)
export const transferOffers = pgTable('transfer_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  buyerClubId: uuid('buyer_club_id').references(() => clubs.id).notNull(),
  sellerClubId: uuid('seller_club_id').references(() => clubs.id), // null for free agents
  playerId: uuid('player_id').references(() => players.id).notNull(),
  windowId: uuid('window_id').notNull(),
  feeEurK: integer('fee_eur_k').notNull(),
  wageOfferEurKWeek: integer('wage_offer_eur_k_week').notNull(),
  contractWeeks: integer('contract_weeks').notNull(),
  status: text('status').notNull(), // 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired'
  counterOfferEurK: integer('counter_offer_eur_k'),
  createdAt: timestamp('created_at').defaultNow(),
  resolvedAt: timestamp('resolved_at'),
  bidNumber: integer('bid_number').notNull(), // 1..MAX_BIDS_PER_PLAYER
});

// Saved searches (UX persistence)
export const savedSearches = pgTable('saved_searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').references(() => clubs.id).notNull(),
  name: text('name').notNull(),
  filtersJson: jsonb('filters_json').notNull(), // serialized filter config
  createdAt: timestamp('created_at').defaultNow(),
});

// Hidden AI club bargain factors (per-window, per-club)
export const aiClubWindowState = pgTable('ai_club_window_state', {
  clubId: uuid('club_id').references(() => clubs.id).notNull(),
  windowId: uuid('window_id').notNull(),
  bargainFactor: real('bargain_factor').notNull(), // [0.85, 1.20]
  transferBudgetUsedEurK: integer('transfer_budget_used_eur_k').notNull().default(0),
  rotationCompleted: boolean('rotation_completed').notNull().default(false),
});

// Player-buyer rejection log (prevents re-scouting after hard reject)
export const playerBuyerRejections = pgTable('player_buyer_rejections', {
  playerId: uuid('player_id').references(() => players.id).notNull(),
  buyerClubId: uuid('buyer_club_id').references(() => clubs.id).notNull(),
  windowId: uuid('window_id').notNull(),
  reason: text('reason').notNull(), // 'price_too_low' | 'not_for_sale_this_window' | 'manual_withdraw'
});
```

Migration 0027 also adds composite indexes for fast queries:
- `(window_id, club_id)` on scouting_actions
- `(buyer_club_id, status, window_id)` on transfer_offers
- `(club_id, name)` UNIQUE on saved_searches

### D3. API surface (Hono routes at `/api/scouting`)

```
GET    /api/scouting/pool                  → filtered, paginated player pool with tier info
GET    /api/scouting/player/:id            → full info for player at current tier
POST   /api/scouting/scout                 → { playerId } initiate T1→T2 scout
POST   /api/scouting/deep-scout            → { playerId } initiate T2→T3 scout
POST   /api/scouting/offer                 → { playerId, feeEurK, wageOfferEurKWeek, contractWeeks } make offer
POST   /api/scouting/offer/:id/accept-counter → accept the counter-offer
POST   /api/scouting/offer/:id/withdraw    → withdraw pending offer
GET    /api/scouting/offers                → list pending offers for this club this window
GET    /api/scouting/searches              → list saved searches
POST   /api/scouting/searches              → { name, filters } save
DELETE /api/scouting/searches/:id          → delete saved
```

HTTP error codes per scouting-market.md §5:
- 400 `WINDOW_CLOSED` (any action outside transfer window)
- 400 `INVALID_PREREQ` (deep-scout without T2 prereq)
- 402 `INSUFFICIENT_BALANCE` (cost exceeds balance)
- 403 `INSUFFICIENT_STAFF` (deep-scout without Scout Director T2+)
- 404 `PLAYER_NOT_FOUND`
- 409 `MAX_BIDS_REACHED`
- 410 `PLAYER_GONE` (player signed elsewhere between scout and offer)

### D4. World Clock integration

The world clock tick pipeline (ADR-008) calls `scoutingMarketService.tick()` once per week. Logic:

```typescript
async function tick(currentWeek: number) {
  // 1. Resolve pending scouts that complete this week
  const completing = await repo.getScoutsCompletingAtWeek(currentWeek);
  for (const action of completing) {
    if (windowStillOpen(action.windowId, currentWeek)) {
      await repo.markCompleted(action.id);
    } else {
      // §5.9: refund 50%
      await repo.markRefunded(action.id, action.costPaidEurK * 0.5);
      await economy.credit(action.clubId, action.costPaidEurK * 0.5, 'scouting_refund');
    }
  }

  // 2. Time out counter-offers
  await repo.expireStaleCounterOffers(currentWeek);

  // 3. On transfer_window_open event (separate trigger, not weekly):
  //    Trigger AI club mini-loop (D5).
}
```

### D5. AI club rotation worker

Listens to `transfer_window_open` event (ADR-015). Single BullMQ job per window open: `scouting-market:window-rotation`. Workflow:

```typescript
async function runAiClubRotation(windowId: string) {
  const aiClubs = await getAllAiClubs();

  for (const club of aiClubs) {
    // Use deterministic RNG seeded by (worldSeed, windowId, clubId)
    const rng = seedrandom(`${worldSeed}-${windowId}-${club.id}`);

    // Generate hidden bargain factor for this window
    const bargainFactor = 0.85 + rng.quick() * 0.35; // [0.85, 1.20]
    await repo.upsertAiClubWindowState(club.id, windowId, bargainFactor);

    // §3.5 step 1: Mark for_sale candidates
    for (const player of club.roster) {
      if (player.age > AGE_DECLINE_THRESHOLD && club.roster.length > MIN_ROSTER_SIZE) {
        if (rng.quick() < FOR_SALE_RATIO_AGE_DECLINE) {
          await markForSale(player);
        }
      }
      if (player.morale < LOW_MORALE_THRESHOLD && rng.quick() < TRANSFER_REQUEST_PROB) {
        await markForSale(player);
      }
    }

    // §3.5 step 2: Buy decisions
    let remainingBudget = club.financialBalance * AI_TRANSFER_BUDGET_PCT;
    const positionsNeeded = computeSquadGaps(club);
    for (const pos of positionsNeeded) {
      const candidate = pickRandomInBand(rng, club.division, pos, club.targetOvrBand);
      if (candidate && candidate.transferValue <= remainingBudget) {
        await executeAiTransfer(club.id, candidate.id, candidate.transferValue);
        remainingBudget -= candidate.transferValue;
      }
    }

    // §3.5 step 3: Youth promotion if below TARGET
    while (club.roster.length < TARGET_ROSTER_SIZE) {
      await promoteYouthFromWorldGen(club);
    }

    await repo.markRotationCompleted(club.id, windowId);
  }
}
```

**Determinism is critical** — same `worldSeed + windowId + clubId` → same rng sequence → same rotation outcome. Tests use fixed seeds (AC-SCM-22).

### D6. Visibility tier computation (F1)

`packages/shared/src/sim/scouting/visibility.ts` is pure — given a player + manager state + window, returns T0/T1/T2/T3. Called from both server (API filtering responses) and frontend (UI rendering, but server is source-of-truth — frontend never decides visibility on its own).

Server-side filtering: `GET /api/scouting/pool` only returns fields appropriate for each player's tier. Fields beyond the tier are stripped from response **before** serialization — no client-side info leak.

### D7. AI club buy/sell consistency

Critical invariant: AI club rotation MUST run BEFORE the manager can interact with the window. Sequence:

```
1. transfer_window_open event fires (ADR-015)
2. BullMQ job 'scouting-market:window-rotation' enqueued (D5)
3. Manager UI is blocked from /api/scouting/* until job completes
   - 503 SERVICE_UNAVAILABLE with retry-after header
   - Frontend polls until ready (~5-15 seconds expected job time)
4. Once rotation completes, manager can browse + scout + offer
```

Use a `scouting_market_window_status` table to track readiness:

```typescript
export const windowStatus = pgTable('scouting_market_window_status', {
  windowId: uuid('window_id').primaryKey(),
  rotationStartedAt: timestamp('rotation_started_at'),
  rotationCompletedAt: timestamp('rotation_completed_at'),
});
```

### D8. Scouting Director — NO new role (extension only)

**Correction (post-draft)**: `scouting_director` already EXISTS as one of the 6 base staff roles in `staff-system.md` with T1/T2/T3 tiers + cost (0.50/1.00/2.00 €K/sem). This ADR does **NOT** add a new role — it extends what existing tiers enable.

**No schema migration needed for the staff role.** The role + its skill column already exist. What changes:

1. Service `staffSystem.getScoutDirectorTier(clubId)` is **referenced** by scouting-market service. If not already exported, add it (returns 0..3, where 0 = no director hired).
2. Visibility tier function (story 002) uses this getter to gate T2→T3 transitions.
3. Cost discount logic (story 003) uses tier 3 boolean to apply -20% scout cost.

If the staff-system module doesn't expose `getScoutDirectorTier` cleanly, story 004 of this epic adds the export. No DB migration needed for it; just a service method.

### D9. Frontend integration

New SvelteKit route at `apps/web/src/routes/scouting/+page.svelte`. Mounts a pool browser + saved searches sidebar + offer modal. Subscribes to Socket.IO events:
- `scouting:scout_complete` → page invalidates, tier-info refreshes
- `scouting:offer_resolved` → modal shows accept/reject/counter
- `scouting:window_rotation_complete` → unblock UI from 503 spinner

Use existing PixiJS (ADR-021) only for player portrait sprites if those exist; otherwise pure DOM (faster — there's no canvas value-add for a list view).

### D10. Cross-app contract

Frontend types live in `packages/shared/src/types/scouting.ts`. Includes:

```typescript
export type PoolPlayer = {
  id: string;
  // T0 fields (always present)
  name: string; age: number; position: string; currentClub: string | null; contractStatus: 'contract' | 'free_agent';
  // T1 fields
  ovrBand?: string; transferValueBand?: string;
  // T2 fields
  ovrEstimate?: number; transferValueEstimate?: number; moraleBand?: 'low' | 'mid' | 'high';
  // T3 fields
  ovrExact?: number; transferValueExact?: number; moraleExact?: number; fitnessExact?: number; recentForm?: string[];
  // Always
  visibilityTier: 0 | 1 | 2 | 3;
};
```

Server strips unauthorized fields per visibility tier. Frontend can safely render whatever is present without checking tier — already filtered.

## Consequences

**Positive:**
- Clean module separation; scouting-market is a layer ON TOP of player-management, not a replacement
- Determinism preserved via seeded rng for AI club rotation
- Server-authoritative visibility (no client can cheat by inspecting unsent fields)
- Reuses existing cascade-engine scouting nodes — no new sim work
- Free agent + AI club auction handled with consistent FSM pattern (similar to stadium-upgrades)

**Negative:**
- AI club rotation job adds latency on transfer window open (~5-15s blocking UI)
- 5 new tables + indexes = larger DB footprint
- Cross-system coupling: requires staff-system update (new role) + manager-rpg cross-ref + player-management OQ resolutions
- Counter-offer auction is a 2-step flow — increases UX complexity vs simple bid/accept

**Risks:**
- AI club rotation determinism: bug in seed could cascade across multiple windows (each window's rng depends on worldSeed). Mitigation: regression tests with fixed seed verify identical outcomes.
- Pool size scaling: with 40 clubs × ~22 players = 880 players + free agents = >900 records to filter per request. Mitigation: paginated API + DB indexes on `(division, position, ovr_band)` precomputed.
- Race: 2 managers offer for same player simultaneously. Server uses row-level lock on `players.id` during offer resolution. Last accepted wins; second offer hard rejected.

## ADR Dependencies

| ADR | Relation |
|---|---|
| ADR-005 (WorldState persistence) | Extended — 5 new tables |
| ADR-008 (World Clock) | Reused — tick() + window event |
| ADR-015 (Special Event Decision Schema) | Consumed — transfer_window_open/close drive lifecycle |
| ADR-016 (Player Lifecycle) | Extended — implements OQ-PM-03 + OQ-PM-04 |
| ADR-029 (Stadium Upgrades Module) | Pattern reference — same module layout + FSM style |

## GDD Requirements Addressed

| TR-ID (future) | Requirement | GDD source |
|---|---|---|
| TR-SCM-001 | 4 visibility tiers T0-T3 | scouting-market.md §3.1 + F1 |
| TR-SCM-002 | Pool size by scouting_network_level | scouting-market.md §3.2 + F5 |
| TR-SCM-003 | Scout / deep-scout actions with cost + delay | scouting-market.md §3.3 + F4 |
| TR-SCM-004 | Auction acceptance + counter-offer | scouting-market.md §3.4 + F3 |
| TR-SCM-005 | AI club rotation mini-loop | scouting-market.md §3.5 + F6 |
| TR-SCM-006 | Search filters + saved searches | scouting-market.md §3.6 |
| TR-SCM-007 | Scout Director role | scouting-market.md §3.7 |
| TR-SCM-008 | Server-authoritative visibility | scouting-market.md §3.1 + ADR-031 §D6 |
| TR-SCM-009 | Determinismo | scouting-market.md AC-SCM-22 |
| TR-SCM-010 | Resolution of OQ-PM-03 + OQ-PM-04 | player-management.md §9 |

Full ACs in scouting-market.md §8 (AC-SCM-01 through AC-SCM-30).
