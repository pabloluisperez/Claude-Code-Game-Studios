# UX Spec: Dashboard

> **Status**: In Design (initial draft 2026-05-19)
> **Author**: ux-designer (autonomous run) + Pablo review pending
> **Last Updated**: 2026-05-19
> **Source GDD**: `design/gdd/hud-ui.md` (Approved R3 2026-05-18)
> **ADRs governing this screen**: ADR-012 (DOM-only MVP), ADR-017 (input control taxonomy + formatter library), ADR-018 (match-week CTA pattern)
> **Resolves**: OQ-HUD-01 (Dashboard KPIs + hierarchy), OQ-HUD-08 (empty states — Dashboard only)
> **Template**: UX Spec

---

## 1. Purpose and Player Goals

The Dashboard is the **home base** of every session. It is the first screen the player
sees after loading their save and the screen they return to after every `AdvanceResult`
is processed. Its single job is to answer the player's silent question on arrival:

> "Where am I, what just happened, and what should I do next?"

### Player-task hierarchy (ordered by urgency on arrival)

1. **Orient** — understand the current week, financial health, and league position at a
   glance without reading any sub-panel.
2. **Decide** — set training intensity and ticket price for the upcoming week.
3. **Act** — press Avanzar (or navigate to the live match if it is match week).
4. **Reflect** (optional) — read the result panel from the previous advance to understand
   cascading effects before committing the next decision.
5. **Explore** (optional) — follow the staff link to dig deeper into messages that explain
   the observed changes.

The screen does not require the player to open any sub-panel to complete tasks 1–3.
Sub-panels (Plantilla, Staff, Finanzas) are consulted voluntarily. Dashboard is always
the starting point and the landing point.

### Pillar alignment

| Pillar | How this screen serves it |
|--------|---------------------------|
| **P1 — Tinkering Beats Optimization** | Metrics are formatted in domain language, not raw numbers. The player sees "Afición: desencantada" not "fan_momentum=35". The relationship between decisions and outcomes is not explained on this screen — it is observed over time. |
| **P3 — You Grow Like Your Club** | The metric grid and result panel are the player's read of the world. As staff quality improves, staff messages (accessible from the result panel link) become more precise — but the Dashboard metrics stay the same labels. Progress is visible in the world, not in more statistics. |
| **P4 — Calm Is The Tempo** | Avanzar is the only required action. There is no countdown, no blinking, no urgency indicator beyond the financial status icon. The screen waits for the player. |

---

## 2. Player Context on Arrival

**First visit (t=0, new save)**: The player arrives cold. They have not yet made any
decision. The club (Real Pueblo CF in the starting scenario) is a mess: fan_momentum=35
(Desencantada), team_fitness=70 (Buena, starting default), no match results yet. The
onboarding banner explains the starting situation and what two decisions they must make.
The player arrives curious and possibly uncertain. The screen must be calm and readable.

**Subsequent visits (returning after advance)**: The player arrives with context from
the previous week. They may have seen a result in the advance overlay. The result panel
shows the closed week's outcome. The onboarding banner is hidden. The player is in
"reading and deciding" mode — checking what changed and setting the next week's decisions.

**After a match week**: The player arrives having chosen to advance through (or skip)
a match. The result panel shows the match score and any threshold crossings. If the
player is mid-match-week and `isMatchWeek=true`, the match CTA is visible above the
metrics grid.

**Navigation**: The player always arrives here:
- On fresh load (SvelteKit route `/`)
- After `POST /api/game/advance` resolves (the AdvanceResult handler calls `goto('/')`)
- After pressing the Dashboard nav icon from any other panel
- Via auto-redirect when `currentWeek > 4` delivers them to `/end-of-month` first, then back here for the next month

---

## 3. Navigation Position

```
Root (/)
  └── Dashboard  ← this screen (default route)
        ├── exits to /match  (match-week CTA)
        └── exits to /end-of-month  (auto-redirect when currentWeek > 4)

Top-level nav peers (always accessible from Dashboard):
  /squad (Plantilla), /staff (Staff), /finance (Finanzas)
```

The Dashboard is the root route. It is always reachable by pressing the Dashboard icon
in the tab bar (mobile) or sidebar nav (desktop).

---

## 4. Entry and Exit Points

### Entry

| Entry Source | Trigger | Player carries this context |
|---|---|---|
| Fresh load | `onMount` calls `getState()` | Nothing — state loaded from server |
| Post-advance redirect | `AdvanceResult` received → `goto('/')` | `lastResult` (week outcome, match result, threshold crossings) |
| Nav icon tap | User presses Dashboard nav icon | Current `pt` (GameState) already loaded |
| Auto-return after end-of-month | Player completes `/end-of-month` flow | Fresh month state |

### Exit

| Exit Destination | Trigger | Notes |
|---|---|---|
| `/match` | Player taps "Jugar partido en directo" CTA | Only available when `isMatchWeek=true` |
| `/end-of-month` | `currentWeek > 4` auto-redirect on mount or after advance | One-way until the month closes; player returns here after |
| `/squad`, `/staff`, `/finance` | Nav icon tap | Non-destructive; decisions in progress (training intensity, price) are preserved in component state until the player presses Avanzar |

---

## 5. Layout Specification

### 5.1 Information Hierarchy

Priority from most to least critical on arrival:

1. **Week + next event** — orients the player in time (HUD strip, always visible)
2. **Financial status** — signals if there is a crisis requiring attention (HUD strip)
3. **Match-week CTA** (conditional) — actionable only if `isMatchWeek=true`; must be seen before Avanzar
4. **Metrics grid** — four at-a-glance state indicators (fitness, fan momentum, attendance, week number)
5. **Decision controls** — the two inputs the player sets each week
6. **Avanzar button** — the primary commit action
7. **Result panel** (conditional) — previous week's outcome, rendered after the first advance
8. **Onboarding banner** (conditional) — only on week 0 / before any advance
9. **Error notice** (conditional) — API connectivity failures

### 5.2 Layout Zones

