# Playtest 2026-05-21 — Fresh-Player Agent-Walkthrough (NOT a human playtest)

> **⚠️ This is an agent-walkthrough, NOT a human playtest.** Per the precedent set by the slice's Day 12 (`prototypes/cascada-vertical-slice-mes1/playtest-notes-day12.md`), an agent walking through the UI flow in-character produces a structured prediction of what a fresh player WOULD experience, plus pre-emptive flags of obvious UX issues. It is an approximation — the real human playtest per `production/playtests/protocols/fresh-player.md` is still required for the Production → Polish gate.

## Session Metadata

| Field | Value |
|---|---|
| **Date** | 2026-05-21 |
| **Playtester** | Claude (Opus 4.7) — agent-walkthrough mode |
| **Profile** | Fresh-player simulation against production main branch UI flow |
| **Build** | Sprint 8 closed state (commit `753db77`) |
| **Method** | Code-trace silent walkthrough against the 5 success metrics in `production/playtests/protocols/fresh-player.md` |

## Hypothesis Under Test (verbatim from protocol)

> A player who has never seen Cascada FC can sign up, create a club, and reach
> a meaningful first decision within 5 minutes without dev guidance. They
> should articulate the central fantasy of "discover-cascades + grow-as-manager"
> unprompted by minute 15.

## Walkthrough — UI Flow Step-by-Step

### T+0:00 — Landing → /signup

User arrives. Sees the simple `Create Account` card with Email + Username + Password fields. No tutorial.

**Prediction**: ~30s to fill the form. No confusion.

### T+0:30 — Post-signup → / (root)

After form submit, server redirects to `/` (per `signup/+page.server.ts:35`).

**Prediction**: User lands on root. Need to check what's there.

### T+0:45 — Root → click "Crear mi primera carrera"

Dashboard (`/dashboard`) renders the welcome hero (`+page.svelte:214-226`):

> "¡Bienvenido a Total Soccer Manager!"
> "Todavía no has comenzado una partida. Crea tu primera carrera para tomar
>  las riendas de un club modesto y construir tu legado."

There's ONE primary CTA: "Crear mi primera carrera" → /game.

**Prediction**: No ambiguity. ~10s to click.

### T+0:55 — /game → fill 3 fields + submit

Form has: `managerName`, `clubName`, `city`, primary/secondary colors (color pickers default to brand defaults).

**Prediction**: ~60s to fill. The "Color principal (camiseta)" label might cause a brief pause (what does this affect?) but the defaults make it skippable.

### T+1:55 — Post-form-submit → /dashboard

User lands on the populated dashboard. They see:

- Topbar: club name link, "Hoy" date, "Semana 0", "Balance 250 €K", inbox icon, username, "Salir".
- Sidebar nav: Dashboard, Plantilla, Staff, Finanzas, Liga, Calendario, Mánager.
- Hero card: club name + week 0 + position display.
- "Esperando primer tick del simulador para mostrar nodos cascada." (no cascade cards yet — they need 1 advance to populate).
- Big "▶ Avanzar semana" button.

**Prediction**: User has ~3 options that aren't obviously useless:
1. Click "Avanzar semana" (CTA primary).
2. Wander sidebar to explore.
3. Wonder where to start.

The dashboard is fairly clean but does NOT pre-frame "what does avanzar do" or "what's a cascade node". The waiting message "Esperando primer tick del simulador" is dev language that may confuse a player who doesn't know what a "tick" or "simulador" is.

🟡 **Friction point #1**: "primer tick del simulador" is dev jargon visible to fresh players.

### T+2:30 — Click "Avanzar semana"

Modal animation (`AdvanceTransition` component) plays a ~7-day visual. Then the page refreshes with `?advanced=1`. The cascade-node cards (fan_momentum, team_fitness, squad_available_pct) now populate.

**Prediction**: ~45s. The transition animation gives the player a sense of "something happened" but doesn't explain WHAT.

### T+3:15 — Post-advance dashboard

Now the user sees:
- The 3 cascade-node cards (each with a number + bar + color tier).
- Staff messages feed (likely 0-3 messages from the seeded staff observers).
- Maybe a STOP event in the calendar badge (sponsors? auction?).
- "Avanzar semana" button now disabled if a STOP is pending.

**Prediction**: User reads the cards. "Fan momentum 60. Team fitness 70. Squad available 90."
The numbers exist; the meaning doesn't. The player has to either:
- Click each card for more info (does that work?)
- Hover for tooltips
- Read the sidebar
- Just advance again

🟡 **Friction point #2**: cascade-node cards don't auto-explain what the numbers mean or how player decisions affect them. The slice's Day 13 hint copy was tactical-level only.

## Success Metrics Evaluation

### Metric 1: Time-to-first-meaningful-decision < 5 minutes

