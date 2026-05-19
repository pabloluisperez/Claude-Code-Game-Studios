# ADR-017: UI Input Control Taxonomy

## Status
Accepted

## Date
2026-05-19 (Proposed → Accepted same day — formalizes the input-control
pattern validated during Pablo's live playtest 2026-05-18; resolves
OQ-HUD-09 (input control taxonomy) and OQ-HUD-10 (domain-language
formatting) from `hud-ui.md`).

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — SvelteKit 2 + Svelte 5 (runes) + `svelte-range-slider-pips@4.1.1` |
| **Domain** | Presentation / Frontend |
| **Knowledge Risk** | HIGH — Svelte 5 runes are post-cutoff (verified with caveats during slice). `svelte-range-slider-pips@4.1.1` is post-cutoff and has known issues with `bind:value` + `$state` runes (see control-manifest cross-cutting rule). |
| **References Consulted** | `design/gdd/hud-ui.md` OQ-HUD-09 + OQ-HUD-10 (post-slice 2026-05-18), `docs/engine-reference/web/modules/frontend.md`, vertical slice `prototypes/cascada-vertical-slice-mes1/src/web/src/routes/+page.svelte` + `src/lib/format.ts`, ADR-012 (UI architecture DOM↔Canvas frontier — MVP DOM-only) |
| **Post-Cutoff APIs Used** | Svelte 5 `$state`/`$derived`/`$derived.by`/`$effect` runes; `svelte-range-slider-pips@4.1.1` `<RangeSlider>` component with pips + color zones |
| **Verification Required** | Manual: every player-facing numeric input renders via the correct control family; no raw 0-100 sliders. Automated: lint rule forbidding `<input type=range>` outside `apps/web/src/lib/controls/` if feasible. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-001 (Web stack — SvelteKit chosen), ADR-012 (DOM-only MVP — no canvas inputs) |
| **Enables** | `hud-ui` epic stories — unblocks `/ux-design` for Dashboard / Match-live / Manager / Staff-inbox / End-of-month |
| **Blocks** | `hud-ui` epic implementation until Accepted |
| **Ordering Note** | Independent of ADR-014/015/016. Can be Accepted in parallel. ADR-018 (Match Visual Feedback) is a companion to this — both came out of the same playtest round. |

## Context

### Problem Statement

The slice initially shipped two 0–100 sliders for `training_intensity` and
`ticket_price_index`. Pablo's playtest 2026-05-18 surfaced two intertwined
design observations:

1. **OQ-HUD-09 (Input Control Taxonomy)**: a generic 0–100 slider is wrong
   for some inputs. Categorical decisions (intensidad de entrenamiento: muy
   bajo / bajo / normal / alto / muy alto) want a **button group**. Quantitative
   decisions with a natural unit (precio de entrada en euros) want a **slider
   IN that unit, not in an abstract 0–100 index**. Item selection (formation,
   player from bench) wants a **dropdown / select**.

2. **OQ-HUD-10 (Domain-Language Formatting)**: numeric WorldState values
   shown to the player should NEVER be raw scalars. `fan_momentum: 35` should
   render as "Afición: desencantada"; `team_fitness: 55` as "Estado físico:
   regular"; `fan_attendance: 30%` as "900 personas (poco lleno)". The
   slice implemented this in `apps/web/src/lib/format.ts` as a starting
   reference.

These are not surface-level styling decisions — they affect how every player
input and every player-facing metric is rendered. Without an ADR, every
sprint risks inconsistent control families and re-discovering the
domain-language rule.

### Constraints

- Server-authoritative state (technical-preferences.md): the UI does not
  hold game state, it renders + sends decisions. The control family choice
  affects the SHAPE of the decision payload but NOT the engine internals.
- Engine still consumes 0–100 indices internally (cascade-engine `runTick`
  operates on indexed nodes). The UI is responsible for translating
  domain-language inputs to engine indices and back.
- Svelte 5 caveats (verified by slice):
  - Local variable named `state` collides with `$state` rune detection — rename.
  - `bind:value` on `<input>` has known issues with `$state` — use `value` +
    `oninput` event handlers OR component-level `bind:values` (works) for
    library components like `svelte-range-slider-pips`.
  - `$derived` narrowing requires `$derived.by()` for some optional-chain
    patterns (verified twice by slice).

