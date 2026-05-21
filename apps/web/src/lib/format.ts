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
