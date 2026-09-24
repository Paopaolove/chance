export const colors = {
  background: '#FAF6F1',
  surface: '#FFFFFF',
  surfaceMuted: '#F0EBE4',
  primary: '#C45C26',
  primaryDark: '#A34A1E',
  primarySoft: '#F5E6DC',
  text: '#1C1917',
  textSecondary: '#78716C',
  textMuted: '#A8A29E',
  border: '#E7E0D8',
  success: '#3F6B4A',
  successSoft: '#E4EFE7',
  warning: '#B7791F',
  warningSoft: '#F8E9C9',
  danger: '#B42318',
  dangerSoft: '#F5E6DC',
  chip: '#F0EBE4',
  overlay: 'rgba(28, 25, 23, 0.45)',
  tabInactive: '#A8A29E',
  white: '#FFFFFF',
} as const;

export type ColorName = keyof typeof colors;
