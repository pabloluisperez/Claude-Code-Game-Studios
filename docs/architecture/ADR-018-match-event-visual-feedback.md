# ADR-018: Match Event Visual Feedback Library

## Status
Accepted

## Date
2026-05-19 (Proposed → Accepted same day — formalizes the visual feedback +
pacing patterns validated during Pablo's live playtest 2026-05-18; resolves
OQ-HUD-11 (pixel-art match event animations), OQ-HUD-12 (dramatic event
pacing rules), and OQ-HUD-13 (live match playback timing + fast-forward) from
`hud-ui.md`).

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Web stack — SvelteKit 2 + Svelte 5 (runes) + Socket.IO 4 (server-pushed match feed) + CSS animations + optional `<img>`-embedded pixel-art sprites + (optional, v1.1+ ready) Lottie JSON |
| **Domain** | Presentation / Frontend |
| **Knowledge Risk** | MEDIUM — Svelte 5 runes (already covered by ADR-017); Socket.IO 4 patterns (verified by slice's BullMQ + planned migration); CSS `backdrop-filter` + keyframe animations are stable but their behavior with stacking contexts has gotchas (verified by slice — confetti needs z-index above backdrop). |
| **References Consulted** | `design/gdd/hud-ui.md` OQ-HUD-11 + OQ-HUD-12 + OQ-HUD-13 (post-slice 2026-05-18), vertical slice `prototypes/cascada-vertical-slice-mes1/src/web/src/routes/match/+page.svelte`, ADR-012 (UI architecture — DOM-only for MVP), ADR-013 (interactive match contract), ADR-017 (UI input control taxonomy — modal options use EventChoiceButtons), `design/art/art-bible.md` (Lived-In Pixel anchor — pixel-art delivery format) |
| **Post-Cutoff APIs Used** | Svelte 5 runes; Socket.IO 4 server-pushed events (planned, replaces slice's client-side animation timing) |
| **Verification Required** | Pace: 1 in-game minute = 1 real second by default; toggle to ×3 / ×10. Modal: confetti renders crisp ABOVE backdrop (no blur applied to confetti layer). Skip: clicking "Continuar" mid-modal advances to next event immediately; ESC also skips. Sprite-in-DOM: pixel-art sprite animations play smoothly at 16ms per frame budget. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-001 (Web stack — Socket.IO chosen), ADR-012 (DOM-only MVP — sprites are DOM `<img>`, NOT canvas), ADR-013 (interactive match contract — modals fire on `MatchPauseEvent` types), ADR-017 (UI input control taxonomy — EventChoiceButtons + countdown components) |
| **Enables** | `hud-ui` epic stories — partial unblock (alongside ADR-017); fully unblocks the `/match` interactive route and the end-of-month resolution sequence |
| **Blocks** | `hud-ui` epic implementation until Accepted |
| **Ordering Note** | Companion to ADR-017. Should be Accepted within the same review wave. Independent of ADR-014/015/016 in terms of dependency direction, but the event payloads it renders come from ADR-015. |

## Context

### Problem Statement

The slice's live match (`prototypes/.../routes/match/+page.svelte`) shipped
with a flat tick-by-tick event feed at 100ms/tick (full match in ~9 seconds).
Pablo's playtest identified three problems:

1. **OQ-HUD-13 (Playback Timing)**: 100ms/tick is too fast to feel like a
   match — Pilar 4 (Calm Is The Tempo) is violated. Production needs
   **1 second = 1 in-game minute** (90s per match), with **×1/×3/×10 speed
   toggle** + **skip-to-end** that dispatches remaining ticks server-side.
2. **OQ-HUD-12 (Dramatic Event Pacing)**: when something important happens
   (goal, injury, expulsion), the UI should:
   - Show a **teaser banner** ("⚡ ¡Algo está pasando!") for ~900ms BEFORE
     the reveal — builds tension without revealing the outcome.
   - Show the modal for **10 seconds** with a **visible countdown** and a
     **"Continuar →" skip button** + **"✕" close button**.
   - **Confetti for own-team goals** rendered above the backdrop (the slice
     bug had backdrop-filter blur dimming the confetti — fix: confetti
     z-index above backdrop; backdrop is just a flat dim layer).
3. **OQ-HUD-11 (Visual Feedback)**: events deserve **pixel-art animations**
   inside `<img>` tags — NOT a PixiJS canvas. Specifically:
   - Goal → animation of a ball hitting a net
   - Injury → animation of a stretcher carrying a player
   - Expulsion → animation of a sliding tackle + red card

This ADR is the architectural contract that the rest of the live-match UI
sprint builds against.

### Constraints

- ADR-012 keeps MVP DOM-only — NO PixiJS canvas. Sprite animations are
  delivered as either:
  - Animated GIF / WebP / APNG inside `<img>`
  - CSS keyframe animations driving sprite sheets
  - Lottie JSON via lottie-web (allowed but optional — slice did not use)
- Server-authoritative state (technical-preferences.md): the SERVER decides
  when each match event happens. The CLIENT animates the timing. The slice's
  client-side animation is acceptable as a starting reference but
  production must eventually stream events from the server via Socket.IO so
  multiple clients (future MMO) can watch the same match in sync.
- Modal pacing must respect Pilar 4 — the player should never feel rushed.
  10 seconds for a goal modal is the default; the player can extend by
  refusing to dismiss, or compress via the skip button.
- Accessibility: prefers-reduced-motion media query disables animations and
  shortens dramatic event holds to 2s (instead of 10s default).

### Requirements

The match feedback library must provide:

1. **Live match playback timing**: default 1s = 1 in-game minute (90s per
   match); speed toggle (×1/×3/×10) persisted in localStorage; skip-to-end
   server-dispatched.
2. **Dramatic event modal**: teaser → modal → optional VAR theater → close,
   with countdown + skip button.
3. **Pixel-art sprite library**: sprites organized in `apps/web/static/sprites/match/`
   (or equivalent) with a naming convention; each event type has at least
   one sprite.
4. **Confetti layer**: above backdrop (z-index 110); rendered for own-team
   goals only.
5. **Socket.IO match feed**: server pushes events with their real in-match
   minute; client animates timing relative to local playback speed.
6. **Reduced-motion compatibility**: respects `prefers-reduced-motion`.

## Decision

**Three concerns, three components, one Socket.IO namespace.**

### 1. Match Playback Timing

- **Default**: `1 in-game minute = 1 real second`. Full 90-tick match = 90s.
- **Speed toggle**: HUD shows a `×1 / ×3 / ×10 / ⏭ Saltar al final` quad
  toggle.
- **Persistence**: selected speed stored in `localStorage` under key
  `cascada.match.playbackSpeed` so it persists across matches in a session.
- **Skip-to-end**: client emits `match:skip-to-end` to the server; server
  fast-completes the remaining ticks and emits the final `match:full-time`
  event with the final score + final WorldStateDeltas. The match's pause-
  window logic (ADR-013) is honored — if a pause window is pending, skip is
  disabled.
- **Implementation**: client maintains a `nextEventDeadlineMs` derived from
  `(serverTickMinute - currentDisplayedMinute) * speedMultiplier * 1000`.
  A `setTimeout` chain (or `requestAnimationFrame` loop) advances the
  displayed minute and unveils events as their `event.minute <= displayedMinute`.

### 2. Dramatic Event Modal Pacing

```
EVENT FLOW (when server emits 'match:goal', 'match:injury', 'match:red-card', etc.)
────────────────────────────────────────────────────────────────────────────

t=0           Server pushes event (e.g. goal at minute 67')
              Client checks if event is "dramatic" (goal | major-injury | red-card | var-review)
              IF dramatic:
                ↓
t=0           Show TEASER banner for 900ms:
              "⚡ ¡Algo está pasando!" / "👀 Atento al área..." / "🔥 Se calienta el partido"
              (random pick from a small pool — slice had 7+4)
                ↓
t=900ms       TEASER fades; MODAL opens with full reveal:
              - Pixel-art sprite playing (goal → ball-hits-net animation, ~1.5s)
              - Score updated (if goal)
              - Player name (if individual event)
              - Confetti FOR OWN-TEAM GOAL ONLY
                ↓
t=900ms       MODAL countdown begins at 10s (default; reduced-motion: 2s)
              "Continuar → (Ns)" button visible
              ✕ button visible top-right
                ↓
t=2400ms-10900ms   Modal holds (countdown decrements; player can skip)
                ↓
t=10900ms     Modal auto-closes IF VAR roll NOT triggered
              (VAR theater is optional — 30% chance per goal per ADR-013 R6 spec)
              IF VAR triggered:
                ↓
t=10900ms     Modal switches to "VAR REVISANDO" state
              Pixel-art "VAR check" animation (2200ms)
                ↓
t=13100ms     VAR result reveals: "GOL CONFIRMADO" (90%) or "VAR ANULA" (10%)
              Hold 2500ms more
                ↓
t=15600ms     Modal closes, playback resumes
```

**Skip controls**:
- "Continuar →" button: skips countdown → modal closes immediately
- "✕" button: same effect
- ESC key: same effect
- The teaser (900ms) is non-skippable — too short to bother

**Backdrop**: the modal backdrop is a flat dim layer at `z-index: 100`,
**NO `backdrop-filter: blur`** (slice bug — verified to obscure confetti).
Confetti container sits at `z-index: 110` (above backdrop, below modal-text).
Modal text card sits at `z-index: 120`.

### 3. Pixel-Art Sprite Library

#### Asset organization

```
apps/web/static/sprites/match/
├── goal/
│   ├── goal-default.gif           (8-12 frames, ~96×96, ~1.5s loop)
│   ├── goal-volley.gif            (variant: hit at first touch)
│   └── goal-header.gif            (variant: header from corner)
├── injury/
│   ├── injury-stretcher.gif       (player on stretcher carried off)
│   └── injury-down.gif            (minor: player on ground briefly)
├── card/
│   ├── card-yellow.gif            (ref shows yellow card)
│   ├── card-red.gif               (ref shows red card)
│   └── card-second-yellow.gif     (variant: 2nd yellow → red)
├── expulsion/
│   └── expulsion-tackle.gif       (sliding tackle followed by red card show)
├── var/
│   ├── var-checking.gif           (loop: VAR monitor animation)
│   ├── var-confirmed.gif          (one-shot: ✅ overlay)
│   └── var-overturned.gif         (one-shot: ❌ overlay)
└── ambient/
    ├── ball-bounce.gif            (between events, idle ball)
    └── crowd-cheer.gif            (between events, when momentum favorable)
```

**Format**: GIF (or APNG for higher quality) embedded in `<img>` tags. Each
sprite is bounded at ~96×96 to ~128×128 pixels and ~1-3s loops. No PixiJS,
no canvas, no WebGL. Per ADR-012 — DOM-only.

**Naming convention**: `[category]-[variant].gif`. Variants are picked
deterministically by the server event's payload (e.g., `goal_volley` event
type → `goal-volley.gif`).

**Lottie option (deferred to v1.1+ or post-art-bible decision)**: if pixel-
art doesn't scale well, switch to Lottie JSON via `lottie-web`. The
`<MatchEventSprite>` component abstracts the playback so swapping is local.

#### Sprite delivery component

```svelte
<!-- apps/web/src/lib/match/MatchEventSprite.svelte -->
<script lang="ts">
  interface Props {
    eventType: 'goal' | 'injury' | 'card-yellow' | 'card-red' | 'expulsion' | 'var-checking' | 'var-confirmed' | 'var-overturned';
    variant?: string;       // e.g. 'header', 'volley'
    onComplete?: () => void;  // for one-shot animations
  }
  let { eventType, variant, onComplete }: Props = $props();
  const path = variant ? `/sprites/match/${eventType}/${eventType}-${variant}.gif` : `/sprites/match/${eventType}/${eventType}-default.gif`;
  // ... animation playback logic ...
</script>

<img src={path} alt={`${eventType} animation`} class="match-event-sprite" />

<style>
  .match-event-sprite {
    width: 96px;
    height: 96px;
    image-rendering: pixelated;  /* preserves crispness of pixel art */
    image-rendering: -moz-crisp-edges;
  }
</style>
```

### 4. Confetti Layer

```svelte
<!-- apps/web/src/lib/match/Confetti.svelte -->
<script lang="ts">
  interface Props { active: boolean; pieceCount?: number; }
  let { active, pieceCount = 60 }: Props = $props();
  // ... generate emoji confetti with random drift, duration, delay ...
</script>

{#if active}
  <div class="confetti-container" aria-hidden="true">
    {#each confettiPieces as p}
      <span class="confetti-piece" style="left: {p.left}%; animation-delay: {p.delay}s; animation-duration: {p.duration}s; --drift: {p.drift}px;">
        {p.emoji}
      </span>
    {/each}
  </div>
{/if}

<style>
  .confetti-container { position: fixed; inset: 0; z-index: 110; pointer-events: none; }
  .confetti-piece { /* CSS animation falling + drifting */ }
  @media (prefers-reduced-motion: reduce) {
    .confetti-piece { animation: none; opacity: 0; }
  }
</style>
```

Confetti is `z-index: 110` — ABOVE the modal backdrop (`z-index: 100`) and
BELOW the modal text card (`z-index: 120`). This stacking is the slice's
verified fix.

### 5. Socket.IO Match Feed

The slice's `/match` page uses client-side animation timing because the
match was server-precomputed and the events arrived as a single array.
**Production target**: server pushes events as they occur during simulation
(per ADR-013's stateful match flow), so the client and server are
synchronised.

Socket.IO namespace: `/match` with rooms `match:{sessionId}`. Server emits:

```typescript
// Server → client
'match:event': {
  sessionId: string;
  minute: number;
  type: 'goal' | 'injury' | 'card_yellow' | 'card_red' | 'expulsion' | 'half_time' | 'full_time' | 'var_review' | ...;
  variant?: string;     // for sprite picking
  team: 'home' | 'away';
  player?: { id: string; name: string; position: 'GK'|'DEF'|'MID'|'FWD' };
  score?: { home: number; away: number };
  payload?: EventDecisionPayload;  // for events requiring a player decision (per ADR-015)
}

'match:tick': { sessionId: string; minute: number; }  // sent every ~5 in-game minutes for clock sync

'match:full-time': { sessionId: string; score: { home: number; away: number }; outcome: MatchOutcome; }

// Client → server
'match:subscribe': { sessionId: string; }   // join room
'match:skip-to-end': { sessionId: string; } // trigger fast-completion
'match:decide': { sessionId: string; payload: EventDecisionPayload; choiceId: string; }  // ADR-013 + ADR-015
```

The slice's `/match` route already has the page structure; production
re-implements the timing logic using Socket.IO subscription instead of
client-side `setTimeout` chains.

### 6. Reduced-Motion Compatibility

```css
@media (prefers-reduced-motion: reduce) {
  .match-event-sprite { /* still render image, animation stops */ }
  .confetti-piece { animation: none; opacity: 0; }
  .modal-backdrop { animation: none; }
}
```

Plus modal countdown defaults shorten:
- Default: 10s for goal, 5s for injury
- Reduced-motion: 2s for both

## Alternatives Considered

### Alternative A: PixiJS canvas for match events (full v1.1+ visual)

- **Description**: Render match events on a PixiJS canvas with full isometric
  player sprites running, ball bouncing, etc.
- **Pros**: Visually impressive; aligns with Lived-In Pixel anchor.
- **Cons**: Violates ADR-012 (MVP DOM-only); requires Pillar B work that
  scope-mvp.md deferred to v1.1+.
- **Rejection**: This is exactly the v1.1+ vision. Documenting the path
  forward but NOT building it in MVP.

### Alternative B: Lottie animations exclusively (no GIF)

- **Description**: Use Lottie JSON for all match event animations.
- **Pros**: Scalable; smaller file sizes for complex animations; designer-
  friendly via After Effects export.
- **Cons**: Adds `lottie-web` dependency (~30KB minified); slice did not
  exercise this; designer tooling unfamiliar.
- **Rejection**: Pixel-art GIF / APNG is the simpler default for Lived-In
  Pixel aesthetic. Lottie remains an option but not the primary. The
  `<MatchEventSprite>` component abstracts the playback — production can
  swap to Lottie via prop without rewriting consumers.

### Alternative C: Pure CSS keyframes (no images)

- **Description**: All match event animations are CSS-only (transforms on
  divs).
- **Pros**: Zero image assets; performant.
- **Cons**: Hard to deliver pixel-art aesthetic with pure CSS. Designers
  cannot iterate without code changes.
- **Rejection**: Pixel-art is the art bible's Lived-In Pixel anchor;
  emulating it in pure CSS misses the point.

## Consequences

### Positive

- Match playback respects Pilar 4 (Calm Is The Tempo) by default
- Players control pace via the speed toggle without compromising the
  authoritative server simulation
- Dramatic events feel like events (teaser → reveal → countdown) — Pilar 1's
  "the moment the cascade lands" gets the spotlight
- Pixel-art sprites deliver Lived-In Pixel within DOM constraints
- The Socket.IO pattern future-proofs for MMO match-watching (multiple
  clients in sync)
- Confetti stacking fix is documented for future modals

### Negative

- Asset pipeline: someone has to author the pixel-art GIFs (deferred — slice
  used emoji only). MVP backlog item, not a slice failure.
- Socket.IO server-pushed events add a new failure mode (lost connection
  during a match) — must handle reconnection per realtime-multiplayer
  specialist guidance.

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Pixel-art assets not ready in time for MVP launch | HIGH | LOW (UX still functional with emoji fallback per slice) | Slice's emoji fallback (⚽ 🎉 🟢 etc.) is the production fallback if a sprite is missing. The `<MatchEventSprite>` component degrades gracefully via the `?` operator. |
| Socket.IO connection drop mid-match | MEDIUM | MEDIUM | On reconnect, client requests `match:resync` and server replays missed events from snapshot. Inherits robustness from ADR-013's session lock. |
| Player abuses skip-to-end to never watch a match | LOW | LOW | Acceptable; same fan can let the cascade engine run "match-only" mode in the future. UX respects player agency. |
| Confetti renders behind modal in some browsers | LOW | LOW | Test against Chrome/Safari/Firefox; z-index stacking is well-supported. Slice verified the fix. |

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| hud-ui.md OQ-HUD-11 | Pixel-art animations for match events | `<MatchEventSprite>` component + asset organisation under `apps/web/static/sprites/match/` |
| hud-ui.md OQ-HUD-12 | Dramatic event pacing (teaser + 10s countdown + skip + no blur) | Modal flow spec above; confetti at z-index 110 above backdrop at 100 |
| hud-ui.md OQ-HUD-13 | Playback timing 1s = 1 minute + ×1/×3/×10 + skip-to-end | Default tick rate spec; localStorage persistence; Socket.IO `match:skip-to-end` event |
| ADR-013 | Interactive match pause windows | Modal flow respects `MatchPauseEvent` types; pause window disables skip-to-end |
| ADR-015 | Special event payloads | Modal renders `EventDecisionPayload.options` via `<EventChoiceButtons>` (per ADR-017) |
| ADR-012 | DOM-only MVP | All sprites delivered as `<img>` tags; NO PixiJS in MVP |
| game-concept.md Pilar 4 (Calm Is The Tempo) | Playback should not rush the player | 1s/minute default; skip is player-initiated, not automatic |
| design/art/art-bible.md "Lived-In Pixel" anchor | Pixel-art aesthetic | GIF / APNG sprites with `image-rendering: pixelated` |
| Accessibility (WCAG 2.1 AA) | Reduced-motion compatibility | `@media (prefers-reduced-motion: reduce)` in all animation rules |

## Performance Implications

- **CPU**: GIF playback is browser-native — negligible CPU per sprite. ~5
  simultaneous sprites max at any moment. <1% CPU.
- **Memory**: Each sprite ~50-200KB GIF. ~10 sprites loaded means ~1-2MB
  memory. Acceptable.
- **Network**: Sprites are static assets — cached on first load. ~2MB total
  for full sprite library on initial download; gzip helps minimally for GIF.
- **Socket.IO bandwidth**: ~10 events per match × ~300 bytes each = ~3KB
  per match. Trivial.
- **Frame budget**: All animations are CSS / GIF — independent of JS frame
  loop. No impact on the 16ms frame budget for PixiJS scenes (v1.1+).

## Related Decisions

- [ADR-001](ADR-001-web-stack.md) — Socket.IO chosen for realtime
- [ADR-012](ADR-012-ui-architecture-dom-canvas-frontier.md) — DOM-only MVP; sprites are DOM `<img>`, not canvas
- [ADR-013](ADR-013-match-session-stateful-pattern.md) — Match session FSM + pause windows; this ADR specifies UI rendering rules for those pauses
- [ADR-015](ADR-015-special-event-decision-schema.md) — `EventDecisionPayload` is the payload rendered in modals
- [ADR-017](ADR-017-ui-input-control-taxonomy.md) — `<EventChoiceButtons>` + button group + countdown timer; this ADR builds the modal envelope around them
- `design/art/art-bible.md` — "Lived-In Pixel" anchor; sprite aesthetic
- `design/gdd/hud-ui.md` — OQ-HUD-11/12/13 resolved by this ADR
- `prototypes/cascada-vertical-slice-mes1/src/web/src/routes/match/+page.svelte` — slice reference implementation
