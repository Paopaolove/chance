import React from 'react';
import {
  Image,
  ImageStyle,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, fonts } from '../theme';


interface Props {
  name: string;
  photoUri?: string;
  size?: number;
  seed?: string;
  style?: ViewStyle | ImageStyle;
}

export function Avatar({ name, photoUri, size = 48, seed, style }: Props) {
  const initial = (name || '?').charAt(0).toUpperCase();
  // Initiale sur fond blanc + liseré (plus de verts pâles) ; `seed` gardé pour l’API.
  void seed;
  const fontSize = Math.round(size * 0.38);

  if (photoUri) {
    return (
      <Image
        source={{ uri: photoUri }}
        style={[
          styles.image,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
          style as ImageStyle,
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
    >
      <Text style={[styles.initial, { fontSize, lineHeight: fontSize + 4 }]}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.chip,
  },
  fallback: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
});
