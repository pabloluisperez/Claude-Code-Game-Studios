/**
 * Cascada FC — paleta de producción.
 *
 * Fuente única: `design/art/art-bible.md` §4.
 * Cualquier asset producido (manual o AI-generated) DEBE usar exclusivamente
 * colores de esta paleta. El script `validate-palette.ts` aplica esta
 * restricción en CI.
 *
 * Estructura:
 *   - PALETTE_T0_BASE: 7 colores permanentes
 *   - PALETTE_T1_ADD: 3 colores nuevos que aparecen en T1
 *   - PALETTE_T2_ADD: 2 + Club Primary + Club Secondary (variables runtime)
 *   - PALETTE_T3_ADD: 1 + Club Accent + Luz estadio (variables runtime)
 *   - CLUB_COLOR_SLOTS: 3 slots paramétricos (decisión del jugador)
 *
 * Los Club Colors NO se enforcan a hex específico en validation — son
 * variables runtime aplicadas via PixiJS tint. Validation acepta cualquier
 * color HSL S ≤ 85% (T3) y se reemplaza por tint en runtime.
 */

export type RGB = readonly [number, number, number];

export type PaletteEntry = {
  name: string;
  hex: string;
  rgb: RGB;
  /** HSL luminance 0..100 per Art Bible §4 tables. */
  luminance: number;
  /** Tier en el que aparece (mínimo). T0 = siempre presente. */
  introducedInTier: 0 | 1 | 2 | 3;
  /** Rol semántico del color (Art Bible §4 columnas "Rol"/"Dónde aparece"). */
  role: string;
};

function rgbFromHex(hex: string): RGB {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ] as const;
}

function p(name: string, hex: string, luminance: number, tier: 0 | 1 | 2 | 3, role: string): PaletteEntry {
  return { name, hex, rgb: rgbFromHex(hex), luminance, introducedInTier: tier, role };
}

// ── T0 base (Art Bible §4.1) ─────────────────────────────────────────────────
export const PALETTE_T0_BASE: readonly PaletteEntry[] = [
  p('Tierra seca',       '#5C3D1E', 24, 0, 'Suelo primario, caminos sin pavimentar'),
  p('Polvo de fachada',  '#8C6B47', 42, 0, 'Paredes de edificios, mampostería sin pintar'),
  p('Cielo encapotado',  '#A8A0A0', 64, 0, 'Fondo de cielo, niebla base'),
  p('Sombra interior',   '#2E2018', 14, 0, 'Zonas de sombra en edificios, interior'),
  p('Madera envejecida', '#7A5230', 36, 0, 'Vallas, bancos, postes, puertas'),
  p('Hierba agostada',   '#6B7A3A', 35, 0, 'Campo (T0), vegetación escasa'),
  p('Ceniza de tejado',  '#504844', 29, 0, 'Tejados, asfalto sin mantenimiento'),
] as const;

// ── T1 additions (Art Bible §4.2.1) ──────────────────────────────────────────
export const PALETTE_T1_ADD: readonly PaletteEntry[] = [
  p('Césped vivo',       '#4A9968', 38, 1, 'Campo de fútbol — sustituye Hierba agostada'),
  p('Césped vivo dots',  '#5BBF7E', 50, 1, 'Textura puntos 2px sobre Césped vivo (a11y signal)'),
  p('Cal de fachada',    '#C4B49A', 71, 1, 'Paredes repintadas — solo edificios del estadio'),
  p('Acento neutro',     '#9E8B6E', 52, 1, 'Banderín gris-beige, primer detalle del club'),
] as const;

// ── T2 additions (Art Bible §4.2.2) ──────────────────────────────────────────
export const PALETTE_T2_ADD: readonly PaletteEntry[] = [
  p('Verde parque',      '#3D8C55', 34, 2, 'Zonas verdes urbanas más allá del campo'),
  p('Pavimento urbano',  '#7A7060', 40, 2, 'Calles pavimentadas — upgrade de Tierra seca'),
] as const;

// ── T3 additions (Art Bible §4.2.3) ──────────────────────────────────────────
export const PALETTE_T3_ADD: readonly PaletteEntry[] = [
  p('Asfalto nuevo',     '#5C5650', 34, 3, 'Calles centro de la ciudad, plazas'),
] as const;

/**
 * Club color slots — 3 colores paramétricos elegidos por el jugador en onboarding.
 * NO se enforcan a hex específico en validation; los assets se generan con un
 * color neutro placeholder y PixiJS aplica tint en runtime.
 */
export type ClubColorSlot = 'primary' | 'secondary' | 'accent';

export const CLUB_COLOR_PLACEHOLDER: Record<ClubColorSlot, string> = {
  primary: '#1E3A8A',   // default azul (per clubs.kit_primary_color default)
  secondary: '#F8FAFC', // default blanco
  accent: '#FBBF24',    // default ámbar
};

/**
 * Full validation palette. Returns every hex allowed up to and including
 * the given tier. T3 includes T0+T1+T2+T3.
 *
 * Club color placeholders are also included so generated assets with the
 * default placeholder values pass validation; runtime tint replaces them.
 */
export function getValidationPalette(maxTier: 0 | 1 | 2 | 3 = 3): readonly PaletteEntry[] {
  const out: PaletteEntry[] = [...PALETTE_T0_BASE];
  if (maxTier >= 1) out.push(...PALETTE_T1_ADD);
  if (maxTier >= 2) out.push(...PALETTE_T2_ADD);
  if (maxTier >= 3) out.push(...PALETTE_T3_ADD);
  // Club placeholders
  for (const [slot, hex] of Object.entries(CLUB_COLOR_PLACEHOLDER)) {
    out.push(p(`Club ${slot} placeholder`, hex, 0, 0, `Club ${slot} (runtime tint)`));
  }
  return out;
}

/** Just the hex strings, lowercase, for fast lookup. */
export function getValidationHexSet(maxTier: 0 | 1 | 2 | 3 = 3): Set<string> {
  const set = new Set<string>();
  for (const entry of getValidationPalette(maxTier)) {
    set.add(entry.hex.toLowerCase());
  }
  return set;
}

/** Euclidean RGB distance (good enough for palette nearest-match). */
export function rgbDistance(a: RGB, b: RGB): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Find the closest palette entry to a given RGB color. */
export function nearestPaletteEntry(
  rgb: RGB,
  maxTier: 0 | 1 | 2 | 3 = 3,
): PaletteEntry {
  const palette = getValidationPalette(maxTier);
  let best = palette[0]!;
  let bestDist = Infinity;
  for (const entry of palette) {
    const dist = rgbDistance(rgb, entry.rgb);
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best;
}

/**
 * Tolerance — RGB distance below which a pixel is considered "in palette"
 * even if not a perfect match (allows for sub-byte rounding in PNG encoders).
 */
export const PALETTE_TOLERANCE_RGB = 4;
