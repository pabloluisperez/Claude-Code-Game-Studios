/**
 * Client-side display formatters.
 *
 * Per playtest 2026-05-21 (Pablo): "Los valores de dinero mejor mostrarlos
 * como 100.000€ en lugar de 100 €K, creo que queda mas claro." — full euros
 * with Spanish locale thousands separator are more readable than the
 * developer-facing €K shorthand.
 */

/**
 * Convert a value stored in €K (thousands of euros) to a display string in
 * full euros with Spanish locale formatting.
 *
 *   formatEurK(100)    → '100.000 €'
 *   formatEurK(-25.5)  → '-25.500 €'
 *   formatEurK(0)      → '0 €'
 *   formatEurK(1.75)   → '1.750 €'   (decimal €K rounds to nearest €)
 */
export function formatEurK(eurK: number): string {
  const eur = Math.round(eurK * 1000);
  return `${eur.toLocaleString('es-ES')} €`;
}

/**
 * Format an EXACT euro amount (not €K) with Spanish locale.
 * Use when the underlying figure has euro precision (gate, merch, bar) so we
 * don't round 2.341 € to 2.000 €.
 *   formatEur(2341) → '2.341 €'
 */
export function formatEur(eur: number): string {
  return `${Math.round(eur).toLocaleString('es-ES')} €`;
}

/**
 * Like `formatEurK` but signed — adds a leading '+' for positive values.
 * Used for cashflow deltas where the sign matters visually.
 *
 *   formatEurKSigned(5)   → '+5.000 €'
 *   formatEurKSigned(-3)  → '-3.000 €'
 *   formatEurKSigned(0)   → '0 €'
 */
export function formatEurKSigned(eurK: number): string {
  const eur = Math.round(eurK * 1000);
  if (eur === 0) return '0 €';
  const sign = eur > 0 ? '+' : '';
  return `${sign}${eur.toLocaleString('es-ES')} €`;
}

/**
 * Compact "k€" notation for tight chrome (topbar, badges, sparkline labels).
 *
 * Polish walkthrough fix (Pablo, post-Sprint-11): the full-euro Spanish
 * format (`245.000 €`) crowds the topbar. Compact format collapses to
 * `245 k€` for values ≥ 1 €K, falls through to whole euros under 1 €K, and
 * uses millions notation for very large balances.
 *
 *   formatEurCompact(245)      → '245 k€'
 *   formatEurCompact(-50)      → '-50 k€'
 *   formatEurCompact(1500)     → '1,5 M€'
 *   formatEurCompact(0.4)      → '400 €'
 *   formatEurCompact(0)        → '0 €'
 */
export function formatEurCompact(eurK: number): string {
  if (eurK === 0) return '0 €';
  const absK = Math.abs(eurK);
  const sign = eurK < 0 ? '-' : '';
  if (absK >= 1000) {
    // Millions tier: 1500 €K → 1,5 M€
    const millions = absK / 1000;
    const formatted = millions.toLocaleString('es-ES', {
      maximumFractionDigits: 1,
    });
    return `${sign}${formatted} M€`;
  }
  if (absK >= 1) {
    // Thousands tier: 245 €K → 245 k€
    return `${sign}${Math.round(absK).toLocaleString('es-ES')} k€`;
  }
  // Sub-€K tier: show full euros (rare for balance, common for small deltas)
  const eur = Math.round(absK * 1000);
  return `${sign}${eur.toLocaleString('es-ES')} €`;
}
