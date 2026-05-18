---
status: draft
type: silent-walkthrough
date: 2026-05-18
mode: code-trace (no live human playtest)
limitations: "Walkthrough conducted by tracing the user journey through code. Real human playtest by Pablo deferred to Day 14."
---

# Day 12 — Silent Walkthrough Notes

> **What this is**: an honest enumeration of friction points discovered by
> tracing the slice end-to-end from a cold start. This is the agent's best
> approximation of what a human playtester would notice in the first
> playthrough. The verdict is *not* a substitute for a real playtest with
> Pablo on Day 14, but it surfaces issues that should be fixed before that
> playtest to avoid wasting his time on known problems.

---

## Cold-start journey

Imagined first-time user. No prior context. Has `npm run db:up` running.

### 1. Run the dev stack

```
npm run db:setup     # seed
npm run dev:api      # Hono on :3010
cd src/web && npm run dev  # SvelteKit on :5180
```

**Friction**:
- ❗ **No single command starts everything**. User must remember 3 terminals.
  Production fix: a `dev:all` script using concurrently or pm2.
- ❗ **db:setup needs to be re-run between attempts**. No `db:reset` shortcut.
  This is moderate friction during testing.

### 2. Open http://localhost:5180

User sees the dashboard at **week 1**, before any decision.

**What works**:
- The status header shows `S 1 · — · Fan 35` — gives an immediate read.
- The 4 metric panels (Semana / Forma / Afición / Asistencia) telegraph state.
- Fan_momentum=35 displays as ⚠ warn color, signaling "afición desencantada".
- 2 sliders + 1 button are immediately actionable.

**Friction**:
- ❗ **No onboarding context**. The slice drops you into "you're the manager of
  Real Pueblo CF" with zero narrative setup. A naive player won't know who they
  are, what division, what stakes. Production fix: 30-second intro modal or
  pre-game cinematic.
