/**
 * Robust numeric parsing for demo inputs (montants €, minutes, etc.).
 * Accepts French comma or dot; empty / NaN → null. No silent defaults.
 */
export function parseLooseNumber(raw: string): number | null {
  const t = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.');
  if (t === '' || t === '.' || t === '-' || t === '-.') return null;
  // Allow optional leading digits, optional fractional part.
  if (!/^-?\d+(\.\d*)?$/.test(t) && !/^-?\.\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Round to int; empty / invalid → null. */
export function parseLooseInt(raw: string): number | null {
  const n = parseLooseNumber(raw);
  if (n == null) return null;
  return Math.round(n);
}

/** Clamp a finite number into [min, max] (inclusive), rounded. */
export function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}
