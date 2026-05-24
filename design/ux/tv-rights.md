# UX Spec: TV Rights

> **Status**: In Design (initial draft 2026-05-20)
> **Author**: ux-designer (autonomous run) + Pablo review pending
> **Last Updated**: 2026-05-20
> **Source GDD**: `design/gdd/tv-rights.md` (Approved R7 2026-05-20)
> **Governing ADRs**: ADR-012 (DOM-only MVP), ADR-017 (input control taxonomy), ADR-019 (TV Rights implementation contract)
> **Resolves**: GDD UI Requirements section
> **Template**: UX Spec

---

## 1. Purpose and Player Goals

The TV Rights surface lives inside `/finance` (a sub-tab or accordion section). It surfaces
**a once-per-season decision** (the `tv_auction` STOP event) and a **passive contract panel**
that informs the player what they signed and how much it pays each week. The single job is to
make the player feel **the maturing relationship with the broadcasting world** described in
the GDD Player Fantasy.

### Player-task hierarchy

1. **Read** — at a glance, see the active contract: tier (canal local / regional / nacional),
   weekly rate, year-of-contract for multi-year, weeks remaining in current season.
2. **Decide** — on a `tv_auction` STOP event: choose tier + duration, OR reject all.
3. **Decide** — on a `tv_midseason_offer` STOP event: accept the discounted replacement,
   OR reject it and accept the loyalty bump.
4. **Understand risk** — read ⚠️ indicators on multi-year options that carry corruption
   exposure risk (NACIONAL 3yr with `corruption>0`; REGIONAL 2yr with `corruption≥22`).

The screen never blocks the player except via the STOP event modal. Reading the contract
panel is passive. The decision points are explicit and unambiguous.

### Pillar alignment

| Pillar | How this surface serves it |
|---|---|
| **P1 — Tinkering Beats Optimization** | Each offer surfaces its trade-off line: tier-vs-rate-vs-corruption. The ⚠️ flag on dangerous multi-year options telegraphs the cliff. Rejection is presented as a real option, not a hidden out — with its fan_loyalty consequence shown. |
| **P3 — You Grow Like Your Club** | T1 shows a single LOCAL offer (the modest first sobre). Subsequent seasons surface 2–3 tiers as the manager builds reputation or rises divisions. The arc is visible: "qué canales llaman este año" is the signal of growth. |
| **P4 — Calm Is The Tempo** | No countdown. STOP events block `/advance` until resolved, but inside the modal there is no urgency. Multi-year contracts have a "Sin oferta este año" placeholder explaining quietly why no sobre arrived. |

---

## 2. Player Context on Arrival

**At `/finance/tv` (contract panel, passive)**: The player arrived because they navigated to
the Finance tab. They want to know: *do I have a TV contract, what does it pay, when does
it expire?* They do not need to make a decision here unless an unresolved STOP event is
pending — which the dashboard's "Próximos eventos" surface flagged.

**At `tv_auction` modal (season-start)**: The player arrived via the Inbox / Calendar STOP
event link. `advance()` is blocked. The player must either pick an offer or reject all. The
defaultOption (LOCAL 1yr) applies if the player times out — but in MVP there is no timeout
beyond the player's own pacing.

**At `tv_midseason_offer` modal (mid-season, post-cancellation)**: The player's previous
contract was just cancelled by scandal. They arrived urgent — *what just happened, what
can I do now?* The modal must surface the cancellation reason briefly, then present the
70% replacement offer or the rejection option (with its fan_loyalty boost).

---

## 3. Navigation Position

```
/finance  (Finanzas — top-level nav)
  ├── Resumen (default)
  ├── Patrocinadores
  ├── TV Rights  ← this screen (passive contract panel + history)
  └── Riesgo financiero

Inbox / Calendar
  └── tv_auction STOP event (season-start)        → modal overlay
  └── tv_midseason_offer STOP event (conditional) → modal overlay
```

The TV Rights tab is always reachable via `/finance` navigation. The STOP event modals
are presented on top of whatever screen the player is on when they click the event link
(typically Dashboard or Inbox).

