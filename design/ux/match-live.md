# UX Spec: Match-Live (Partido en Directo)

> **Status**: In Design (initial draft 2026-05-19)
> **Author**: ux-designer (autonomous run) + Pablo review pending
> **Last Updated**: 2026-05-19
> **Source GDD**: `design/gdd/match-simulation.md` (R6 2026-05-18) · `design/gdd/hud-ui.md` (Approved R3 2026-05-18)
> **ADRs governing this screen**: ADR-012 (DOM-only MVP), ADR-013 (Match Session FSM + re-enqueue), ADR-015 (EventDecisionPayload), ADR-017 (input control taxonomy + formatters), ADR-018 (visual feedback library + pacing rules)
> **Resolves**: OQ-HUD-11 (pixel-art sprites), OQ-HUD-12 (dramatic event pacing), OQ-HUD-13 (playback timing)
> **Slice reference**: `prototypes/cascada-vertical-slice-mes1/src/web/src/routes/match/+page.svelte`
> **Entry from**: Dashboard → "Jugar partido en directo →" CTA (Zone E, `design/ux/dashboard.md`)
> **Template**: UX Spec

---

## 1. Purpose and Player Goals

The Match-Live screen is where the player watches their week's preparation crystallise into
90 minutes of football. It has one job: deliver the emotional narrative of the match at the
player's chosen pace, interrupt only for decisions that matter, and return the player to the
Dashboard with a clear emotional verdict.

> "El banquillo sabe que no puede tocar el balón. Pero decidió quién juega, cómo entrena, y
> qué precio tiene la entrada. Ahora observa las consecuencias."

### Player-task hierarchy (ordered by importance)

1. **Watch** — follow the match as it unfolds: scoreboard, minute clock, events feed. The player
   is a spectator with history.
2. **React** — respond to dramatic events (goal, injury, expulsion) as they happen. The teaser +
   modal flow handles this without player action — the player just reads.
3. **Decide** — respond to pause windows (`substitution_window` at minutes 45, 60, 75;
   `injury_pause` at any minute for a starter injury). These are the only mandatory interactions
   on this screen.
4. **Control pace** — adjust playback speed (×1/×3/×10) or skip to end. Entirely optional.
5. **Receive** — absorb the final outcome and any WorldState deltas (∆MPI) before returning
   to the Dashboard.

The screen does **not** require the player to make any decision except at formal pause windows.
Everything else is observation.

### Pillar alignment

| Pillar | How this screen serves it |
|--------|---------------------------|
| **P4 — Calm Is The Tempo** | **This is the governing pillar.** 1 in-game minute = 1 real second by default. No urgency UI. Pause windows wait indefinitely. The skip button is always visible but never pressured. The teaser is 900ms of tension — not anxiety. |
| **P1 — Tinkering Beats Optimization** | Every event in the feed is a direct signal from the player's prior decisions. The injury at minute 60 traces back to the `injury_risk` the player has been ignoring. The goal at minute 34 traces back to the squad they assembled. The screen does not explain these links — it shows the events. The player connects the dots. |
| **P3 — You Grow Like Your Club** | Staff flavor text on events is tier-dependent (per ADR-017 domain-language formatting). A tier-1 assistant says "Gol del defensa." A tier-3 technical director says "Gol de cabeza del central — las sesiones de rematado del martes empiezan a pagar." The insight scales with the staff the player has earned. |

---

## 2. Information Architecture

The screen has three persistent zones and two layer stacks (modal + confetti).

### Persistent Zones

```
┌─────────────────────────────────────────────────────────────────┐
│ ZONE A: Global HUD strip (z-10, sticky top, from hud-ui.md)     │
│  [Club siglas] [S1·T1] [⚽ Partido · en curso] [💚 Safe · €45K] │
│  (Avanzar button disabled during live match)                     │
├─────────────────────────────────────────────────────────────────┤
│ ZONE B: Sticky Scoreboard (z-20, sticky below HUD strip)        │
│  [Club local]   [homeGoals - awayGoals]   [Club visitante]       │
│  [⏱ Minuto N' · Primera/Segunda parte | DESCANSO | FINAL]       │
├─────────────────────────────────────────────────────────────────┤
│ ZONE C: Playback Control Bar (sticky below scoreboard, z-15)    │
│  [×1] [×3] [×10] [⏭ Saltar al final]                           │
├─────────────────────────────────────────────────────────────────┤
│ ZONE D: Events Log (scrollable, expands downward)               │
│  New events animate in from below; oldest at top.               │
│  At minute 0: idle ball sprite (empty state)                    │
├─────────────────────────────────────────────────────────────────┤
│ ZONE E: Lineup/Formation Panel (collapsible side panel)         │
│  Current XI with fitness indicators. Updates after subs.        │
├─────────────────────────────────────────────────────────────────┤
│ (Mobile only) ZONE F: Bottom Tab Bar (z=per hud-ui.md)         │
└─────────────────────────────────────────────────────────────────┘
```

### Layer Stack (renders above persistent zones)

```
z-index  Layer
──────── ─────────────────────────────────────────────────────────
  125    ZONE G: Outcome Modal (full-screen, match complete)
  120    ZONE H: Modal text card (dramatic event / substitution)
  115    ZONE I: Teaser Banner (900ms pre-modal tension)
  110    ZONE J: Confetti (own-team goals only; pointer-events: none)
  105    ZONE K: Teaser Banner (sits below confetti; see §9)
  100    ZONE L: Modal Backdrop (flat dim; NO backdrop-filter:blur)
   20    Zone B: Sticky Scoreboard
   15    Zone C: Playback Control Bar
   10    Zone A: HUD strip
```

**Critical z-index rule** (ADR-018 verified fix): The modal backdrop is at z-index 100.
Confetti is at z-index 110 — above the backdrop, below the modal card (120). This ensures
confetti rains around the modal text, not behind the backdrop. `backdrop-filter: blur` is
explicitly forbidden on the modal backdrop — it was confirmed to dim confetti in the slice.

---

## 3. Interaction Flow

### 3.1 Complete Session Lifecycle

```
Dashboard (isMatchWeek=true)
  ↓ Player taps "Jugar partido en directo →"
  ↓ SvelteKit goto('/match')

/match route mounts
  ↓ GET /api/matches/active  (loads MatchSessionSnapshot from DB)
  ↓ Socket.IO: subscribe to match:{sessionId}

Pre-match State
  ├─ Scoreboard shows 0-0, "Antes de empezar"
  ├─ Events log shows idle ball-bounce sprite (empty state)
  ├─ "Comenzar partido →" CTA visible
  └─ Player confirms → POST /api/matches/:id/start

Live Playback (in_progress)
  ├─ Server emits match:tick (every ~5 in-game minutes for clock sync)
  ├─ Server emits match:event on each match event
  ├─ Client animates at selected speed (default ×1 = 1s/minute)
  ├─ Events feed populates as minutes pass
  ├─ For DRAMATIC events (goal, injury, red-card, var_review):
  │    → Teaser banner 900ms
  │    → Modal opens (10s countdown + skip + ✕ + ESC)
  │    → Optional VAR theater (30% of goals)
  │    → Modal closes, playback resumes
  ├─ For NON-dramatic events (yellow_card, substitution):
  │    → Entry appends to events log immediately (no modal)
  └─ Player controls speed or skips at any time

Pause Window (substitution_window at 45', 60', 75')
  ├─ Server pauses → emits match:event {type:'substitution_window'}
  ├─ Playback stops; Substitution Decision Modal opens
  ├─ Player must resolve before playback continues (non-skippable)
  │    Options: [sub player] + [no hacer cambios] + [cambio táctico]
  └─ Player POSTs /api/matches/:id/decision → playback resumes

Injury Pause (injury_pause — any minute, forced)
  ├─ Server pauses → emits match:event {type:'injury', severity:'major'}
  ├─ Teaser → Injury Modal (5s dwell) → closes
  ├─ Injury Substitution Decision Modal opens immediately after
  ├─ Player must resolve (or accept playing with 10)
  └─ Player POSTs decision → playback resumes

Match Complete (tick 90)
  ├─ Server emits match:full-time
  ├─ Final scoreboard shows definitive score
  ├─ Outcome Modal opens (z-125, full-screen):
  │    Score · Result label (victoria / empate / derrota)
  │    ∆MPI delta (see OQ-MATCH-01)
  │    "Volver al panel →" CTA
  └─ Player taps CTA → goto('/') [Dashboard]
```

### 3.2 Speed Toggle Persistence

