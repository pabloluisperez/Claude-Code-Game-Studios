/**
 * Museum templated text (Spanish, v1.1). Story TROPHIES-HISTORY-003.
 *
 * Pure-function templates for the 2-3 sentence contextual text shown when
 * the player hovers/taps a museum object. Tone: warm, restrained, the
 * "tarde de domingo" feel from the launch comms. v1.2+ replaces with
 * narrative-ai.md LLM-generated text (these templates remain as fallback).
 */

export type TrophyTemplateParams = { trophy_name: string; season: number; summary_adjective: string };
export type BannerAscensoParams = { division: string; season: number };
export type BannerDerbyParams = { opponent: string; season: number; result_text: string };
export type BannerLegendaryParams = { season: number; match_description: string };
export type TransferOutgoingParams = {
  player_name: string;
  season: number;
  fee_eur_k: number;
  year_in: number;
  year_out: number;
};
export type TransferIncomingParams = {
  player_name: string;
  season: number;
  fee_eur_k: number;
};
export type TransferCanteraParams = { player_name: string; season: number };
export type MilestoneSeasonParams = { season: number };
export type StadiumHistoryParams = { item_name: string; season: number; cost_eur_k: number };

type TrophyTemplate = (p: TrophyTemplateParams) => string;

export const trophyTemplates: readonly TrophyTemplate[] = [
  ({ trophy_name, season, summary_adjective }) =>
    `Ganaste la ${trophy_name} en la temporada ${season}. Fue un año de ${summary_adjective}.`,
  ({ trophy_name, season }) =>
    `La ${trophy_name} llegó en la temporada ${season}. La copa descansa aquí desde entonces.`,
  ({ trophy_name, season, summary_adjective }) =>
    `Temporada ${season}: ${trophy_name}. Un trofeo ${summary_adjective}.`,
];

export const bannerTemplates = {
  ascenso: (p: BannerAscensoParams): string =>
    `Ascenso a ${p.division} en la temporada ${p.season}. La afición no olvidará el último partido.`,
  derby: (p: BannerDerbyParams): string => `Derbi ${p.opponent}, ${p.season}: ${p.result_text}.`,
  legendary: (p: BannerLegendaryParams): string =>
    `${p.season}: ${p.match_description}. Un partido legendario.`,
};

export const transferTemplates = {
  outgoing: (p: TransferOutgoingParams): string =>
    `${p.player_name} dejó el club en la temporada ${p.season} por ${p.fee_eur_k}€K. Aquí jugó desde ${p.year_in} hasta ${p.year_out}.`,
  incoming: (p: TransferIncomingParams): string =>
    `${p.player_name} llegó al club en la temporada ${p.season} por ${p.fee_eur_k}€K. Aquí comenzó una época.`,
  cantera: (p: TransferCanteraParams): string =>
    `${p.player_name} salió de la cantera en la temporada ${p.season}. Hijo del club.`,
};

export const milestoneTemplates = {
  first_profit: (p: MilestoneSeasonParams): string =>
    `Temporada ${p.season}: por primera vez, beneficios. El club ya no pierde dinero.`,
  millionaire: (p: MilestoneSeasonParams): string =>
    `Temporada ${p.season}: el balance cruzó el millón de euros. Hubo champaña en el bar.`,
  rich_club: (p: MilestoneSeasonParams): string =>
    `Temporada ${p.season}: el club entra entre los 10 más ricos de la liga.`,
  bankruptcy_recovery: (p: MilestoneSeasonParams): string =>
    `Temporada ${p.season}: el club resurge tras el bache. Otros darían por perdido — tú no.`,
};

export function stadiumHistoryTemplate(p: StadiumHistoryParams): string {
  return `${p.item_name} — temporada ${p.season}. Coste: ${p.cost_eur_k}€K.`;
}

/** Adjectives library — selected deterministically by `seed % length`. */
export const SUMMARY_ADJECTIVES = [
  'esfuerzo',
  'gloria',
  'paciencia',
  'sorpresas',
  'remontadas',
  'sufrimiento',
  'milagros',
  'orden',
  'temple',
  'caos productivo',
] as const;

export function pickAdjective(seed: number): string {
  const n = SUMMARY_ADJECTIVES.length;
  const idx = ((Math.floor(seed) % n) + n) % n; // safe modulo for negatives
  return SUMMARY_ADJECTIVES[idx]!;
}

export function pickTrophyTemplate(seed: number): TrophyTemplate {
  const n = trophyTemplates.length;
  const idx = ((Math.floor(seed) % n) + n) % n;
  return trophyTemplates[idx]!;
}