---

## 4. Entry and Exit Points

### Entry

| Entry Source | Trigger | Player carries this context |
|---|---|---|
| Finance tab click | User selects "TV Rights" sub-tab | Wants to read contract state |
| Inbox click on `tv_auction` | STOP event link | Knows they have a season-start decision |
| Inbox click on `tv_midseason_offer` | STOP event link | Knows their previous contract was cancelled |
| Advance attempt while STOP event pending | `POST /api/game/advance` returns HTTP 409 with `event_type='tv_auction'` | Forced into the resolution modal |

### Exit

| Exit Action | Resulting state |
|---|---|
| Sign offer (in modal) | Contract ACTIVE; event resolved; modal closes; revenue starts this tick |
| Reject all (in modal) | Contract NONE (auction) or CANCELLED stays (midseason); fan_loyalty += 10; modal closes |
| Close panel (passive view) | Return to previous screen |
| Navigate away from modal during decision | Modal stays open if STOP event is pending (cannot be dismissed without resolving) |

---

## 5. Information Architecture — Contract Panel

The passive panel renders one of these three states:

### State A — Active contract

```
┌────────────────────────────────────────────────────────┐
│  Derechos de televisión                                │
│  ──────────────────────────                            │
│  Canal Regional · Año 2 de 2                           │
│  1.84 €K/sem · 12 semanas restantes esta temporada     │
│                                                        │
│  Próximo evento: subasta nueva en Sem 38               │
└────────────────────────────────────────────────────────┘
```

Fields:
- **Tier label**: "Canal Local" / "Canal Regional" / "Canal Nacional" (domain language,
  never the enum string).
- **Year of contract**: "Año N de M" (only if `duration_seasons > 1`). For 1-year contracts,
  show only the weekly rate line.
- **Weekly rate**: formatted as `1.84 €K/sem` (always 2 decimals; format helper from
  `apps/web/src/lib/format.ts`).
- **Weeks remaining**: `38 - currentWeek` for the current season.
- **Next event**: a brief preview line indicating when the next decision will arrive
  ("subasta nueva en Sem 38" or "este año no hay sobre" for mid-multi-year seasons).

### State B — No contract this season

```
┌────────────────────────────────────────────────────────┐
│  Derechos de televisión                                │
│  ──────────────────────────                            │
│  Sin contrato TV esta temporada                        │
│  El club opera sin ingresos por televisión.            │
│                                                        │
│  Próximo evento: subasta nueva en Sem 38               │
└────────────────────────────────────────────────────────┘
```

### State C — Cancelled mid-season (between cancellation and season_end reset)

```
┌────────────────────────────────────────────────────────┐
│  Derechos de televisión                                │
│  ──────────────────────────                            │
│  Contrato cancelado por escándalo (Sem 22)             │
│  Sin ingresos hasta fin de temporada.                  │
│                                                        │
│  [Sin oferta de reemplazo — la cancelación fue tardía] │
└────────────────────────────────────────────────────────┘
```

If a `tv_midseason_offer` was generated, surface the link prominently:
```
│  ⚠️ Oferta de reemplazo disponible — abrir Inbox       │
```

---

## 6. Information Architecture — `tv_auction` Modal

Presented when the player resolves the STOP event from Inbox / Calendar.

### Layout (mobile-first; expands gracefully to desktop)

