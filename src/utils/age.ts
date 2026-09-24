/** Adults-only: parse a demo age (18–99). No silent default. */
export function parseAdultAge(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) return null;
  const age = Math.round(n);
  if (age < 18 || age > 99) return null;
  return age;
}

export const AGE_REQUIRED_HINT = 'Indique ton âge (18 ans minimum).';
export const AGE_UNDERAGE_HINT = 'Chance est réservé aux adultes (18 ans et plus).';