### Requirements

The UI input layer must:

1. Map each player-facing input to a control family per type:
   - Categorical → button group
   - Quantitative with natural unit → discrete slider in that unit
   - Item selection → select / dropdown
2. Provide a shared formatter library (`packages/shared/src/types/format.ts`)
   for all numeric metrics → domain-language strings.
3. Provide reusable Svelte components for each control family.
4. Translate domain-language inputs to engine indices at the API boundary
   (`apps/web/src/lib/api.ts`).
5. Forbid raw 0-100 sliders for player-facing inputs (lint or PR-review).

## Decision

**Three control families. One formatter library. Translation at the UI ↔
API boundary. Tooling enforces the boundary.**

### Control Family Mapping

| Input type | Control family | Component | Library |
|-----------|---------------|-----------|---------|
| **Categorical** (3-7 named choices, mutually exclusive) | Button group / segmented control | `<ButtonGroup>` (slice has prototype) | Native Svelte, no lib |
| **Quantitative with natural unit** (€, %, hours, sliders with snap) | Discrete slider with pips + color zones, labelled in unit | `<UnitSlider>` wrapping `<RangeSlider>` | `svelte-range-slider-pips@4.1.1` |
| **Item selection** (1-of-N from a list of distinct entities like formations, players, sponsors) | Select / dropdown OR scrollable grid (>~10 items) | `<ItemSelect>` | Native Svelte |
| **Binary choice in narrative context** (yes/no to an event option) | Two-button group (per event modal) | `<EventChoiceButtons>` | Native Svelte (drives ADR-018 event modals too) |

**Decision rule**: when in doubt between button group and slider, **prefer
button group** if there are ≤7 named buckets and the buckets feel
qualitatively different. Use slider only when the player is reasoning in a
natural unit (€, %, h) with smooth continuity within the unit.

### Inputs Catalog (MVP)

| Input | Source GDD | Family | Component / config |
|-------|-----------|--------|-------------------|
| `training_intensity` | cascade-engine.md | Categorical | ButtonGroup: muy_bajo / bajo / normal / alto / muy_alto (5 buckets, internal indices 10/30/50/70/90) |
| `ticket_price_index` | economy.md | Quantitative € | UnitSlider step=5€, min=5, max= maxTicketEur(club) (per ADR-014); index = euros × 5 |
| `catering_budget` | cascade-engine.md | Categorical | ButtonGroup: minimo / bajo / normal / alto (4 buckets, indices 20/40/60/80) |
| `groundskeeper_budget` | cascade-engine.md | Categorical | ButtonGroup: minimo / bajo / normal / alto (4 buckets) |
| `scouting_budget` | cascade-engine.md | Categorical | ButtonGroup: minimo / bajo / normal / alto (4 buckets) |
| Match formation | match-simulation.md | Item select | ItemSelect: 4-4-2 / 4-3-3 / 3-5-2 / 5-3-2 |
| Match instruction | match-simulation.md | Categorical (3-option) | ButtonGroup: NORMAL / HOLD_SHAPE / PRESS_HIGH / COUNTER (4 mutually exclusive) |
| Substitution player choice (during interactive match) | match-simulation.md / ADR-013 | Item select | ItemSelect (bench list) |
| Skill point allocation | manager-rpg.md | Item select (1 of 5 skills) | ButtonGroup (5 skills are categorical) or ItemSelect for tier-3 expansion |
| Sponsor choice / Transfer offer / Board meeting choice (special events) | ADR-015 EventDecisionPayload | Categorical (event options) | EventChoiceButtons (per modal) |

### Domain-Language Formatter Library

Lives in `packages/shared/src/types/format.ts` (slice has the file in
`apps/web/src/lib/format.ts` as a starting reference; production moves it
to `packages/shared` so server-side staff message generation can also use it).

