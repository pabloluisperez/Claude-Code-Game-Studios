# Accessibility Requirements — Cascada FC

> **Status**: In Design (sections 1-7 drafted 2026-05-16)
> **Author**: [user + ux-designer]
> **Last Updated**: 2026-05-16
> **Template**: Accessibility Requirements

This document defines the accessibility tier and binding requirements for all UX work in Cascada FC. Every `/ux-design` spec for a screen must satisfy these requirements before it can pass `/ux-review`. Every story must include an accessibility verification step before `/story-done` accepts it.

---

## 1. Accessibility Tier & Standard

**Adopted standard**: **WCAG 2.1 Level AA**

**Scope split**:
- **DOM (SvelteKit management UI)** — strict WCAG 2.1 AA compliance. Audited via axe-core in CI + manual review per screen.
- **Canvas (PixiJS isometric world)** — best-effort. Information visible only in the canvas (e.g., a sprite changing colour) must be duplicated in adjacent DOM (a status row, an inbox message, a tooltip text). The canvas itself is not audited as WCAG-compliant — it is treated as a visual enhancement, not the primary information surface.

**Rationale**: WCAG 2.1 AA is the industry standard for web applications and aligns with the project's web-first stack. Strict canvas compliance would require duplicating the entire game state into accessible DOM trees — not feasible for MVP. The "best-effort + DOM mirror" approach ensures no critical decision-making information is locked inside the canvas.

**The Pillar 2 corollary**: *"The World Is The Scoreboard"* says progress renders in the isometric world. Accessibility says **the world is a duplicate scoreboard, not the only one**. Every state visible in the world must also be readable in the DOM — the world is the celebration of progress, not the only place it can be observed.

---

## 2. Visual Accessibility

### Contrast (binding)

- **Body text and labels**: contrast ratio ≥ **4.5:1** against background
- **Large text** (≥ 18px or ≥ 14px bold): ≥ **3:1**
- **Interactive UI components and meaningful icons**: ≥ **3:1**
- **Focus indicator**: ≥ **3:1** against the focused element's background

Contrast applies to all DOM-rendered text and UI. For canvas, sprite text overlays must also meet these ratios; world ambience (lighting, weather) may dip below for atmosphere but never on information sprites.

### Color as information (binding)

Information must **never** be conveyed by colour alone. Every coloured state requires a second channel:
- A shape, icon, or text label
- A pattern (stripes, dots, fill style)
- A position or grouping change

Examples for Cascada FC:
- **fan_momentum tiers**: not just colour — also icon (sad → neutral → happy) and numeric/text descriptor
- **City growth tiers**: not just palette shift — also tier name visible in DOM (e.g., "Pueblo derruido" / "Pueblo activo" / "Ciudad próspera")
- **Match result**: not just green/red — also W/D/L letter and explicit score

### Colorblind support

- **MVP**: no dedicated colorblind mode. Instead, the art bible and the design tokens are constrained: any colour pair used to encode state must be distinguishable under simulated deuteranopia and protanopia (carried into `/art-bible` review checklist).
- **Post-MVP (backlog)**: dedicated colorblind palette swap as a settings toggle.

### Reduced motion (binding)

- **Default behaviour**: respect `prefers-reduced-motion: reduce` from the OS. When set, all DOM animations longer than 200ms are reduced to a 100ms cross-fade or instant change.
- **Manual override**: a "Reduce motion" toggle in settings that overrides the OS preference (both directions).
- **Canvas implications**: the isometric world's ambient animations (people walking, day/night cycle, weather) are paused or slowed to 25% speed when reduced motion is active. The world itself does not freeze — it just stops attracting attention.

### Text scaling (binding)

- Browser zoom (Ctrl/Cmd +/-) must work up to **200%** without horizontal scrolling on layouts ≥ 1024px wide.
- Mobile PWA layout must remain functional up to **150%** font scaling at 375px width.
- No fixed pixel font sizes for body copy — use `rem` units throughout. Headings may use `clamp()` for fluid scaling.
- Minimum readable font size: **14px** at default zoom. Labels and metadata may go to **12px** only if non-essential.