**Prediction: ✅ PROBABLE PASS** (~3:15 to first advance).

The "first advance" is the player's first meaningful decision (committing to a tick). The signup-to-advance path is short and unambiguous.

### Metric 2: Time-to-fantasy-articulation < 20 minutes

**Prediction: 🟡 AT RISK** (highly playtester-dependent).

For the cascade-discovery fantasy ("ah, my decisions cascade"), the player needs to:
1. Notice that cascade-node values CHANGE after advance.
2. Attribute the change to something they did or didn't do.

The dashboard shows the deltas WITHIN the transition animation (per the `generateHeadlines` derived data — fan_momentum delta, fitness delta, etc.). This DOES point at causality. BUT the player needs to make ≥2 advances + read the headlines deliberately.

For the manager-RPG fantasy ("I'm growing as a manager"), the player needs to see manager XP increase or reach a level-up event. With default seeded state (reputation L1, all skills L1), the first level-up takes ~4-6 in-game weeks at minimum. Possibly within 20 min real-time IF the player advances 4+ times.

**Risk**: a player who doesn't read the transition headlines carefully might NOT articulate the fantasy explicitly within 20 min. The UI shows numbers; it doesn't tell stories.

### Metric 3: No confusion loops > 3 minutes

**Prediction: 🟡 RISKY** in 2 specific places:

1. **First post-advance dashboard view**: the player sees a cascade-node card with "fan_momentum 60" and may stare at it without action. No tutorial overlay. If they don't click "Avanzar semana" again within 3 min, that's a confusion loop.

2. **First STOP event modal** (sponsor offer is the most likely): the modal asks for a decision. The player may not have context for "kit slot vs boards vs press room" vs "accept vs decline". The slice fixed P-01 (slider tick marks) but the equivalent for sponsor cards may not have similar guidance.

### Metric 4: Positive feedback on cascade-discovery fantasy

**Prediction: ✅ PROBABLE if player advances 3+ weeks**.

The transition headlines reveal cause-effect ("Tu equipo pierde forma física por el partido"). After 3 advances the player has 3 headline reels of cause-effect storytelling.

🟡 **Risk**: if the first 3 advances don't include a match (which depends on the seeded schedule), the headlines may feel too quiet to register as "discovery". Need to verify that match week happens by W2 or W3 of the seeded schedule.

### Metric 5: PROCEED verdict

**Prediction: ✅ PROBABLE PROCEED with documented friction**.

The core loop works (Pablo's slice playtest confirmed this). The friction points are POLISH-grade not FUN-grade:
- Dev jargon ("simulador", "tick") visible.
- No tutorial overlay or hint copy explaining cascade nodes.
- STOP event modals (sponsor) need richer context.

These don't invalidate the fantasy; they cap the discovery rate.

## Pre-Emptive Action Items (for the eventual human playtest)

| Friction | Severity | Recommendation | Sprint |
|---|---|---|---|
| "Esperando primer tick del simulador" copy is dev-jargon | S3 polish | Rephrase to "Aún no has jugado tu primera semana. Pulsa 'Avanzar semana' para ver tu primer reporte." | Sprint 9 polish |
| Cascade-node cards don't self-explain | S2 onboarding | Add per-node tooltip with "Mide [X]. Lo afectan [Y]." after first advance | Sprint 9 hud-ui polish |
| Sponsor STOP modal needs richer context | S2 onboarding | Add "Tu primer patrocinador" callout when this fires for the first time | Sprint 9 onboarding pass |
| No "what to do next" prompt after first advance | S3 polish | After advance #1, surface a NOTIFY message "Bien hecho. Ahora puedes seguir o explorar tu plantilla en /squad" | Sprint 9 hud-ui polish |

## Verdict

**Prediction: PROCEED** — the loop is sound and the friction is well-defined and polishable.

**Confidence**: **MEDIUM** — agent-walkthrough cannot capture the subjective "feels good" / "feels confusing" signal a human gives. The real test is `production/playtests/protocols/fresh-player.md` with an actual playtester.

**Recommendation**: Pablo runs the human protocol when convenient. The above friction list pre-emptively covers the most likely findings.

## Limitations of this Agent-Walkthrough

- Cannot evaluate "feels good" subjective signal.
- Cannot detect novel friction points that depend on the playtester's specific mental model.
- Cannot validate that the cascade-discovery fantasy actually REGISTERS emotionally vs just being readable.
- Does NOT count toward the Production → Polish gate's 3-playtest requirement (that requires HUMAN sessions).

This doc exists to:
1. Validate the protocol's success metrics are measurable against the real UI.
2. Give Pablo a pre-emptive friction list to address before recruiting a playtester.
3. Document the agent's read of the current UX state for posterity.