```typescript
// packages/shared/src/types/format.ts

export type Severity = 'good' | 'neutral' | 'warn' | 'bad';
export interface MetricLabel { text: string; severity: Severity; }

// Per-node domain-language buckets:
export function formatFitness(value: number): MetricLabel { /* ... */ }
export function formatFanMomentum(value: number): MetricLabel { /* ... */ }
export function formatAttendance(pct: number, capacity: number): {
  absolute: number; percent: number; qualitative: MetricLabel;
}
export function formatInjuryRisk(value: number): MetricLabel { /* ... */ }
export function formatMpi(value: number): MetricLabel { /* ... */ }
export function formatFinancialStatus(status: 0|1|2|3): MetricLabel { /* ... */ }
export function formatBalance(balanceEurK: number): MetricLabel { /* ... */ }
// ... per node that appears in player-facing UI
```

**Bucket definitions are normative** — they live in the shared package
specifically so server-side staff messages can refer to the same labels:
"Carmen comenta: la afición está **desencantada**." (Carmen reads the same
formatter the HUD displays.)

### Translation at the UI ↔ API boundary

```typescript
// apps/web/src/lib/translate.ts

export function intensityBucketToIndex(bucket: 'muy_bajo'|'bajo'|'normal'|'alto'|'muy_alto'): number {
  const map = { muy_bajo: 10, bajo: 30, normal: 50, alto: 70, muy_alto: 90 };
  return map[bucket];
}

export function indexToIntensityBucket(idx: number): 'muy_bajo'|'bajo'|'normal'|'alto'|'muy_alto' {
  // Reverse map, snap to nearest bucket
  if (idx < 20) return 'muy_bajo';
  if (idx < 40) return 'bajo';
  if (idx < 60) return 'normal';
  if (idx < 80) return 'alto';
  return 'muy_alto';
}

export function eurosToTicketIndex(eurosPerEntry: number, marketEur: number): number {
  return Math.round((eurosPerEntry / marketEur) * 50);
}

export function ticketIndexToEuros(idx: number, marketEur: number): number {
  return Math.round((idx / 50) * marketEur);
}
```

The API client (`apps/web/src/lib/api.ts`) accepts UI-domain values
(`intensityBucket`, `ticketPriceEur`) and translates them to engine indices
in the POST payload. The engine NEVER sees domain-language values.

### Reusable Components

```svelte
<!-- apps/web/src/lib/controls/ButtonGroup.svelte -->
<script lang="ts" generics="T extends string">
  interface Props {
    value: T;
    options: Array<{ id: T; label: string; description?: string; severity?: 'good'|'neutral'|'warn'|'bad' }>;
    onChange: (newValue: T) => void;
    'aria-label'?: string;
  }
  let { value, options, onChange, ['aria-label']: ariaLabel }: Props = $props();
</script>

<div class="button-group" role="radiogroup" aria-label={ariaLabel}>
  {#each options as opt (opt.id)}
    <button
      class:active={value === opt.id}
      class:good={opt.severity === 'good'}
      class:warn={opt.severity === 'warn'}
      class:bad={opt.severity === 'bad'}
      role="radio"
      aria-checked={value === opt.id}
      onclick={() => onChange(opt.id)}
      title={opt.description}
    >
      {opt.label}
    </button>
  {/each}
</div>
```

Similar shells for `<UnitSlider>` (wraps `RangeSlider` from
`svelte-range-slider-pips`), `<ItemSelect>`, and `<EventChoiceButtons>`. All
live in `apps/web/src/lib/controls/`.

### Lint Rule (recommended, not blocking)

A custom ESLint rule or `grep`-based pre-commit hook can flag:

```
# Disallow <input type="range"> outside the controls library
grep -r '<input type="range"' apps/web/src/routes/  # should be empty
```

This is a guardrail, not a strict gate — exceptions go through a control-
manifest amendment.

## Alternatives Considered

### Alternative A: Single "control component" that switches at runtime

- **Description**: One `<NumericInput>` component that picks between slider /
  button group / select based on prop config.
- **Pros**: One component to import.
- **Cons**: API becomes complex (a polymorphic prop bag); harder to type;
  harder to style each family consistently.
- **Rejection**: Three small, distinct components are easier to use, type,
  test, and style than one polymorphic one.

### Alternative B: All inputs as sliders (with discrete snap)