```
┌────────────────────────────────────────────────────────────┐
│  Subasta de Derechos de TV — Temporada 5         (cerrar)  │
│  ────────────────────────────────────────────────          │
│                                                            │
│  Tienes 3 sobres este año:                                 │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Canal Nacional                                       │  │
│  │ Cobertura: D1 · Escrutinio +1.5/sem (+57.0/temp)     │  │
│  │                                                      │  │
│  │  ○  1 temporada — 7.16 €K/sem                        │  │
│  │  ○  3 temporadas — 7.87 €K/sem (+10%) ⚠️ Riesgo Alto │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Canal Regional                                       │  │
│  │ Cobertura: D1/D2 · Escrutinio +0.5/sem (+19.0/temp)  │  │
│  │                                                      │  │
│  │  ○  1 temporada — 2.36 €K/sem                        │  │
│  │  ○  2 temporadas — 2.48 €K/sem (+5%) ⚠️ Riesgo       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Canal Local                                          │  │
│  │ Cobertura: D2 · Escrutinio -0.5/sem (-19.0/temp)     │  │
│  │                                                      │  │
│  │  ○  1 temporada — 0.72 €K/sem                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ────────────────────────────────────────                  │
│                                                            │
│        [ Firmar selección ]    [ Rechazar todo ]           │
│                                                            │
│  Rechazar otorga +10 fidelidad de afición (cap 50).        │
└────────────────────────────────────────────────────────────┘
```

### Interaction rules

- **Selection**: radio button group per tier+duration combination. Only ONE radio across all
  tiers can be selected (the "Firmar" CTA is disabled until one is chosen).
- **⚠️ Risk indicators**: rendered as a coloured icon (warning yellow) with hover/tap tooltip
  explaining the cliff:
  - `NACIONAL_3YR`: "Tu nivel actual de escrutinio (X) hará que este contrato se cancele en la Temporada 2."
  - `REGIONAL_2YR`: "Tu nivel actual de escrutinio (X) llevará al contrato a cancelarse al final de la Temporada 2."
- **Rejection CTA**: secondary button, always available. Triggers a confirm dialog:
  > "¿Rechazar todas las ofertas? El club no recibirá ingresos por TV esta temporada. A
  > cambio, la afición valorará la postura anti-comercial (+10 fidelidad)."
- **Modal cannot be dismissed**: closing X is hidden while the STOP event is unresolved.

### Domain-language labels

- "Cobertura: D1" → "Cobertura: Primera División"
- "Cobertura: D2" → "Cobertura: Segunda División"
- "Cobertura: D1/D2" → "Cobertura: ambas divisiones"
- "Escrutinio +1.5/sem" → the corruption_delta_per_week, formatted as `+X.X/sem` with the
  total per-season in parentheses.

---

## 7. Information Architecture — `tv_midseason_offer` Modal

Smaller, more urgent. Single offer, no duration choice.

```
┌────────────────────────────────────────────────────┐
│  Oferta de reemplazo — Sem 25                      │
│  ────────────────────────────────────────          │
│                                                    │
│  Tu contrato anterior fue cancelado por escrutinio │
│  mediático. Te ofrecen un sustituto:               │
│                                                    │
│  Canal Regional — 1.23 €K/sem · 13 semanas         │
│                                                    │
│        [ Firmar ]    [ Rechazar ]                  │
│                                                    │
│  Rechazar: el club termina la temporada sin TV,    │
│  pero la afición valora la dignidad (+10).         │
└────────────────────────────────────────────────────┘
```

The 70% penalty is implicit in the rate (e.g., 1.23 instead of 1.75). The modal does NOT
re-explain the percentage; the rate speaks for itself.

---

## 8. Visual Hierarchy

| Element | Tailwind / DaisyUI class hint | Hierarchy |
|---|---|---|
| Active contract tier label | `text-2xl font-semibold` | Primary |
| Weekly rate | `text-3xl font-bold tabular-nums` | Primary |
| Year-of-contract badge | `badge badge-outline` | Secondary |
| Weeks-remaining text | `text-sm text-base-content/70` | Tertiary |
| ⚠️ risk indicator | `text-warning` icon + `tooltip` | High-attention (only when present) |
| Offer tier card | `card bg-base-200` | Container |
| Radio group | DaisyUI `radio` styling | Interactive |
| CTA "Firmar selección" | `btn btn-primary` (disabled until selection) | Primary action |
| CTA "Rechazar todo" | `btn btn-ghost` (always enabled) | Secondary action |

---

## 9. Accessibility

- **Keyboard**: all radio options reachable via Tab. Arrow keys cycle within a tier's
  duration group. Enter on "Firmar selección" submits.