The playback speed is stored in `localStorage` under key `cascada.match.playbackSpeed`.
When the player loads the match screen, the stored speed is applied immediately. Default
is `1` (×1) for first-time visits. Valid values: `1`, `3`, `10`, `Infinity` (skip-to-end).

The skip-to-end button (⏭) triggers a confirmation only if a pause window is pending
(edge case §14). Otherwise it emits `match:skip-to-end` to the server and the client
shows a brief loading state until `match:full-time` arrives.

---

## 4. Component Inventory

### 4.1 Zone B — Sticky Scoreboard

| Property | Value |
|---|---|
| Component type | Sticky header panel (below HUD strip) |
| `position` | `sticky; top: HUD_HEIGHT_PX` |
| `z-index` | 20 |
| Content | Home club name · goals-dash-goals · Away club name · current minute + phase label |
| Club names | Full name on desktop; abbreviated siglas (≤ 4 chars) on mobile 375px |
| Score display | `font-variant-numeric: tabular-nums`; score digits always same width |
| Phase labels | "Antes de empezar" · "Primera parte" · "Descanso (45')" · "Segunda parte" · "Final" |
| Minute label | "⏱ 34'" with `⏸` icon when paused; `✅ FINAL` when complete |
| Accessibility | `role="banner"` `aria-label="Marcador: {homeClub} {homeGoals} - {awayGoals} {awayClub}, minuto {minute}"` — announced via `aria-live="polite"` on score changes only |
| Empty state | "0-0 · Antes de empezar" |

**Score announcement rule**: the `aria-live` region on the scoreboard only announces
when the score itself changes (goal event). Clock tick updates are NOT announced
(would flood screen readers). The events log has its own aria-live for event text.

### 4.2 Zone C — Playback Control Bar

Per ADR-018 §1 and ADR-017 §Control Family Mapping: 4-option speed toggle is a
ButtonGroup (categorical — 4 mutually exclusive options).

| Property | Value |
|---|---|
| Component type | `<ButtonGroup>` (ADR-017 categorical) — 4 options |
| Options | `×1` (1s/min) · `×3` (0.33s/min) · `×10` (0.1s/min) · `⏭ Saltar` (skip-to-end) |
| Default | Loaded from `localStorage.cascada.match.playbackSpeed`; fallback `×1` |
| Persistence | On change: write to `localStorage`; apply immediately |
| Position | Sticky below Zone B scoreboard; `z-index: 15` |
| Disabled state | `⏭ Saltar` disabled while a pause window is pending; shows tooltip "Resuelve el cambio primero" |
| ARIA | `role="radiogroup"` `aria-label="Velocidad de reproducción"`. Each option: `role="radio"` `aria-checked={active}` |
| Keyboard | Tab enters group; Left/Right arrows navigate; Enter/Space selects |
| Reduced-motion | Speed toggle behaviour unchanged; animations at target speed still play (the toggle affects match simulation time, not CSS animations) |

**Skip-to-end flow**:
1. Player taps ⏭
2. If no pending pause window: client emits `match:skip-to-end` → server fast-completes → client shows brief loading state ("Procesando final del partido…") → `match:full-time` arrives → Outcome Modal
3. If pause window pending: button is disabled (see §14 edge cases)

### 4.3 Zone D — Events Log

| Property | Value |
|---|---|
| Component type | Scrollable feed (auto-scroll to bottom as new events arrive) |
| Event entry format | `[minute]' [icon] [event text] [optional player name + staff flavor]` |
| New event animation | New entries animate in from below: `translateY(12px) → 0, opacity: 0 → 1` at `motion-short` (200ms). Reduced-motion: instant |
| Auto-scroll | On new event: `scrollIntoView({ behavior: 'smooth', block: 'end' })`. Reduced-motion: `behavior: 'instant'` |
| Log item classes | `.event-goal` (accent color, bold) · `.event-yellow` (warn) · `.event-red` (bad) · `.event-injury` (bad, italic) · `.event-sub` (dim) · `.event-system` (dim, centered — half_time, full_time dividers) |
| Accessibility | `role="log"` `aria-live="polite"` `aria-relevant="additions"`. Each new entry gets an accessible label (see §12.2). Screen readers announce new events as they are appended |
| Empty state | Idle ball-bounce sprite (§5) with text "Partido no iniciado aún" |

**Event text format** (Spanish, domain language, per ADR-017):

| Event type | Rendered text |
|---|---|
| `goal` (home) | `⚽ 34' — GOL LOCAL — [PlayerName] ([position flavor])` |
| `goal` (away) | `⚽ 67' — GOL VISITANTE — [PlayerName] ([position flavor])` |
| `goal_disallowed` | `⚽✗ 34' — GOL ANULADO (VAR) — fuera de juego` |
| `yellow_card` | `🟨 45' — Amarilla — [PlayerName] ([team])` |
| `red_card` | `🟥 67' — Roja directa — [PlayerName] ([team])` |
| `red_downgraded` | `🟨 67' — VAR: Roja rebajada a amarilla — [PlayerName]` |
| `injury` | `🏥 60' — Lesión [leve/grave] — [PlayerName]` |
| `substitution` | `🔄 46' — Cambio: entra [PlayerIn], sale [PlayerOut]` |
| `playing_with_ten` | `⚠ 71' — Equipo local juega con 10` |
| `var_review` | `🎯 67' — VAR revisando...` → `GOL CONFIRMADO` or `VAR ANULA` |
| `half_time` | `──── DESCANSO ────` (centered divider, `.event-system`) |
| `full_time` | `──── FINAL · [score] ────` (centered divider, `.event-system`) |