- **Description**: Use the library slider universally, just with `step` set
  to bucket size for categorical inputs.
- **Pros**: One library, one interaction model.
- **Cons**: Sliders communicate "continuous spectrum"; buttons communicate
  "discrete choice." Categorical inputs feel weird as sliders (Pablo's playtest
  exact feedback).
- **Rejection**: Information design is the point. Different concepts deserve
  different controls.

### Alternative C: Free choice per screen (no taxonomy)

- **Description**: Let each `/ux-design` session decide ad-hoc.
- **Pros**: Maximum flexibility for designers.
- **Cons**: Inconsistent UX across the app; every new screen re-debates the
  same point.
- **Rejection**: The taxonomy is the point. Without rules, every screen
  re-derives them poorly.

## Consequences

### Positive

- Consistent UX across all decision screens
- Domain-language formatters shared between server (staff messages) and
  client (HUD) — single source of truth for "what does fan_momentum=35 mean
  in words"
- Three small reusable components (ButtonGroup, UnitSlider, ItemSelect)
- Translation at the boundary keeps the engine indices stable while letting
  the UI evolve

### Negative

- Three components to write + maintain (vs one polymorphic)
- Onboarding new contributors requires teaching the taxonomy
- Library dependency (`svelte-range-slider-pips@4.1.1`) added to allowed
  libraries (slice already uses it)

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Designers default to slider for everything (out of habit) | MEDIUM | LOW | Explicit lint rule + control-manifest reference in `/ux-design` skill |
| Formatter buckets drift between server and client | LOW | MEDIUM | Formatters live in `packages/shared` — single source. Tests assert label outputs for boundary values. |
| Library breaking change in svelte-range-slider-pips | LOW | MEDIUM | Version pinned; library has 17 releases and is maintained; we wrap it in `<UnitSlider>` so swap is local |

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| hud-ui.md OQ-HUD-09 | Input control taxonomy | Three control families with explicit assignment per input |
| hud-ui.md OQ-HUD-10 | Domain-language formatting | Shared formatter library in `packages/shared`; per-node buckets normative |
| cascade-engine.md / economy.md / ADR-014 | UI does not show raw 0-100 indices | Translation layer in `apps/web/src/lib/translate.ts` and inputs catalog above |
| ADR-015 EventDecisionPayload | Special events need consistent option presentation | `<EventChoiceButtons>` component renders any payload's `options` map |
| game-concept.md Pilar 4 (Calm Is The Tempo) | Decisions should feel deliberate, not micro-tweaked | Button groups (snap to buckets) embody this better than continuous sliders |
| game-concept.md Pilar 1 (Tinkering Beats Optimization) | Player explores discrete options vs min-maxing a slider | Categorical button groups invite "which bucket should I try?" rather than "which exact value optimises?" |

## Performance Implications

- **CPU**: Component renders are O(n) where n = number of options per control
  (typically ≤7). Negligible.
- **Bundle**: `svelte-range-slider-pips@4.1.1` is ~30KB minified, ~10KB gzipped.
  Acceptable; the slice already includes it.
- **Network**: Translation happens client-side — no extra round-trips.

## Related Decisions

- [ADR-001](ADR-001-web-stack.md) — SvelteKit chosen; this ADR specifies UI patterns within it
- [ADR-012](ADR-012-ui-architecture-dom-canvas-frontier.md) — DOM-only MVP; this ADR specifies what the DOM looks like for inputs
- [ADR-014](ADR-014-economy-financial-flow.md) — `maxTicketEur(club)` formula consumed by `<UnitSlider>` for the price input
- [ADR-015](ADR-015-special-event-decision-schema.md) — Event modals use `<EventChoiceButtons>` driven by the `options` map of each payload
- [ADR-018](ADR-018-match-event-visual-feedback.md) — Match event modals build on this ADR's button group + countdown timer pattern
- `design/gdd/hud-ui.md` — OQ-HUD-09 + OQ-HUD-10 (resolved by this ADR)
- `prototypes/cascada-vertical-slice-mes1/src/web/src/lib/format.ts` — Reference implementation of formatter library; production moves to `packages/shared`
