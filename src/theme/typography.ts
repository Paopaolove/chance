import { TextStyle } from 'react-native';

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export const typography = {
  hero: {
    fontFamily: fonts.bold,
    fontSize: 34,
    letterSpacing: -0.6,
    lineHeight: 40,
  } as TextStyle,
  title: {
    fontFamily: fonts.bold,
    fontSize: 26,
    letterSpacing: -0.4,
    lineHeight: 32,
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
