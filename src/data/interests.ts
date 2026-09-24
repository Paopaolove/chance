/** Curated interest chips (French UI). */
export const INTEREST_SUGGESTIONS = [
  'cuisine',
  'vin',
  'cinéma',
  'art',
  'balades',
  'sport',
  'musique',
  'photo',
  'théâtre',
  'apéro',
  'café',
  'musées',
  'jazz',
  'brunch',
  'voyage',
  'lecture',
] as const;

export type InterestSuggestion = (typeof INTEREST_SUGGESTIONS)[number];

/** Soft suggestion range for onboarding (optional). */
export const SUGGESTED_INTERESTS_MIN = 3;
export const SUGGESTED_INTERESTS_MAX = 5;

/** Bio hard cap (~120 chars per product brief). */
export const MAX_BIO_LENGTH = 120;

/** Soft hint only — bio is required but short; no long min. */
export const MIN_BIO_LENGTH = 1;

export const MAX_CUSTOM_FILTERS = 8;
export const MAX_CUSTOM_FILTER_LENGTH = 24;

/** Merge curated interests + custom filters for display (deduped case-insensitive). */
export function mergeProfileTags(
  interests: string[] = [],
  customFilters: string[] = [],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of [...interests, ...customFilters]) {
    const key = tag.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(tag.trim());
  }
  return out;
}

/** Normalize and append a custom filter; returns null if invalid / duplicate / full. */
export function tryAddCustomFilter(
  current: string[],
  raw: string,
): { ok: true; next: string[] } | { ok: false; reason: string } {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return { ok: false, reason: 'Écris un filtre avant d’ajouter.' };
  }
  if (trimmed.length > MAX_CUSTOM_FILTER_LENGTH) {
    return {
      ok: false,
      reason: `Max ${MAX_CUSTOM_FILTER_LENGTH} caractères.`,
    };
  }
  if (current.length >= MAX_CUSTOM_FILTERS) {
    return {
      ok: false,
      reason: `Max ${MAX_CUSTOM_FILTERS} filtres personnalisés.`,
    };
  }
  const key = trimmed.toLowerCase();
  if (current.some((c) => c.toLowerCase() === key)) {
    return { ok: false, reason: 'Ce filtre est déjà ajouté.' };
  }
  return { ok: true, next: [...current, trimmed] };
}

/** Light FR phone check: 0X… (10 digits) or +33… (11 digits). */
export function isValidFrPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('33') && digits.length === 11) {
    return /^33[1-9]\d{8}$/.test(digits);
  }
  if (digits.length === 10) {
    return /^0[1-9]\d{8}$/.test(digits);
  }
  return false;
}