---

## 3. Motor & Cognitive Accessibility

### Time pressure (already by design)

Pillar 4 ("Calm Is The Tempo") removes time pressure as a gameplay feature. This carries directly into accessibility:
- No real-time countdowns that punish absence
- No actions that auto-execute after N seconds without user input
- No actions that lock the player out if not completed in time
- Save state is preserved across sessions — leaving the tab open or closing it never loses progress

### Cognitive load

The game concept flags **DR2** ("3 parallel progression curves may saturate the UI") as a real risk. Accessibility framing:
- **Progressive disclosure**: a player early in the game sees fewer decision categories. New categories unlock as the manager's skills and staff grow (Pillar 3 — "You Grow Like Your Club").
- **No more than 7 ± 2 primary actions visible at once** on any decision panel. Above that, group under tabs or progressive disclosure.
- **Each decision must be reversible or pre-confirmed**. Irreversible decisions (selling a player, firing a staff member) require a Confirmation Modal that names the consequence in concrete units (see `interaction-patterns.md`).
- **Onboarding length**: ~2 in-game weeks of guided tutorial integrated into the world (already in `game-concept.md`). No tutorial overlays blocking the canvas.

### Destructive actions (binding)

Any action that cannot be undone within the same session requires a **Confirmation Modal**:
- Selling/releasing a player
- Firing staff
- Demolishing a building (post-MVP)
- Accepting an external club offer
- Deleting a save

The modal must:
- Name the specific entity affected ("Vender a Carlos López al Real Hospitalet por 80k€?")
- Show the cost in concrete units (money, fan_momentum impact estimate, reputation)
- Have keyboard-accessible "Confirm" and "Cancel" buttons
- Default focus on "Cancel" (safer)

### Input timeouts (binding)

- No action requires fast input. Holding, double-tapping, or rapid sequences are never required.
- Hover-to-reveal patterns must have a keyboard equivalent (focus reveals same content).

---

## 4. Input & Navigation Accessibility

### Keyboard navigation (binding)

- **Every interactive DOM element** must be reachable via Tab in a logical reading order (top-to-bottom, left-to-right per zone).
- **No keyboard traps**: from any focusable element, Tab must eventually loop back to the start of the page. Modal dialogs trap focus inside the modal but Escape must always close them.
- **Focus indicator**: visible at 3:1 contrast minimum. The default browser outline is acceptable as a baseline; custom focus rings must meet the same contrast.
- **Skip link**: "Skip to main content" link as the first focusable element on every route. A second "Skip canvas" skip link appears when focus enters a canvas region.

### Canvas input

- The isometric world is **not** keyboard-navigable for selection in MVP — interaction with the world happens via the DOM (clicking an entry in a list opens its detail and centres the camera).
- The camera itself can be panned with arrow keys when the canvas has focus, but this is optional convenience, not a path to information.

### Gamepad

- **MVP**: no gamepad support. Documented and accepted.
- **Post-MVP**: revisit if MMO or console port lands on the roadmap.

### Mouse / pointer

- All clickable targets in DOM are ≥ **24×24 CSS pixels** (WCAG 2.2 AA Target Size minimum, adopted voluntarily). Recommended **40×40** for primary actions and **44×44** on mobile.
- No hover-only interactions. Hover may reveal supplementary info, but the same info must be available via click, focus, or in a permanent state.

---

## 5. Audio Accessibility

### Audio independence (binding)

- **No information communicated by audio alone**. Every audio cue (match goal, staff alert, AI narrative event) has a corresponding visual element (toast, badge, inbox entry).
- The game is fully playable with audio muted.

### Volume and channels

- Independent volume sliders for: **Music**, **SFX**, **Ambient (world)**, **Voice/Narrative** (post-MVP if voiced). Each goes from 0 to 100, persisted in settings.
- A global mute toggle.

### Captions / subtitles

- All narrative AI output is **text-first** (llama.cpp generates text, not audio in MVP) — captions are intrinsic.
- Post-MVP: if any TTS or voiced content is added, captions are mandatory and on by default.

