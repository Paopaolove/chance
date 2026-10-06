import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { colors, fonts, radius, spacing, typography } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'primary' || variant === 'danger'
              ? colors.white
              : colors.text
          }
        />
      ) : (
        <Text
          style={[
            styles.label,
            (variant === 'primary' || variant === 'danger') &&
              styles.labelOnDark,
            variant === 'secondary' && styles.labelSecondary,
            variant === 'ghost' && styles.labelGhost,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
  label: {
    ...typography.bodyStrong,
    fontFamily: fonts.semiBold,
  },
  labelOnDark: { color: colors.white },
  labelSecondary: { color: colors.text },
  labelGhost: { color: colors.text },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primary },
  /** Secondaire = pilule contour #E4DDD2, texte #1C1917 (le vert reste au bouton principal). */
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.chipBorder,
  },
  ghost: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.chipBorder,
  },
  danger: { backgroundColor: colors.danger },
});
