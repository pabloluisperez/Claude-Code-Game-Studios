# ADR-016: Player Lifecycle

## Status
Accepted

## Date
2026-05-19 (Proposed → Accepted same day — formalizes the lifecycle implied
by `player-management.md` (Approved R2 2026-05-18) which specifies F1–F12
formulas but does not pin down the architectural orchestration of player
generation, form rolling, morale per match, skill drift, contract renewal,
and aging.)

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Core / Backend (Drizzle 0.36+ + deterministic player generation) |
| **Knowledge Risk** | LOW — patterns verified by vertical slice's `player-gen.ts`; no post-cutoff APIs new to this ADR. |
| **References Consulted** | `design/gdd/player-management.md` (R2 PASS 2026-05-18), ADR-002 (sim determinism), ADR-005 (WorldState persistence), ADR-007 (match-simulation contract for `PlayerStats`), `design/gdd/match-simulation.md` (F1-F10 formulas), `design/gdd/league-system.md` (forfeit pct rule), vertical slice `prototypes/cascada-vertical-slice-mes1/src/sim/player-gen.ts` |
| **Post-Cutoff APIs Used** | None new — Drizzle 0.36+ + `seedrandom` (both already covered by ADR-002/005). |
| **Verification Required** | World-gen determinism: same seed + same club configs → identical player rosters across 20 clubs. F4 form rolling identity: 5 matches with same ratings always produces the same form value. F12 aging curve: 5-year simulation of a single player (age 22 → 27) produces monotonic skill drift consistent with expected curve. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-002 (`ctx.rng()` determinism), ADR-005 (WorldState; players persist via JSONB on club rows), ADR-007 (`PlayerStats` shape consumed by match-sim), ADR-011 (clubs table; world-gen populates per club), ADR-015 (TransferOffer + YouthPromotion event payloads use this lifecycle) |
| **Enables** | `player-management` epic stories; staff-system scout observations (read player attributes); economy payroll (reads player.salary); manager-rpg career events that reference squad state |
| **Blocks** | `player-management` epic implementation until Accepted |
| **Ordering Note** | Independent of ADR-014/015 (though referenced by them). Can be Accepted in parallel with ADR-014. |

## Context

### Problem Statement

`player-management.md` R2 (Approved 2026-05-18) defines formulas F1–F12
covering effective fitness/rating, form rolling, morale updates, skill
degradation, and salary determination. Cross-review R2 fixed AC-PM-11 (F8
forfeit pct ≤63%), AC-PM-16 arithmetic, F11 morale formula, and F12 skill
degradation. What the GDD does NOT define is the **architectural orchestration**:

1. **World-gen**: When a playthrough is created, ~800 players (20 clubs × 40)
   must be generated deterministically. The algorithm parameters (position
   distribution, age distribution, attribute weights) are implicit in the
   GDD but not contracted.
2. **Storage**: Players are owned by clubs; their stats are read by
   match-simulation every tick (10 matches/week × 22 players = 220 player
   reads per week). Should they live in a normalised `players` table or
   JSONB on the `clubs` table?
3. **Form update timing**: F4 says "rolling average of last 5 match_ratings"
   — but when, within `advance()`, does this update happen? Before or after
   the next-week setup?
4. **Aging**: scope-mvp.md says "jugadores pueden envejecer básico, no se
   retiran como entrenadores" — so the basic curve must be defined, but
   retirement is v1.1+.
5. **Contract renewal**: Triggers on `season_end`; offered via event-system
   (ADR-015 references `TransferOffer` but contract renewal is
   separately owned by player-management).
6. **Forfeit handling**: When `squad_available_pct ≤ 63%` at fixture time, the
   match defaults to 0-3. This decision lives in player-management (per
   league-system canonical resolution) but the wiring needs explicit ownership.

Without this ADR, the `player-management` epic cannot write stories.

### Constraints

- Determinism (ADR-002): world-gen must produce identical rosters from the
  same seed.
- Match-simulation already has the `PlayerStats` shape (ADR-007). This ADR
  must NOT introduce a parallel player shape.
- Players are HIGH-frequency reads (every match). Storage must support fast
  per-club lookup.
