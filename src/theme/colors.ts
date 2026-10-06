export const colors = {
  /** Fond d’écran — papier #F7F1EA ; cartes, champs et pastilles en blanc + liseré `border` */
  background: '#F7F1EA',
  surface: '#FFFFFF',
  /** Surfaces secondaires — blanc + liseré `border` (un blanc, un noir, un orange) */
  surfaceMuted: '#FFFFFF',
  /** Abricot #E37A55 — uniquement : bouton principal, mot accent, onglet actif, engrenage, pastille active */
  primary: '#E37A55',
  primaryDark: '#C45E3C',
  /** Ancien vert pâle → blanc (l’orange est réservé : CTA, mot accent, onglet actif, engrenage, pastille active) */
  primarySoft: '#FFFFFF',
  /** Texte principal — encre #1C1917 */
  text: '#1C1917',
  /** Texte secondaire — #6F675E */
  textSecondary: '#6F675E',
  /** Légendes / placeholders — même #6F675E (contraste ≥ 4.5 sur blanc) */
  textMuted: '#6F675E',
  /** Bordures / liserés 1px — #E7DFD6 (cartes, champs, pastilles) */
  border: '#E7DFD6',
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
  /** Pastille inactive : fond blanc, bord #E7DFD6, texte #1C1917 */
  chip: '#FFFFFF',
  chipBorder: '#E7DFD6',
  chipText: '#1C1917',
  /** Pastille active : fond abricot #E37A55, texte blanc */
  chipActive: '#E37A55',
  chipActiveText: '#FFFFFF',
  overlay: 'rgba(28, 25, 23, 0.45)',
  tabInactive: '#6F675E',
  white: '#FFFFFF',
} as const;

export type ColorName = keyof typeof colors;
