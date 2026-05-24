# ADR-010: Manager-RPG Progression Model

## Status
Accepted

## Date
2026-05-16 (Proposed) → 2026-05-16 (Accepted, post-architecture-review run 2)

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Core / Backend (Drizzle + PostgreSQL) + Shared Sim |
| **Knowledge Risk** | LOW — Drizzle 0.36+ JSONB patterns, PostgreSQL 16: all stable, verified in VERSION.md |
| **References Consulted** | `docs/engine-reference/web/modules/backend.md`, `docs/engine-reference/web/VERSION.md` |
| **Post-Cutoff APIs Used** | Drizzle `.$onUpdate(() => new Date())` — verified correct pattern for auto-updating timestamps in Drizzle 0.36+ |
| **Verification Required** | Verify `drizzle-kit generate` emits both `REFERENCES` and `UNIQUE` on `playthrough_id`; verify `updated_at` auto-updates on every `updateSkills()` call; audit all `switch` over `CalendarEventType` for `assertNever` exhaustiveness guards before adding `manager_level_up` |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-002 (SimContext — `applyXpGrants` follows the sim pure-function pattern), ADR-005 (playthrough save — manager profile is part of the playthrough context), ADR-008 (advance lifecycle — XP computed inline during advance; level-up events inserted in advance transaction), ADR-009 (StaffPerceptionConfig.qualityTier — `getMaxHirableStaffQuality()` defined here gates what quality tier of staff is available to hire) |
| **Enables** | `manager-rpg.md` GDD (can now specify skill formulas, XP sources, level-up events, reputation effects); `staff-system.md` GDD (can now implement hire marketplace using `getMaxHirableStaffQuality()`); ADR-004 enrichment (narrative AI receives ManagerContext for NPC reactions) |
| **Blocks** | Epic manager-rpg — cannot start without this ADR Accepted; Epic staff-system (hire quality gating) |
| **Ordering Note** | ADR-010 Accepted → manager-rpg.md GDD (specifies the 5 skill formulas + XP source table) → staff-system.md GDD (implements hire marketplace using this ADR's contracts) |

## Context

### Problem Statement

Cascada FC's Manager-RPG is the second narrative spine of the game ("You Grow Like Your Club" — Pilar 3). Without a defined architecture, the `manager-rpg.md` GDD cannot specify formulas, because the implementer doesn't know where to store skill state, how XP is computed, or how reputation affects the rest of the game world.

More critically, this ADR resolves the central design tension: **Pilar 1 ↔ Pilar 3**. Pilar 1 says cascades should be partially hidden (discovered through play); Pilar 3 says the manager's growth should reveal the world. The resolution is architectural: the manager grows their `reputation`, which gates the maximum `qualityTier` of staff they can hire; higher-quality staff perceives cascade nodes more sensitively (ADR-009); therefore the manager's growth *mechanically* increases world visibility — but through a character-growth gate, not through the UI simply showing more data.

### Constraints

- Manager state must persist per playthrough (ADR-005: single autosave)
- XP computation must be deterministic and auditable (ADR-002: reproducibility)
- XP is granted from game outcomes (match results, financial events) — these are known only post-tick
- Must not block the advance() HTTP response: XP computation must be O(1) per skill
- 5 skills × 5 levels is the MVP scope (game-concept.md: "5 habilidades × 4-5 niveles")
- The `getMaxHirableStaffQuality()` contract must be a pure function (usable on both server and client for hire marketplace preview)
- `reputation` is one of the 5 skills, not a separate field — treated consistently with other skills

### Requirements

- Manager profile stored in DB, loaded alongside WorldState in advance context
- 5 named skills, each with level (1–5) and XP tracking
- XP granted inline during advance(), in the same DB transaction as snapshot persistence
- Level-up creates a NOTIFY CalendarEvent inserted in the same transaction
- `reputation.level` drives `getMaxHirableStaffQuality()` — the P1↔P3 resolution mechanism
- All XP grants recorded in an audit table for determinism debugging and replay
- Manager state passed as context to narrative AI calls (ADR-004) for NPC reactions

## Decision

**Manager state in dedicated `manager_profiles` table with skills as JSONB. XP computed inline during advance() via pure function. Level-ups → NOTIFY CalendarEvent in the same transaction. Reputation level gates staff hire quality via a pure exported function.**

### P1↔P3 Resolution Mechanism

```
Manager reputation.level 1-2  →  getMaxHirableStaffQuality() = 1  →  only novice staff hirable
Manager reputation.level 3    →  getMaxHirableStaffQuality() = 2  →  experienced staff hirable  
Manager reputation.level 4-5  →  getMaxHirableStaffQuality() = 3  →  expert staff hirable
                                                                         ↓
                                                           Expert staff qualityTier = 3 (ADR-009)
                                                           → perceives cascade nodes at fine sensitivity
                                                           → more staff messages → more cascade signals
```

The cascade formulas remain hidden. The UI never exposes them. The manager must grow their reputation to hire expert staff who notices more signals — that is the only path to cascade visibility.

### Architecture Diagram

```
POST /api/game/advance
        │
        ├─► evaluateTick() × N weeks
        │   → thresholdCrossings, eventsTriggered
        │
        ├─► computeXpGrants(eventsTriggered, crossings)
        │   → XpGrant[]  [data-driven from XP_SOURCES table]
        │
        ├─► applyXpGrants(ctx, managerProfile, grants)   [pure function]
        │   → { updatedProfile, levelUps }
        │
        └─► db.transaction:
              INSERT worldSnapshots
              UPDATE playthroughs.currentWeek
              UPDATE manager_profiles.skills = updatedProfile.skills
              INSERT skill_xp_events (audit trail)
              for each levelUp:
                INSERT calendar_events(type='manager_level_up', priority='NOTIFY')
              ─────────────────────────────────────────────────────
              AdvanceResult includes level-up events in eventsTriggered[]
```

### Key Interfaces

```typescript
// packages/shared/src/types/manager-rpg.ts

export type ManagerSkillId =
  | 'tactical_insight'    // affects match outcome quality (minor sim bonus)
  | 'man_management'      // affects player morale cascade nodes
  | 'financial_acumen'    // affects business events, sponsor negotiations
  | 'scouting_network'    // affects transfer market quality + information
  | 'reputation';         // gates max hirable staff qualityTier (P1↔P3 key)

export interface ManagerSkill {
  level: 1 | 2 | 3 | 4 | 5;
  xp: number;             // current XP within this level
  xpToNextLevel: number;  // XP needed to reach next level
}

export type ManagerSkills = Record<ManagerSkillId, ManagerSkill>;

export interface ManagerProfile {
  id: string;
  playthroughId: string;
  name: string;
  skills: ManagerSkills;
}

/**
 * Pure function — the P1↔P3 resolution contract.
 * Used by staff-service when building hire marketplace queries.
 * Safe to call on client for preview (no I/O).
 */
export function getMaxHirableStaffQuality(reputationLevel: number): 1 | 2 | 3 {
  if (reputationLevel >= 4) return 3;
  if (reputationLevel >= 3) return 2;
  return 1;
}

export interface XpGrant {
  skillId: ManagerSkillId;
  amount: number;
  reason: string;  // audit key — matches XP_SOURCES entry
}

export interface SkillLevelUp {
  skillId: ManagerSkillId;
  fromLevel: number;
  toLevel: number;
}

// Narrative AI context — passed to ADR-004 prompt builder, not persisted
export interface ManagerNarrativeContext {
  name: string;
  reputationLevel: number;
  highestSkill: ManagerSkillId;  // for NPC dialogue personalization
  notableAchievements: string[]; // e.g., ['promoted_season_1', 'survived_relegation']
}
```

### XP Sources (data-driven)

```typescript
// packages/shared/src/data/manager-xp-sources.ts
// Key: CalendarEventType value that triggered the XP grant

export const XP_SOURCES: Readonly<Record<string, XpGrant[]>> = {
  'match_win':                       [{ skillId: 'tactical_insight', amount: 10, reason: 'match_win' }],
  'match_draw':                      [{ skillId: 'tactical_insight', amount: 5,  reason: 'match_draw' }],
  'match_loss':                      [{ skillId: 'tactical_insight', amount: 2,  reason: 'match_loss' }],
  'end_of_month:positive_finances':  [{ skillId: 'financial_acumen', amount: 10, reason: 'positive_month' }],
  'end_of_month:negative_finances':  [{ skillId: 'financial_acumen', amount: 3,  reason: 'survived_negative_month' }],
  'transfer_window_close:signed':    [{ skillId: 'scouting_network', amount: 15, reason: 'signed_player' }],
  'board_meeting:passed':            [{ skillId: 'reputation', amount: 8,        reason: 'board_approval' }],
  'season_end:promoted':             [{ skillId: 'reputation', amount: 50,       reason: 'promotion' }],
  // ... full table defined in manager-rpg.md GDD
} as const;
```

### Pure Function (sim layer)

```typescript
// packages/shared/src/sim/manager-rpg.ts

/**
 * Applies XP grants to a manager profile.
 * Follows ADR-002 pattern: SimContext as first parameter.
 * ctx.worldClock is unused today — reserved for future time-based XP formulas
 * (e.g., diminishing XP returns in later seasons). Do not remove.
 */
export function applyXpGrants(
  ctx: SimContext,
  profile: ManagerProfile,
  grants: XpGrant[]
): { updatedProfile: ManagerProfile; levelUps: SkillLevelUp[] } {
  const updatedSkills = { ...profile.skills } as ManagerSkills;
  const levelUps: SkillLevelUp[] = [];

  for (const grant of grants) {
    const skill = updatedSkills[grant.skillId];
    const newXp = skill.xp + grant.amount;

    if (newXp >= skill.xpToNextLevel && skill.level < 5) {
      // Level up
      levelUps.push({
        skillId: grant.skillId,
        fromLevel: skill.level,
        toLevel: (skill.level + 1) as ManagerSkill['level'],
      });
      updatedSkills[grant.skillId] = {
        level: (skill.level + 1) as ManagerSkill['level'],
        xp: newXp - skill.xpToNextLevel,
        xpToNextLevel: calculateXpToNextLevel(skill.level + 1),
      };
    } else {
      // At max level (5): cap XP silently — this is intentional.
      // Unit test: assert XP beyond level-5 threshold does NOT carry over.
      updatedSkills[grant.skillId] = {
        ...skill,
        xp: Math.min(newXp, skill.xpToNextLevel),
      };
    }
  }

  return {
    updatedProfile: { ...profile, skills: updatedSkills },
    levelUps,
  };
}

export function calculateXpToNextLevel(currentLevel: number): number {
  // Exponential curve: 100, 200, 400, 800, ∞ (level 5 is max)
  return currentLevel >= 5 ? Infinity : 100 * Math.pow(2, currentLevel - 1);
}
```

### Drizzle Schema Addition

```typescript
// packages/db/src/schema/manager.ts

export const managerProfiles = pgTable('manager_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  playthroughId: uuid('playthrough_id').notNull()
    .references(() => playthroughs.id, { onDelete: 'cascade' })
    .unique(),  // one manager per playthrough in MVP
  name: text('name').notNull(),
  skills: jsonb('skills')
    .$type<ManagerSkills>()
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),  // auto-updates on every db.update() via Drizzle ORM layer
});

export const managerProfilesRelations = relations(managerProfiles, ({ one }) => ({
  playthrough: one(playthroughs, {
    fields: [managerProfiles.playthroughId],
    references: [playthroughs.id],
  }),
}));

export const skillXpEvents = pgTable('skill_xp_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  playthroughId: uuid('playthrough_id').notNull()
    .references(() => playthroughs.id, { onDelete: 'cascade' }),
  week: integer('week').notNull(),
  season: integer('season').notNull(),
  skillId: text('skill_id').notNull(),
  xpGranted: integer('xp_granted').notNull(),
  reason: text('reason').notNull(),   // matches XP_SOURCES key for auditability
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const skillXpEventsRelations = relations(skillXpEvents, ({ one }) => ({
  playthrough: one(playthroughs, {
    fields: [skillXpEvents.playthroughId],
    references: [playthroughs.id],
  }),
}));
```

### Inline advance() Integration

```typescript
// In game-clock-service.advance() — before opening the DB transaction:
const managerProfile = await managerRepo.findByPlaythrough(playthroughId);
const xpGrants = computeXpGrants(eventsTriggered, allCrossings);  // data-driven from XP_SOURCES
const { updatedProfile, levelUps } = applyXpGrants(ctx, managerProfile, xpGrants);

// Inside the DB transaction (alongside snapshots + currentWeek update):
if (xpGrants.length > 0) {
  await managerRepo.updateSkills(tx, playthroughId, updatedProfile.skills);
  await skillXpRepo.insertBatch(tx, playthroughId, finalWeek, currentSeason, xpGrants);
}
for (const levelUp of levelUps) {
  await calendarRepo.insertEvent(tx, {
    playthroughId,
    week: finalWeek,
    season: currentSeason,
    type: 'manager_level_up',   // additive extension to CalendarEventType (ADR-008)
    priority: 'NOTIFY',
    metadata: { skillId: levelUp.skillId, from: levelUp.fromLevel, to: levelUp.toLevel },
    consumed: false,
  });
}
// Level-up events appear in AdvanceResult.eventsTriggered[] automatically
```

### CalendarEventType Extension

`'manager_level_up'` is added to the `CalendarEventType` union defined in ADR-008. This is an additive change. Before implementation: audit all `switch` statements over `CalendarEventType` in `apps/api/` and `packages/shared/` for `assertNever(type)` exhaustiveness guards. TypeScript will surface any unhandled cases as compile errors once the variant is added.

## Alternatives Considered

### Alternative 1: Manager skills as WorldState nodes
- **Description**: Store skill levels as nodes in `WorldState = Map<NodeId, number>` (e.g., `'manager:reputation'`), evaluated by the cascade engine.
- **Pros**: Reuses existing infrastructure; skills could theoretically participate in cascade chains.
- **Cons**: WorldState nodes are continuous numeric values in [0, 1] or bounded ranges. Manager skills are discrete (level 1–5) with non-linear XP curves. Forcing them into WorldState mixes semantic types. `getNode()` raises on missing nodes — requires initializing all skill nodes at playthrough start. Most critically, the cascade engine would need to know about manager skills, coupling simulation to RPG progression.
- **Rejection Reason**: Single-responsibility. The cascade engine computes game world dynamics; the manager-rpg module computes character progression. These are different domains.

### Alternative 2: Manager state as JSONB in `playthroughs` table
- **Description**: Extend the `playthroughs` table (ADR-005) with a `managerState: jsonb` column.
- **Pros**: No new table; manager state loaded with the playthrough in one read.
- **Cons**: Couples the manager schema to the save game schema. Adding or changing manager fields requires touching the playthroughs table. Violates module boundary: playthroughs.ts should own save game lifecycle, not manager progression data.
- **Rejection Reason**: Module boundaries. `manager_profiles` is a separate bounded context from `playthroughs`.

### Alternative 3: Post-advance async XP via BullMQ
- **Description**: Consistent with staff messages (ADR-009) — XP computed after advance in a BullMQ job.
- **Pros**: Pattern consistency with ADR-009.
- **Cons**: XP computation is O(1) — a handful of additions and comparisons. BullMQ introduces async complexity (job queuing, potential failure) for a trivial operation. Manager state would be stale until the job runs, making `getMaxHirableStaffQuality()` return wrong results in the immediate post-advance UI.
- **Rejection Reason**: Wrong tool. BullMQ is for I/O-bound async operations (narrative AI text generation). XP computation is CPU-bound at microsecond scale.

## Consequences

### Positive
- P1↔P3 tension resolved architecturally: cascade visibility path is `reputation.level → getMaxHirableStaffQuality() → qualityTier → perception threshold → staff messages`. Clean, testable, no UI shortcuts.
- Manager state loaded in the same advance context as WorldState — no extra async round-trip
- `XP_SOURCES` is data-driven: adding new XP triggers requires no code changes to `applyXpGrants()`
- `skill_xp_events` provides complete audit trail for debugging "why did this skill level up?"
- `getMaxHirableStaffQuality()` as a pure exported function: usable on client for hire marketplace preview without a server round-trip

### Negative
- `XP_SOURCES` table needs content for every meaningful game event — a design content task (belongs in `manager-rpg.md` GDD, not in this ADR)
- `calculateXpToNextLevel()` curve (100 → 200 → 400 → 800) is a placeholder — the actual tuned curve belongs in `manager-rpg.md` GDD
- `manager_level_up` extends `CalendarEventType` (ADR-008) — requires exhaustiveness guard audit before implementation
- `ManagerNarrativeContext.notableAchievements` is a `string[]` — the source of truth for which achievements to populate is deferred to `manager-rpg.md` GDD

### Risks
- **R1 — XP inflation**: If XP_SOURCES is too generous, managers hit reputation level 4 in the first season, making expert staff available too early (collapsing the P3 progression arc). **Mitigation**: XP source amounts and `calculateXpToNextLevel()` curve are tuning knobs, both owned by `manager-rpg.md` GDD.
- **R2 — Stale ManagerProfile**: `managerProfile` is loaded before the DB transaction. If two concurrent advance calls fire for the same playthrough (should not happen — single-player, server-authoritative), there could be a XP race. **Mitigation**: `playthroughId.unique()` on `manager_profiles` + server session enforces one active advance per user.
- **R3 — `assertNever` audit**: Missing exhaustiveness guard on `CalendarEventType` switch means `manager_level_up` silently falls through. **Mitigation**: Run TypeScript strict compilation check after adding the union variant. Any handler without `assertNever` becomes a compiler error.
- **R4 — `calculateXpToNextLevel` with `Infinity`**: Level-5 returns `Infinity` as `xpToNextLevel`. Code that computes `xp / xpToNextLevel` (e.g., progress bars) must guard against `Infinity`. **Mitigation**: Document this invariant; UI progress bar must check `level === 5` before computing percentage.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| game-concept.md | "Manager RPG core: 5 habilidades × 4-5 niveles" | 5 ManagerSkillId values × 5 levels defined as the authoritative schema |
| game-concept.md | "reputación" as a progression dimension | `reputation` is one of the 5 skills; its level drives `getMaxHirableStaffQuality()` |
| game-concept.md | Pilar 3: "calidad de tu staff determina cuántas cascadas son visibles" | `reputation.level → getMaxHirableStaffQuality() → qualityTier → ADR-009 perception threshold` |
| game-concept.md | Pilar 1 ↔ Pilar 3 resolution: "Si la visibilidad viene de crecer como manager, P3 gana" | Resolved via `getMaxHirableStaffQuality()` gate — not via UI tooltip changes |
| game-concept.md | "Competence: Manager RPG con habilidades visibles que crecen" | Skills with XP + level-up events surface progression visibly in AdvanceResult |
| game-concept.md | "Long-Term: Manager RPG — habilidades + reputación + ofertas de otros clubes" | Foundation for the career event system (ofertas de otros clubes = reputation-gated narrative AI events) |

## Performance Implications

- **CPU**: `applyXpGrants()` is O(skills × grants) = O(5 × ~3) = O(15) operations. Sub-millisecond.
- **Memory**: `ManagerProfile` object: ~500 bytes. Loaded once per advance, held briefly. Negligible.
- **Load Time**: Not applicable.
- **Network**: Level-up events appear in `AdvanceResult.eventsTriggered[]`. Adds ~200 bytes per level-up event (rare). Negligible.
- **DB**: 1 `SELECT` (load profile) + 1 `UPDATE` (skills JSONB) + N `INSERT` (skill_xp_events, N ≤ ~3 per advance) + M `INSERT` (calendar_events for level-ups, M usually 0). All within the advance transaction.

## Migration Plan

No existing code to migrate. New tables.

1. Create `manager_profiles` Drizzle migration (verify `UNIQUE` + `REFERENCES` on `playthrough_id`)
2. Create `skill_xp_events` migration
3. Implement `applyXpGrants()` + `calculateXpToNextLevel()` in `packages/shared/src/sim/manager-rpg.ts`
4. Implement `getMaxHirableStaffQuality()` in `packages/shared/src/types/manager-rpg.ts`
5. Implement `XP_SOURCES` skeleton in `packages/shared/src/data/manager-xp-sources.ts` (full table content in `manager-rpg.md` GDD)
6. Implement `managerRepo.findByPlaythrough()`, `managerRepo.updateSkills()`, `skillXpRepo.insertBatch()` in `apps/api/src/modules/manager/repo.ts`
7. Wire `applyXpGrants()` into `game-clock-service.advance()` before the transaction
8. Add `'manager_level_up'` to `CalendarEventType` union + audit `assertNever` guards

## Validation Criteria

- After a match win, `tactical_insight.xp` increases by 10 (per XP_SOURCES). Deterministic: same seed + same outcomes → same XP grants.
- After reaching `reputation.level = 3`, `getMaxHirableStaffQuality(3) === 2` and the hire marketplace presents qualityTier 2 staff.
- A level-up inserts a `calendar_events` row with `type = 'manager_level_up'`, `priority = 'NOTIFY'`, and correct `metadata.skillId`.
- Level-up event appears in `AdvanceResult.eventsTriggered[]` from the same advance call.
- XP granted beyond level-5 threshold is silently capped (no carry-over). Unit test confirms intent.
- `manager_profiles.updated_at` reflects the actual update time after `updateSkills()` call.
- `skill_xp_events` records every XP grant with matching `reason` key from `XP_SOURCES`.

## Related Decisions

- [ADR-002](ADR-002-simulation-determinism.md) — `applyXpGrants()` follows the SimContext-first pattern; deterministic, no side effects
- [ADR-005](ADR-005-worldstate-persistence.md) — manager_profiles persists within the playthrough save context
- [ADR-008](ADR-008-world-clock-event-loop.md) — advance() lifecycle; level-up → NOTIFY CalendarEvent inserted in advance transaction; `CalendarEventType` extended with `'manager_level_up'`
- [ADR-009](ADR-009-staff-message-routing.md) — `StaffPerceptionConfig.qualityTier` is gated by `getMaxHirableStaffQuality(reputation.level)` defined here
- [ADR-004](ADR-004-narrative-ai-architecture.md) — `ManagerNarrativeContext` passed as AI prompt context for NPC reactions ("el alcalde recuerda...")
- `manager-rpg.md` GDD (future) — specifies the full XP_SOURCES table, `calculateXpToNextLevel()` tuned curve, career events (job offers from other clubs), reputation effects on NPC dialogue
