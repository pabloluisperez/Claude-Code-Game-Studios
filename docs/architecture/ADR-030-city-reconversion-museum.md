# ADR-030: `/city` Route Reconversion — From City Gameplay to Museum & History

## Status

Proposed (v1.1 design — 2026-05-24 autonomous authoring)

## Date

2026-05-24 — created during trophies-history.md GDD authoring; pending Pablo accept.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — TypeScript full-stack monorepo |
| **Domain** | Frontend (SvelteKit route refactor + PixiJS scene) + Backend (read-only API aggregator) |
| **Knowledge Risk** | LOW — read-only system, no new state |
| **References Consulted** | ADR-005 (WorldState), ADR-021 (canvas rendering pipeline), trophies-history.md, stadium-upgrades.md, city-progression.md (now superseded) |
| **Post-Cutoff APIs Used** | None — uses existing PixiJS 8 + Svelte 5 stack |
| **Verification Required** | `/city` page-load <800ms with 100 museum objects (AC-TH-22); read-only invariant test (AC-TH-26) |

## Supersedes

- ADR-021 §"city scene" (the canvas pipeline still applies, but the **content** of `/city` is now museum, not isometric city)
- `design/gdd/city-progression.md` (now in `Superseded` status — its gameplay layer is absorbed by stadium-upgrades.md per ADR-029; its rendering layer is replaced by this ADR)

## Context

The MVP v1.0 `/city` route was a placeholder. The v1.1 plan originally intended to convert `/city` into a full isometric city view per `city-progression.md`. During GDD authoring on 2026-05-24, Pablo decided to:

1. Absorb city tier-up gameplay into `stadium-upgrades.md` (ADR-029).
2. Reconvert `/city` into a museum + history space — `trophies-history.md`.

This ADR codifies the technical implications.

Without this ADR, the implementing programmer would inherit a contradictory state: `city-progression.md` is marked superseded but `/city` route still exists; `trophies-history.md` references "isometric world" but it should not render an isometric world. This ADR is the bridge.

## Decision

### D1. `/city` route owns the museum, not the city

The SvelteKit route `apps/web/src/routes/city/+page.svelte` (assumed to exist or be created) is refactored to render trophies-history.md's museum + barrio. The "full isometric city" remains a **v1.2+ deferred feature** under `isometric-world.md`.

What `/city` shows:
- **Center**: museum building, clickable to enter interior
- **Right**: stadium exterior (visual only — clicking redirects to `/stadium`)
- **Left**: manager office exterior (visual only — clicking redirects to `/manager-office`)
- **Background**: minimal ambient — palm trees, sky, sidewalk

What `/city` does NOT show in v1.1:
- The wider city tiles (residential, commercial — those are v1.2+)
- Day/night cycle (deferred — museum interior is always softly lit)
- Weather (deferred)
- NPCs walking around (Open Question OQ-TH-2)

### D2. Museum interior as a separate PixiJS scene

When user clicks the museum building, the PixiCanvas (per ADR-021) swaps scenes:

```
SceneBarrio  ↔  SceneMuseum
```

Implementation: Svelte `$state` toggles a `scene` variable; the PixiCanvas component renders the active scene via conditional `Container` mount. No route change — same URL, dolly animation.

Optional v1.2+: deep-link `/city/museum/[zone]` to land directly in a specific museum zone.

### D3. Backend aggregator API

Trophies-history.md is read-only over multiple existing systems. To avoid the frontend hitting 5+ endpoints, create one aggregator:

```
GET /api/museum/contents
```

Returns:
```json
{
  "trophies": [...],        // from league-system
  "banners": [...],         // from match-simulation (legendary) + league-system (ascensos)
  "legendTransfers": [...], // from player-management
  "financialMilestones": [...],  // from economy
  "stadiumHistory": [...],  // from stadium-upgrades (completed items)
  "totalObjects": <int>,
  "museumDensity": <float 0..1>  // F5 of trophies-history.md
}
```

Cached aggressively (TTL 60s) since this data only changes on world clock tick events — invalidate on `match:end`, `season:end`, `stadium:item_complete`.

### D4. Read-only invariant

The `/api/museum/contents` endpoint and its underlying service MUST be strictly read-only. No write to WorldState. No write to any domain table. Enforce with:

- TypeScript: service file only imports `repo.ts` files with `select*` methods, not `insert*` or `update*`
- Lint rule (custom): `apps/api/src/modules/museum/**/*` cannot call methods named `^(insert|update|delete|set)`
- Integration test: spy on DB transactions during `/api/museum/contents` call — assert zero writes (AC-TH-26)

### D5. Sprite asset pipeline

New asset categories needed in `assets/sprites/city-hd/`:

```
museum-exterior.png         # Building from outside, ~1024×1024
museum-interior-trophies.png   # Trophy room interior
museum-interior-banners.png    # Banner wall
museum-interior-hall.png       # Hall of fame
museum-interior-finance.png    # Financial milestones wall
museum-interior-stadium.png    # Stadium history timeline
trophy-cup-small.png            # Regional trophy
trophy-cup-medium.png           # National trophy
trophy-cup-large.png            # League/championship
trophy-dusty-overlay.png        # Dust effect for old trophies
banner-template-base.png        # Banner background (kit color tinted)
plaque-base.png                 # Plaque template
```

Estimated 12-15 new HD sprites. Generation via existing pipeline (comfyui MCP per overnight 2026-05-22). Spec sheet authored by `/asset-spec` skill in production phase.

### D6. Text generation strategy (v1.1 templates, v1.2+ LLM)

Phase v1.1:
- Templates in `packages/shared/src/i18n/museum-templates.ts`
- Per-category, per-locale (es/en).
- Placeholders: `{trophy_name}, {season}, {opponent}, {result}, {player_name}, {fee_eur_k}, ...`
- Example: `"Ganaste la {trophy_name} en la temporada {season}. Fue un año de {summary_adjective}."`

