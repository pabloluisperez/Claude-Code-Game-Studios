/**
 * Player personality traits.
 *
 * Cosmetic in MVP: traits surface in the UI as labelled chips on the player
 * detail modal. Mechanical effects (mood swings, leadership boosts, etc.) are
 * planned for post-MVP.
 *
 * Pure functions only.
 *
 * Story: Alma Pass — player traits
 * Control Manifest: 2026-05-20
 */

export interface TraitDef {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  /** Tone for UI accent: positive | neutral | negative. */
  readonly tone: 'positive' | 'neutral' | 'negative';
}

export const TRAITS: Readonly<Record<string, TraitDef>> = Object.freeze({
  lider: {
    id: 'lider',
    label: 'Líder',
    description: 'Capitanea al equipo cuando hace falta. La afición lo respeta.',
    icon: '🦁',
    tone: 'positive',
  },
  clutch: {
    id: 'clutch',
    label: 'Clutch',
    description: 'Aparece en los momentos decisivos. Cuanto más grande el partido, mejor juega.',
    icon: '🎯',
    tone: 'positive',
  },
  veterano: {
    id: 'veterano',
    label: 'Veterano',
    description: 'Saca los partidos adelante con oficio. No comete errores de inexperto.',
    icon: '🧓',
    tone: 'positive',
  },
  cantera: {
    id: 'cantera',
    label: 'De la cantera',
    description: 'Producto del club, querido por la grada. Aumenta el fan momentum.',
    icon: '🏠',
    tone: 'positive',
  },
  talento: {
    id: 'talento',
    label: 'Talento',
    description: 'Potencial alto. Puede ser una pieza clave si se le cuida.',
    icon: '⭐',
    tone: 'positive',
  },
  fragil: {
    id: 'fragil',
    label: 'Frágil',
    description: 'Propenso a lesiones musculares — riesgo elevado bajo intensidad alta.',
    icon: '🩹',
    tone: 'negative',
  },
  cabeza_caliente: {
    id: 'cabeza_caliente',
    label: 'Cabeza caliente',
    description: 'Se calienta fácil. Más tarjetas amarillas y rojas.',
    icon: '🔥',
    tone: 'negative',
  },
  mercenario: {
    id: 'mercenario',
    label: 'Mercenario',
    description: 'Le mueve el dinero, no el escudo. Difícil de renovar barato.',
    icon: '💸',
    tone: 'negative',
  },
  inconstante: {
    id: 'inconstante',
    label: 'Inconstante',
    description: 'Tiene partidos brillantes y partidos invisibles. Forma volátil.',
    icon: '🎲',
    tone: 'neutral',
  },
  silencioso: {
    id: 'silencioso',
    label: 'Silencioso',
    description: 'Hace lo suyo sin llamar la atención. Ni para bien, ni para mal.',
    icon: '🤐',
    tone: 'neutral',
  },
});

const TRAIT_IDS = Object.keys(TRAITS);

/**
 * Pick 0-2 deterministic traits for a player using its seed key.
 * 30% chance of 0 traits, 50% of 1, 20% of 2.
 */
export function pickTraits(seed: string): readonly string[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;

  const roll = h % 100;
  const count = roll < 30 ? 0 : roll < 80 ? 1 : 2;
  if (count === 0) return [];

  const first = TRAIT_IDS[(h >> 3) % TRAIT_IDS.length]!;
  if (count === 1) return [first];

  let second = TRAIT_IDS[(h >> 7) % TRAIT_IDS.length]!;
  if (second === first) {
    second = TRAIT_IDS[((h >> 7) + 1) % TRAIT_IDS.length]!;
  }
  return [first, second];
}

export function describeTraits(traitIds: readonly string[]): readonly TraitDef[] {
  return traitIds
    .map((id) => TRAITS[id])
    .filter((t): t is TraitDef => t !== undefined);
}
