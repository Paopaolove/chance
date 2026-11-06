import { TextStyle } from 'react-native';

export const fonts = {
  regular: 'InterTight_400Regular',
  medium: 'InterTight_500Medium',
  semiBold: 'InterTight_600SemiBold',
  bold: 'InterTight_700Bold',
  /** Mot-symbole « Moment » uniquement */
  brand: 'Fraunces_500Medium',
} as const;

export const typography = {
  hero: {
    fontFamily: fonts.bold,
    fontSize: 40,
    letterSpacing: -1.2,
    lineHeight: 44,
  } as TextStyle,
  title: {
    fontFamily: fonts.bold,
    fontSize: 28,
    letterSpacing: -0.6,
    lineHeight: 34,
  } as TextStyle,
  subtitle: {
    fontFamily: fonts.semiBold,
    fontSize: 18,
    lineHeight: 24,
  } as TextStyle,
  body: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
  } as TextStyle,
  bodyStrong: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    lineHeight: 24,
  } as TextStyle,
  caption: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
  } as TextStyle,
  small: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
  } as TextStyle,
} as const;
