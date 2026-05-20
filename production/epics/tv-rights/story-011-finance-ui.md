# Story 011: /finance UI — TV Rights Panel + Event Display

> **Epic**: Derechos de Televisión
> **Status**: ✅ Done — UX spec authored at `design/ux/tv-rights.md` (2026-05-20); UI implemented at `apps/web/src/routes/finance/tv-rights/`
> **Layer**: Presentation
> **Type**: UI
> **Estimate**: M (3-4h — once UX spec exists)
> **Manifest Version**: 2026-05-19
> **Last Updated**: —

## Context

**GDD**: `design/gdd/tv-rights.md`
**Requirement**: `TR-TVR-011`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: [ADR-012: UI Architecture (DOM↔Canvas Frontier)](../../../docs/architecture/ADR-012-ui-architecture-dom-canvas-frontier.md) + [ADR-017: UI Input Control Taxonomy](../../../docs/architecture/ADR-017-ui-input-control-taxonomy.md)
**ADR Decision Summary**: DOM-only for MVP (ADR-012). Svelte 5 runes. All API calls via typed wrappers in `apps/web/src/lib/api.ts`. Input controls follow ADR-017 taxonomy (categorical → button group).

**Engine**: Web stack | **Risk**: MEDIUM (Svelte 5 runes post-cutoff pattern)
**Engine Notes**: Svelte 5 runes only — `$state`, `$derived`, `$effect`. No `on:click` — use `onclick={fn}`. No `bind:value` with $state — use `value` + `oninput`. No variable named `state` in components.

**Control Manifest Rules (Presentation layer)**:
- Required: DOM-only for MVP (ADR-012) — no PixiJS canvas in tv-rights UI.
- Required: Svelte 5 runes only — `$state`, `$derived`, `$effect`.
- Required: HTML-style events — `onclick={fn}` not `on:click`.
- Required: All API calls via `apps/web/src/lib/api.ts` typed wrappers.
- Required: Domain-language formatting at UI boundary — no raw 0-100 indices in player-facing text.

---

## BLOCKED: UX Spec Required

> 📌 The GDD has an active UX flag:
> *"Este sistema tiene UI en `/finance`. En Pre-Production, run `/ux-design tv-rights` antes de escribir las stories. Las stories que referencien UI de TV rights deben citar `design/ux/tv-rights.md`."*
>
> Run `/ux-design tv-rights` to create `design/ux/tv-rights.md` before implementing this story.
> This story's `Status` must be updated to `Ready` and the UX spec path added to Context once the spec is approved.

---

## Acceptance Criteria

*From GDD `design/gdd/tv-rights.md` UI Requirements section — to be refined by UX spec:*

- [ ] Panel in `/finance` shows active contract: tier label, channel name (generated), weekly rate (€K), weeks remaining in current season, "Year N of M" badge for multi-year contracts, or "Sin contrato TV esta temporada" if NONE
- [ ] `tv_auction` event in inbox/calendar: list of available offers; each shows tier name, duration option (1yr/2yr/3yr), calculated weekly rate (with multi-year bonus clearly marked), corruption delta per week
- [ ] ⚠️ Risk indicator on NACIONAL 3yr offer when `corruption_exposure > 0`
- [ ] ⚠️ Risk indicator on REGIONAL 2yr offer when `corruption_exposure ≥ 22`
- [ ] Player selects offer (tier + duration), confirms → `POST /api/tv/sign` called; or rejects → `POST /api/tv/reject`
- [ ] `tv_midseason_offer` event display: shows tier (always one level below cancelled), rate at 70%, weeks remaining; no duration choice (always 1yr)
- [ ] All text uses domain language (e.g., "Canal Regional" not raw enum "REGIONAL")

---

## Implementation Notes

*To be derived from `design/ux/tv-rights.md` (pending creation):*

Component location: `apps/web/src/routes/finance/tv-rights/` (sub-route of /finance)

API wrappers needed in `apps/web/src/lib/api.ts`:
- `getActiveContract(playthroughId)` → TVContract | null
- `getTVAuction(eventId)` → TVAuctionPayload
- `signContract(offerId, tier, durationSeasons)` → { ok: true }
- `rejectOffer(offerId)` → { ok: true }

Risk flag logic (client-side, computed from offer payload):
- Render ⚠️ when `offer.durationOptions[].riskFlag` is set in `TVAuctionPayload`
- The server computes `riskFlag` at auction generation (ADR-019 §8)

---

## Out of Scope

- All backend implementation (Stories 001-010 must be DONE first)
- UX spec authoring (run `/ux-design tv-rights` first)

---

## QA Test Cases

*Manual verification — once UX spec exists and story is unblocked.*

- **Active contract panel**:
  - Setup: Navigate to /finance with an ACTIVE REGIONAL 2yr contract in year 2 of 2
  - Verify: Panel shows "Canal Regional", weekly rate "1.75 €K/sem", "Año 2 de 2", weeks remaining
  - Pass condition: All fields present, no raw enum strings visible

- **tv_auction event**:
  - Setup: Navigate to inbox with pending tv_auction STOP event; manager has corruption=25 in D1
  - Verify: Offers list shows LOCAL (1yr), REGIONAL (1yr + 2yr options), NACIONAL (1yr + 3yr); REGIONAL 2yr shows ⚠️ icon; NACIONAL 3yr shows ⚠️ "Riesgo Alto"
  - Pass condition: ⚠️ visible for correct tiers; rates correct; UI blocked until decision

- **Rejection flow**:
  - Setup: tv_auction open, player clicks "Rechazar todas"
  - Verify: advance unblocked; panel shows "Sin contrato TV"; fan_loyalty incremented (visible somewhere in UI)
  - Pass condition: no contract active; advance works

---

## Test Evidence

**Story Type**: UI
**Required evidence**: `production/qa/evidence/tv-rights-ui-evidence.md` + lead sign-off

**Status**: [ ] Not yet created — BLOCKED until UX spec approved

---

## Dependencies

- Depends on: Stories 001-010 must all be DONE; `design/ux/tv-rights.md` must be approved
- Unlocks: Nothing (final story in this epic)
