export const colors = {
  /** Fond d’écran — blanc Moment Pro */
  background: '#FFFFFF',
  /** Surfaces / cartes — #F7F7F5 */
  surface: '#F7F7F5',
  /** Carte moment — même surface Pro */
  cardWarm: '#F7F7F5',
  /** Pastille pictogramme catégorie — surface douce */
  accentSoft: '#F0F0EE',
  /** Surfaces secondaires */
  surfaceMuted: '#F7F7F5',
  /** CTA / accent — encre slate #1F2937 */
  primary: '#1F2937',
  primaryDark: '#111827',
  /** Soft du CTA — surface */
  primarySoft: '#F7F7F5',
  /** Texte principal — encre #111111 */
  text: '#111111',
  /** Texte secondaire — #6B6B6B */
  textSecondary: '#6B6B6B',
  /** Légendes / placeholders */
  textMuted: '#6B6B6B',
  /** Bordures / liserés 1px — #E8E8E6 */
  border: '#E8E8E6',
  /** Succès — Moment Pro */
  success: '#157F3B',
  /** Avertissement — Moment Pro */
  warning: '#B54708',
  /** Fond des encarts d’avertissement */
  warningSoft: '#FFFFFF',
  /** Erreur / danger — Moment Pro */
  danger: '#C62828',
  dangerSoft: '#FFFFFF',
  /** Pastille inactive */
  chip: '#FFFFFF',
  chipBorder: '#E8E8E6',
  chipText: '#111111',
  /** Pastille active : CTA #1F2937, texte blanc */
  chipActive: '#1F2937',
  chipActiveText: '#FFFFFF',
  overlay: 'rgba(17, 17, 17, 0.45)',
  tabInactive: '#6B6B6B',
  white: '#FFFFFF',
} as const;

/** Teintes de catégorie (look Pro) — remplacent d’anciennes teintes jaguar. */
export const categoryColors = {
  restaurant: '#9A5839',
  bar: '#62538D',
  sport: '#39716C',
  culture: '#49688A',
  autre: '#6B6B6B',
} as const;

export type ColorName = keyof typeof colors;