- **Screen reader**: Each offer card has `role="group"` with `aria-labelledby` pointing
  to the tier title. Each radio has descriptive label including price + corruption.
- **⚠️ risk indicator**: never icon-only. Always accompanied by visible text label
  ("Riesgo Alto", "Riesgo"). Tooltip provides additional detail on focus/hover.
- **Domain-language**: All labels use domain language per ADR-017 / control-manifest
  Presentation layer rules. No raw enum strings.
- **WCAG 2.1**: AA contrast on warning text + icon.

---

## 10. Empty States

- **Active contract: panel state A applies** — never empty if `tv_contract_status === 'ACTIVE'`.
- **No contract: panel state B** — explicit message, not blank.
- **No pending events**: contract panel still shows the next-event preview line. There is
  no separate "no events" empty state.

---

## 11. Implementation Hooks

| UI element | Backend dependency |
|---|---|
| Contract panel | `GET /api/tv/:playthroughId/contract` |
| `tv_auction` modal | `GET /api/tv/:playthroughId/offers/:eventId` (returns TVAuctionPayload) |
| Sign button | `POST /api/tv/:playthroughId/sign { offerId, tier, durationSeasons, currentDivision, season }` |
| Reject button | `POST /api/tv/:playthroughId/reject { offerId }` |
| Formatter | `apps/web/src/lib/format.ts` → `formatTier(tier: TVTier): string`, `formatRate(eurK: number): string` |

---

## 12. Open Questions (UX-level)

- **OQ-UX-TVR-01**: Should the contract panel show ALL historical contracts (a career
  log of TV deals) or only the current one? Recommendation: current only in MVP; history
  defers to a future "Career timeline" view.
- **OQ-UX-TVR-02**: Should the ⚠️ tooltip show the exact week the contract will cancel
  ("se cancelará en Sem 38 de la Temporada 2")? Recommendation: yes — the player benefits
  from precise telegraphing; the formula is documented in the GDD and can be exposed
  at the UI boundary.
- **OQ-UX-TVR-03**: Mobile layout (375px width): does the 3-tier offer list stack
  vertically? Recommendation: yes — single column, each tier card full width, durations
  vertically stacked radio buttons. Verify with playtest.

---

## 13. Acceptance Criteria (UI)

- [ ] **AC-UI-TVR-01**: With an ACTIVE 2-year REGIONAL contract in year 2, the panel
  displays "Canal Regional · Año 2 de 2 · X.XX €K/sem · N semanas restantes".
- [ ] **AC-UI-TVR-02**: With `tv_contract_status === 'NONE'`, the panel displays
  "Sin contrato TV esta temporada" with no rate line.
- [ ] **AC-UI-TVR-03**: When a `tv_auction` STOP event has `consumed: false`, the
  Inbox link routes to the modal and `/advance` returns HTTP 409 until resolved.
- [ ] **AC-UI-TVR-04**: The `tv_auction` modal renders one card per available tier
  from the `TVAuctionPayload.offers` array. T1 case shows exactly one card (LOCAL 1yr).
- [ ] **AC-UI-TVR-05**: When `duration_option.riskFlag === 'NACIONAL_3YR'`, the
  ⚠️ icon + "Riesgo Alto" text is rendered next to the rate.
- [ ] **AC-UI-TVR-06**: When `duration_option.riskFlag === 'REGIONAL_2YR'`, the
  ⚠️ icon + "Riesgo" text is rendered next to the rate.
- [ ] **AC-UI-TVR-07**: The "Firmar selección" button is disabled until a radio is selected.
- [ ] **AC-UI-TVR-08**: Pressing "Rechazar todo" triggers a confirm dialog before calling
  `POST /api/tv/.../reject`.
- [ ] **AC-UI-TVR-09**: On successful sign, the modal closes and the contract panel updates
  to show the newly signed contract on the next render.
- [ ] **AC-UI-TVR-10**: The `tv_midseason_offer` modal renders a single offer (no duration
  choice) at the 70% penalty rate.
