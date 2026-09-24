import { ViewStyle } from 'react-native';
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
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

export const shadows = {
  card: {
    shadowColor: '#222222',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  } as ViewStyle,
  soft: {
    shadowColor: '#222222',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  } as ViewStyle,
} as const;

export const theme = {
  colors,
  typography,
  fonts,
  spacing,
  radius,
  shadows,
} as const;

export { colors, typography, fonts };
