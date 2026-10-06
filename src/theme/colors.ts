export const colors = {
  /** Fond d’écran — papier #F4F1EA ; cartes, champs et pastilles en blanc + liseré `border` */
  background: '#F4F1EA',
  surface: '#FFFFFF',
  /** Surfaces secondaires — blanc + liseré `border` (un blanc, un noir, un orange) */
  surfaceMuted: '#FFFFFF',
  /** Orange 70s #C85A12 — uniquement : bouton principal, mot accent, onglet actif, engrenage, pastille active */
  primary: '#C85A12',
  primaryDark: '#9E4710',
  /** Ancien vert pâle → blanc (l’orange est réservé : CTA, mot accent, onglet actif, engrenage, pastille active) */
  primarySoft: '#FFFFFF',
  /** Texte principal — encre #1C1917 */
  text: '#1C1917',
  /** Texte secondaire — #6F675E */
  textSecondary: '#6F675E',
  /** Légendes / placeholders — même #6F675E (contraste ≥ 4.5 sur blanc) */
  textMuted: '#6F675E',
  /** Bordures / liserés 1px — #E4DDD2 (cartes, champs, pastilles) */
  border: '#E4DDD2',
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
  /** Pastille inactive : fond blanc, bord #E4DDD2, texte #1C1917 */
  chip: '#FFFFFF',
  chipBorder: '#E4DDD2',
  chipText: '#1C1917',
  /** Pastille active : fond orange #C85A12, texte blanc */
  chipActive: '#C85A12',
  chipActiveText: '#FFFFFF',
  overlay: 'rgba(28, 25, 23, 0.45)',
  tabInactive: '#6F675E',
  white: '#FFFFFF',
} as const;

export type ColorName = keyof typeof colors;
