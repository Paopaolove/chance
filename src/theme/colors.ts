export const colors = {
  /** Fond d’écran — papier #F6F1E8 ; cartes, champs et pastilles en blanc + liseré `border` */
  background: '#F6F1E8',
  surface: '#FFFFFF',
  /** Surfaces secondaires — blanc + liseré `border` (un blanc, un noir, un orange) */
  surfaceMuted: '#FFFFFF',
  /** Orange #E25B1A — uniquement : bouton principal, mot accent, onglet actif, engrenage, pastille active */
  primary: '#E25B1A',
  primaryDark: '#C44A12',
  /** Ancien vert pâle → blanc (l’orange est réservé : CTA, mot accent, onglet actif, engrenage, pastille active) */
  primarySoft: '#FFFFFF',
  /** Texte principal — encre #1C1917 */
  text: '#1C1917',
  /** Texte secondaire — #6F675E */
  textSecondary: '#6F675E',
  /** Légendes / placeholders — même #6F675E (contraste ≥ 4.5 sur blanc) */
  textMuted: '#6F675E',
  /** Bordures / liserés 1px — #E6DFD4 (cartes, champs, pastilles) */
  border: '#E6DFD4',
  /**
   * Pas de token « success » : une confirmation = coche + texte foncé
   * sur fond blanc (CheckNote). L’orange plein reste réservé au CTA.
   */
  /** Avertissement — texte + liseré #A15C07, sur fond blanc */
  warning: '#A15C07',
  /** Fond des encarts d’avertissement — blanc (plus de crème) */
  warningSoft: '#FFFFFF',
  /** Erreur / danger — countdown 10 min, no-show, clôturer, erreurs */
  danger: '#9B2C2C',
  dangerSoft: '#FFFFFF',
  /** Pastille inactive : fond blanc, bord #E6DFD4, texte #1C1917 */
  chip: '#FFFFFF',
  chipBorder: '#E6DFD4',
  chipText: '#1C1917',
  /** Pastille active : fond orange #E25B1A, texte blanc */
  chipActive: '#E25B1A',
  chipActiveText: '#FFFFFF',
  overlay: 'rgba(28, 25, 23, 0.45)',
  tabInactive: '#6F675E',
  white: '#FFFFFF',
} as const;

export type ColorName = keyof typeof colors;
