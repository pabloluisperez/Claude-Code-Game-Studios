/**
 * Lightweight gender guess from a Spanish first name, for avatar styling only
 * (long hair for women). Deterministic so the same name yields the same look
 * everywhere (dashboard, /staff). Heuristic, not authoritative — Spanish first
 * names ending in "a" are overwhelmingly feminine, with a few known exceptions.
 *
 * Pablo 2026-05-29.
 */

const MALE_EXCEPTIONS = new Set([
  'luca', 'cuca', 'borja', 'elias', 'lucas', 'jonas', 'tobias', 'matias', 'dia',
]);
const FEMALE_EXTRA = new Set([
  'carmen', 'pilar', 'isabel', 'beatriz', 'mercedes', 'dolores', 'nieves',
  'consuelo', 'soledad', 'rocio', 'rosario', 'raquel', 'noelia', 'merche',
]);

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** True if the (first) name reads as feminine under the heuristic. */
export function isFemaleName(fullName: string | null | undefined): boolean {
  if (!fullName) return false;
  const first = stripAccents(fullName.trim().split(/\s+/)[0] ?? '').toLowerCase();
  if (!first) return false;
  if (FEMALE_EXTRA.has(first)) return true;
  if (MALE_EXCEPTIONS.has(first)) return false;
  return first.endsWith('a');
}
