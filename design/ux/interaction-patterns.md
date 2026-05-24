# Interaction Pattern Library — Cascada FC

> **Status**: In Design (initial catalog drafted 2026-05-16)
> **Author**: [user + ux-designer]
> **Last Updated**: 2026-05-16
> **Template**: Interaction Pattern Library

---

## Overview

This library catalogs reusable interaction patterns for Cascada FC. Every `/ux-design` spec for a screen must reference these patterns by name rather than reinventing them. Patterns evolve: new patterns are added as new screens require them; existing patterns are revised when a screen surfaces a missing case.

**Guiding principles**:
- **Consistency over novelty**. A pattern repeats so the player learns it once.
- **DOM-first**. Patterns are DOM components by default. Canvas-only patterns are flagged.
- **Accessibility-bound**. Every pattern declares how it satisfies `accessibility-requirements.md`.
- **Calm tempo**. No pattern introduces time pressure (Pillar 4).

This is the **initial catalog**, derived from the game concept before any screen UX specs exist. Patterns will be revised as `/ux-design [screen]` sessions surface real usage.

---

## Pattern Catalog

| Pattern | Category | Purpose |
|---------|----------|---------|
| [Decision Panel](#decision-panel) | Navigation + Input | Container for a category of management decisions (entreno, finanzas, fichajes...) |
| [Event Inbox](#event-inbox) | Feedback | Persistent feed of staff messages, AI narratives, calendar events |
| [Time Advance](#time-advance) | Time | Skip to the next significant event in the calendar |
| [Confirmation Modal](#confirmation-modal) | Modal | Confirms destructive or irreversible actions |
| [Toast Notification](#toast-notification) | Feedback | Lightweight ephemeral feedback for non-critical events |
| [Section Tabs](#section-tabs) | Navigation | Switches between contexts within a decision area |
| [Entity Card](#entity-card) | Data Display | Compact representation of a player, staff member, club, or building |
| [Stat Display](#stat-display) | Data Display | Numeric value with optional trend indicator and non-colour encoding |
| [Drill-Down List](#drill-down-list) | Navigation | List item that opens a detail view; primary navigation pattern |
| [Spatial Camera](#spatial-camera) | Navigation (Canvas) | How the player moves the isometric camera |
| [Calendar Strip](#calendar-strip) | Time | Shows the upcoming week/month with anchored events |
| [Reveal Tooltip](#reveal-tooltip) | Feedback | Reveals supplementary, non-essential info on hover or focus |
| [Progress Indicator](#progress-indicator) | Feedback | Communicates the state of a long-running operation |
| [Empty State](#empty-state) | Feedback | What a list, panel, or screen shows when there is no data |
| [Button](#button) | Input | Foundational interactive element for committing an action; five variants |
| [Toggle](#toggle) | Input | Binary on/off control with persistent state |
| [Slider](#slider) | Input | Continuous or stepped numeric input within a defined range |
| [Form Field](#form-field) | Input | Text, number, or selection input within settings/creation flows |

---

## Animation Standards

All animations in the DOM follow a small set of duration tokens and easing curves, with reduced-motion fallbacks per `accessibility-requirements.md` Section 2. Canvas-side animation (Spatial Camera, ambient world) follows its own rules — see [Spatial Camera](#spatial-camera).

| Token | Duration | Easing | Use case | Reduced-motion fallback |
|-------|----------|--------|----------|--------------------------|
| `motion-instant` | 0ms | — | Tab swap, state change without transition | Same (no change) |
| `motion-quick` | 100ms | `ease-out` | Hover/focus highlight, press feedback | Same — already ≤ 200ms |
| `motion-short` | 200ms | `ease-out` | Toast slide-in, tooltip fade, toggle thumb | Cross-fade or instant |
| `motion-medium` | 300ms | `ease-in-out` | Modal enter/exit, panel slide, drawer | Cross-fade 100ms |
| `motion-long` | 500ms | `ease-in-out` | Camera tweens, page transitions | Instant cut |
| `motion-ambient` | 1-3s loop | `linear` | Inbox icon pulse, indeterminate progress strip | Paused or replaced by static state |

**Binding rules**:
- Any animation > 200ms must declare a reduced-motion fallback in its pattern entry.
- No animation may delay an information update beyond `motion-short` (200ms). State must be readable instantly even if the visual transition is still in flight.
- `motion-ambient` loops never communicate critical information — they are decorative only.

**Cross-reference**: `accessibility-requirements.md` Section 2 (Reduced motion).

---

## Sound Standards

All audio routes through one of four channels with independent volume sliders (per `accessibility-requirements.md` Section 5). No information is ever communicated by audio alone — every cue has a visual counterpart in the same screen.

### Channels

| Channel | Default volume | Purpose |
|---------|----------------|---------|
| **Music** | 60 | Background score, menu themes |
| **SFX** | 80 | Discrete UI feedback cues |
| **Ambient** | 50 | Continuous world layers |
| **Voice/Narrative** | 80 | TTS or voiced content (post-MVP) |

### Pattern-to-channel mapping

| Pattern | Channel | Required? | Trigger | Notes |
|---------|---------|-----------|---------|-------|
| [Decision Panel](#decision-panel) | SFX | Optional | On commit | Subtle "select" cue — opt-in per panel |
| [Event Inbox](#event-inbox) | SFX | Optional | On new message batch (per tick) | Single soft chime — never per-message |
| [Time Advance](#time-advance) | Ambient | Optional | During tick progression | Low-volume ticking; mute respected |
| [Confirmation Modal](#confirmation-modal) | SFX | Optional | On confirm only | No sound on cancel |
| [Toast Notification](#toast-notification) | — | No sound | — | Silent by default at scale |
| [Progress Indicator](#progress-indicator) | — | No sound | — | Silent |
| [Spatial Camera](#spatial-camera) | Ambient | Optional | On zone change | Cross-fade between world layers |
| [Slider](#slider) (volume only) | Per channel | Required | On thumb release | 200ms sample at new volume — see Slider |

**Binding rules**:
- Every audio cue has a visual equivalent in the same screen (per `accessibility-requirements.md` Section 5).
- The global mute toggle silences all channels regardless of individual sliders.
- No pattern introduces a new audio cue without a slot in this table — update both.

**Cross-reference**: `accessibility-requirements.md` Section 5 (Audio Accessibility).

---

## Patterns

### Decision Panel

**Category**: Navigation + Input
**Used In**: (no specs yet — anticipated: dashboard, entreno, finanzas, fichajes, tácticas, staff, ciudad)

**Description**: The primary container for a group of related management decisions. A decision panel always represents one of the management contexts named in the game concept (entreno, fichajes, finanzas, tácticas, staff, ciudad, plus the dashboard overview). Inside, it presents the available actions for that context, the relevant state, and a clear way to commit a decision.

**Specification**:
- A header with the panel name, the manager's current relevant skill level in that area (Pillar 3 surfaces growth), and an optional contextual hint from the staff.
- A body area with the current state (cards, stats, lists) above the action area.
- An action area at the bottom-right (desktop) or full-width (mobile) with the primary commit action. Secondary actions are textual buttons to the left.
- Maximum **7 ± 2 primary actions** visible at once. Above that, group under Section Tabs or progressive disclosure.

**Input mapping**:
- Tab navigates through actions in declared order
- Enter activates the focused action
- Escape returns to the dashboard (does not close the panel destructively — state is preserved)

**Feedback**:
- Visual: focused action shows focus ring at ≥ 3:1 contrast
- Audio: optional subtle "select" sound on commit

**Accessibility**:
- The panel container has `role="region"` and `aria-labelledby` pointing to the header
- The action area is wrapped in `role="group"` with a label
- All actions are real `<button>` elements, never clickable divs

**When to use**: Whenever the player needs to make decisions in one of the defined management contexts.

**When NOT to use**: For one-shot dialogs ("are you sure?") — use [Confirmation Modal](#confirmation-modal). For viewing-only data ("scout report") — use a read-only detail view, not a Decision Panel.

---

### Event Inbox

**Category**: Feedback
**Used In**: (anticipated: persistent across all screens, opened from a top bar icon)

**Description**: The persistent feed of incoming events — staff messages, AI-narrated press, calendar alerts, board notes, mayor calls. The inbox is the primary way the game communicates back to the player. Pillar 2 corollary: when "the world is the scoreboard" but the world is a canvas, the inbox is the scoreboard's text channel.

**Specification**:
- A top-bar button with an unread count badge.
- Clicking opens a side panel listing messages newest-first.
- Each message shows: sender (icon + name), one-line title, time of arrival (in-game date), urgency badge if applicable.
- Clicking a message opens its full content in the same side panel.
- Messages are categorised by sender role: staff, board, press, calendar, mayor (Manager-RPG).
- Read state persists. Unread messages are visually distinct (bolder text + dot) — not by colour alone.

**Input mapping**:
- Keyboard shortcut to open: `I`
- Up/Down arrows navigate messages
- Enter opens the focused message; Backspace returns to the list

**Feedback**:
- Visual: subtle pulse on the inbox icon when a new message arrives (subject to reduced-motion)
- Audio: single soft chime per batch (not per message — batched per tick), respects mute

**Accessibility**:
- New messages announced via `aria-live="polite"` summary ("3 nuevos mensajes del staff") — never message-by-message during fast tick sequences (resolves accessibility AQ2)
- The full content view scrolls within a focus-trapped region until closed with Escape

**When to use**: For all asynchronous communications from the game world to the player.

**When NOT to use**: For information the player just acted on (use [Toast Notification](#toast-notification)). For decisions that need immediate response (use [Confirmation Modal](#confirmation-modal)).

---

### Time Advance

**Category**: Time
**Used In**: (anticipated: dashboard primary, every screen secondary)

**Description**: The control the player uses to advance the in-game clock to the next significant event. The fundamental tempo control. Pillar 4 ("Calm Is The Tempo") makes this the player's choice — never an automatic forward push.

**Specification**:
- A prominent button labelled by the upcoming event ("Avanzar a próximo partido", "Avanzar al fin de semana", "Avanzar 1 día").
- The button text always names the destination event explicitly — never a generic "Skip".
- Clicking opens a brief progress indicator (see [Progress Indicator](#progress-indicator)) while the simulation ticks. The player can interrupt only via explicit Cancel; abandoned ticks roll back cleanly.
- After advancing, the dashboard refreshes with the new state and any inbox messages from the elapsed time.

**Input mapping**:
- Keyboard shortcut: `Space` (re-mappable post-MVP)
- Cancel during advance: Escape

**Feedback**:
- Visual: button morphs into a progress strip during the advance. Reduced-motion: shows percentage text instead of strip animation.
- Audio: low-volume ticking under the strip; mute respected.

**Accessibility**:
- The button always indicates the destination event in plain text — screen readers read "Avanzar al partido contra Real Hospitalet" not "Skip".
- During advance, an `aria-live="assertive"` announces "Avanzando…" once, then "Listo" on completion.

**When to use**: As the canonical time-progression action.

**When NOT to use**: Never auto-advance time without the player's explicit click. The pattern is the player's hand, not the game's.

---

### Confirmation Modal

**Category**: Modal
**Used In**: (anticipated: any destructive or irreversible action across the game)

**Description**: A focused dialog that requires the player to confirm a destructive or irreversible action. Named in `accessibility-requirements.md` Section 3 as binding for: selling/releasing players, firing staff, demolishing buildings, accepting external offers, deleting saves.

**Specification**:
- Overlay dims the background (≥ 50% opacity).
- Modal box centred, max 480px wide, vertically scrollable if content is long.
- Header: action name (e.g., "Vender jugador").
- Body: names the specific entity ("Carlos López"), names the cost in concrete units ("80k€ recibidos · fan_momentum −12 estimado · plantilla queda con 17 jugadores"), and explains the consequence.
- Footer: "Cancel" button (left, default focus) and "Confirm" button (right, destructive styling — never red-only; also marked with text like "Vender" and an explicit icon).

**Input mapping**:
- Focus is trapped inside the modal.
- Tab cycles between Cancel and Confirm; Shift-Tab reverses.
- Enter on focused button activates it. Escape always cancels (regardless of focused element).
- Background clicks **do not** dismiss — only explicit buttons or Escape (prevents accidental confirms).

**Feedback**:
- Visual: confirmed actions briefly show a check + result toast. Cancelled actions return to the previous state silently.
- Audio: subtle chime on confirm, no sound on cancel.

**Accessibility**:
- `role="alertdialog"` with `aria-labelledby` and `aria-describedby` referencing header and body.
- Initial focus on Cancel (safer default).
- After dismissal, focus returns to the element that opened the modal.

**When to use**: For actions that cannot be undone within the session.

**When NOT to use**: For reversible actions (those use a [Toast Notification](#toast-notification) with an "Undo" link if confirmation feels necessary). For decisions central to the loop (selecting tactics, training intensity) — those are committed inline with no modal.

---

### Toast Notification

**Category**: Feedback
**Used In**: (anticipated: any successful action, any non-critical info)

**Description**: Lightweight ephemeral feedback that confirms an action succeeded or surfaces a minor event. Always non-blocking. Distinct from the [Event Inbox](#event-inbox) (persistent) and [Confirmation Modal](#confirmation-modal) (interactive).

**Specification**:
- Anchored to bottom-centre on desktop, **top of viewport on mobile** (avoids conflict with thumb-reach for primary actions — resolves PQ2).
- One line of text, optional icon, optional "Undo" or "View" link.
- Auto-dismisses after **5 seconds** by default (configurable per call, never shorter than 4s).
- Hover or focus pauses the dismissal timer (accessibility — readers need time).
- Maximum 3 toasts stacked at once; older ones fade out as new arrive.

**Input mapping**:
- Tab moves focus into the current toast's action link if present; Escape dismisses focused toast.
- Toasts are non-trapping — keyboard focus does not automatically jump to them.

**Feedback**:
- Visual: subtle slide-in (reduced-motion: cross-fade).
- Audio: no sound by default (would be noisy at scale).

**Accessibility**:
- `aria-live="polite"` region used for non-critical toasts; `aria-live="assertive"` reserved for error toasts that report an unrecoverable failure.
- Action links inside toasts are real `<button>` elements.

**When to use**: For "saved", "fichaje enviado", "presupuesto actualizado", small successes.

**When NOT to use**: For critical events that need persistence — those go to the [Event Inbox](#event-inbox). For dangerous actions — [Confirmation Modal](#confirmation-modal) first, Toast as confirmation after.

---

### Section Tabs

**Category**: Navigation
**Used In**: (anticipated: any panel with > 7 actions or > 1 contextual view)

**Description**: A horizontal row of mutually exclusive tabs that switch the content shown below them. Used when a [Decision Panel](#decision-panel) needs to be subdivided.

**Specification**:
- Tabs are real tabs (`role="tablist"` + `role="tab"` + `role="tabpanel"`).
- Active tab visually distinct via underline + bolder weight (never colour-only).
- On mobile, tabs collapse to a horizontally scrollable strip; the active tab anchors visible.

**Input mapping**:
- Tab moves into the tablist; once inside, Left/Right arrows move between tabs.
- Enter or Space activates the focused tab.
- Tab then moves focus into the active tabpanel.

**Feedback**:
- Visual: instant tab content swap (no slide animation in MVP — keeps things calm).

**Accessibility**:
- Full WAI-ARIA Tabs pattern.
- Each tab has `aria-controls` pointing to its tabpanel.

**When to use**: To split a [Decision Panel](#decision-panel)'s actions into 2-5 contexts (e.g., entreno: "Físico" / "Técnico" / "Mental").

**When NOT to use**: For navigation between top-level screens (use the main nav). For lists of more than 5 items (use a select or a list view).

---

### Entity Card

**Category**: Data Display
**Used In**: (anticipated: plantilla list, staff list, scouting results, building list)

**Description**: A compact, glanceable representation of a single game entity (player, staff member, building, club). Always includes an identifier, a key state indicator, and the most relevant 1-2 stats for the current context.

**Specification**:
- Fixed aspect ratio per entity type (players ~3:4 portrait, staff ~4:3, buildings ~1:1).
- Top: portrait or sprite, name, role/position.
- Middle: 1-3 most-relevant stats for the context (different stats shown in entreno vs in finanzas).
- Bottom: state badges (injured, suspended, available, etc.) — always with icon + text, not colour-only.
- Click anywhere on the card opens its detail (see [Drill-Down List](#drill-down-list)).

**Input mapping**:
- The card is a single focusable element (entire card is the activator).
- Tab moves between cards in reading order.

**Feedback**:
- Hover/focus: subtle elevation (reduced-motion: just border highlight).

**Accessibility**:
- Card is a `<button>` or `<a>` (real interactive element).
- The card's accessible name is the entity name + key state ("Carlos López, delantero, lesionado").

**When to use**: For lists where the player will scan many entities looking for one. For dashboard widgets summarising a single entity.

**When NOT to use**: For tabular comparisons (use a table). For deeply detailed entity views (use a full detail page).

---

### Stat Display

**Category**: Data Display
**Used In**: (anticipated: throughout the game)

**Description**: A numeric value paired with optional trend indicator and non-colour encoding. The base unit of management UI.

**Specification**:
- Label (e.g., "Forma física") + value (e.g., "87/100") + optional trend (↑ ↓ →) + optional contextual descriptor ("Excelente").
- Trends use both arrow icon **and** sign/colour — never colour-only.
- Values are right-aligned in lists for scanability.

**Input mapping**:
- Stat displays are not interactive by default. If they reveal more on click, they become a [Drill-Down List](#drill-down-list) item.

**Feedback**:
- Hover/focus on interactive stats: [Reveal Tooltip](#reveal-tooltip) with brief explanation.

**Accessibility**:
- The full statement is the accessible label: "Forma física: 87 de 100, subiendo".
- Visual icon (arrow) is `aria-hidden` since the trend is in the text label.

**When to use**: For all numeric quantities visible to the player.

**When NOT to use**: For percentages of long bars (use a progress bar with text label). For currencies — use a dedicated money component that handles formatting and localisation.

---

### Drill-Down List

**Category**: Navigation
**Used In**: (anticipated: plantilla, staff, scouting, fixtures, history, archived messages)

**Description**: A vertical list of items where clicking an item opens its detail view. The most common navigation pattern in management UIs.

**Specification**:
- Each row is one item, typically an [Entity Card](#entity-card) or a row of [Stat Displays](#stat-display).
- Optional sort/filter header above the list.
- Selected row stays highlighted while its detail is shown alongside (desktop) or replaces it (mobile).

**Input mapping**:
- Tab moves into the list; once inside, Up/Down arrows move between rows.
- Enter opens the focused row's detail.
- Escape closes the detail and returns focus to the row.

**Feedback**:
- Visual: focused row outlined; selected row backgrounded.
- Loading detail: see [Progress Indicator](#progress-indicator).

**Accessibility**:
- The list has `role="listbox"` if it represents single-select choices, or `role="list"` if it's a browsable list.
- Each row has an accessible name combining its entity name and key state.

**When to use**: As the primary navigation within a context (e.g., "plantilla" panel opens a list of players; clicking one opens the player detail).

**When NOT to use**: For navigation between top-level contexts (use main nav). For 1-3 items (use cards instead).

---

### Spatial Camera

**Category**: Navigation (Canvas)
**Used In**: (anticipated: any isometric world view)

**Description**: How the player moves the camera through the isometric world. The world is **not** the primary navigation surface — the DOM is — but the camera is the player's window onto the canvas-rendered state of their city and club.

**Specification**:
- Drag to pan (mouse) or one-finger drag (touch).
- Pinch to zoom (touch) or scroll wheel to zoom (mouse).
- "Centre on entity" action available from any [Entity Card](#entity-card) or DOM detail — clicking an entity in the DOM centres the camera on its world location.
- Camera bounds clamped to the playable world; no infinite scroll.
- Zoom limited to a defined range (TBD by the isometric world GDD) to keep sprites legible.

**Input mapping**:
- Arrow keys pan the camera when the canvas has focus.
- Plus/Minus keys zoom.
- Tab leaves the canvas back into the DOM nav.

**Feedback**:
- Visual: smooth camera tweens (reduced-motion: jump-cut to the destination).
- Audio: ambient world layers cross-fade as zones change (mute respected).

**Accessibility**:
- The canvas has a label ("Mundo isométrico del club"). When the player triggers a "centre on entity" action, an `aria-live="polite"` confirms in the DOM ("Vista centrada en el estadio").
- All world-relevant information is duplicated in DOM panels — the player **never** has to look at the canvas to make a decision.

**When to use**: As the dedicated canvas-interaction pattern.

**When NOT to use**: As the primary information surface. As a path the player must traverse to reach a decision (DOM is always faster).

---

### Calendar Strip

**Category**: Time
**Used In**: (anticipated: dashboard, fixtures, season planning)

**Description**: A horizontal strip showing the upcoming days/weeks with anchored events. The player's visual anchor for "what's next" — supports the **anticipated event** retention hook from the game concept.

**Specification**:
- Horizontal scroll, showing ~7 days (mobile) or ~14 days (desktop) by default.
- Today is highlighted; upcoming events appear as labelled markers anchored to their day.
- Event types use distinct icons (and labels on hover/focus) — match, transfer deadline, board meeting, mayor call, AI narrative event.
- Clicking a marker shows event details and the option to "Avanzar hasta aquí" (uses [Time Advance](#time-advance)).
- Past events roll off into a "Reciente" collapsible section that the player can expand without leaving the strip (resolves PQ5).

**Input mapping**:
- Tab moves into the strip; Left/Right arrows move between events.
- Enter opens the focused event.

**Feedback**:
- Visual: focused event scales slightly; reduced-motion: just outlined.

**Accessibility**:
- Each marker is a `<button>` with an accessible name combining event type and date: "Partido contra Real Hospitalet, domingo 12 de octubre".

**When to use**: For all forward-looking time visualisation.

**When NOT to use**: For full historical records (use a [Drill-Down List](#drill-down-list) of past events).

---

### Reveal Tooltip

**Category**: Feedback
**Used In**: (anticipated: anywhere supplementary explanation helps)

**Description**: A floating, non-essential explanation that appears on hover or focus. **Pillar 1 ("Tinkering Beats Optimization") constrains this pattern**: tooltips never expose hidden cascade relationships. They explain UI conventions and named concepts, not the underlying simulation graph.

**Specification**:
- Appears 200-500ms after hover or focus.
- One paragraph max, no images, no interactive content inside.
- Auto-positions to avoid screen edges.
- Dismisses on mouse-out, blur, or Escape.
- On touch: long-press to reveal (with explicit visual affordance); tap on the same trigger when no long-press is registered just activates the underlying action. PQ3 flagged for real-user validation.

**Input mapping**:
- Hover or keyboard focus on the trigger reveals.
- Escape dismisses; focus stays on the trigger.

**Feedback**:
- Visual: fade-in (reduced-motion: instant).

**Accessibility**:
- The tooltip's content is referenced by `aria-describedby` from the trigger — screen readers read it as part of the trigger's description.
- **Critical info must never live in a tooltip alone** — if it's important enough to need explaining, it goes in the visible UI text.

**When to use**: To explain a named concept ("¿qué es fan_momentum?") or a UI convention.

**When NOT to use**: To reveal cascade outcomes (violates Pillar 1). For required-to-act information (must be visible). For long content (use a panel or modal).

---

### Progress Indicator

**Category**: Feedback
**Used In**: (anticipated: time advance, match simulation, AI generation, save/load)

**Description**: Communicates that a long-running operation is in flight and approximately how far along it is.

**Specification**:
- Two variants:
  - **Determinate**: shows percentage or step count when known (save/load, batch tick).
  - **Indeterminate**: shows continuous motion when not known (AI generation, match simulation with unpredictable duration).
- Always paired with a text label naming the operation ("Simulando partido…", "Generando informe…").
- For operations expected to take > 3s, show an explicit "Cancelar" button when cancellable.

**Input mapping**:
- Cancel button is focusable and activatable via Enter or Escape.

**Feedback**:
- Visual: bar fill (determinate) or strip motion (indeterminate). Reduced-motion: dots cycling slowly or step text only.
- Audio: silent by default.

**Accessibility**:
- Determinate: `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.
- Indeterminate: `role="progressbar"` without value attributes.
- The label is associated via `aria-labelledby`.

**When to use**: For any operation > 500ms that blocks the related UI.

**When NOT to use**: For operations under 200ms (no indicator — feels jittery). For background syncs the player doesn't need to know about.

---

### Empty State

**Category**: Feedback
**Used In**: (anticipated: any list, panel, or screen that may be empty)

**Description**: What a list, panel, or screen shows when there is no data to display. Often the first thing a player sees on a new save (a club in ruins has no scouts, no fans yet).

**Specification**:
- A short headline ("Aún no tienes ojeadores").
- One-line explanation ("Contrata ojeadores para recibir informes de jugadores fuera del club.").
- A primary action button that resolves the empty state ("Contratar ojeador") when one exists.
- Optional small illustration — must satisfy the art-bible colour rules from `accessibility-requirements.md` Section 2.

**Input mapping**:
- The primary action is the default focus.
- Tab progresses normally.

**Feedback**:
- No special feedback.

**Accessibility**:
- The empty state region has `role="status"` if it dynamically replaces previously-loaded content.

**When to use**: For every list, panel, or table that may legitimately be empty in normal gameplay.

**When NOT to use**: When the empty state implies an error — that is an error state, not empty (use an explicit error pattern, TBD as a future pattern).

---

### Button

**Category**: Input
**Used In**: (anticipated: ubiquitous — every [Decision Panel](#decision-panel), [Confirmation Modal](#confirmation-modal), [Toast Notification](#toast-notification), and [Form Field](#form-field) uses Button as its commit primitive)

**Description**: The foundational interactive element for committing an action. Every clickable affordance in Cascada FC's DOM is a real `<button>` element (or `<a>` if it navigates to a new route). Buttons come in five variants distinguished by purpose and visual hierarchy — never by colour alone.

**Specification**:

| Variant | Use case | Visual encoding |
|---------|----------|-----------------|
| **Primary** | The dominant action in the current context ("Confirmar", "Avanzar al partido"). | Filled background, bold weight, larger size. Maximum one per context. |
| **Secondary** | Alternative actions of equal weight ("Cancelar", "Volver"). | Outlined, regular weight. |
| **Tertiary / Text** | Low-emphasis actions ("Ver detalle", "Más opciones"). | Text-only with underline on focus/hover. |
| **Destructive** | Irreversible actions ("Vender", "Despedir"). | Outlined + warning icon + warning text colour at ≥ 4.5:1 — never colour-only. Always opens a [Confirmation Modal](#confirmation-modal) before committing. |
| **Icon-only** | Compact actions in dense UI (close, expand, settings cog). | Square; requires `aria-label`. |

- **Size buckets**: small (32px height, secondary actions in dense lists), default (40px, primary), large (48px, mobile primary CTAs).
- **Hit target**: minimum 24×24 CSS px (WCAG 2.2 AA voluntary); recommended 40×40 desktop / 44×44 mobile (per `accessibility-requirements.md` Sec 4 & 6).
- **Disabled state**: 50% opacity, cursor `not-allowed`, `aria-disabled="true"` (so the button remains focusable and can announce its disabled reason). The reason must be discoverable — either via [Reveal Tooltip](#reveal-tooltip) on focus or an adjacent hint.
- **Loading state**: button replaces its label with an indeterminate [Progress Indicator](#progress-indicator) and disables interaction; `aria-busy="true"`.

**Input mapping**:
- Tab focuses, Enter or Space activates.
- Double-activation prevented during loading state.

**Feedback**:
- Visual: focus ring at ≥ 3:1; press state at `motion-quick` (100ms); loading transition at `motion-short` (200ms). See [Animation Standards](#animation-standards).
- Audio: only when the parent pattern declares one (see [Sound Standards](#sound-standards)). No default sound.

**Accessibility**:
- Real `<button>` element, never a clickable `<div>`.
- Accessible name must contain the visible label (WCAG 2.5.3 — Label in Name).
- Disabled state announced via `aria-disabled`; reason text linked via `aria-describedby`.
- Icon-only buttons require `aria-label` matching the conceptual action ("Cerrar", "Ajustes").

**When to use**: For every action commit in DOM — confirming, cancelling, navigating, toggling reveals.

**When NOT to use**: For navigation to a new route (use `<a>` styled like a button so the semantic stays correct). For persistent on/off state (use [Toggle](#toggle)). For continuous value selection (use [Slider](#slider)).

---

### Toggle

**Category**: Input
**Used In**: (anticipated: settings — reduce motion, global mute, AI narrative on/off; in-game — auto-renew contracts, automatic training)

**Description**: A binary on/off control with persistent state. Distinct from [Button](#button) (which fires an action) — a toggle *expresses a state* the player can flip. Used wherever the player sets a preference the game respects until changed.

**Specification**:
- Underlying control: `<input type="checkbox" role="switch">` styled as a track + thumb.
- Off state: thumb on the left, track in muted background. On state: thumb on the right, track in active foreground.
- The thumb position is the canonical state indicator — colour change alone is never sufficient (per `accessibility-requirements.md` Sec 2).
- An adjacent label is mandatory and clickable (clicking the label toggles the state).
- Optional hint text below ("Reduce las animaciones del DOM y el mundo isométrico.").
- Dimensions: track 44×24 desktop, 56×32 mobile — both meet the 44px touch target including label.

**Input mapping**:
- Tab focuses, Space toggles state (native checkbox behaviour).
- Clicking the visual switch OR its label toggles state.

**Feedback**:
- Visual: thumb slide at `motion-short` (200ms `ease-out`); reduced-motion: cross-fade 100ms. See [Animation Standards](#animation-standards).
- Audio: none by default.

**Accessibility**:
- `role="switch"` exposed via the underlying input, with `aria-checked="true|false"` updating natively.
- Real `<label for="…">`; never `aria-label` alone when a visible label exists.
- State change announced naturally by screen readers.

**When to use**: For player preferences with persistent on/off state — settings, accessibility options, auto-behaviours.

**When NOT to use**: For triggering an immediate one-shot action (use [Button](#button)). For selecting among 3+ options (use [Section Tabs](#section-tabs) or a select). For granular numeric values (use [Slider](#slider)).

---

### Slider

**Category**: Input
**Used In**: (anticipated: settings — four independent volume sliders per channel Music/SFX/Ambient/Voice per `accessibility-requirements.md` Section 5; post-MVP — UI density, font scale)

**Description**: A continuous or stepped input for selecting a numeric value within a defined range. Primary use in Cascada FC is volume control; other usages emerge in settings only. Sliders are never used for game decisions — those use [Form Field](#form-field) with explicit number input or [Decision Panel](#decision-panel) buttons.

**Specification**:
- Underlying control: `<input type="range">` styled with custom track and thumb.
- Always paired with: a visible label above the slider, a numeric value display to the right (e.g., "Música · 60"), and tick marks if the range is discrete (volume 0-100 in steps of 5).
- Range, step, default value, and unit are declared explicitly per instance.
- Track height ≥ 8px; thumb diameter ≥ 24px desktop and ≥ 44px mobile (touch target compliance).
- Thumb position is the canonical state indicator; the filled portion of the track is supplementary, never the only encoding.

**Input mapping**:
- Tab focuses, Left/Right arrows decrement/increment by step.
- Home/End jump to min/max.
- Page Up / Page Down move by 10×step.
- Touch: drag the thumb; tap the track to jump.

**Feedback**:
- Visual: focus ring at ≥ 3:1; value display updates live during keyboard adjustment. No animation on drag (instant).
- Audio: for **volume sliders specifically**, the channel being adjusted plays a 200ms sample tone at the new volume on thumb release — helps calibration without applying the change live during drag. Other slider types: silent. See [Sound Standards](#sound-standards).

**Accessibility**:
- Native `<input type="range">` provides `role="slider"` + `aria-valuenow` / `aria-valuemin` / `aria-valuemax` automatically.
- Label associated via `<label for="…">`.
- The numeric value display has `aria-live="polite"` so screen readers announce the value during keyboard adjustment without flooding during drag.
- Unit included in `aria-valuetext` when the visual unit (e.g., "%", "/100") is not part of the raw number.

**When to use**: For continuous or stepped numeric input where the range is known and the player benefits from visual position feedback (volume, density, scale).

**When NOT to use**: For exact numeric entry (use [Form Field](#form-field) with `<input type="number">`). For binary on/off (use [Toggle](#toggle)). For ordered choice among named options (use [Section Tabs](#section-tabs) or a select).

---

### Form Field

**Category**: Input
**Used In**: (anticipated: signup/login, settings, club creation, save management)

**Description**: A labelled input for text, numbers, or single-selection. Cascada FC is not a form-heavy game — most decisions are committed via buttons in [Decision Panels](#decision-panel) — but settings, creation flows, and save management need real inputs.

**Specification**:
- Label above the input, always visible (no placeholder-as-label).
- Optional hint text below the input.
- Error state inline below the input, with both text and an icon.
- Required fields marked with both text ("Obligatorio") and visual marker.

**Input mapping**:
- Standard browser keyboard behaviour for inputs.
- Tab to commit and move to next; Enter submits the form when on the last field.

**Feedback**:
- Visual: focus ring at ≥ 3:1.
- Validation: on blur for individual fields; on submit for the whole form.

**Accessibility**:
- Real `<label for="…">` linking, never `aria-label` alone.
- Errors associated via `aria-describedby` and announced via `aria-live="polite"`.

**When to use**: For settings, account flows, and any time the player must provide arbitrary text or numbers.

**When NOT to use**: For game decisions (use [Decision Panel](#decision-panel) buttons).

---

## Gaps & Patterns Needed

These patterns will likely emerge as UX specs are authored. Document them here as hints for the next `/ux-design` session:

- **Match View**: how the player watches a match unfold (text commentary? tactical view? canvas animation?) — needs its own pattern category.
- **Cascade Discovery Note**: when a player uncovers a new cascade, how is it surfaced? (Inbox event? Dedicated journal screen? Pop-up?) — connects to Pillar 1.
- **Staff Recommendation**: how the staff's contextual recommendations are shown — distinct from the Event Inbox? Embedded in Decision Panels?
- **City Tier Transition**: the visual celebration when the world crosses a tier threshold — needs its own pattern, probably canvas-heavy with a DOM mirror.
- **Mayor Call (RPG)**: the AI-narrated call from another club's mayor — could be a special modal or a special inbox entry. Decide when authoring the Manager-RPG screens.
- **Tutorial Hint**: how guided onboarding is shown without blocking play — needs constraints (no blocking overlays per Pillar 4 / accessibility).
- **History/Timeline View**: how past seasons, past clubs, past events are browsed — distinct from Calendar Strip.
- **Error State**: explicit pattern for unrecoverable failures (network down, save corrupt) — currently merged with Empty State guidance, deserves its own entry.

---

## Open Questions

- **PQ1** — How tight is the coupling between Decision Panel and the canvas? Does opening a panel auto-pan the camera to the relevant world location, or is that opt-in via a "Ver en el mundo" link?
- **PQ2** — *(Resolved 2026-05-16)* — Toast Notification on mobile anchors to the top, not bottom, to avoid thumb-reach conflict.
- **PQ3** — Reveal Tooltip on touch: tap-to-reveal vs long-press? Pattern currently specifies long-press; needs validation with real users.
- **PQ4** — Event Inbox: should AI-generated long-form events have a different reading experience (e.g., paginated, "toca para continuar") from short staff messages?
- **PQ5** — *(Resolved 2026-05-16)* — Past events roll into a collapsible "Reciente" section within the Calendar Strip.
- **PQ6** — Pattern entries above use placeholder "Used In" lists. Update each as `/ux-design [screen]` sessions produce real specs.