Phase v1.2+:
- When `narrative-ai.md` is implemented, replace templates with LLM-generated text using WorldState context.
- Background job: `regenerate-museum-texts` BullMQ scheduler runs after major events; results cached in DB.

### D7. Soft deprecation of city-progression.md

`design/gdd/city-progression.md`:
- Header marked `⚠️ Superseded by stadium-upgrades.md + trophies-history.md` (already done in Fase 1.3)
- Visual tier definitions (§3.1) retained as input to `stadium-upgrades.md F1` and `isometric-world.md`
- All other sections marked as "historical reference, not implementation spec"

This is **not** a hard delete because:
- Visual tier descriptions still inform asset spec sheets
- Some thresholds (§3.3 pitch surface) feed cascade-engine via `infrastructure_level` (now F3)
- Open Questions and Edge Cases may surface again when isometric-world.md is implemented

`design/gdd/isometric-world.md` should also be re-scoped to v1.2+ (already at `[v1.1+]` in systems-index, but with no implementation path in v1.1 — deferred behind this ADR).

### D8. Frontend route flow

```
User flow v1.1:
  Sidebar "🏛 Museo" → /city → barrio render
  Click museum building → dolly to interior → scroll between 5 zones
  Click stadium exterior → redirect /stadium
  Click manager office → redirect /manager-office
  Back button → return to barrio
```

Sidebar navigation update (hud-ui.md propagation pending):
- Replace existing `/city` link label (if it says "Ciudad") with "🏛 Museo"
- Optionally retain `/city-text` deep-link for a11y DOM fallback (AC-TH-24)

## Consequences

**Positive:**
- Cleaner scope for v1.1: stadium-upgrades is the "gameplay" of city growth; trophies-history is the "celebration" of it. Two systems, one cohesive experience.
- Resolves the open question OQ-09 from overnight 2026-05-22 ("¿/city canvas HD integration?") concretely: never integrate isometric city in MVP — the answer is "no city, use the museum".
- Museum is screenshot-friendly from day 1 — supports community marketing without extra effort (Pillar 2 amplification).
- Trophies-history is read-only, so it never blocks other systems or introduces save corruption risks.

**Negative:**
- Lost gameplay surface: the "watch your city grow over seasons" sensation from city-progression.md §2 is now partially shifted to `/stadium` (close-up) — the wider city growth is deferred to v1.2+.
- Existing players who tested v1.0 with the `/city` placeholder may expect more in v1.1 (full city) and get less. Mitigation: launch communication frames `/city` as "museum unlocked" — a feature gain, not a feature loss.
- Two systems means two implementations to test instead of one bigger one. Mitigation: trophies-history is mostly read aggregation, low complexity; stadium-upgrades is the meatier one.

**Risks:**
- If trophies-history templates feel flat (text generation in v1.1 is just templates), the museum may feel sterile. Mitigation: prioritize narrative-ai.md (v1.2+) integration soon after v1.1 ships. Plan v1.2 sprint immediately after v1.1 launch.
- Sprite generation pipeline must produce 12-15 cohesive museum assets — risk of visual inconsistency. Mitigation: art-bible review with art-director before mass generation; produce 2-3 reference sprites first and validate before full batch.

## ADR Dependencies

| ADR | Relation |
|---|---|
| ADR-021 (Canvas Rendering Pipeline) | Reuses — `/city` rendering still goes through PixiCanvas |
| ADR-029 (Stadium Upgrades Module) | Sibling — together they replace city-progression's gameplay layer |
| ADR-005 (WorldState persistence) | Read-only consumer |
| ADR-023 (DOM-Canvas Event Router) | Reuses — click→redirect pattern in barrio scene |
| ADR-024 (Canvas A11y Fallback) | Required — `/city-text` route as DOM fallback |
| ADR-004 (Narrative AI architecture) | Future consumer — v1.2+ text generation |
| ADR-006 (Isometric Rendering) | Partially deferred — museum is interior view (less complex than full city) |

## GDD Requirements Addressed

| TR-ID (future) | Requirement | GDD source |
|---|---|---|
| TR-TH-001 | `/city` renders barrio (museum + stadium ext + manager office ext) | trophies-history.md §3.2 |
| TR-TH-002 | Click stadium → redirect `/stadium` | trophies-history.md §3.2 + AC-TH-02 |
| TR-TH-003 | Click museum → dolly interior, 5 zones | trophies-history.md §3.2 + AC-TH-04 |
| TR-TH-004 | Trophy materialization from league-system | trophies-history.md §3.3.1 |
| TR-TH-005 | Banner materialization (ascensos + legendary matches) | trophies-history.md §3.3.2, F1 |
| TR-TH-006 | Hall of fame (TOP_5 + legend transfers) | trophies-history.md §3.3.3, F2, F3 |
| TR-TH-007 | Financial milestones | trophies-history.md §3.3.4 |
| TR-TH-008 | Stadium history timeline | trophies-history.md §3.3.5 |
| TR-TH-009 | Text contextual templated (v1.1) | trophies-history.md §3.4 + AC-TH-14, AC-TH-15 |
| TR-TH-010 | Read-only invariant | trophies-history.md + AC-TH-26 |
| TR-TH-011 | Determinismo | trophies-history.md + AC-TH-25 |
| TR-TH-012 | Performance: page-load <800ms with 100 objects | trophies-history.md AC-TH-22 |
| TR-TH-013 | DOM fallback `/city-text` | trophies-history.md AC-TH-24 |

Full ACs in trophies-history.md §8 (AC-TH-01 through AC-TH-27).
