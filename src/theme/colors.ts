export const colors = {
  /** Fond app crème années 70 */
  background: '#FFF1E0',
  surface: '#FFFFFF',
  /** Surfaces secondaires / chips — crème orangé, pas terracotta */
  surfaceMuted: '#FFE8D1',
  /** Orange 70s — CTA, logo, engrenage, accents « Chance » */
  primary: '#E85D04',
  primaryDark: '#BB4D00',
  /** Soft aperçu orange crème */
  primarySoft: '#FFE4C8',
  text: '#1C1917',
  textSecondary: '#78716C',
  textMuted: '#A8A29E',
  border: '#F0D9C0',
  success: '#3F6B4A',
  successSoft: '#E4EFE7',
  warning: '#B7791F',
  warningSoft: '#F8E9C9',
  danger: '#B42318',
  dangerSoft: '#FCE8E6',
  chip: '#FFE8D1',
  overlay: 'rgba(28, 25, 23, 0.45)',
  tabInactive: '#A8A29E',
  white: '#FFFFFF',
} as const;

export type ColorName = keyof typeof colors;