```
┌─────────────────────────────────────────────────────────────────┐
│ ZONE A: HUD Strip (z-10, always visible, sticky top)            │
│  [Club siglas] [S1 · T1] [⚽ Partido · 3d] [💚 Safe · €45K]    │
│  [📬 3]                                      [Avanzar →]        │
├─────────────────────────────────────────────────────────────────┤
│ ZONE B: Page header (below HUD strip, scrolls)                  │
│  "Esta semana"                                                   │
├─────────────────────────────────────────────────────────────────┤
│ ZONE C: Error notice (conditional, renders when error ≠ null)   │
├─────────────────────────────────────────────────────────────────┤
│ ZONE D: Onboarding banner (conditional, t=0 only)              │
├─────────────────────────────────────────────────────────────────┤
│ ZONE E: Match-week CTA (conditional, isMatchWeek=true only)     │
├─────────────────────────────────────────────────────────────────┤
│ ZONE F: Metrics grid (4-column auto-fit, min 140px per cell)    │
│  [Semana] [Estado físico] [Afición] [Asistencia]                │
├─────────────────────────────────────────────────────────────────┤
│ ZONE G: Decisions panel                                         │
│  Heading: "Decisiones de esta semana"                           │
│  [Training intensity: ButtonGroup 5-bucket]                     │
│  [Ticket price: UnitSlider €]                                   │
│  [Avanzar semana →] button (Primary)                            │
├─────────────────────────────────────────────────────────────────┤
│ ZONE H: Result panel (conditional, rendered after first advance) │
│  "Semana X cerrada"  [match result] [thresholds] [level-up]     │
│  [Ver lo que dice el staff →]                                   │
└─────────────────────────────────────────────────────────────────┘
│ ZONE I: Bottom tab bar (mobile, z=above panels per hud-ui.md)   │
└─────────────────────────────────────────────────────────────────┘
```

**Zone A (HUD strip)** is part of the global layout, not the Dashboard page. It is
specified in `hud-ui.md`. The Dashboard scroll area starts below it.

**Zone E (match CTA)** renders above the metrics grid because it is actionable and
time-relevant. The player must see it before deciding whether to Avanzar or go live.

**Zone H (result panel)** renders below the decision panel because it is retrospective.
The player's immediate job is to decide the next week; reflecting on the last one is
secondary.

### 5.3 Component Inventory

#### Zone C — Error Notice

| Property | Value |
|---|---|
| Component type | Alert panel |
| Content | Error string from `getState()` or `postAdvance()` failure, prefixed with connection status icon |
| Interactive | No (read-only) |
| Pattern reference | Not a Toast (this is persistent until resolved) — standalone alert variant |
| Empty state | Hidden when `error === null` |
| Accessibility | `role="alert"` so screen readers announce immediately; `aria-live="assertive"` |

**Copy convention**: "API ✗ — [error message]". The "API ✗" prefix surfaces the
connectivity context without technical jargon.

#### Zone D — Onboarding Banner