- Aging happens once per season (52 weeks). Not per-tick. Cost is amortised.

### Requirements

The player-management module must provide:

1. Deterministic world-gen at playthrough creation.
2. Storage that supports per-club lookup at sub-millisecond.
3. F4 form rolling that updates exactly once per match week, post-match.
4. F11 morale update path triggered by match outcome + cascade thresholds.
5. F12 weekly skill degradation (small) applied during advance() before tick.
6. Yearly aging at season_end (basic skill drift; no retirement in MVP).
7. Contract renewal pipeline that fires via event-system at season_end.
8. Forfeit guard at fixture-load time: if availability ≤63%, mark
   forfeit + emit synthetic 0-3 outcome.

## Decision

**Players live in a dedicated `players` table (normalised, per-row). World-gen
runs at playthrough creation as a single deterministic batch. Form, morale,
and skill drift are updated post-match by the player-management service. Aging
runs once per season as a transactional pass over all players. Contract
renewal is event-driven via ADR-015's `SponsorOffer`/`TransferOffer` payloads
(extended with a new `ContractRenewalOffer` variant). Forfeit is detected at
fixture load and short-circuits the match.**

### `players` Table Schema (Drizzle)

```typescript
// packages/db/src/schema/players.ts

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  clubId: uuid('club_id').notNull().references(() => clubs.id, { onDelete: 'cascade' }),
  playthroughId: text('playthrough_id').notNull().references(() => playthroughs.id, { onDelete: 'cascade' }),

  // Identity
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  nationality: text('nationality').notNull().default('ES'),
  birthWeek: integer('birth_week').notNull(),     // weeks since playthrough epoch — age = (currentWeek - birthWeek) / 52
  position: text('position').notNull(),           // 'GK' | 'DEF' | 'MID' | 'FWD'

  // Universal stats (from match-simulation.md Player Model)
  skill:   integer('skill').notNull(),            // [20, 95]
  fitness: integer('fitness').notNull(),          // [30, 100]
  morale:  integer('morale').notNull().default(60), // [0, 100]
  form:    integer('form').notNull().default(60), // [30, 90]
  stamina: integer('stamina').notNull().default(75), // [40, 100]

  // Position-specific stats (only the 2 relevant for the position are set)
  reflexes:   integer('reflexes'),
  handling:   integer('handling'),
  strength:   integer('strength'),
  tackling:   integer('tackling'),
  passing:    integer('passing'),
  vision:     integer('vision'),
  speed:      integer('speed'),
  finishing:  integer('finishing'),

  // Contract
  salaryEurK:          integer('salary_eur_k').notNull(),   // €K/week
  contractStartWeek:   integer('contract_start_week').notNull(),
  contractEndWeek:     integer('contract_end_week').notNull(),

  // Lifecycle
  availability: text('availability').notNull().default('available'),  // 'available' | 'injured' | 'suspended' | 'sold'
  injuredUntilWeek: integer('injured_until_week'),  // null if not injured

  // Form rolling history — last 5 match_ratings used by F4
  recentRatings: jsonb('recent_ratings').$type<number[]>().notNull().default([]),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byClub: index('players_by_club').on(t.playthroughId, t.clubId),
  byPlaythrough: index('players_by_playthrough').on(t.playthroughId),
}));
```

Per-club lookup uses the `(playthroughId, clubId)` composite index. Expected
size: 800 rows × ~250 bytes = ~200KB per playthrough. Negligible.

### World-gen Algorithm (lives in `packages/shared/src/sim/world-gen.ts`)

```typescript
interface WorldGenInput {
  seed: string;
  playthroughId: string;
  clubs: Array<{ id: string; baseSkill: number; reputation: 1 | 2 | 3 }>;
}

interface GeneratedPlayer {
  // matches `players` schema; clubId set by caller
  firstName: string;
  lastName: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  skill: number;
  fitness: number;
  morale: number;
  form: number;
  stamina: number;
  // ...position-specific stats per ADR-007
  birthWeek: number;
  salaryEurK: number;
  contractStartWeek: number;
  contractEndWeek: number;
}

export function generateRoster(args: {
  ctx: SimContext;       // ctx.rng() — deterministic
  clubBaseSkill: number; // [40, 90] depending on division + tier
  clubSlug: string;      // identity seed component
  rosterSize: number;    // default 40 per club
  currentWeek: number;   // birth_week is relative to this
}): GeneratedPlayer[];
```

