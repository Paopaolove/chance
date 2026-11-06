import { colors, categoryColors } from './colors';
import { fonts, typography } from './typography';

export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  /** Marge d’écran (gauche/droite) */
  screen: 24,
  /** Entre deux blocs */
  block: 32,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  /** Cartes : rayon 16 (Pro md) */
  card: 16,
  full: 999,
} as const;

export const theme = {
  colors,
  categoryColors,
  typography,
  fonts,
  spacing,
  radius,
} as const;

export { colors, categoryColors, typography, fonts };
