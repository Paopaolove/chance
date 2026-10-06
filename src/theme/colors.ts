export const colors = {
  /** Fond app — blanc pur (plus de crème) ; cartes séparées par un liseré `border` */
  background: '#FFFFFF',
  surface: '#FFFFFF',
  /** Surfaces secondaires — vert très pâle (palette vert Jaguar) */
  surfaceMuted: '#EDF2EE',
  /** Vert Jaguar — CTA, logo, engrenage, liens, accents « Moment » */
  primary: '#1B4D3E',
  primaryDark: '#143D32',
  /** Fond de pastille / aperçu — vert Jaguar très pâle */
  primarySoft: '#E3EDE8',
  text: '#1C1917',
  /** Secondary labels — darkened for white contrast (lot 8) */
  textSecondary: '#57534E',
  /** Muted / captions — was too pale (#A8A29E) on white */
  textMuted: '#78716C',
  /** Bordures — gris-vert neutre */
  border: '#D8E2DC',
  /**
   * Pas de token « success » : une confirmation = coche vert Jaguar + texte foncé
   * sur fond blanc (CheckNote). Le vert plein reste réservé au CTA.
   */
  /** Avertissement — texte + liseré #A15C07, sur fond blanc */
  warning: '#A15C07',
  /** Fond des encarts d’avertissement — blanc (plus de crème) */
  warningSoft: '#FFFFFF',
  /** Erreur / danger — countdown 10 min, no-show, clôturer, erreurs */
  danger: '#9B2C2C',
  dangerSoft: '#F6E7E7',
  /** Chips non sélectionnées — vert très pâle */
  chip: '#E8EFEA',
  overlay: 'rgba(28, 25, 23, 0.45)',
  tabInactive: '#78716C',
  white: '#FFFFFF',
} as const;

export type ColorName = keyof typeof colors;