**Position distribution** (40 players → first-team + reserves):
- 4 GK (1 starter + 3 backup)
- 12 DEF (4 starter + 8 backup)
- 12 MID (4 starter + 8 backup)
- 12 FWD (2 starter + 10 backup)
Reserves cover injuries + rotation. Total: 40.

**Age distribution**:
- 30% of squad: age 18-23 (jóvenes en formación)
- 50% of squad: age 24-29 (peak)
- 20% of squad: age 30-35 (veteranos)

`birth_week = current_week - (age * 52 + rng_offset_0_to_52)`.

**Attribute generation**: each player's `skill` is drawn from a normal-ish
distribution centered on the club's `baseSkill` with σ=8, clamped [20, 95].
Position-specific stats are drawn similarly with a position-bias factor:
- GK: `reflexes` + `handling` are correlated to skill; +5 mean
- DEF: `strength` + `tackling` bias +3
- MID: `passing` + `vision` bias +3
- FWD: `speed` + `finishing` bias +3

`form` initial = 60 + rng_jitter [-5,+5]. `morale` = 60. `stamina` = 70 + rng_jitter [-10,+10].

**Salary determination**:
```
salaryEurK = SALARY_BASE_BY_DIVISION[club.divisionTier] * (skill / 50) * (age_bias) * rng_jitter
```
Where `SALARY_BASE_BY_DIVISION[1] = 12 €K/wk` (Primera) and `[2] = 6 €K/wk`
(Segunda). `age_bias` peaks 1.2× at age 27, decays at extremes.

**Contract**: every initial player gets a contract through `current_week + 104`
(2 seasons). At world-gen, contracts are spaced so ~30% expire at the end of
each season; renewal events thus arrive as a managed stream rather than a
season-1 flood.

### Form Update Path (F4)

After each match where the player played ≥30 minutes:

```typescript
// Inside advance-worker, post-match outcome application
for (const [playerId, rating] of Object.entries(outcome.playerRatings)) {
  const player = await playersRepo.getById(playerId);
  const newRecentRatings = [...player.recentRatings, rating].slice(-5);  // keep last 5
  const newForm = computeFormF4(newRecentRatings);
  await playersRepo.update(playerId, { recentRatings: newRecentRatings, form: newForm });
}
```

`computeFormF4(ratings: number[]) → number`:
```typescript
// F4 from player-management.md: weighted exponential, most recent matters more
const weights = [1.0, 0.85, 0.7, 0.55, 0.4];  // last → 5th-to-last
const weighted = ratings.reduce((sum, r, i) => sum + r * weights[i], 0);
const totalWeight = weights.slice(0, ratings.length).reduce((a, b) => a + b, 0);
const form = Math.round(weighted / totalWeight);
return Math.min(90, Math.max(30, form));  // clamp [30, 90] per cross-review fix
```

### Morale Update (F11)

Triggered:
- Post-match: `morale += (match_rating - 60) * 0.3` (per match-simulation
  outcome). Range delta: ±9.
- Cascade-driven: per cascade-engine player_happiness changes propagate to
  individual `morale` via F9b delta path (averaging). The cascade engine
  writes `player_happiness` (aggregate); player-management reads it and
  applies a per-player smoothing delta toward the new aggregate.

### Skill Degradation (F12)

```typescript
function f12_weekly_skill_drift(player: PlayerStats, age: number): number {
  if (age < 28) return 0;            // jóvenes no degradan en MVP
  if (age < 30) return -0.05;        // micro-decay
  if (age < 32) return -0.1;
  if (age < 34) return -0.2;
  return -0.4;                       // veteranos decae rápido
}
```

Applied once per week during `advance()` BEFORE the cascade tick. Floored at
`skill ≥ 20`.

### Aging (yearly, at season_end)