- ⚠ **The two sliders default to 50**. Naive instinct: leave them at 50 the
  first week. But the cascade engine is calibrated such that 80 (high training)
  triggers C4 negative delta — the *counterintuitive* discovery. If the player
  always leaves sliders at 50, they never trigger discovery. Production fix:
  small staff hint on first load ("Intenta jugar con la intensidad — los
  preparadores tienen opiniones").
- ⚠ **No tooltip explains what each slider does**. The names "Intensidad de
  entrenamiento" and "Precio de entradas" are clear but their range scale
  (0-100) isn't intuitive vs concrete €/intensity levels.

### 3. Click "Avanzar semana"

The advance loop runs (server-side):
1. All 10 fixtures simulated
2. Real Pueblo plays CD Cinta (CR2 baseline)
3. WorldStateDeltas applied
4. Cascade tick
5. XP gain + staff messages persisted
6. Snapshot saved
7. currentWeek → 2

UI reads the response and renders the "Semana 1 cerrada" panel with:
- Match score
- Threshold count if any
- Level-up notice if applicable

**Friction**:
- ❗ **No "what just happened" narrative**. The result panel shows the score
  but not WHY. Did we play well? Was the loss expected? Was there an injury?
  Production fix: lead with a 1-line summary from the head coach.
- ❗ **No visual indication that the cascades fired**. The player sees fan/fit
  numbers change but doesn't know WHICH cascade caused it. Staff messages help
  but are on a different tab. Production fix: inline "Why this happened" link
  from each metric change.
- ⚠ **Score is shown but not the events**. Did we lose 0-1 to a 90' goal or to
  three 1st-half mistakes? Player wants to know. Workaround: go to /match for
  live playback. But that's a separate flow.

### 4. Browse the tabs

User explores Calendar, Squad, Staff, Finance, Manager.

**Calendar**:
- Shows the 4-week window. Real Pueblo's fixtures highlighted.
- ❗ **Calendar events (festival, derby announce) NOT visible here**. They go
  to staff messages only. This is a regression vs scope: "calendar event
  announced by staff" should appear on the calendar page itself.

**Squad**:
- Shows the league table. Real Pueblo highlighted.
- ✅ Works as expected. No friction.

**Staff inbox**:
- Shows messages grouped by week.
- ✅ Tier-1 narrative tone reads OK. "Los chicos llegan tocados" feels human.
- ⚠ **No filter by priority**. A player with 10 messages can't easily find
  the BLOCKING one.
- ⚠ **causalNodeId badge is helpful for debugging but probably should not be
  user-visible** in production. Slice quality OK.

**Finance**:
- Computes ticket revenue + costs locally. Shows a balance proxy.
- ❗ **This data is computed CLIENT-SIDE from snapshot fields, not from the
  server's actual financial model**. Production must move this to economy.md's
  authoritative computation. Slice acceptable as proxy.

**Manager**:
- Shows level, XP bar, skill pips, career events.
- ✅ Visually clean.
- ❗ **Can't actually click to allocate a skill point**. The pendingSkillPoints
  is just shown as a number. Production fix: clickable allocation UI on the
  skill row.

### 5. Repeat for weeks 2-4

User does 3 more cycles. By week 2, the player likely sees fan_momentum cross
20 (BLOCKING threshold) — the slice's most dramatic moment.

**Friction**:
- ❗ **BLOCKING threshold doesn't BLOCK anything in the slice**. The advance
  call goes through. A real "board meeting forced" interrupt is in the GDD
  (event-system.md) but not wired into the slice's advance loop. Production
  fix: BLOCKING crossings should pause advance and require an event response.
- ⚠ **Loop feels samey across weeks**. Each week is the same 2 sliders + 1
  button. The interactive match (Match 3 derby) breaks the monotony — but
  the slice's /match page doesn't get linked from the dashboard until a player
  thinks to look at /match directly. Production fix: prompt "Hay partido esta
  semana — ¿jugarlo en directo?" on the dashboard during match weeks.

### 6. End of week 4

The dashboard shows the result. There's no obvious "month closed!"
celebration. Player has to navigate to `/end-of-month` manually.

**Friction**:
- ❗ **The end-of-month route is NOT linked from anywhere in the UI**. A new
  player won't find it. Production fix: redirect to /end-of-month when
  advance returns currentWeek > 4, OR add a visible link.

---

## Top friction items (ranked)

If the budget were 5 fixes, I'd do these:

1. **Onboarding context** — 30s intro: "Eres el nuevo manager de Real Pueblo CF,
   un club humilde en Segunda. Cuatro semanas para empezar a dar señales.
   Empieza decidiendo cómo entrenar y cuánto cobrar."
2. **End-of-month auto-route** — When advance() returns currentWeek > 4, the
   dashboard should auto-navigate to /end-of-month or surface a big call-to-action.
3. **Match-week dashboard prompt** — On match weeks, show a big "🎮 Jugar el
   partido en directo" button on the dashboard.
4. **Calendar events visible in /calendar** — The festival + derby + líder
   notices should appear on the calendar page (not just staff inbox).
5. **Skill-point allocation UI** — Make pending points clickable from /manager
   to spend on tactics or finance.

Lower priority but worth noting:
- 6. **Why-this-happened links** — From a metric change to the cascade that caused it.
- 7. **dev:all script** — One terminal for the full stack.
- 8. **db:reset shortcut** — One command to nuke and re-seed.
- 9. **BLOCKING threshold interrupt** — At least a confirmation modal.
- 10. **First-load nudge** — Hint that sliders aren't decoration.

---

## What worked well (don't break these)

- ✅ The 2-slider decision loop is **frictionless**. One screen, two values,
  one button. The slice nailed the "Calm Is The Tempo" pillar — no urgency,
  no FOMO, no over-design.
- ✅ The staff messages, even tier-1, **feel human**. "Recibimos llamadas. La
  afición está empezando a marcar distancia." reads like real club-life
  observation, not stat readout.
- ✅ The asymmetric C6 + cumulative C15 produces a **legible negative trajectory**
  when the player makes naive decisions. The cascades teach.
- ✅ The interactive match pause-and-sub mechanic **works mechanically** —
  ADR-013 Option B determinism holds, decision arrives via Hono, resume
  completes cleanly.
- ✅ The league table + manager XP bar + staff inbox **feel like a real
  Football-Manager-clásico UI** at a fraction of the visual cost. Vindicates
  the DOM-only MVP scope decision.

---

## Verdict (tentative — needs Day 14 human playtest)

**PROCEED**, with the 5 top friction items addressed in Day 13. The core
discovery — that the cascade engine + staff messages + manager-RPG is
intrinsically satisfying without canvas/AI — appears to hold up. The slice
plays in ~10 minutes (well under the 45-60min target for a full polished
month), and the loop is mechanically complete.

The blockers to a clean PROCEED verdict from a human playtester:
- Onboarding clarity
- End-of-month routing
- Match-week dashboard prompt

If those three are fixed in Day 13, Day 14's playtest should produce a
real PROCEED with the same caveats already known (no real auth, no full
season, no PixiJS, no AI narrative) — those are scope items, not slice failures.
