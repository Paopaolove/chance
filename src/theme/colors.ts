export const colors = {
  /** Fond app crème années 70 */
  background: '#FFF1E0',
  surface: '#FFFFFF',
  /** Surfaces secondaires — vert très pâle (palette vert Jaguar) */
  surfaceMuted: '#EDF2EE',
  /** Vert Jaguar — CTA, logo, engrenage, liens, accents « Chance » */
  primary: '#1B4D3E',
  primaryDark: '#143D32',
  /** Fond de pastille / aperçu — vert Jaguar très pâle */
  primarySoft: '#E3EDE8',
  text: '#1C1917',
  /** Secondary labels — darkened for cream/white contrast (lot 8) */
  textSecondary: '#57534E',
  /** Muted / captions — was too pale (#A8A29E) on crème */
  textMuted: '#78716C',
  /** Bordures — gris-vert neutre */
  border: '#D8E2DC',
  success: '#3F6B4A',
  successSoft: '#E4EFE7',
  /** Avertissement — graphite neutre */
  warning: '#3D4A44',
  warningSoft: '#ECEFED',
  danger: '#B42318',
  dangerSoft: '#FCE8E6',
  /** Chips non sélectionnées — vert très pâle */
  chip: '#E8EFEA',
  overlay: 'rgba(28, 25, 23, 0.45)',
  tabInactive: '#78716C',
  white: '#FFFFFF',
} as const;

export type ColorName = keyof typeof colors;
