---
Story: TROPHIES-HISTORY-003
Status: Ready
Type: Logic
GDD Requirement: AC-TH-14/15
Governing ADR: ADR-030 §D6
Control Manifest: 2026-05-19
Test Evidence: packages/shared/tests/museum/text-templates.test.ts (pending)
ImplementedAt: packages/shared/src/i18n/museum-templates.ts
---

# Story: Templated text generation for museum objects (v1.1 ES-only)

## Goal

Generate the 2-3 sentence contextual text shown when player hovers/taps a museum object. v1.1 uses simple template substitution; v1.2+ will replace with `narrative-ai.md` LLM generation.

## Scope

In `packages/shared/src/i18n/museum-templates.ts` (new):

```typescript
type TrophyTemplate = (params: { trophy_name: string; season: number; summary_adjective: string }) => string;

export const trophyTemplates: TrophyTemplate[] = [
  ({trophy_name, season, summary_adjective}) =>
    `Ganaste la ${trophy_name} en la temporada ${season}. Fue un año de ${summary_adjective}.`,
  ({trophy_name, season}) =>
    `La ${trophy_name} llegó en la temporada ${season}. La copa descansa aquí desde entonces.`,
  ({trophy_name, season, summary_adjective}) =>
    `Temporada ${season}: ${trophy_name}. Un trofeo ${summary_adjective}.`,
];

export const bannerTemplates = {
  ascenso: (params) => `Ascenso a ${params.division} en la temporada ${params.season}. La afición no olvidará el último partido.`,
  derby: (params) => `Derbi ${params.opponent}, ${params.season}: ${params.result_text}.`,
  legendary: (params) => `${params.season}: ${params.match_description}. Un partido legendario.`,
};

export const transferTemplates = {
  outgoing: (params) => `${params.player_name} dejó el club en la temporada ${params.season} por ${params.fee_eur_k}€K. Aquí jugó desde ${params.year_in} hasta ${params.year_out}.`,
  incoming: (params) => `${params.player_name} llegó al club en la temporada ${params.season} por ${params.fee_eur_k}€K. Aquí comenzó una época.`,
  cantera: (params) => `${params.player_name} salió de la cantera en la temporada ${params.season}. Hijo del club.`,
};

export const milestoneTemplates = {
  first_profit: (params) => `Temporada ${params.season}: por primera vez, beneficios. El club ya no pierde dinero.`,
  millionaire: (params) => `Temporada ${params.season}: el balance cruzó el millón de euros. Hubo champaña en el bar.`,
  rich_club: (params) => `Temporada ${params.season}: el club entra entre los 10 más ricos de la liga.`,
  bankruptcy_recovery: (params) => `Temporada ${params.season}: el club resurge tras el bache. Otros darían por perdido — tú no.`,
};

export const stadiumHistoryTemplate = (params) =>
  `${params.item_name} — temporada ${params.season}. Coste: ${params.cost_eur_k}€K.`;

// Adjectives library — picks based on season events (deterministic from event hash)
export const SUMMARY_ADJECTIVES = ['esfuerzo', 'gloria', 'paciencia', 'sorpresas', 'remontadas', 'sufrimiento', 'milagros', 'orden', 'temple', 'caos productivo'];

export function pickAdjective(seed: number): string {
  return SUMMARY_ADJECTIVES[seed % SUMMARY_ADJECTIVES.length];
}

export function pickTrophyTemplate(seed: number): TrophyTemplate {
  return trophyTemplates[seed % trophyTemplates.length];
}
```

## Out of Scope

- LLM integration (v1.2+ via narrative-ai.md)
- English / other locales (v1.1 is ES-only)
- Background regeneration job (v1.2+)

## Acceptance Criteria

1. Trophy template substitution: `trophyTemplates[0]({trophy_name: 'Copa Regional', season: 3, summary_adjective: 'gloria'})` → `"Ganaste la Copa Regional en la temporada 3. Fue un año de gloria."`
2. Banner ascenso template substitution works for all 3 variants
3. Transfer outgoing template includes all 5 placeholders
4. Milestone bankruptcy_recovery includes season number
5. Stadium history template includes item name, season, cost
6. `pickAdjective(0)` returns deterministically (same input → same output)
7. `pickTrophyTemplate(N % 3)` cycles through 3 templates
8. All exported functions are pure (no I/O, no random — `seed` is the source of variability)
9. ES-only verified: no English strings in templates

## Test Requirements (Logic, BLOCKING)

`packages/shared/tests/museum/text-templates.test.ts`:

- Cover ACs 1-9
- Verify Spanish strings render correctly (UTF-8 handling)
- Determinismo: same seed → same output 100 times

## Dependencies

- **Upstream**: 002 (types for params)
- **Downstream**: 001 (service uses these to enrich response payload), 005 (frontend displays)

## Estimate

**1 day.** Template authoring + small test file.

## Notes / Gotchas

- Tone: warm, restraint, "tarde de domingo" — match the game's launch communication tone per `production/marketing/launch-post-v1.0.md`
- NO contradictions with game state — e.g., if club is in Q2 of season X, don't generate "temporada anterior" text that contradicts
- Future v1.2+ will replace these with LLM-generated text; the templates serve as fallback even then (if LLM fails/cost-cap)
- Avoid placeholder syntax mismatch — each template explicitly typed with its expected params object