**Staff flavor text rule** (Pilar 3): the `[position flavor]` suffix on goal events is
generated by the server based on the staff tier. Tier-1 staff: generic (position name).
Tier-3 staff: specific (narrative line referencing the player's training). The client
renders whatever string the server provides — no client-side tier logic.

### 4.4 Zone I — Teaser Banner

Per ADR-018 §2. The teaser is the 900ms tension buildup before a dramatic event modal.

| Property | Value |
|---|---|
| Component type | Fixed positioned pill banner |
| `position` | `fixed; top: (HUD_HEIGHT + SCOREBOARD_HEIGHT + 16px); left: 50%; transform: translateX(-50%)` |
| `z-index` | 115 (see note below) |
| Hold duration | 900ms (non-skippable — too short) |
| Reduced-motion | Dwell unchanged (900ms is below threshold); animation on enter is instant |
| Dismissal | Auto-dismisses; no player action |

**Z-index correction vs ADR-018**: ADR-018 places teaser conceptually above the backdrop.
In the final layer stack, the backdrop only appears when the modal opens (after the 900ms
teaser). Therefore teaser at z-115 and backdrop at z-100 do not coexist at the same time.
They are sequential. This is correct.

**Teaser pools** (validated from slice; extend with art team copy if needed):

| Event type | Teaser pool (pick 1 at random) |
|---|---|
| `goal` | "⚡ ¡Algo está pasando!" · "👀 Atento al área..." · "🔥 Se calienta el partido" · "💥 ¡Hay peligro!" · "😱 ¡Ojo, ojo, ojo!" · "⚠ Atento al ataque" · "🎯 Llega con peligro" |
| `injury` | "🩹 Un jugador en el suelo..." · "😬 Espera, algo no va bien" · "⚠ Pausa para asistencia" · "🤕 Algo se ha torcido" |
| `red_card` | "🟥 Un árbitro va al bolsillo..." · "😮 Hay tarjeta en el aire" · "⚠ Situación tensa en el campo" |
| `var_review` | "🎯 El VAR está revisando..." (single entry — reveals intention but that's appropriate for VAR) |

**Important**: teaser text uses neutral wording — it does NOT reveal the outcome. "Algo
está pasando" works for either team's goal. The reveal comes in the modal.

**Accessibility**: `aria-live="polite"` on the teaser container. Screen readers
announce it when it appears. Invisible to screen readers after it fades.

### 4.5 Zone H — Dramatic Event Modal

Per ADR-018 §2. Opens after the 900ms teaser. Rules are verbatim from ADR-018.

| Property | Value |
|---|---|
| Backdrop | `position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100` **NO `backdrop-filter: blur`** |
| Modal card | `z-index: 120; position: relative` |
| Default dwell | 10s for goals; 5s for injuries (per ADR-018 §6) |
| Reduced-motion dwell | 2s for both (per ADR-018 §6) |
| Countdown | Visible count-down: "Continuar → 8s"; decrements each second |
| Skip controls | "Continuar →" button · "✕" button (top-right) · ESC key |
| Role | `role="dialog"` `aria-modal="true"` `aria-label="Evento del partido"` |
| Focus management | On modal open: focus the modal card (`tabindex="-1"`). On close: return focus to the Events Log. |

**Goal modal content**:
```
[MatchEventSprite: goal-default.gif OR goal-header.gif]
¡GOOOOL!   (home team: color accent; away team: color bad)
[ClubName] · minuto [N]'
[homeGoals]-[awayGoals]  (score flash — large, tabular-nums)
[staff flavor text if available]
[Continuar → Ns]  [✕]
```

**Injury modal content** (dramatic = severity:'major' only; minor injuries go straight to log):
```
[MatchEventSprite: injury-stretcher.gif]
LESIÓN GRAVE
[PlayerName] ([position]) · minuto [N]'
[injury flavor text]
[Continuar → Ns]  [✕]
```

**VAR theater phases** (30% of goals, inline per ADR-018):
```
Phase 1 — "reviewing" (2200ms):
  [MatchEventSprite: var-checking.gif (loop)]
  VAR REVISANDO
  "Revisando el gol del minuto [N]'..."

Phase 2 — "upheld" OR "overturned" (1500ms):
  Upheld: [MatchEventSprite: var-confirmed.gif]  → "GOL CONFIRMADO"
  Overturned: [MatchEventSprite: var-overturned.gif] → "VAR ANULA EL GOL"

Modal closes after Phase 2 + 1500ms hold.
```

**VAR probability rule** (from ADR-018 + match-simulation.md):
- `P_VAR_review_goal = 0.30` (30% of goals trigger VAR theater)
- `P_overturn = 0.10` (10% of VAR reviews overturn)
- These probabilities are applied client-side for the theater (they are determined
  by the server's simulation; the server includes `var_review` in the event stream
  when it occurs — see §11 Socket.IO integration)

**Card / Expulsion modal** (red_card only — yellow goes to log without modal):
```
[MatchEventSprite: card-red.gif OR expulsion-tackle.gif]
TARJETA ROJA
[PlayerName] · minuto [N]' · [reason]
[Continuar → Ns]  [✕]
```

### 4.6 Zone J — Confetti Layer

Per ADR-018 §4.

| Property | Value |
|---|---|
| Trigger | Own-team `goal` event only (server's `team` field matches `playerClubSide`) |
| `z-index` | 110 (above backdrop 100; below modal card 120) |
| `pointer-events` | `none` (never intercepts clicks) |
| Count | 60 pieces |
| Auto-clear | After 3500ms |
| Reduced-motion | `animation: none; opacity: 0` — confetti does not play |
| Aria | `aria-hidden="true"` — purely decorative |

### 4.7 Substitution Decision Modal

Triggered by: `substitution_window` event (minutes 45, 60, 75) AND `injury_pause`.
This modal blocks playback — the player MUST respond before the match continues.

| Property | Value |
|---|---|
| Modal type | Decision modal (blocks playback, no auto-dismiss countdown) |
| `z-index` | 120 (same layer as dramatic event modal; these never co-occur) |
| Timeout | 24h server-side countdown (per ADR-013 `MATCH_PAUSE_TIMEOUT_HOURS`). UI shows "Tiempo límite: 23h 59m" (small, dim — Pilar 4: no urgency anxiety) |
| Timeout default | Server applies `defaultOption` from the `MatchPauseEvent` payload if timer expires |

**substitution_window modal content**:

```
[Heading] Ventana de cambios — minuto [N]'
[Score at pause] [Formation preset selector]

JUGADORES EN CAMPO (fitness indicators)
  [List: name · position · fitness-icon (🟢/🟡/🔴)]

BANQUILLO DISPONIBLE  (substituciones restantes: N/5)
  [ItemSelect — bench player list]
  Each entry: [name] · [position] · [fitness]

INSTRUCCIÓN DE EQUIPO (optional)
  [ButtonGroup: NORMAL / HOLD_SHAPE / PRESS_HIGH / COUNTER*]
  *COUNTER hidden for home team (per match-simulation.md R4)

[Hacer cambio →]  [Continuar sin cambios]
```

**Input controls** (per ADR-017):
- **Bench player selection** → `<ItemSelect>` (item selection family)
- **Formation** → `<ItemSelect>` (4 presets: 4-4-2 / 4-3-3 / 3-5-2 / 5-3-2)
- **Tactical instruction** → `<ButtonGroup>` (categorical, 3-4 options depending on team side)
- **Decision confirm/skip** → `<EventChoiceButtons>` pair

**injury_pause modal content**:

```
[Heading] Lesión grave — minuto [N]'
[PlayerName] ha sido sustituido de emergencia

BANQUILLO DISPONIBLE  (cambios restantes: N/5)
  [ItemSelect — bench players or "Sin jugadores disponibles"]

[Meter cambio →]  [Continuar con 10 jugadores]
(If pool exhausted OR bench empty: only "Continuar con 10" visible)
```

**Accessibility**: the decision modal has `role="dialog"` `aria-modal="true"`. Focus is
trapped inside the modal while open (Tab cycles only within modal elements). On close
(decision submitted), focus returns to the Events Log container.

**ARIA for bench list**: `aria-label="Seleccionar jugador para entrar al campo"`. Each
bench player item: `aria-label="[Name], [position], fitness: [label]"`.

**No `<select>` for bench on mobile**: use a scrollable touch-friendly list
(`<ItemSelect>` rendered as a styled list, not a native `<select>`) — native `<select>`
on iOS opens a picker wheel that breaks from the page's visual language and cannot be
styled to 44px touch targets.

### 4.8 Zone E — Lineup / Formation Panel

| Property | Value |
|---|---|
| Component type | Collapsible side panel |
| Default state | Collapsed (hidden) on mobile 375px; expanded on desktop ≥ 768px |
| Toggle | "Plantilla ▾" / "Plantilla ▴" button at top of panel |
| Content | Current XI with fitness color indicators · bench with availability · current formation name |
| Update trigger | Re-renders on every `substitution` event (reflects real-time lineup changes) |
| ARIA | `aria-expanded` on toggle button; `aria-controls` pointing to the panel element |

Fitness indicators in the lineup panel use the same three-state encoding as `hud-ui.md`
Regla 6: 🟢 fresh (fitness ≥ 60) · 🟡 tired (30–59) · 🔴 exhausted (< 30).
Color is supplementary — the icon shape differentiates all three states independently.

### 4.9 Zone G — Outcome Modal

Appears when `match:full-time` is received. Full-screen, above everything.

| Property | Value |
|---|---|
| `z-index` | 125 |
| Backdrop | Full-screen, flat dark — same rules as dramatic event modal |
| Auto-dismiss | Never — player must tap the CTA |
| Content | Final score (large) · result label · ∆MPI delta · "Volver al panel →" CTA |

**Outcome modal content**:
```
FINAL DEL PARTIDO
[homeClub]  [homeGoals] - [awayGoals]  [awayClub]

[VICTORIA LOCAL / EMPATE / DERROTA] (severity: good / neutral / bad)

∆MPI: [+N / -N]   (formatted via formatMpi(); see OQ-LIVE-01)

[Volver al panel →]
```

The "Volver al panel →" CTA navigates to `/` (Dashboard) via `goto('/')`. The match
session is already marked `completed` server-side — the Dashboard will show the result
in Zone H (result panel) when it loads.

---

## 5. Empty States

### 5.1 Pre-match (state = 'pre_match')

Match session exists but has not been started by the player. The server delivers a
`MatchSessionSnapshot` with `state: 'pre_match'` on GET /api/matches/active.

| Zone | Empty state |
|---|---|
| Zone B — Scoreboard | `0-0 · Antes de empezar` |
| Zone C — Playback bar | Visible and interactive (speed selection persists across start) |
| Zone D — Events log | Idle `ball-bounce.gif` sprite (ADR-018 ambient sprite library) + text "Partido no iniciado aún" in dim text below the sprite |
| Zone E — Lineup panel | Visible with the pre-match lineup |
| CTA | "Comenzar partido →" Primary button visible in the content area |

The "Comenzar partido →" button triggers `POST /api/matches/:id/start`. Pressing it
transitions the session to `in_progress` and begins the Socket.IO event stream.

### 5.2 Between events (idle at any in-game minute)

When there are no recent events and the match clock is running, the events log shows
the last rendered event. No additional empty state needed — the clock tick is evidence
the match is proceeding. The ambient `ball-bounce.gif` sprite is displayed below the
events log if fewer than 3 events have been rendered so far.

### 5.3 After `match:full-time` (completed)

The Outcome Modal is the empty state for this phase. The events log remains visible
below the modal when the player dismisses it (they cannot — the modal has no dismiss
except the CTA). The player always exits via "Volver al panel →".

### 5.4 Failed match session (state = 'failed')

Per ADR-013: the `failed` state is excluded from the UNIQUE INDEX — a failed session
does not block new matches. The UI shows:

```
[Error panel]
Error en la sesión de partido
No fue posible recuperar la sesión. El partido no puede continuarse.
[Volver al panel →]
```

No retry of the same failed session. The player returns to the Dashboard; the cascade
engine processes the week without a match result (or with a default result — per
`OQ-LIVE-02`).

---

## 6. Input Control Spec (ADR-017)

### 6.1 Speed Toggle — ButtonGroup

| Config | Value |
|---|---|
| Family | Categorical → ButtonGroup (4 options) |
| Options | `×1` · `×3` · `×10` · `⏭ Saltar` |
| Labels (ARIA) | "Velocidad ×1" · "Velocidad ×3" · "Velocidad ×10" · "Saltar al final" |
| State | Active option gets `aria-checked="true"` |
| Persistence | `localStorage.cascada.match.playbackSpeed` |
| Disabled | `⏭ Saltar` disabled when pause window pending; `aria-disabled="true"` + tooltip |

**Speed multiplier to `setTimeout` interval**:
```typescript
const BASE_INTERVAL_MS = 1000; // 1 second per minute at ×1
const speedMultiplier: Record<PlaybackSpeed, number> = {
  '1': 1,
  '3': 3,
  '10': 10,
  'skip': Infinity,
};
const tickIntervalMs = BASE_INTERVAL_MS / speedMultiplier[speed];
```

### 6.2 Substitution Decision — ItemSelect + EventChoiceButtons

**Bench player selection**:
- Family: Item selection → `<ItemSelect>` (scrollable list)
- Each item: `[name] · [position] · [fitness-icon]`
- Single-select; selected item highlighted
- ARIA: `role="listbox"` with `role="option"` per item; `aria-selected={isSelected}`

**Tactical instruction**:
- Family: Categorical → `<ButtonGroup>` (3-4 options)
- Options depend on team side: home excludes COUNTER; away includes all four

**Decision confirm/skip**:
- Family: Binary event choice → `<EventChoiceButtons>` pair
- "Hacer cambio →" (primary, enabled only if bench player selected)
- "Continuar sin cambios" (secondary)
- Submission POSTs `{ decisionType: 'substitution_window', playerOutId, playerInId, newFormation?, teamInstruction? }` to `/api/matches/:id/decision`

### 6.3 Formation Select — ItemSelect

- Family: Item selection → `<ItemSelect>` (4 formation presets)
- Options: `4-4-2 (Equilibrado)` · `4-3-3 (Ataque)` · `3-5-2 (Control)` · `5-3-2 (Defensivo)`
- Secondary label shows modifier description ("+ataque / -defensa" etc.)
- ARIA: `aria-label="Cambio de formación"`

---

## 7. Domain-Language Formatting (ADR-017)

All numeric metrics route through `packages/shared/src/types/format.ts`. For the
match screen, the relevant formatters are:

### Player fitness (in lineup panel and substitution modal)

Used for fitness indicators on individual players during the match. Uses the same
`formatFitness()` function as the Dashboard but also applies the icon-tier rule:

| Range | Text label | Icon | Severity |
|---|---|---|---|
| ≥ 60 | "Fresco" | 🟢 | good |
| 30–59 | "Cansado" | 🟡 | warn |
| < 30 | "Agotado" | 🔴 | bad |

This is a simplified 3-bucket read of `effective_fitness(player, currentTick)`. The
full 5-bucket `formatFitness()` is for Dashboard summary use; the match-time 3-bucket
encoding follows hud-ui.md Regla 6 exactly (same icons, same thresholds).

### ∆MPI (in Outcome Modal)

Uses `formatMpi()` from the formatter library. Display: signed integer with + prefix
for positive values. Example: `+12` (good/green) · `0` (neutral) · `-8` (bad/red).
Severity encoding: positive = good, zero = neutral, negative = bad.

See **OQ-LIVE-01** for the open question on whether ∆MPI is the right metric to surface
here vs. the raw result delta.

### Match result label

Derived from final score + `playerClubSide`:

| Condition | Label | Severity |
|---|---|---|
| Player's team scored more | "VICTORIA" | good |
| Equal score | "EMPATE" | neutral |
| Opponent scored more | "DERROTA" | bad |

This derivation is client-side. The server's `MatchOutcome` includes `outcome: 'win' | 'draw' | 'loss'`
relative to the home team; the client maps it to the player's club side.

---

## 8. Sprite Library Usage (ADR-018)

All sprites are `<img>` tags with `image-rendering: pixelated`. Served from
`apps/web/static/sprites/match/`. Wrapped in `<MatchEventSprite>` component
(see ADR-018 §3 for component shell).

### Event → Sprite mapping

| Event type | Variant condition | Sprite path |
|---|---|---|
| `goal` | default | `goal/goal-default.gif` |
| `goal` | `variant === 'header'` | `goal/goal-header.gif` |
| `goal` | `variant === 'volley'` | `goal/goal-volley.gif` |
| `injury` | `severity === 'major'` | `injury/injury-stretcher.gif` |
| `injury` | `severity === 'minor'` | `injury/injury-down.gif` |
| `yellow_card` | — | `card/card-yellow.gif` |
| `red_card` | `reason === 'second_yellow'` | `card/card-second-yellow.gif` |
| `red_card` | `reason === 'direct'` | `card/card-red.gif` |
| `expulsion` | tackle context | `expulsion/expulsion-tackle.gif` |
| `var_review` | `outcome === 'reviewing'` | `var/var-checking.gif` |
| `var_review` | `outcome === 'confirmed'` | `var/var-confirmed.gif` |
| `var_review` | `outcome === 'overturned'` | `var/var-overturned.gif` |
| Ambient (idle) | pre-match / between events | `ambient/ball-bounce.gif` |
| Ambient (favorable momentum) | when `homeMomentum > 65` at half-time | `ambient/crowd-cheer.gif` |

**Emoji fallback rule** (validated in slice): if a sprite `src` 404s (asset not yet
created by the art team), the `<MatchEventSprite>` component falls back to an emoji
placeholder defined in the component:

```typescript
const EMOJI_FALLBACK: Record<EventType, string> = {
  'goal': '⚽', 'injury': '🏥', 'yellow_card': '🟨',
  'red_card': '🟥', 'expulsion': '🟥', 'var-checking': '🎯',
  'var-confirmed': '✅', 'var-overturned': '❌',
};
```

The fallback is automatic — no feature flag needed. The `<img>` `onerror` handler
replaces the element with the emoji span. This ensures the MVP works before all
pixel-art assets are complete.

### Sprite sizing

All sprites render at 96×96px with `image-rendering: pixelated`. On `@media (min-width: 768px)`,
sprites scale to 128×128px in the modal context. The ambient sprites (ball-bounce, crowd-cheer)
render smaller: 48×48px in the events log empty state area.

---

## 9. Pacing Rules (ADR-018)

### 9.1 Default tick rate

```
1 in-game minute = 1 real second (×1 speed)
Full 90-minute match = 90 real seconds at ×1
```

The client maintains a `displayedMinute` counter driven by `setTimeout` at
`tickIntervalMs = 1000 / speedMultiplier`. Events are queued client-side as they
arrive via Socket.IO and unveiled when `displayedMinute >= event.minute`.

### 9.2 Dramatic event pacing (verbatim from ADR-018)

```
Teaser         900ms  (non-skippable; announces event without revealing outcome)
Modal open     →      (immediately after teaser)
Modal dwell    10s    (goals) / 5s (injuries) — default
               2s     (goals + injuries) — when prefers-reduced-motion active
VAR reviewing  2200ms (loop)
VAR resolve    1500ms (one-shot result)
```

The countdown in the modal shows the remaining seconds. The "Continuar →" button and
"✕" button skip the remaining dwell. ESC also skips. None of these skip the VAR
theater phase — VAR resolves on its own 2200+1500ms timeline (also skippable via ✕ / ESC).

### 9.3 Non-skippable elements

The 900ms teaser is non-skippable (too short to warrant a skip UI). The substitution
decision modal is non-skippable (it blocks playback by design — this is a game mechanic,
not a UI timer). All other dwell timers are skippable.

### 9.4 Backdrop rule

The modal backdrop (`z-index: 100`) is `rgba(0,0,0,0.7)`. **`backdrop-filter: blur` is
explicitly forbidden.** This was a verified slice bug that caused confetti (z-index 110)
to appear dimmed by the blur filter applied to elements above the backdrop but below the
confetti. The fix is a flat dim layer with no filter.

### 9.5 localStorage persistence

```typescript
const STORAGE_KEY = 'cascada.match.playbackSpeed';
// Write on every speed change:
localStorage.setItem(STORAGE_KEY, selectedSpeed);
// Read on mount:
const stored = localStorage.getItem(STORAGE_KEY) as PlaybackSpeed | null;
const initialSpeed: PlaybackSpeed = stored ?? '1';
```

Valid stored values: `'1'`, `'3'`, `'10'`. The skip (⏭) state is never persisted — it
is a one-time action, not a persistent preference.

---

## 10. Match Session Lifecycle (ADR-013)

### 10.1 State machine visible to the UI

| Server state | UI state | What the player sees |
|---|---|---|
| `pre_match` | Pre-match | Scoreboard 0-0, "Comenzar partido →" CTA, idle sprite |
| `in_progress` | Playing | Clock running, events arriving, speed toggle active |
| `paused_for_decision` | Paused | Decision modal blocking; clock frozen; "⏸ N'" in scoreboard |
| `completed` | Match complete | Outcome Modal (score + ∆MPI + "Volver al panel →") |
| `failed` | Error | Error panel with "Volver al panel →" only |
| `archived` | (not reached from this screen) | — |

### 10.2 State transition triggers

```
pre_match     → in_progress         POST /api/matches/:id/start
in_progress   → paused_for_decision Server pauses (injury / sub_window)
paused_for_dec → in_progress        POST /api/matches/:id/decision
in_progress   → completed           Server emits match:full-time
in_progress   → failed              Server emits match:error (unrecoverable)
```

### 10.3 "Avanzar" button state on HUD strip

While on the `/match` route, the global HUD strip's "Avanzar" button is **disabled**
(as per hud-ui.md Regla 4 — disabled when BLOCKING modal is open). The entire match
screen is a BLOCKING context: the player must complete the match (or return to
Dashboard via the outcome CTA) before advancing the week. The Avanzar button label
changes to "Partido en curso" while disabled.

If the player navigates away via the nav icons (back to Dashboard) before the match
is complete, see §14.3 (navigation away mid-match).

### 10.4 Pre-match scoreboard derivation

The home and away club names are loaded from the MatchSessionSnapshot. The server
includes `homeClubName` and `awayClubName` in the session data. The player's club
side (`playerClubSide: 'home' | 'away'`) determines which club name to emphasize
and which goal events trigger confetti.

---

## 11. Socket.IO Integration (ADR-018 + ADR-013)

### 11.1 Namespace and room

```
Namespace: /match
Room:      match:{sessionId}
```

The client joins the room via `match:subscribe` immediately on mount. The server's
`MatchSession` FSM already manages who receives events (the one authenticated
player who owns the session).

### 11.2 Events the client listens to

```typescript
// Server → Client

socket.on('match:event', (e: MatchEvent) => {
  // Queue event at e.minute for display
  // Trigger teaser + modal for dramatic events
})

socket.on('match:tick', (t: { sessionId: string; minute: number }) => {
  // Sync clock — advance displayedMinute if client is behind
})

socket.on('match:full-time', (result: { score, outcome, worldStateDeltas }) => {
  // Close any open modals; show Outcome Modal
})

socket.on('match:error', (err: { reason: string }) => {
  // Transition to failed state; show error panel
})
```

### 11.3 Events the client emits

```typescript
// Client → Server

socket.emit('match:subscribe', { sessionId })   // On mount
socket.emit('match:skip-to-end', { sessionId }) // On ⏭ tap (no pending pause)
// Note: decisions are sent via HTTP POST /api/matches/:id/decision (not Socket.IO)
// This keeps the decision path RESTful and auditable (per ADR-013 + ADR-015)
```

### 11.4 Reconnection handling

If the Socket.IO connection drops mid-match:

1. The client shows a subtle reconnecting indicator (not alarming — Pilar 4): a dim
   "Reconectando..." badge below the scoreboard. The match clock freezes.
2. On reconnect, the client emits `match:subscribe` again. The server re-sends any
   events that were emitted after the last received event (using the `eventsAccumulated`
   in `MatchSessionSnapshot` as the source of truth per ADR-013).
3. If the match completed during the disconnect, the server emits `match:full-time`
   immediately on re-subscribe. The client opens the Outcome Modal.
4. If the session transitioned to `failed` during the disconnect, the client shows
   the error panel (§5.4).

**The reconnect banner** is a `role="status"` element (`aria-live="polite"`) that
announces "Reconectando al partido..." to screen readers without alerting.

---

## 12. Accessibility

Per `accessibility-requirements.md` — WCAG 2.1 AA.

### 12.1 Keyboard navigation

| Element | Tab order | Action |
|---|---|---|
| HUD strip | First (global, sticky) | Tab reaches Avanzar (disabled during match) and inbox icon |
| Skip-link | Before any content | "Saltar al contenido del partido" — jumps to scoreboard |
| Zone B — Scoreboard | 1st in page body | Not interactive — no tab stop inside cells |
| Zone C — Playback bar | 2nd | Tab enters ButtonGroup; Left/Right navigate speeds; Enter/Space selects |
| Zone D — Events log | 3rd | Not interactive — scrollable with keyboard via arrow keys on focused container |
| Zone E — Lineup toggle | 4th | Enter/Space opens/closes lineup panel |
| Lineup panel (if open) | 5th | Tab through player rows (read-only) |
| "Comenzar partido" CTA (pre-match) | 2nd (replaces playback bar) | Enter/Space starts match |
| Decision modal (when open) | Focus trapped inside | Tab cycles: bench list → formation → instruction → confirm → skip |
| "Volver al panel" CTA (outcome modal) | Only interactive element when modal open | Enter navigates to Dashboard |

### 12.2 Screen reader labels

| Element | Accessible name |
|---|---|
| Scoreboard | `aria-label="Marcador: {homeClub} {homeGoals} - {awayGoals} {awayClub}, minuto {minute}"` |
| Score updates | `aria-live="polite"` on the goals container — announces when score changes |
| Playback speed group | `aria-label="Velocidad de reproducción"` on `role="radiogroup"` |
| Events log | `role="log"` `aria-live="polite"` `aria-label="Eventos del partido"` |
| Each event entry | `aria-label` — e.g., "Gol del minuto 67 del equipo local" · "Lesión grave en el minuto 34" · "Tarjeta amarilla minuto 45 equipo visitante" |
| Teaser banner | `aria-live="polite"` — announces teaser text to screen reader |
| Dramatic event modal | `role="dialog"` `aria-modal="true"` `aria-labelledby` pointing to the modal heading |
| Substitution modal | `role="dialog"` `aria-modal="true"` `aria-label="Ventana de cambios, minuto {N}"` |
| Bench player list | `role="listbox"` `aria-label="Seleccionar jugador para entrar al campo"` |
| Outcome modal | `role="dialog"` `aria-labelledby` → "Resultado final" heading |
| Confetti container | `aria-hidden="true"` |
| Reconnecting indicator | `role="status"` `aria-live="polite"` |

### 12.3 Colour and contrast

| Element | Colour rule |
|---|---|
| Own-team goal modal | Accent color (`--accent`) + "¡GOOOOL!" text label — color is supplementary; text is the primary channel |
| Rival goal modal | Bad color (`--bad`) + "GOL RIVAL" text — same pattern |
| Fitness icons | 3 shapes (circle/square/triangle could supplement) or icon + text label "Fresco/Cansado/Agotado" — icon shape must differ per tier |
| Severity in event log | Color class + icon in event text (⚽ 🟨 🟥 🏥) — icons are not purely decorative here; they are the primary non-color encoding |
| VAR result | Text "GOL CONFIRMADO" / "VAR ANULA" — color of sprite is supplementary |

All contrast ratios follow the verified values in `design/ux/dashboard.md` §12.3.
The additional `--accent` color for player-team goals must be verified at ≥ 4.5:1
against the modal card background (`var(--bg-2)`).

### 12.4 Reduced motion

| Element | Reduced-motion behavior |
|---|---|
| New event entry animation | Instant (no translateY slide-in) |
| Auto-scroll on new event | `behavior: 'instant'` instead of `'smooth'` |
| Teaser banner entrance | Instant render (no `teaser-pop` keyframe) |
| Modal enter animation | Instant render (no `pop-in` / `fade-in`) |
| Confetti | `animation: none; opacity: 0` — confetti does not play |
| GIF sprites | `animation-play-state: paused` — sprites render first frame only |
| VAR spinner rotation | Paused — shows static first frame |
| Dramatic event dwell | Reduced to 2s (see §9.2) |
| Events log sprite (ambient) | No animation on ball-bounce sprite |

### 12.5 WCAG checklist for this screen

- [x] Usable with keyboard only (full tab order in §12.1; modal focus trap)
- [x] No gamepad support (none in MVP — documented and accepted)
- [x] Text readable at minimum font size (score uses `font-size: 40px`; all labels ≥ 14px)
- [x] No information conveyed by colour alone (event icons + text labels are primary; color is supplementary)
- [x] No flashing content (no pulsing elements; teaser is a brief appearance, not a flash)
- [x] No dialogue/audio requiring subtitles on this screen (no voice content in MVP)
- [x] UI scales at 200% desktop zoom (sticky zones use max-width + centering; no fixed pixel widths on text containers)

---

## 13. Mobile / Responsive

### 13.1 Layout at 375px

| Zone | Mobile behaviour |
|---|---|
| Zone A — HUD strip | Sticky top; compact mode per hud-ui.md (siglas, icon-only financial status) |
| Zone B — Scoreboard | Club names: abbreviated siglas (≤ 4 chars). Score display: same size. Phase label: small, dim. |
| Zone C — Playback bar | 4 buttons in a row: `×1 ×3 ×10 ⏭`. Each ~(375 - 32px padding - 3×8px gap) / 4 ≈ 75px. Labels fit at 14px — verify. |
| Zone D — Events log | Full-width; event entries single-line truncate with `text-overflow: ellipsis`. Tap entry to expand (full text in a tooltip-style popover). |
| Zone E — Lineup panel | Hidden by default on 375px; accessible via "Plantilla ▾" toggle at bottom of events log |
| Dramatic event modal | Full-screen on mobile (`width: 100%; height: 100%`; no border-radius). Sprite renders centered. |
| Substitution modal | Full-screen; bench list scrollable; confirm button full-width, 48px height |
| Outcome modal | Full-screen; "Volver al panel →" full-width button, 48px height |
| Touch targets | All interactive elements ≥ 44×44px (per accessibility-requirements.md §6) |
| Bottom tab bar | `padding-bottom: TAB_BAR_HEIGHT_PX` on page content to prevent overlap |

**Scoreboard on mobile — club name abbreviation**:
The server includes a `siglas` field in the MatchSessionSnapshot (same pattern as HUD
strip per hud-ui.md Regla 2). If `siglas` is absent, the client truncates to the first
4 characters + "." as a fallback.

**Playback bar at 375px — label fit check** (OQ-LIVE-03): the four labels "×1", "×3",
"×10", "⏭" are all ≤ 3 characters. They fit comfortably at 14px. No abbreviation needed.
However, the ⏭ option may need an `aria-label="Saltar al final"` to supplement the icon.

### 13.2 Touch interaction model

The primary touch interactions on this screen are passive (watching, reading). The
only active touch interactions are:
- Speed toggle ButtonGroup (tap to select)
- Substitution modal: scroll bench list + tap to select + tap confirm
- Modal dismiss: tap "Continuar →" or "✕"

All of these use standard tap targets. No swipe gestures are required. No long-press
semantics are used.

### 13.3 Orientation

Portrait is the primary orientation for match watching on mobile. In landscape, the
scoreboard and playback bar remain sticky but take less vertical space; the events log
gains more height. No explicit orientation lock. The substitution modal in landscape
on mobile may need `overflow-y: auto` within the modal card to handle the longer bench
list — flag as **OQ-LIVE-04** for visual testing.

---

## 14. Edge Cases

### 14.1 Socket.IO disconnect mid-match

Per §11.4. The client freezes the clock and shows the reconnecting indicator. On
reconnect, it re-subscribes and replays missed events. If the session reached
`completed` or `failed` during the disconnect, those states are applied immediately
on re-subscribe. The player never sees a "stale" match state — reconnection always
restores the authoritative server state.

### 14.2 Player navigates away mid-pause window

If the player presses a nav icon (Dashboard, Plantilla, Staff, Finanzas) while a
substitution decision modal is open:

1. A browser `beforeunload`-style confirmation dialog appears:
   > "¿Salir del partido?"
   > El partido está pausado esperando tu decisión. Si sales, se aplicará la decisión
   > por defecto (sin cambios). El partido continuará en el servidor.
   > [Salir] [Quedarme]

2. If the player confirms exit: the server's 24h timeout eventually fires the default
   decision. The player can return to `/match` at any time (the session is still
   `paused_for_decision` until the timeout fires or they POST a decision).
3. If the player cancels: they remain on the match screen.

**Implementation note**: use SvelteKit's `beforeNavigate` hook, not `beforeunload`
(which is unreliable on mobile PWA). The dialog is a standard Confirmation Modal
(per interaction-patterns.md pattern).

### 14.3 Player navigates away during normal playback (not paused)

No confirmation dialog. The match continues server-side (the simulation is
server-authoritative). On return to `/match`, the client re-subscribes and replays
any missed events from the `eventsAccumulated` snapshot. If the match completed while
the player was away, the Outcome Modal appears on return.

### 14.4 Skip-to-end while pause window pending

The ⏭ button is disabled with `aria-disabled="true"`. A tooltip renders on hover/focus:
"Resuelve la ventana de cambios antes de saltar al final."

The button is never removed from the DOM while disabled — it remains in the tab order
with `aria-disabled` so keyboard users encounter the explanation.

### 14.5 All bench players used (pool exhausted or bench empty)

When `substitutionsUsed === 5` OR `availableBench.length === 0`:
- The substitution window modal still opens (the window itself is a game event)
- The bench player `<ItemSelect>` is hidden or replaced with "Sin cambios disponibles"
- Only the tactical instruction and formation options remain
- Confirm button: "Continuar sin cambios →"

When only injury pauses remain with an empty pool:
- The `injury_pause` modal shows only "Continuar con 10 jugadores →"
- No bench select rendered

### 14.6 Zero events in a 90-second match

Statistically unusual but possible (all `P_attack` rolls miss). The events log shows:
- Ambient `ball-bounce.gif` sprite persists throughout the match
- `half_time` and `full_time` system entries render as dividers
- No dramatic modals fire
- Final score is 0-0; Outcome Modal shows "EMPATE"
- No confetti (no goals)
- No dead time — the clock still counts 1s/minute; the player observes the absence of events

### 14.7 VAR overturns a goal (score correction)

When `var_review.outcome === 'overturned'`:
1. The modal transitions to VAR theater (§4.5)
2. On "VAR ANULA" reveal: the score in Zone B scoreboard decrements by 1 for the
   scoring team
3. The events log appends a `goal_disallowed` entry: `⚽✗ 34' — GOL ANULADO (VAR)`
4. Confetti (if it was active) has already auto-cleared by this point (3500ms) — no
   explicit confetti reversal needed
5. The `<MatchEventSprite var-overturned.gif>` plays its one-shot animation

**Slice note**: the slice did not decrement the score on VAR overturn ("visual only").
Production must correct this — the authoritative score comes from the server's event
stream. When a `goal` event is followed by `var_review {outcome:'overturned'}`, the
client undoes the goal in its local score state.

### 14.8 Browser tab backgrounded during match

The match simulation continues server-side — it is completely server-authoritative.
When the tab returns to the foreground:
1. If less than ~90 real seconds elapsed: the Socket.IO connection may still be alive;
   events that arrived during background are queued and replayed.
2. If the tab was backgrounded long enough for the Socket.IO connection to timeout:
   reconnect flow applies (§11.4).
3. If the match completed while backgrounded: Outcome Modal appears immediately.

**No pausing of client-side timers when backgrounded**: the client's `setTimeout`-based
clock is unreliable when backgrounded (browsers throttle it). Production must sync the
displayed minute from `match:tick` events rather than relying on client-side timers as
the sole source of truth. On tab return, request a `match:resync` to snap the displayed
minute to the server's current tick.

### 14.9 Concurrent session attempt (`409 Conflict`)

Per ADR-013 UNIQUE INDEX: if the player somehow triggers `POST /api/matches/:id/start`
when a session is already `in_progress` or `paused_for_decision`, the server returns
`409 { error: 'match_already_in_progress' }`. The client:
1. Does not open a second session
2. Shows a brief error toast: "El partido ya está en curso. Reconectando..."
3. Fetches the existing session and resumes from its current state

---

## 15. Open Questions

| ID | Question | Blocking for | Owner |
|---|---|---|---|
| **OQ-LIVE-01** | Should the Outcome Modal show `∆MPI` as the primary post-match metric? The Dashboard already shows `∆MPI` in the result panel. The match screen showing it again may feel redundant. Alternatives: show the win/draw/loss label only; or show the narrative staff message teaser. Recommend retaining ∆MPI on Outcome Modal for now — it gives the player an immediate signal of how their decisions propagated. Flag for confirmation. | Outcome Modal implementation | Pablo + game-designer |
| **OQ-LIVE-02** | What happens to the cascade engine's weekly tick if the match session ended in `failed` state? Does the advance loop use a default 0-0 result, a previous result estimate, or does it block until the player creates a new session? This determines the error UX copy in §5.4. | Failed session UX copy | web-backend-specialist + game-designer |
| **OQ-LIVE-03** | Playback bar at 375px: do "×1 ×3 ×10 ⏭" labels fit without wrapping at 14px? This is likely fine given the short labels but requires a visual test at the target viewport. Flag for ui-programmer visual check. | Playback bar mobile implementation | ui-programmer |
| **OQ-LIVE-04** | Substitution modal in landscape on mobile: does the bench player list overflow vertically? If the bench has 7 players and the landscape viewport is ~414px tall (iPhone), the modal may need `max-height: 90vh; overflow-y: auto`. Requires visual test. | Substitution modal mobile implementation | ui-programmer |
| **OQ-LIVE-05** | The `match:tick` event (sent every ~5 in-game minutes per ADR-018) is used for clock sync. When the player has speed set to ×10, the client advances 10 minutes per real second. The `match:tick` arrives every 5 real seconds at ×1, but at ×10 the client may advance ahead of the server's tick events. Define the exact client-server sync protocol for fast playback: does the client interpolate, or does it wait for tick events? Flag for realtime-multiplayer-specialist. | ×10 speed implementation | realtime-multiplayer-specialist |
| **OQ-LIVE-06** | Staff flavor text on goal events (§4.3): the spec states the server generates tier-dependent flavor text. Is this included in the `match:event` payload as a `staffComment: string` field, or does the client request it separately? If it's in the event payload, the formatter contract should be documented in ADR-017. If it's a separate request, there is a latency concern for fast playback (×10). Flag for web-backend-specialist + ux-designer follow-up. | Staff flavor text implementation | web-backend-specialist |
| **OQ-HUD-11** (partial) | OQ-HUD-11 is resolved for the sprite library architecture (ADR-018 + this spec §8). Remaining scope: the actual pixel-art GIF assets are not yet authored. The emoji fallback (§8) handles MVP launch without assets. The art pipeline for creating the 12+ sprites needs a timeline from the art-director. | Art asset pipeline | art-director |
| **OQ-HUD-12** (resolved) | OQ-HUD-12 (dramatic event pacing) is fully resolved by ADR-018 + this spec §9. No further open questions. | — | — |
| **OQ-HUD-13** (resolved) | OQ-HUD-13 (playback timing + speed toggle) is fully resolved by ADR-018 + this spec §9.1. OQ-LIVE-05 is a follow-up refinement for fast playback sync, not a blocker for this OQ. | — | — |

---

## 16. Acceptance Criteria

These are testable by a QA tester without reading any other design document.

### Session lifecycle

- [ ] **AC-LIVE-01** GIVEN `state='pre_match'` when the player navigates to `/match`, WHEN the
  screen loads, THEN the scoreboard shows `0-0 · Antes de empezar`, the idle `ball-bounce.gif`
  sprite (or emoji fallback) is visible, and the "Comenzar partido →" CTA is present.

- [ ] **AC-LIVE-02** GIVEN the player taps "Comenzar partido →", WHEN `POST /api/matches/:id/start`
  succeeds, THEN the screen transitions to playback mode: the clock starts at 1', events begin
  arriving, and the "Comenzar partido" CTA is removed from the DOM.

- [ ] **AC-LIVE-03** GIVEN the match reaches minute 90 and the server emits `match:full-time`,
  WHEN the final event is rendered, THEN the Outcome Modal appears with the correct final score,
  a result label (VICTORIA / EMPATE / DERROTA), and a "Volver al panel →" CTA.

- [ ] **AC-LIVE-04** GIVEN the player taps "Volver al panel →" in the Outcome Modal, WHEN the
  navigation executes, THEN the route changes to `/` (Dashboard) without a full page reload
  (SvelteKit client-side navigation).

### Playback timing

- [ ] **AC-LIVE-05** GIVEN the speed is set to ×1, WHEN the match is in playback, THEN the
  displayed minute advances at 1 minute per real second (±100ms tolerance). Measured by
  Playwright with a local mock server and a 10-second observation window.

- [ ] **AC-LIVE-06** GIVEN the speed is set to ×3, WHEN the match is in playback, THEN the
  displayed minute advances at 3 minutes per real second (±200ms tolerance).

- [ ] **AC-LIVE-07** GIVEN the player sets the speed to ×10 and navigates away (page reload),
  WHEN they return to `/match`, THEN the playback speed is still ×10 (restored from localStorage).

- [ ] **AC-LIVE-08** GIVEN no localStorage entry exists, WHEN the player opens the match screen,
  THEN the default playback speed is ×1.

### Dramatic event flow (ADR-018)

- [ ] **AC-LIVE-09** GIVEN a `goal` event arrives via Socket.IO, WHEN the client renders it,
  THEN: (a) the teaser banner appears for approximately 900ms without revealing the outcome,
  (b) the score in Zone B updates, (c) the dramatic event modal opens with the correct home/away
  styling, (d) the modal includes a visible countdown starting at 10s, and (e) the modal closes
  after 10s if not dismissed.

- [ ] **AC-LIVE-10** GIVEN a `goal` event for the player's own team, WHEN the dramatic modal
  opens, THEN confetti renders at z-index 110 (visually above the backdrop, below the modal card)
  and the confetti container has `aria-hidden="true"`.

- [ ] **AC-LIVE-11** GIVEN a `goal` event for the rival team, WHEN the dramatic modal opens,
  THEN no confetti renders.

- [ ] **AC-LIVE-12** GIVEN the player presses "Continuar →" or "✕" during the modal countdown,
  WHEN the action fires, THEN the modal closes immediately (no remaining dwell time).

- [ ] **AC-LIVE-13** GIVEN the player presses ESC during the dramatic event modal, WHEN the key
  fires, THEN the modal closes immediately (same as "✕").

- [ ] **AC-LIVE-14** GIVEN `prefers-reduced-motion: reduce` is active, WHEN a goal event arrives,
  THEN: (a) no confetti animates, (b) the modal dwell is 2s (not 10s), (c) no CSS transition
  plays on modal entry.

### VAR theater

- [ ] **AC-LIVE-15** GIVEN the server sends a `var_review {outcome:'confirmed'}` event following
  a goal, WHEN the VAR theater plays, THEN: (a) the modal transitions to "VAR REVISANDO" state
  with the `var-checking.gif` sprite (or emoji fallback), (b) after ~2200ms transitions to
  "GOL CONFIRMADO" with the `var-confirmed.gif` sprite, (c) the score remains unchanged.

- [ ] **AC-LIVE-16** GIVEN the server sends a `var_review {outcome:'overturned'}` event following
  a goal, WHEN the VAR theater resolves, THEN: (a) the "VAR ANULA EL GOL" state renders,
  (b) the scoreboard in Zone B decrements the scoring team's goals by 1, (c) a `goal_disallowed`
  entry appears in the events log.

### Substitution decision (ADR-013)

- [ ] **AC-LIVE-17** GIVEN the server emits a `substitution_window` at minute 45, WHEN the event
  arrives, THEN: (a) match playback stops, (b) the substitution decision modal opens with the
  current lineup, bench list, formation selector, and instruction ButtonGroup, (c) the playback
  controls are disabled while the modal is open.

- [ ] **AC-LIVE-18** GIVEN the player selects a bench player and taps "Hacer cambio →", WHEN the
  POST `/api/matches/:id/decision` succeeds, THEN: (a) the modal closes, (b) a `substitution`
  event entry appears in the events log, (c) the lineup panel reflects the new XI, (d) playback
  resumes.

- [ ] **AC-LIVE-19** GIVEN the player taps "Continuar sin cambios", WHEN the action fires, THEN
  the modal closes and playback resumes without any substitution.

- [ ] **AC-LIVE-20** GIVEN `substitutionsUsed === 5` when a `substitution_window` fires, WHEN the
  modal opens, THEN the bench player selection is absent and only "Continuar sin cambios →" is
  shown.

- [ ] **AC-LIVE-21** GIVEN the ⏭ button is visible and a pause window is pending, THEN the ⏭
  button has `aria-disabled="true"` and tapping it does not emit `match:skip-to-end`.

### Sprites and formatting (ADR-018 + ADR-017)

- [ ] **AC-LIVE-22** GIVEN a `goal` event, WHEN the `<MatchEventSprite>` renders, THEN the `<img>`
  has `image-rendering: pixelated` in its computed styles and a non-empty `alt` attribute.

- [ ] **AC-LIVE-23** GIVEN the sprite file does not exist (404), WHEN `<MatchEventSprite>` renders,
  THEN the emoji fallback replaces the `<img>` within one error cycle (no broken image icon shown
  to the user).

- [ ] **AC-LIVE-24** GIVEN `injury_pause` fires for a minor injury (`severity: 'minor'`), THEN no
  dramatic modal opens — the injury appends as a regular log entry only.

### Accessibility

- [ ] **AC-LIVE-25** GIVEN a keyboard-only user (mouse unplugged), WHEN they navigate the match
  screen, THEN they can: reach the speed toggle ButtonGroup via Tab, change speed via arrow keys,
  and interact with the substitution decision modal without a mouse.

- [ ] **AC-LIVE-26** GIVEN a `goal` event fires, WHEN the score updates in Zone B, THEN a screen
  reader announces the new score via the `aria-live="polite"` region on the goals container.

- [ ] **AC-LIVE-27** GIVEN the substitution decision modal is open, WHEN the user presses Tab
  repeatedly, THEN focus stays inside the modal (focus is trapped; it does not escape to background
  elements).

- [ ] **AC-LIVE-28** GIVEN the player is on the match screen, WHEN they navigate to the speed
  toggle and select ×3, THEN the screen reader announces "Velocidad ×3 seleccionada" (or
  equivalent via `aria-checked` change).

### Mobile

- [ ] **AC-LIVE-29** GIVEN a 375×812px viewport, WHEN the match screen renders, THEN: (a) club
  names in the scoreboard are abbreviated to siglas; (b) the playback bar shows all 4 speed
  options without horizontal scroll; (c) all interactive elements have a touch target ≥ 44×44px;
  (d) the bottom tab bar does not overlap the events log content.

- [ ] **AC-LIVE-30** GIVEN the dramatic event modal fires on a 375×812px viewport, WHEN the modal
  renders, THEN it fills the full screen (width: 100%; no border gaps), the sprite and text are
  readable, and the "Continuar →" button is ≥ 48px tall and full-width.

---

## Data Requirements

| Data | Source system | Read / Write | Notes |
|---|---|---|---|
| `matchSession.state` | match-session / ADR-013 | Read | Drives UI state machine |
| `matchSession.homeClubName` / `awayClubName` | match-session | Read | Scoreboard labels |
| `matchSession.playerClubSide` | match-session | Read | Determines confetti + result label |
| `matchSession.currentLineupHome` / `Away` | match-session | Read | Lineup panel; sub modal |
| `matchSession.substitutionsUsed` | match-session | Read | Controls sub availability |
| `matchEvent.type` | match-worker / Socket.IO | Read | Drives teaser, modal, log entry |
| `matchEvent.minute` | match-worker / Socket.IO | Read | Clock sync; log entry |
| `matchEvent.team` | match-worker / Socket.IO | Read | Confetti trigger; score update |
| `matchEvent.player` | match-worker / Socket.IO | Read | Player name in events |
| `matchEvent.score` | match-worker / Socket.IO | Read | Scoreboard update |
| `matchEvent.payload` | match-worker / ADR-015 | Read | Renders sub decision modal |
| `matchFinalResult.worldStateDeltas` | match-worker | Read | ∆MPI in Outcome Modal |
| `localStorage.cascada.match.playbackSpeed` | client | Read/Write | Speed persistence |

The match screen does NOT write any game state. All writes go through the server
via the decision POST endpoint. The UI is read-and-emit only.

---

## Events Fired

| Player Action | Event / API call | Payload |
|---|---|---|
| Tap "Comenzar partido →" | `POST /api/matches/:id/start` | `{}` |
| Submit substitution decision | `POST /api/matches/:id/decision` | `{ decisionType, playerOutId?, playerInId?, newFormation?, teamInstruction? }` |
| Skip modal (Continuar / ✕ / ESC) | None (client-side state only) | — |
| Change playback speed | None (localStorage write only) | — |
| Skip to end | `socket.emit('match:skip-to-end', { sessionId })` | — |
| Tap "Volver al panel →" | SvelteKit `goto('/')` | — |

---

## Transitions and Animations

| Transition | Behaviour | Reduced-motion fallback |
|---|---|---|
| Pre-match → Playing | Scoreboard updates phase label; CTA fades out; clock starts | Instant |
| New event log entry | `translateY(12px) → 0, opacity 0 → 1` at `motion-short` (200ms) | Instant |
| Teaser banner appear | `teaser-pop` keyframe (350ms spring) | Instant render |
| Teaser banner disappear | `opacity: 0` fade 150ms | Instant |
| Dramatic modal enter | `pop-in` + `fade-in` backdrop (200ms) | Instant |
| Dramatic modal exit | `opacity: 0` 150ms | Instant |
| VAR phase transition | Cross-fade 300ms between phases | Instant cut |
| Confetti fall | Per-piece CSS animation 2.5–4s | None (disabled entirely) |
| Scoreboard score change | Brief scale pulse on changed digit: `transform: scale(1.15) → 1` 200ms | Instant |
| Outcome Modal enter | `fade-in` 200ms | Instant |
| Reconnecting badge appear | Instant (functional state — no cosmetic delay) | Same |

All transitions ≤ 300ms per ADR-012 hard cap (Pilar 4). The only exception is
confetti (cosmetic, optional, disabled under reduced-motion).

---

## Cross-Reference Check

**GDD requirements covered**:
- hud-ui.md OQ-HUD-11 (pixel-art sprites): Resolved — §8 defines full sprite library + emoji fallback
- hud-ui.md OQ-HUD-12 (dramatic event pacing): Resolved — §9.2 verbatim from ADR-018; §4.5 modal spec
- hud-ui.md OQ-HUD-13 (playback timing + speed toggle): Resolved — §9.1 + §4.2 playback bar
- hud-ui.md Regla 6 (pause window decision types + snapshot): Addressed — §4.7 substitution modal
- ADR-013 (pause windows at 45/60/75; substitution_window vs injury_pause): Addressed — §3.1 lifecycle + §4.7
- ADR-013 (PRNG Option B): Not a UX concern — server-side; no UX spec needed
- ADR-013 (`failed` state + UNIQUE INDEX): Addressed — §5.4 + §14.9
- ADR-015 (EventDecisionPayload for substitution): Addressed — §4.7 references `<EventChoiceButtons>` + ItemSelect
- ADR-017 (ButtonGroup for speed; ItemSelect for bench/formation): Addressed — §6 full input spec
- ADR-018 (teaser 900ms; 10s modal; VAR 30%/10%; confetti z-110; no backdrop-filter): Addressed — §9 verbatim
- ADR-018 (Socket.IO /match namespace): Addressed — §11

**New patterns used, not yet in interaction-patterns.md**:
- "Sticky scoreboard" (Zone B): a persistent header below the global HUD that always shows the current score + clock during a match. This is narrower than [Stat Display] and different from [Entity Card]. Flag for addition to pattern library.
- "Teaser banner": 900ms tension buildup panel before a dramatic reveal. A temporary, non-dismissable notification that creates anticipation. Distinct from [Toast Notification] (which is informational and can persist). Flag for pattern library addition.
- "Decision modal with timeout" (substitution_window): a modal that blocks an ongoing process (match playback) but is not session-blocking (24h timeout); has server-side default behavior if untouched. Different from [Confirmation Modal] (which blocks a user action). Flag for pattern library.

**Navigation mismatches**: None. Entry via Dashboard Zone E CTA is consistent with
dashboard.md §9. Exit via "Volver al panel →" calls `goto('/')` consistent with dashboard.md §4.

**ADR-012 compliance**: All sprites are `<img>` DOM elements. No PixiJS canvas. Confirmed.

**Pilar 4 compliance check**:
- No real-time pressure for substitution decisions (24h server timeout)
- No urgency styling on the timeout counter (dim text, no countdown bar)
- Speed is player-controlled; default ×1 is unhurried
- Teaser is 900ms (sub-second tension, not sustained pressure)
- Modal dwell is generous (10s) and fully skippable
