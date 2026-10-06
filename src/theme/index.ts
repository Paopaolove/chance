import { colors } from './colors';
import { fonts, typography } from './typography';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  /** Marge d’écran (gauche/droite) */
  screen: 24,
  /** Entre deux blocs */
  block: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 28,
  /** Cartes : rayon 16 */
  card: 16,
  full: 999,
} as const;

export const theme = {
  colors,
  typography,
  fonts,
  spacing,
  radius,
} as const;

export { colors, typography, fonts };