```typescript
// Inside processSeasonEnd transaction (per ADR-011)
for (const player of playersInPlaythrough) {
  const ageNow = (currentWeek - player.birthWeek) / 52;
  // skill drift already applied weekly via F12; aging is mostly admin
  // (contract renewal triggers via event-system)
  if (ageNow > 35) {
    // MVP: no retirement; just flag for v1.1+ retirement event
    await playersRepo.update(player.id, { availability: 'retiring_soon' });
  }
}
```

### Contract Renewal Pipeline

At `season_end`, for each player with `contractEndWeek <= currentWeek + 8`:
event-system fires a new `ContractRenewalOffer` event (extension to ADR-015's
union):

```typescript
// Added to EventDecisionPayload union in ADR-015 (this ADR amends ADR-015):
export interface ContractRenewalOfferPayload {
  kind: 'contract_renewal_offer';
  playerId: string;
  playerName: string;
  age: number;
  currentSalaryEurK: number;
  proposedSalaryEurK: number;     // calculated by player-management
  proposedContractWeeks: number;  // typically 104 (2 seasons)
  options: {
    accept:  { label: string; description: string; };
    decline: { label: string; description: string; };  // player will leave free at contractEndWeek
    counter: { label: string; description: string; counterSalaryEurK?: number; };
  };
  defaultOption: 'decline';
}
```

Resolution writes to `players.salaryEurK`, `players.contractEndWeek`, or
flags `availability='leaving'` based on choice.

### Forfeit Guard

