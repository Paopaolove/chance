import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { colors, fonts, typography } from '../theme';

interface Props {
  children: React.ReactNode;
  /** Centre la ligne (états sous les boutons). */
  center?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

/**
 * Confirmation sobre : coche #1C1917 + texte foncé, sans fond plein.
 * L’orange plein reste réservé à l’action principale (CTA).
 */
export function CheckNote({ children, center, size = 16, style, textStyle }: Props) {
  return (
    <View style={[styles.row, center && styles.center, style]}>
      <Ionicons
        name="checkmark-circle"
        size={size}
        color={colors.text}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text style={[styles.text, textStyle]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  center: { justifyContent: 'center' },
  text: {
    ...typography.caption,
    color: colors.text,
    fontFamily: fonts.semiBold,
    flexShrink: 1,
  },
});