### Critical audio cue list (for redundancy audit)

Every cue in this list must be cross-referenced with its visual equivalent in each affected screen's UX spec:
- Match events (goal, card, substitution)
- Staff alerts (incoming message, urgent priority)
- Calendar events (match starting, transfer window closing, board meeting)
- AI narrative announcement (long-form story event)

---

## 6. Mobile PWA Accessibility

### Touch targets (binding)

- **Minimum**: 44×44 CSS pixels for any primary action (Apple HIG, Google Material baseline).
- **Spacing**: at least 8px between adjacent touch targets to prevent mis-taps.
- This may force lower information density on mobile — acceptable trade-off. Mobile is positioned as a "snack" experience (10-20min, one in-game week) per `game-concept.md`.

### Orientation

- Portrait + landscape both supported. The isometric world reflows; the management UI stacks vertically in portrait.
- No layout requires a specific orientation.

### Zoom

- Browser pinch-zoom **must not** be disabled (no `maximum-scale=1` in viewport meta).
- Application zoom (PixiJS camera zoom) is independent and uses dedicated controls.

### Responsive baseline

- Minimum width: **375px** (iPhone SE class).
- Below 375px, the app may show a "Rotate or use a larger screen" message rather than break.

### Mobile-specific concerns

- Haptic feedback (Vibration API) is **optional** — never the only feedback for an action.
- Mobile interactions cannot require gestures more complex than tap and swipe. Long-press is acceptable only with a tap alternative.

---

## 7. Testing & Compliance Criteria

### Automated (CI gates)

- **axe-core** runs on every PR via Playwright. Zero serious or critical violations on DOM routes.
- **Lighthouse Accessibility score** ≥ 90 on main routes (login, dashboard, match view, manager profile).
- **Design tokens contrast lint**: a custom script checks every documented foreground/background pair in the design system against WCAG ratios.

### Manual (per-spec gate)

Each `/ux-review` of a screen must verify:
- [ ] Every interactive element reachable by Tab in a logical order
- [ ] Focus indicator visible and ≥ 3:1 contrast
- [ ] Escape closes modals and dropdowns
- [ ] No information conveyed by colour alone
- [ ] Empty, loading, and error states have accessible text
- [ ] Touch targets ≥ 44px on mobile breakpoint
- [ ] Reduced motion respected for any animation > 200ms
- [ ] Screen reader walkthrough (NVDA on Windows or VoiceOver on macOS) reaches all decision-relevant content

### Manual (per-release gate)

Before any public release:
- [ ] Full screen reader pass of the critical path: signup → login → dashboard → first match → next-day session
- [ ] Keyboard-only pass of the same critical path (mouse physically unplugged)
- [ ] Colorblind simulator check (deuteranopia + protanopia) on all coloured-state screens
- [ ] 200% zoom check on desktop main routes
- [ ] Tested with a real mobile device, not only emulator

### What we do NOT test

- Full canvas screen-reader integration (out of scope by tier decision)
- Voice control (post-MVP if ever)
- Switch device input (post-MVP if ever)
- High contrast mode swap (post-MVP; covered by eventual colorblind palette work)

---

## Open Questions

- **AQ1** — Spanish-language screen reader voice testing: should we standardise on NVDA + a specific voice for QA reproducibility, or accept the user's installed voice?
- **AQ2** — llama.cpp narrative events: should AI output be announced via `aria-live="polite"` automatically when it lands in the inbox, or only when the user opens the message? Polite-live could be overwhelming during fast event sequences.
- **AQ3** — Mobile PWA: does WCAG AA imply landscape orientation must reach the same compliance level as portrait, or can we accept landscape as the primary tested orientation? (Likely answer: same level, both audited.)
- **AQ4** — Player journey map (`design/player-journey.md`) does not yet exist. Some accessibility decisions (e.g., emotional state on arrival) are made without that context. Re-validate this document after the player journey is authored.
- **AQ5** — `art-bible` does not yet exist. The constraint that art must be color-safe (Section 2) needs to be carried into the art-bible specification — flag for the `/art-bible` skill author.
