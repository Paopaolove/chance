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

const AVATAR_COLORS = [
  '#F5E6DC',
  '#E4EFE7',
  '#F0EBE4',
  '#F8E9C9',
  '#EDE4F0',
  '#E6F0ED',
];

interface Props {
  name: string;
  photoUri?: string;
  size?: number;
  seed?: string;
  style?: ViewStyle | ImageStyle;
}

export function Avatar({ name, photoUri, size = 48, seed, style }: Props) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const colorKey = seed ?? name;
  const colorIndex =
    Math.abs(
      colorKey.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0),
    ) % AVATAR_COLORS.length;
  const avatarBg = AVATAR_COLORS[colorIndex];
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
          backgroundColor: avatarBg,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
});
