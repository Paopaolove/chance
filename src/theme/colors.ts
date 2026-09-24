export const colors = {
  background: '#FAF9F7',
  surface: '#FFFFFF',
  surfaceMuted: '#F2F0ED',
  primary: '#E05A33',
  primaryDark: '#C44724',
  primarySoft: '#FCE8E1',
  text: '#222222',
  textSecondary: '#717171',
  textMuted: '#A3A3A3',
  border: '#EBEBEB',
  success: '#008A05',
  successSoft: '#E6F6E7',
  warning: '#B7791F',
  warningSoft: '#F8E9C9',
  danger: '#C13515',
  dangerSoft: '#FCE8E1',
  chip: '#F2F0ED',
  overlay: 'rgba(34, 34, 34, 0.45)',
  tabInactive: '#B0B0B0',
  white: '#FFFFFF',
} as const;

export type ColorName = keyof typeof colors;