Inside the match-week processing (per ADR-011's match-day flow):

```typescript
function checkForfeit(playthroughId: string, clubId: string): { forfeit: boolean; reason?: string } {
  const availability = computeSquadAvailablePct(playthroughId, clubId);
  if (availability <= 63) {
    return { forfeit: true, reason: `squad_available_pct=${availability}` };
  }
  return { forfeit: false };
}
```

If forfeit: synthetic `MatchOutcome` returned with `homeScore=0, awayScore=3,
worldStateDeltas.match_performance_index=-30, worldStateDeltas.injury_risk=0`,
plus an event of type `forfeit_recorded` written to `calendar_events`.

## Alternatives Considered

### Alternative A: Players as JSONB blob on `clubs` table

- **Description**: Each club's roster is a JSONB array on `clubs.players`.
- **Pros**: One query per club; simpler joins.
- **Cons**: jsonb updates rewrite the entire blob (~10KB per club) on every
  per-player change (form, morale, injury) — expensive. No per-player
  foreign-key referential integrity. Hard to query "all injured players in
  the league."
- **Rejection**: Per-row updates are vastly cheaper at the expected per-week
  write volume.

### Alternative B: Aging as continuous-time function (not yearly)

- **Description**: Skill drift evaluated per-tick with continuous age (current_week / 52).
- **Pros**: No special-case yearly pass.
- **Cons**: ~800 players × 52 weeks/year × 5 seasons = 208,000 updates. Per-tick
  cost adds up. The yearly batch is amortised.
- **Rejection**: F12 weekly micro-decay is enough for in-season feel; yearly
  aging handles the larger discontinuities.

### Alternative C: Roster carried in WorldState

- **Description**: Players are nodes in WorldState (per cascade-engine
  catalog).
- **Pros**: Unified state model.
- **Cons**: WorldState is for cascade-driven scalar nodes; players are
  structured rows. Putting 800 player records into a single jsonb snapshot
  would balloon snapshot size to multi-MB. Breaks the slice's design that
  snapshot is bounded.
- **Rejection**: Players belong in a relational table; aggregates that feed
  cascades (e.g., `player_happiness`) live in WorldState.

## Consequences

### Positive

- Players are first-class relational data — queryable, indexed, FK-protected
- World-gen is deterministic and bounded (single batch insert at playthrough creation)
- Form/morale/skill updates are localised to their trigger paths
- Aging is amortised (1 batch per 52 weeks)
- Contract renewal flows through ADR-015's typed event system (consistent UX)
- Forfeit short-circuit prevents accidentally simulating a match with 5 players

### Negative

- 800-row insert at playthrough creation: ~250-500ms in a transaction — within budget but is the dominant cost of playthrough creation
- ADR-015's union grows by 1 variant (`ContractRenewalOffer`) — manageable
- The `recentRatings` jsonb array is per-player; technically a small blob —
  acceptable since it's bounded (5 entries max)

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| World-gen pathology (all clubs end up too similar in skill) | LOW | MEDIUM | Test: 10-club world-gen with same baseSkill produces a skill distribution σ≥8 across teams. |
| Form values clamping at extremes (always 90 or always 30) | LOW | MEDIUM | F4 weights ensure ratings outside [30,90] don't cause runaway. Test: 10 consecutive 100 ratings → form caps at 90. |
| Skill drift produces inverse-age curve (older players become uniformly weak too fast) | MEDIUM | MEDIUM | Tunable constants; `/balance-check` once economy is live. F12 values are tunable knobs per player-management.md. |
| Contract renewal flood at season 1 end | MEDIUM | LOW | World-gen staggers initial contracts so only ~30% expire per season; rest stay multi-year. |
| Forfeit guard false positive (squad_available_pct calculation lag) | LOW | HIGH | Forfeit detection runs at fixture-load time inside the same transaction as match-day processing — atomic. |

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| player-management.md F1 | effective_fitness clamp | Stored fitness has range [30,100]; F1 from match-simulation computes effective at runtime |
| player-management.md F2 | effective_rating | Computed at runtime from F1 + stat columns |
| player-management.md F3-F4 | Form (rolling avg of last 5 with ≥30 min) | `recentRatings` jsonb (max 5) + computeFormF4 post-match |
| player-management.md F7 clamp | (already handled) | World-gen produces values within clamps |
| player-management.md F8 forfeit | pct ≤ 63% → 0-3 default | `checkForfeit()` at fixture load + synthetic MatchOutcome |
| player-management.md F9b player_happiness aggregation | Mean of 11 titulares as delta | player-management subscribes to cascade tick output; pushes deltas back to per-player morale |
| player-management.md F11 morale | Per-match morale update | computeMoraleF11 in post-match path |
| player-management.md F12 skill degradation | Weekly micro-decay | Applied in `advance()` before tick |
| scope-mvp.md "basic aging" | Yearly aging at season_end | processSeasonEnd batch pass |
| ADR-011 league forfeit canonical rule | 63% threshold | Implemented identically in player-management; one source of truth |
| ADR-015 lifecycle events | ContractRenewalOffer | Variant added to EventDecisionPayload union |

## Performance Implications

- **World-gen**: 800 players × ~50 µs/player generation = 40ms CPU + 200-500ms DB insert = total ~500ms one-time per playthrough creation.
- **Match weeks**: 10 matches/week × ~12 player updates per match (form + morale for ≥30-min players from one team) = 120 row updates per week. With Postgres batched, <50ms.
- **Aging pass**: 800 rows × 1 UPDATE each = ~250ms at season_end. Acceptable as a one-time per-year cost.
- **Per-player read in match-sim**: 22 players per match × 10 matches = 220 reads × ~1ms = ~220ms total. Indexed by `(playthroughId, clubId)` — fast.

## Related Decisions

- [ADR-002](ADR-002-simulation-determinism.md) — `ctx.rng()` for world-gen + age jitter
- [ADR-005](ADR-005-worldstate-persistence.md) — Players persisted in their own table; aggregate `player_happiness` in WorldState
- [ADR-007](ADR-007-sport-agnostic-match-sim.md) — `PlayerStats` shape that match-sim consumes; this ADR populates that shape from the `players` table at match time
- [ADR-008](ADR-008-world-clock-event-loop.md) — Aging runs in `processSeasonEnd` flow; contract renewal events emitted via event-system
- [ADR-011](ADR-011-league-competition-schema.md) — Forfeit pct rule (63% canonical); clubs table is FK target
- [ADR-015](ADR-015-special-event-decision-schema.md) — `ContractRenewalOfferPayload` variant added to the discriminated union
- `design/gdd/player-management.md` — Source of formulas
- `design/gdd/scope-mvp.md` — Aging basic / no retirement in MVP constraint