| Property | Value |
|---|---|
| Component type | Info panel with dismiss |
| Content | Welcome heading + 3 paragraphs explaining the starting state, two decisions, and the calm tempo |
| Interactive | Dismiss button ("Empezar") |
| Pattern reference | [Empty State](#empty-state) pattern extended with explanation copy |
| Visibility condition | `showOnboarding === true` AND the player has not yet advanced past week 0 |
| Dismiss behaviour | Pressing "Empezar" sets `showOnboarding = false` (local state, not persisted — see Edge Cases §13.2) |

**Rationale for local state only**: The onboarding banner serves the first visit in a
session. If the player reloads before advancing, seeing it again is acceptable — it
costs nothing. Persisting "dismissed" to the server would require an API call solely to
suppress a banner. Not worth the complexity in MVP.

**Production copy (aligned with slice, approved by Pablo in playtest):**

> **Bienvenido al Real Pueblo CF**
>
> Acabas de aterrizar en la oficina de un club humilde en **Segunda División**. La
> afición está desencantada, las finanzas justas, y tienes 4 jornadas para empezar a
> dar señales.
>
> Cada semana decides dos cosas: **cómo entrenar** y **cuánto cobrar la entrada**. El
> staff te avisará si ve algo raro. Las cascadas son reales — y a veces contraintuitivas.
>
> *Toma una decisión y pulsa Avanzar semana. No hay reloj — el tiempo se detiene hasta
> que tú lo decidas. Calma.*
>
> [Empezar]

The raw metric values (fan_momentum=35) that appeared in the slice onboarding copy are
removed in production — they break domain-language formatting and expose engine internals
(Pilar 1). The formatted label ("La afición está desencantada") replaces them.

#### Zone E — Match-Week CTA

| Property | Value |
|---|---|
| Component type | Contextual action panel |
| Content | Heading + one-line explanation + primary link button |
| Interactive | Primary link: "Jugar partido en directo →" navigates to `/match` |
| Pattern reference | [Button](#button) pattern (Primary variant, large on mobile) |
| Visibility condition | `isMatchWeek === true` AND player state is loaded AND `showOnboarding === false` |
| Border styling | `border-color: var(--warn)` (amber, non-alarming — per hud-ui.md Visual/Audio) |

**Copy:**

> **Hay partido esta semana**
>
> Puedes jugar el partido en directo (con decisiones tácticas en los momentos clave), o
> avanzar directamente y dejar que el equipo lo juegue solo.
>
> [Jugar partido en directo →]

**Relationship to ADR-018**: This CTA is the Dashboard-side entry point for the match
live view. Per ADR-018, when `isMatchWeek=true`, the player must be explicitly invited
to `/match` before pressing Avanzar — otherwise they will auto-process the match
without watching. The CTA must be visible and prominent. It does not block Avanzar; it
is an opt-in.

**Accessibility**: The link button has `aria-label="Jugar el partido en directo esta semana"` — provides context beyond the visible label text.

#### Zone F — Metrics Grid

A responsive 4-column grid (CSS `grid-template-columns: repeat(auto-fit, minmax(140px, 1fr))`).
On 375px mobile this collapses to 2 columns × 2 rows.

Each cell is a [Stat Display](#stat-display) panel card. The four cells:

| Cell | Metric | Source field | Formatter | Empty state |
|---|---|---|---|---|
| **Semana** | Current week number | `pt.playthrough.currentWeek` | Raw integer (no formatter needed — it is already meaningful) | "—" |
| **Estado físico** | `team_fitness` [0,100] | `pt.snapshot.state.team_fitness` | `formatFitness(value)` → "Muy mala / Mala / Regular / Buena / Excelente" | "—" (dim text) |
| **Afición** | `fan_momentum` [0,100] | `pt.snapshot.state.fan_momentum` | `formatFanMomentum(value)` → "En crisis / Desencantada / Inquieta / Neutra / Animada / En llamas" | "—" (dim text) |
| **Asistencia (último)** | `fan_attendance` [0–100 % of capacity] | `pt.snapshot.state.fan_attendance` | `formatAttendance(pct, stadiumCapacity)` → absolute count + qualitative | "Sin partidos aún" |

**Metric label accessibility pattern**: each metric cell has:
- Visible label (e.g., "Estado físico") in `metric-label` class
- Formatted value (e.g., "Regular") in `metric-value-text` with severity class
- `aria-label` on the cell container: "Estado físico: Regular" — combines label + value for screen readers

**Attendance cell special rendering**: shows two sub-lines:
```
900 personas
Poco lleno · 30% del aforo
```
The absolute count is the primary value (large text); qualitative + percent is secondary (small, dim).

#### Zone G — Decisions Panel

Heading: "Decisiones de esta semana"

**G1: Training Intensity — ButtonGroup**

Per ADR-017 §Control Family Mapping: categorical input → ButtonGroup.

| Property | Value |
|---|---|
| Control | `<ButtonGroup>` (5 options, ADR-017 taxonomy) |
| Label | "Intensidad de entrenamiento" |
| Options (display label → internal id → engine index) | "Muy bajo" → `muy_bajo` → 10 · "Bajo" → `bajo` → 30 · "Normal" → `normal` → 50 · "Alto" → `alto` → 70 · "Muy alto" → `muy_alto` → 90 |
| Default | `normal` (hydrated from server state on mount; fallback `normal` if no snapshot) |
| Severity hints | `muy_bajo: warn` · `bajo: neutral` · `normal: good` · `alto: neutral` · `muy_alto: bad` |
| Hint copy | "Parábola invertida (C4): el centro premia, los extremos castigan. Con rachas de derrota, mantener intensidad alta sobreentrena." |
| ARIA | `role="radiogroup"` on container, `role="radio"` + `aria-checked` per button |

**ADR-017 label alignment**: The slice used "Descanso / Suave / Normal / Fuerte / Brutal" (5 Spanish vernacular labels). ADR-017 specifies the bucket IDs as `muy_bajo / bajo / normal / alto / muy_alto` with the note that display labels should reflect the football domain. The production labels "Muy bajo / Bajo / Normal / Alto / Muy alto" are cleaner and closer to the ADR-017 ID naming. The severity encoding (warn on extremes, good on normal) is preserved from the slice.

**Open Question OQ-DASH-01** (flagged): Should the labels use vernacular ("Descanso", "Brutal") from the slice or the more literal "Muy bajo / Muy alto"? The slice labels were validated by Pablo's playtest. Recommend keeping slice labels for production. Flag for explicit confirmation.

**G2: Ticket Price — UnitSlider**

Per ADR-017 §Control Family Mapping: quantitative with natural unit (€) → UnitSlider.

| Property | Value |
|---|---|
| Control | `<UnitSlider>` wrapping `<RangeSlider>` from `svelte-range-slider-pips@4.1.1` |
| Label | "Precio de la entrada" |
| Unit | Euros (€) |
| Min | 0€ |
| Max | `maxTicketEur(club)` per ADR-014 formula (placeholder: 25€ for Real Pueblo CF in Segunda humilde) |
| Step | 5€ |
| Default | Market price (hydrated from server state; fallback: 10€ for Real Pueblo CF) |
| Pip labels | 0€ "Gratis" · 5€ "Barato" · 10€ "Mercado" · 15€ "Caro" · 20€ "Muy caro" · 25€ "Carísimo" |
| Float handle label | "{N}€ · {qualitative label}" |
| Color zones on track | Green zone (0€–10€) · Amber zone (15€) · Red zone (20€–25€) |
| Hint copy | "El mercado de Segunda humilde es **10€**. Cobrar caro da más por entrada vendida, pero la afición tiene memoria." |
| ARIA | `ariaLabels={["Precio de la entrada"]}` per library spec |

**Translation at API boundary** (per ADR-017):
```
ticketPriceIndex = Math.min(100, Math.round((priceEur / marketEur) * 50))
```
The UI holds euros; the POST payload carries the engine index.

**G3: Avanzar Button**

| Property | Value |
|---|---|
| Control | Primary `<Button>` (large size on mobile) |
| Label | "Avanzar semana →" |
| States | `ready` (default) · `processing` (during API call — shows "Procesando…" + spinner) |
| Disabled condition | `pending === true` |
| ARIA | `aria-disabled={pending}` · `aria-busy={pending}` |
| Action | `postAdvance({ training_intensity, ticket_price_index })` then `refresh()` |

**Label note**: Per hud-ui.md Regla 4, the HUD strip's Avanzar button uses the generic
label "Avanzar" (not destination-named). The Dashboard page's Avanzar button uses
"Avanzar semana →" because its context (the decisions panel) makes the meaning clear —
the player is committing this week's decisions and advancing to the next week. These are
two different button instances; both are valid under Pilar 4.

#### Zone H — Result Panel

Rendered after the first advance (`lastResult !== null`).

| Property | Value |
|---|---|
| Component type | Info panel |
| Heading | "Semana {lastResult.weekProcessed} cerrada" |
| Content rows | Match result (if any) · Threshold crossings warning · Manager level-up notice |
| Footer link | "Ver lo que dice el staff →" navigates to `/staff` |

**Match result row** (renders when `lastResult.playerMatchOutcome` is not null):
```
Resultado: 2-1 · victoria local · ∆MPI {delta}
```
Score is always `homeScore-awayScore`. Winner label: "empate" / "victoria local" / "victoria visitante". Delta MPI shown as `∆MPI {value}` (signed integer).

**Threshold crossing row** (renders when `lastResult.thresholdCrossings.length > 0`):
```
⚠ {N} umbral(es) cruzados — revisa /staff.
```
Uses `warn` severity class. This is a hint, not a block — the player navigates to Staff voluntarily. The actual BLOCKING modal for critical crossings (fan_momentum ≤ 20, financial crisis) is handled by the HUD strip system per hud-ui.md, not by this panel.

**Manager level-up row** (renders when `lastResult.managerLeveledUp === true`):
```
↑ ¡Has subido de nivel! (Lvl {lastResult.managerState.level})
```
Uses `good` severity class.

**Accessibility**: The result panel has `role="status"` so screen readers announce its content when it appears (after a dynamic update). Only the topmost item (match result or threshold crossing) is announced via `aria-live="polite"` to avoid flooding.

---

## 6. Empty States

Resolves **OQ-HUD-08** for the Dashboard screen only.

### 6.1 Pre-first-advance (t=0)

The player has not yet pressed Avanzar. `pt.snapshot` may be null or `pt.snapshot.week === 0`.

| Zone | Empty state behaviour |
|---|---|
| Zone D — Onboarding banner | **Visible** — this IS the t=0 state. The banner explains the starting condition in plain language. No empty state pattern needed on top of it. |
| Zone F — Metrics grid | Metrics render with values from `pt.snapshot.state` even at t=0 (the server initialises the cascade state). If any individual metric is `undefined` (server did not send it), the cell shows "—" with dim text. The "Asistencia" cell shows "Sin partidos aún" at t=0 (no match has been played). |
| Zone G — Decisions panel | **Always visible**. Even at t=0, the player must set training intensity and price before advancing. No empty state needed — the controls render with their default values. |
| Zone H — Result panel | **Hidden** (`lastResult === null`). No empty state placeholder needed — the absence of the panel is itself the t=0 state. |
| Zone E — Match CTA | Visible if `isMatchWeek === true` at t=0 (first week is always a match week in Real Pueblo CF scenario). |

### 6.2 Loading state (pt === null, pending fetch)

When `pt` is `null` (initial mount, before `getState()` resolves):

- Zones D, E, F, G, H are all hidden
- A single line appears: "Cargando estado…" (dim text, centered in the content area)
- The HUD strip is always visible (it renders from cached state or skeleton)
- This state should be brief (< 500ms on a normal connection); no spinner needed in MVP

### 6.3 Attendance cell — no match yet

`fan_attendance` at t=0 may be 0 (no match played). The attendance formatter returns
`{ absolute: 0, percent: 0, qualitative: { text: "Vacío", severity: "bad" } }` for 0%.
Rather than show "0 personas · Vacío · 0% del aforo" (misleading — the stadium is not
empty, there just has been no match), show the explicit message "Sin partidos aún" in dim text.

**Condition**: render "Sin partidos aún" when `pt.snapshot.state.fan_attendance === 0`
AND `lastResult === null` (no advance has been made yet). After the first advance, even a
0% attendance should show the real formatted value (empty stands after a very unpopular
match is meaningful information).

### 6.4 Staff messages zero-state on Dashboard

The Dashboard does not show staff messages directly. Staff messages are accessed via
the Staff panel. The HUD strip badge for URGENT messages (from hud-ui.md) is always
present. When `total_unread_badge === 0`, the badge is hidden with `width:0; opacity:0`.

The result panel footer link "Ver lo que dice el staff →" is always shown after any
advance, even if there are no unread messages. Staff can have sent messages (check
BullMQ queue) that are worth reading proactively.

---

## 7. Input Control Spec (ADR-017)

### 7.1 Training Intensity — ButtonGroup

Applies ADR-017 §Control Family Mapping (Categorical → ButtonGroup).

```
Display label    | Internal ID | Engine index | Severity hint
-----------------+-------------+--------------+--------------
Muy bajo         | muy_bajo    | 10           | warn
Bajo             | bajo        | 30           | neutral
Normal           | normal      | 50           | good
Alto             | alto        | 70           | neutral
Muy alto         | muy_alto    | 90           | bad
```

**Translation at API boundary**:
```typescript
function intensityBucketToIndex(bucket: IntensityBucket): number {
  const map = { muy_bajo: 10, bajo: 30, normal: 50, alto: 70, muy_alto: 90 };
  return map[bucket];
}
```

**Hydration from server state**: on mount, the persisted `training_intensity` engine index
is snapped to the nearest bucket:
```typescript
const bucket = INTENSITY_BUCKETS.reduce((best, b) =>
  Math.abs(b.index - persisted) < Math.abs(best.index - persisted) ? b : best
).id;
```

**ARIA**: container `role="radiogroup"` with `aria-label="Intensidad de entrenamiento"`.
Each button `role="radio"` with `aria-checked={active}`.

**Focus behaviour**: Tab enters the group; Left/Right arrows navigate between options;
Enter or Space selects. Standard radio group keyboard pattern.

### 7.2 Ticket Price — UnitSlider

Applies ADR-017 §Control Family Mapping (Quantitative with natural unit → UnitSlider).

```
Config               | Value
---------------------+----------------------------------------------
Library              | svelte-range-slider-pips@4.1.1
Min                  | 0 (€)
Max                  | maxTicketEur(club)  [Real Pueblo: 25]
Step                 | 5 (€)
Default              | marketEur  [Real Pueblo: 10]
Pips                 | Every step (6 pips for 0–25€ range)
Pip label function   | formatPip(v) → "{v}€\n{qualitativeLabel}"
Handle label         | "{v}€ · {qualitativeLabel}"
bind:values pattern  | bind:values (works in svelte-5 per ADR-017 caveat)
```

**Translation at API boundary**:
```typescript
// index where marketEur maps to 50
ticketPriceIndex = Math.min(100, Math.round((priceEur / marketEur) * 50))
```

**Server hydration**: on mount, convert persisted `ticket_price_index` back to euros,
then snap to step:
```typescript
const euros = Math.round((persistedIndex / 50) * marketEur);
priceValues = [Math.round(euros / TICKET_STEP_EUR) * TICKET_STEP_EUR];
```

**Color zone guidance** (visual only — not the only encoding): track gradient uses
green at market-or-below, amber at caro, red at carísimo. Color is supplementary;
the pip labels carry the qualitative information.

**Mobile layout**: on 375px, the slider must have at least 44px touch target on the
thumb (per accessibility-requirements.md §6). The library's default thumb is 24px —
override via CSS to `--range-handle: 44px` height equivalent for mobile. This is a
known mobile caveat for `svelte-range-slider-pips`.

---

## 8. Domain-Language Formatting (ADR-017 §Formatter Library)

All player-facing numeric metrics are formatted via `packages/shared/src/types/format.ts`
(production location) or `apps/web/src/lib/format.ts` (slice reference). The spec below
is normative — it aligns with the slice's validated buckets.

### fan_momentum [0, 100]

| Range | Label | Severity |
|---|---|---|
| < 20 | "En crisis" | bad |
| 20–34 | "Desencantada" | warn |
| 35–49 | "Inquieta" | warn |
| 50–64 | "Neutra" | neutral |
| 65–79 | "Animada" | good |
| ≥ 80 | "En llamas" | good |

**BLOCKING threshold note**: fan_momentum < 20 triggers a BLOCKING modal (cascade-engine.md)
AND renders "En crisis" severity:bad on the Dashboard. The two are consistent.

### team_fitness [0, 100]

| Range | Label | Severity |
|---|---|---|
| < 30 | "Muy mala" | bad |
| 30–49 | "Mala" | warn |
| 50–64 | "Regular" | neutral |
| 65–79 | "Buena" | good |
| ≥ 80 | "Excelente" | good |

**Cascade note**: the cascade engine's training_intensity uses an inverted-U function
(C4). fitness values in the 65–80 range are the sweet spot; above 80 is possible but
not dramatically better. The formatter does not expose this — the player discovers it.

### fan_attendance [0–100 % of stadium capacity]

The formatter returns a composite object (per slice `format.ts`):

```typescript
interface AttendanceLabel {
  absolute: number;    // Math.round((pct / 100) * stadiumCapacity)
  percent: number;     // Math.round(pct)
  qualitative: MetricLabel;
}
```

| Range (%) | Qualitative label | Severity |
|---|---|---|
| < 15 | "Vacío" | bad |
| 15–34 | "Poco lleno" | warn |
| 35–59 | "Medio lleno" | neutral |
| 60–84 | "Lleno" | good |
| ≥ 85 | "Lleno hasta la bandera" | good |

**Display format on Dashboard**: "900 personas · Poco lleno" (primary line); "30% del aforo" (secondary line, dim).

**Stadium capacity source**: `stadiumCapacity` is loaded from `pt.snapshot.stadiumCapacity` when available; fallback to `STADIUM_CAPACITY_DEFAULT = 3000` (Real Pueblo CF starting capacity per slice). The formatter must accept an explicit capacity parameter.

### Severity visual encoding

Per accessibility-requirements.md §2: colour is never the only encoding.

| Severity | CSS class | Visual encoding (non-colour) |
|---|---|---|
| `good` | `.good` | Text colour `#2D6A4F` (dark green, ≥4.5:1 on `#F5F0E8`) — no icon needed for positive metrics |
| `neutral` | `.dim` | Text colour `var(--fg-dim)` — neutral, no additional marker |
| `warn` | `.warn` | Text colour `#8C5A00` (amber, ≥8.0:1) — no icon in metric cell (icon only in HUD strip) |
| `bad` | `.bad` | Text colour `#8B1A1A` (dark red, ≥14.6:1) — no icon in metric cell |

Icon usage in the HUD strip (for financial status) follows hud-ui.md Regla 3. Metric grid
cells use text colour only — no icons per cell.

---

## 9. Match-Week CTA (ADR-018)

When `isMatchWeek === true` (derived from `pt.playthrough.currentWeek >= 1 && currentWeek <= 4`
in the Real Pueblo CF scenario; in production, derived from `pt.snapshot.hasMatchThisWeek`):

**Behaviour**:
1. The CTA panel (Zone E) renders above the metrics grid.
2. It contains a Primary link button "Jugar partido en directo →" that navigates to `/match`.
3. Pressing Avanzar without visiting `/match` is permitted — the match runs automatically
   server-side. This is the "dejar que el equipo lo juegue solo" path.
4. The CTA does not disappear after the player visits `/match` and returns — it stays
   visible until `currentWeek` changes (i.e., after the advance processes the match result).

**Visual styling**: panel with `border-color: var(--warn)` (amber) — non-alarming, draws
attention without implying crisis. This border is purely visual context, not a severity
signal (contrast with financial crisis which uses red border per hud-ui.md Regla 3).

**Production derivation** (replacing the slice's hardcoded `w >= 1 && w <= 4`):

```typescript
const isMatchWeek = $derived(pt?.snapshot?.hasMatchThisWeek ?? false);
```

The server includes `hasMatchThisWeek: boolean` in the GameState snapshot, derived from
the current week's fixture calendar. The client does not compute this.

**Accessibility**: The link button text "Jugar partido en directo →" is descriptive.
`aria-label` augments it: `"Jugar el partido de esta semana en directo"`.

---

## 10. End-of-Month Auto-Redirect

When `pt.playthrough.currentWeek > 4`, the Dashboard auto-redirects to `/end-of-month`
before rendering any content. This is a SvelteKit `goto('/end-of-month')` call inside
the `refresh()` function, executed after the state is loaded.

**Condition** (in `refresh()`):
```typescript
if (pt.playthrough.currentWeek > 4) {
  await goto('/end-of-month');
  return;
}
```

**UX rationale**: The month has closed. Showing the Dashboard with week 5 data would
be confusing — the player should see the month summary before the next month begins.
The redirect is immediate with no intermediate screen. The `/end-of-month` route
handles the summary and then redirects back to the Dashboard for month 2.

**Edge case**: If the player is on the Dashboard and the advance result triggers
`currentWeek > 4`, the redirect happens as part of the `refresh()` call inside `advance()`.
The transition is: advance() → API response → refresh() → auto-redirect. No intermediate
Dashboard render occurs.

---

## 11. Onboarding Banner

First-visit copy (approved pattern from slice, copy refined for production):

**Visibility rule**: `showOnboarding` is `true` by default. It is set to `false`:
- When the player taps "Empezar"
- When the advance starts (in `advance()`, before `postAdvance()` call)
- When the player has advanced at least once before in this session (`(pt.snapshot?.week ?? 0) > 0`)

The third condition handles: player advances → refreshes the page → showOnboarding should
be false because they have a snapshot beyond week 0.

**Copy** (production, stripped of raw metric values per Pilar 1):

> **Bienvenido al Real Pueblo CF**
>
> Acabas de aterrizar en la oficina de un club humilde en **Segunda División**. La
> afición está desencantada, las finanzas justas, y tienes 4 jornadas para empezar
> a dar señales.
>
> Cada semana decides dos cosas: **cómo entrenar** y **cuánto cobrar la entrada**.
> El staff te avisará si ve algo raro. Las cascadas son reales — y a veces
> contraintuitivas.
>
> *Toma una decisión y pulsa Avanzar semana. No hay reloj — el tiempo se detiene
> hasta que tú lo decidas. Calma.*
>
> [Empezar]

**Accessibility**: the banner is in the natural tab order (below error notice, above
the match CTA). "Empezar" is a standard `<button>` (Primary variant). The banner has
`role="region"` and `aria-labelledby` pointing to its heading.

---

## 12. Accessibility

Per `accessibility-requirements.md` — WCAG 2.1 AA.

### 12.1 Keyboard navigation

| Element | Tab order | Action |
|---|---|---|
| HUD strip (global) | First in document (sticky) | Tab reaches HUD buttons (Avanzar, inbox icon) |
| Page content (Dashboard) | After HUD | Skip-link "Saltar al contenido principal" available |
| Error notice (if visible) | 1st in page body | Read only |
| Onboarding banner (if visible) | 2nd in page body | "Empezar" button: Enter / Space |
| Match-week CTA (if visible) | 3rd | Link button: Enter follows to /match |
| Metrics grid | 4th | Not interactive — no tab stops needed inside cells |
| Training intensity ButtonGroup | 5th | Tab enters group; Left/Right arrows navigate; Enter/Space selects |
| Ticket price UnitSlider | 6th | Tab focuses thumb; Left/Right arrows move by 5€ step; Home/End jump to min/max |
| Avanzar semana button | 7th | Enter / Space triggers advance |
| Result panel link (if visible) | 8th | "Ver lo que dice el staff →": Enter follows to /staff |
| Tab bar (mobile) / sidebar (desktop) | Last / persistent | Always accessible |

### 12.2 Screen reader labels

| Element | Accessible name / description |
|---|---|
| Metrics grid container | `role="region"` `aria-label="Métricas de la semana"` |
| Each metric cell | `aria-label="{label}: {formattedValue}"` e.g., "Estado físico: Regular" |
| Attendance cell | `aria-label="Asistencia al último partido: 900 personas, Poco lleno, 30% del aforo"` |
| Training intensity group | `aria-label="Intensidad de entrenamiento"` on radiogroup |
| Each intensity button | Visible label + `aria-checked` is sufficient |
| Price slider | `ariaLabels={["Precio de la entrada"]}` per library; `aria-valuetext="{priceEur}€ {qualitativeLabel}"` on thumb |
| Avanzar button (processing) | `aria-busy="true"` `aria-label="Avanzando, por favor espera"` when pending |
| Result panel | `role="status"` — announces new content on update |
| Error notice | `role="alert"` `aria-live="assertive"` |
| Onboarding banner | `role="region"` `aria-labelledby="onboarding-heading"` |

### 12.3 Colour and contrast

All text on `#F5F0E8` (warm paper background):
- Body text, labels, hints: `var(--fg)` — assumed ≥ 7:1 (verify in token lint)
- Dim text: `var(--fg-dim)` — must be ≥ 4.5:1 (verify; reduce-opacity dim patterns often fail)
- `good` text `#2D6A4F`: 10.7:1 — passes
- `warn` text `#8C5A00`: 8.0:1 — passes
- `bad` text `#8B1A1A`: 14.6:1 — passes
- Focus rings: ≥ 3:1 against their local backgrounds

### 12.4 Reduced motion

All Dashboard animations must respect `prefers-reduced-motion: reduce`:
- Panel transition (150ms ease-out): reduce to instant
- ButtonGroup active state (100ms): keep (≤ 200ms rule, but reduce to instant for safety)
- UnitSlider spring animation: reduce to instant jump (override `springValues` to `{ stiffness: 1, damping: 1 }` when reduced-motion active)
- Onboarding banner appearance: always instant (no entrance animation in MVP)

The match-week CTA border (amber) does not animate — safe.

### 12.5 WCAG checklist for this screen

- [x] Usable with keyboard only (full tab order defined above)
- [x] No gamepad support (none in MVP — documented and accepted)
- [x] Text readable at minimum font size (14px body, 12px hints where non-essential)
- [x] No information conveyed by colour alone (all metric states have text labels; severity is text + colour)
- [x] No flashing content (no animated badges, no pulsing — art bible prohibits pulsing)
- [x] No dialogue/audio requiring subtitles on this screen (no voice content)
- [x] UI scales at 200% desktop zoom (grid uses auto-fit min, no fixed widths)

---

## 13. Mobile / Responsive

### 13.1 Layout at 375px

| Zone | Mobile behaviour |
|---|---|
| Zone A — HUD strip | Sticky top; compact mode per hud-ui.md Regla 10 (siglas, S12·T1, icon-only financial status) |
| Zone D — Onboarding | Full-width single column; "Empezar" button full-width (44px height) |
| Zone E — Match CTA | Full-width panel; "Jugar partido →" button full-width (44px height) |
| Zone F — Metrics grid | 2 columns × 2 rows (auto-fit collapses at 375px given minmax 140px) |
| Zone G — Decisions panel | Single column stacked; ButtonGroup 5 options in a row (each ~56px wide at 375px — verify fits) |
| Zone G — UnitSlider | Full width minus padding; thumb 44px touch target (CSS override required) |
| Zone G — Avanzar button | Full-width, 48px height (large bucket per Button spec) |
| Zone H — Result panel | Single column; link "Ver staff →" full-width |
| Zone I — Tab bar | Fixed bottom, `TAB_BAR_HEIGHT_PX = 56px` clearance for all panels |

**ButtonGroup at 375px**: 5 buttons in a row on 375px = ~(375 - 2×16 padding - 4×gap) / 5 ≈ 63px per button. Text "Muy alto" (8 chars) at 14px may wrap. If wrapping is detected: use `font-size: 12px` for the group at 375px only, or switch to abbreviated labels ("M.bajo" / "Bajo" / "Normal" / "Alto" / "M.alto"). Flag as **OQ-DASH-02** for visual testing.

**Decision**: for MVP, use abbreviated labels at 375px if wrapping occurs:
- "M.bajo" · "Bajo" · "Normal" · "Alto" · "M.alto"

### 13.2 Sticky header

The HUD strip (Zone A) is `position: fixed; top: 0` with `z-index: 10`. The page content
starts below it using `padding-top: HUD_HEIGHT_PX` (or equivalent CSS). On mobile, the
page content also has `padding-bottom: TAB_BAR_HEIGHT_PX` to prevent the bottom tab bar
from overlapping the Avanzar button.

### 13.3 Toast position

Per hud-ui.md Regla 8: toasts on mobile are anchored at the bottom with
`bottom: TAB_BAR_HEIGHT_PX` offset to avoid overlap with the tab bar.

### 13.4 Portrait/landscape

On rotation from portrait to landscape, the metrics grid reflows (auto-fit may show 4
columns instead of 2 in landscape). No explicit orientation lock. The onboarding banner
and decision panel stack vertically in both orientations.

---

## 14. Edge Cases

### 14.1 API down on mount

`getState()` throws → `error` state set → Zone C renders: "API ✗ — [error message]".
All other zones remain hidden (no state to render). The Avanzar button in the HUD strip
is disabled (no game state loaded). The player sees the error and can refresh.

**No partial rendering**: if `pt === null` and `error !== null`, only Zone C is shown
in the content area. Zones D–H are all hidden. This prevents rendering broken empty states.

### 14.2 Onboarding state on reload before advance

`showOnboarding` is local `$state(true)` — it resets on page reload. If the player
dismissed the banner but has not yet advanced (week === 0), they see the banner again on
reload. This is acceptable UX — the banner is helpful orientation material, not annoying
marketing. An explicit "never show again" preference (persisted in localStorage or server)
is deferred to post-MVP polish.

### 14.3 advance() fails mid-call

`postAdvance()` throws → `error` is set to "Advance failed: [message]" → `pending` is
set back to `false` → Zone C renders the error. The `lastResult` is not updated (the
failed call produced no result). The player can read the error and retry. `pt` is NOT
mutated on failure (server-authoritative invariant per hud-ui.md AC-HUD-22).

### 14.4 Last week of month (currentWeek === 4)

`currentWeek === 4` renders normally. The player can still set decisions and Avanzar.
After the advance, `refresh()` is called, `currentWeek` becomes 5, and the auto-redirect
to `/end-of-month` fires. No special UI is needed for "last week of month" on the
Dashboard itself.

**Edge case within this edge case**: if the advance call for week 4 fails (network
error), the Dashboard stays on week 4, shows the error, and the player can retry. The
redirect only fires on a successful advance that moves `currentWeek > 4`.

### 14.5 Both onboarding banner and match CTA visible

At week 1 (first week of play), both `showOnboarding === true` and `isMatchWeek === true`
could be active. Order of rendering: Zone D (onboarding) appears above Zone E (match CTA).

The player reads onboarding → taps "Empezar" → onboarding hides → match CTA becomes the
topmost zone. This is the correct flow: orient the player before presenting the match
choice.

**Alternative path**: if the player taps "Empezar" and then presses Avanzar without
visiting `/match`, the match runs automatically. This is a valid choice — Pillar 4 does
not require the player to watch the match.

### 14.6 `nextEventPreview === null`

HUD strip shows "Próximo evento: desconocido" per hud-ui.md AC-HUD-24. Dashboard body
is not affected — it does not duplicate the HUD strip's next event display.

### 14.7 Very large badge count (> 99 URGENT messages)

The HUD strip badge shows "99+". The Dashboard body is not affected.

### 14.8 `fan_attendance` is 0 after a match (truly empty stadium)

After the first advance (a match was played), if `fan_attendance === 0` from the API,
render "0 personas · Vacío · 0% del aforo". This is meaningful data (something went
wrong — the cascade should have triggered a threshold crossing). Do not suppress it.

The "Sin partidos aún" empty state (§6.3) only applies when `lastResult === null`.

---

## 15. Open Questions

| ID | Question | Blocking for | Owner |
|----|----------|-------------|-------|
| **OQ-DASH-01** | Intensity bucket labels: use playtest-validated vernacular ("Descanso / Suave / Normal / Fuerte / Brutal") or the more literal ADR-017 aligned labels ("Muy bajo / Bajo / Normal / Alto / Muy alto")? Slice labels were validated by Pablo's playtest — recommend keeping them. Needs explicit confirmation. | Dashboard implementation | Pablo |
| **OQ-DASH-02** | ButtonGroup at 375px: do the labels "Muy bajo / Muy alto" wrap within their buttons? If so, use abbreviated labels ("M.bajo / M.alto") or reduce font to 12px. Requires visual test at 375px. | Dashboard mobile implementation | ui-programmer |
| **OQ-DASH-03** | `pt.snapshot.hasMatchThisWeek` — does the production GameState include this boolean? The slice computed `isMatchWeek` client-side from the week number. Production should derive from server-side fixture data. Confirm the field name and presence in the `StateDto` type. | Dashboard implementation | web-backend-specialist |
| **OQ-DASH-04** | `pt.snapshot.stadiumCapacity` — does the production GameState include the club's current stadium capacity? Required for `formatAttendance()` to compute absolute attendance count. Confirm field name in `StateDto`. | Dashboard implementation | web-backend-specialist |
| **OQ-DASH-05** | Should the result panel's `∆MPI` delta be shown on the Dashboard, or is it too much internal system language? The slice showed it; Pablo did not flag it during playtest. Tentative: keep it. Needs confirmation before implementing. | Dashboard implementation | Pablo + game-designer |
| **OQ-DASH-06** | Player journey map (`design/player-journey.md`) does not exist. The Dashboard's player context on arrival (especially the emotional state at t=0) was designed without it. Re-validate this spec against the journey map when it is authored. | Post-MVP UX review | ux-designer |
| **OQ-HUD-08** (partial) | OQ-HUD-08 is resolved for the Dashboard screen. Remaining scope: Plantilla panel (OQ-HUD-08 asks "are player ratings visible at week 1?") and Staff panel (empty message preview slot at t=0). These are deferred to `/ux-design Plantilla` and `/ux-design Staff` respectively. | Plantilla + Staff specs | ux-designer |

---

## 16. Acceptance Criteria

These are testable by a QA tester without reading any other design document.

### Performance

- [ ] **AC-DASH-01** GIVEN the player loads the Dashboard from a fresh tab, WHEN the
  `getState()` response arrives, THEN the metrics grid and decisions panel are visible
  and interactive in ≤ 500ms from the API response (not counting network time). Measured
  by Playwright with a local mock server.

### Navigation

- [ ] **AC-DASH-02** GIVEN the player taps "Jugar partido en directo →" on a match-week
  CTA, WHEN the link is activated, THEN the route navigates to `/match` without a full
  page reload (SvelteKit client-side navigation).

- [ ] **AC-DASH-03** GIVEN `currentWeek > 4` in the loaded state, WHEN `refresh()` is
  called (on mount or after advance), THEN the player is redirected to `/end-of-month`
  before any Dashboard content renders.

### Empty / onboarding state

- [ ] **AC-DASH-04** GIVEN a fresh save (no prior advance), WHEN the Dashboard loads,
  THEN the onboarding banner is visible, the metrics grid shows values or "—" stubs, the
  decisions panel is fully interactive, and the result panel is hidden.

- [ ] **AC-DASH-05** GIVEN the onboarding banner is visible, WHEN the player taps
  "Empezar", THEN the banner disappears without page reload, and all other zones remain
  in their current state.

- [ ] **AC-DASH-06** GIVEN `lastResult === null` AND `fan_attendance === 0`, WHEN the
  attendance metric renders, THEN it shows "Sin partidos aún" (not "0 personas · Vacío").

### Input controls (ADR-017)

- [ ] **AC-DASH-07** GIVEN the player selects "Alto" in the training intensity ButtonGroup
  and taps Avanzar, WHEN the `POST /api/game/advance` payload is sent, THEN
  `training_intensity === 70` (not 0.7, not 4, not "alto").

- [ ] **AC-DASH-08** GIVEN the player sets the ticket price slider to 15€ and taps
  Avanzar, WHEN the `POST /api/game/advance` payload is sent, THEN `ticket_price_index ===
  75` (15€ / 10€ market × 50 = 75).

- [ ] **AC-DASH-09** GIVEN the player loads the Dashboard and has a prior advance with
  `training_intensity = 70` in the snapshot, WHEN the page mounts, THEN the ButtonGroup
  shows "Alto" selected (nearest-bucket hydration).

### Formatters (ADR-017)

- [ ] **AC-DASH-10** GIVEN `fan_momentum = 28` in the snapshot, WHEN the Afición metric
  renders, THEN it shows "Desencantada" (not "28", not "En crisis", not "Inquieta").

- [ ] **AC-DASH-11** GIVEN `team_fitness = 52` in the snapshot, WHEN the Estado físico
  metric renders, THEN it shows "Regular".

- [ ] **AC-DASH-12** GIVEN `fan_attendance = 30` and `stadiumCapacity = 3000`, WHEN the
  Asistencia metric renders, THEN it shows "900 personas" (primary) and "Poco lleno ·
  30% del aforo" (secondary).

### Match-week CTA (ADR-018)

- [ ] **AC-DASH-13** GIVEN `hasMatchThisWeek = true` in the loaded state, WHEN the
  Dashboard renders (with no onboarding banner active), THEN the match-week CTA panel
  is visible above the metrics grid with the link "Jugar partido en directo →".

- [ ] **AC-DASH-14** GIVEN `hasMatchThisWeek = false`, WHEN the Dashboard renders,
  THEN the match-week CTA panel is not present in the DOM.

### Error state

- [ ] **AC-DASH-15** GIVEN `getState()` returns a network error, WHEN the Dashboard
  mounts, THEN Zone C (error notice) renders with text starting "API ✗ —", and zones
  D–H are all absent from the DOM.

### Accessibility

- [ ] **AC-DASH-16** GIVEN a keyboard-only user (mouse unplugged), WHEN they Tab through
  the Dashboard from the skip link, THEN they can reach: the onboarding banner "Empezar"
  button (if visible), the match CTA link (if visible), the training intensity ButtonGroup,
  the ticket price slider, the Avanzar button, and the result panel "Ver staff" link (if
  visible) — all in the order documented in §12.1.

- [ ] **AC-DASH-17** GIVEN `prefers-reduced-motion: reduce` is active in the OS, WHEN
  the player changes the training intensity selection or moves the price slider, THEN
  no CSS transition or animation plays for longer than 0ms (instant swap).

- [ ] **AC-DASH-18** GIVEN the Avanzar button is in `processing` state, WHEN a screen
  reader reads the button, THEN it announces a state that communicates "busy" or
  "processing" (via `aria-busy="true"` and a changed label).

### Mobile

- [ ] **AC-DASH-19** GIVEN a 375×812px viewport, WHEN the Dashboard renders, THEN:
  (a) the metrics grid shows 2 columns; (b) the Avanzar button is ≥ 48px tall and
  full-width; (c) the ButtonGroup options are visible without horizontal scroll; (d) the
  tab bar does not overlap the Avanzar button or the decision panel content.

---

## Data Requirements

| Data | Source system | Read / Write | Notes |
|---|---|---|---|
| `pt.playthrough.currentWeek` | game-clock / GameState | Read | Drives auto-redirect and isMatchWeek |
| `pt.snapshot.state.team_fitness` | cascade-engine / GameState | Read | Formatted via `formatFitness()` |
| `pt.snapshot.state.fan_momentum` | cascade-engine / GameState | Read | Formatted via `formatFanMomentum()` |
| `pt.snapshot.state.fan_attendance` | cascade-engine / GameState | Read | Formatted via `formatAttendance()` with stadiumCapacity |
| `pt.snapshot.state.training_intensity` | cascade-engine / GameState | Read | Used to hydrate ButtonGroup on mount |
| `pt.snapshot.state.ticket_price_index` | economy / GameState | Read | Used to hydrate UnitSlider on mount |
| `pt.snapshot.stadiumCapacity` | economy / GameState | Read | Required for absolute attendance calculation |
| `pt.snapshot.hasMatchThisWeek` | league-system / GameState | Read | Drives match-week CTA visibility |
| `training_intensity` (engine index) | cascade-engine | Write | POSTed to `/api/game/advance` |
| `ticket_price_index` (engine index) | economy | Write | POSTed to `/api/game/advance` |
| `lastResult.weekProcessed` | game-clock / AdvanceResult | Read | Result panel heading |
| `lastResult.playerMatchOutcome` | match-simulation / AdvanceResult | Read | Result panel match row |
| `lastResult.thresholdCrossings` | cascade-engine / AdvanceResult | Read | Result panel warning row |
| `lastResult.managerLeveledUp` | manager-rpg / AdvanceResult | Read | Result panel level-up row |
| `lastResult.managerState.level` | manager-rpg / AdvanceResult | Read | Level number in level-up row |

The Dashboard does not own or calculate any game state. All data flows in from the server
via `getState()` (mount) and `postAdvance()` (advance action). The UI is read-only for
metrics and write-only for decisions. No local mutation of game state is permitted.

---

## Events Fired

| Player Action | Event / API call | Payload |
|---|---|---|
| Press "Empezar" (onboarding dismiss) | None (local state only) | — |
| Change training intensity | None (local state update; committed on Avanzar) | — |
| Move ticket price slider | None (local state update; committed on Avanzar) | — |
| Press "Avanzar semana →" | `POST /api/game/advance` | `{ training_intensity: number, ticket_price_index: number }` |
| Press "Jugar partido en directo →" | SvelteKit `goto('/match')` | — |
| Auto-redirect on `currentWeek > 4` | SvelteKit `goto('/end-of-month')` | — |

Analytics events (post-MVP): `dashboard:advance_submitted`, `dashboard:match_cta_clicked`,
`dashboard:intensity_changed`, `dashboard:price_changed`. Flagged for analytics-engineer
when analytics instrumentation sprint is scheduled.

---

## Transitions and Animations

| Transition | Behaviour | Reduced-motion fallback |
|---|---|---|
| Dashboard load (fresh) | Instant render — no entrance animation | Same |
| Onboarding banner appear | Instant (always) | Same |
| Onboarding banner dismiss | `opacity: 0` fade 150ms → `display: none` | Instant |
| Match-week CTA appear | Instant (part of initial load) | Same |
| Advance start (Avanzar pressed) | Button morphs to "Procesando…" at `motion-quick` (100ms) | Instant |
| Advance overlay (z-50) appear | `motion-short` (200ms) per HUD system | Instant cut |
| Result panel appear (after advance) | Instant render when `lastResult` becomes non-null | Same |
| ButtonGroup option change | Active indicator at `motion-quick` (100ms) | Instant |
| UnitSlider thumb movement | Spring animation (stiffness 0.18, damping 0.55) | `stiffness: 1, damping: 1` (instant snap) |
| Error notice appear | Instant | Same |

All transitions ≤ 200ms per ADR-012 hard cap (Pilar 4).

---

## Cross-Reference Check

**GDD requirements covered**:
- hud-ui.md OQ-HUD-01 (Dashboard KPIs + hierarchy): Resolved — §1 player-task hierarchy + §5 layout zones define the exact KPIs and their order
- hud-ui.md OQ-HUD-08 (empty states — Dashboard): Resolved — §6 covers all Dashboard empty states; remaining OQ-HUD-08 scope (Plantilla, Staff) deferred to those screens' specs
- hud-ui.md Regla 1 (navigation structure): Addressed — Dashboard is the default route with 4 top-level nav destinations
- hud-ui.md Regla 2 (permanent HUD strip): Addressed — HUD strip is Zone A, governed by hud-ui.md; Dashboard spec respects it
- hud-ui.md Regla 4 (Avanzar button): Addressed — §5.3 Zone G and AC-DASH criteria

**New patterns used, not yet in interaction-patterns.md**:
- "Contextual action panel" (Zone E — match-week CTA): a panel that appears only under a specific game state condition and presents a primary link CTA. This pattern is narrower than [Decision Panel] and wider than [Button] alone. Flag for addition to the pattern library.
- "Domain-language metric cell": a [Stat Display] variant that shows a text label instead of a number as the primary value. Suggest adding a sub-variant to the Stat Display pattern.

**Navigation mismatches**: None found. Entry/exit points align with the navigation
structure in hud-ui.md.

**Accessibility gaps**: None blocking. OQ-DASH-06 (no player journey map) is a future
re-validation item, not a current blocker.

**Empty states for data-dependent elements**:
- team_fitness: "—" if undefined — covered §6.1
- fan_momentum: "—" if undefined — covered §6.1
- fan_attendance: "Sin partidos aún" if t=0 — covered §6.3
- result panel: hidden when null — covered §6.1
- match CTA: hidden when !isMatchWeek — covered §5.3 Zone E
