# Narrative Hardcoded-String Audit — Sprint 26-7

**Date**: 2026-05-29 · **Scope**: `apps/web/src/lib/server/advance-orchestrator.ts`
+ event copy. **Goal (AC 26-7)**: no hardcoded player-facing narrative string
remains *where a template group now covers it*.

## Method

Swept every player-facing string emitted by the advance pipeline (staff messages,
event copy) and classified each as **narrative prose** (world-voice — migrate to
the engine) or **operational data notification** (concrete numbers/actions —
stays inline; forcing it through templates would destroy the data it carries).

## Findings

| Site | String | Class | Action |
|------|--------|-------|--------|
| Phase 6c press (match outcome) | `📰 Crónica…` | narrative | ✅ engine (`matchOutcomeTemplates`) — pre-existing |
| Phase 6c press (derby) | `🔥 Derbi…` | narrative | ✅ **wired 26-6** (`pressDerbyTemplates`, same-city heuristic) |
| Phase 6d rumor mill | `🗞️ Rumor…` | narrative | ✅ **wired 26-6** (`rumorTemplates`, seeded gate, window-open) |
| Phase 6e window blurb | `📅 Mercado…` | narrative | ✅ **wired 26-7** (`transferWindowTemplates`) — was: no text |
| Phase 8b mayor call | mayor prose | narrative | ✅ engine (`mayorCallTemplates`) — pre-existing |
| Phase 8c finance commentary | finance prose | narrative | ✅ engine (`financial{Positive,Warning}Templates`) — pre-existing |
| Phase 2 abono signup | `Director comercial… +{N} abonados (+{€})` | **operational** | inline — concrete weekly figures; no covering group |
| Phase 6b abono reminder | `…quedan 2 semanas… revisa el precio del abono` | **operational** | inline — action prompt with deadline; no covering group |
| Phase 8c-bis-3 low merch stock | `📦 …stock bajo de {items}…` | **operational** | inline — concrete stock alert; no covering group |
| Phase 8d-bis contract expiry | `📋 {player} ha expirado contrato y se marcha libre` | **operational** | inline — data event (roster change); no expiry group |

## Surfaces with a group but no inline string to migrate (future wiring)

These have a template group (26-5) but their emission point is **not** the
orchestrator and carries **no hardcoded narrative prose today** (metadata
payloads / delegated helpers). No 26-7 violation; wiring is future work:

- **sponsorRenewal** — emitted on player *acceptance* of a `sponsor_renewal`
  STOP event (event-decision handler), not the orchestrator. Group ready.
- **contractRenewal** — same: player-accepted `contract_renewal` STOP event.
- ~~**promotionRelegation**~~ — ✅ **WIRED (2026-05-29)**. Correction to the
  original audit: `season-rollover.ts` *did* emit hardcoded promotion/relegation
  prose (`¡ASCENDIMOS…` / `Descendimos a…`). Now migrated to
  `promotionRelegationTemplates` (varied across seasons), keeping the coach
  attribution + emoji + tier label.
- **boardConfidence** — no emission site yet; maps naturally to job-security /
  board-confidence state in a future phase. Group ready.

### Aún mudos (pendiente, net-new — sin prosa hardcoded que migrar)
- **sponsorRenewal** — `decideSponsorRenewal` (finance/+page.server.ts) no emite
  mensaje; wirearlo es añadir una emisión nueva (requiere nº de temporada +
  notificador). Diferido.
- **contractRenewal** — mismo patrón en el handler de decisión de contrato.
- **boardConfidence** — sin estado/disparador (no hay "job security"); wirearlo
  bien es una mecánica nueva, fuera de "enchufar grupos existentes". Diferido.

## Verdict

**PASS** for the AC as scoped: every *narrative* surface in the advance
pipeline now renders through the engine; the four remaining inline strings are
operational data notifications without a covering narrative group. The four
"group-ready" surfaces above are logged as explicit follow-ups (no silent gap).
