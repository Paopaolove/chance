import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useChance } from '../data/ChanceContext';
import { colors, fonts, spacing, typography } from '../theme';
import { formatRatingLine } from '../utils/format';

interface Props {
  userId: string;
  firstName: string;
  /** When set, tapping opens reviews (caller handles nav). */
  onPress?: () => void;
  style?: object;
}

/** « 4,6 · 12 sorties » or new-user empty-state copy. */
export function RatingLine({ userId, firstName, onPress, style }: Props) {
  const { getRatingStats } = useChance();
  const stats = getRatingStats(userId);
  const label = formatRatingLine(firstName, stats.average, stats.outingCount);
  const isNew = stats.outingCount <= 0;

  const content = (
    <Text
      style={[styles.text, isNew && styles.newText, style]}
      numberOfLines={2}
    >
      {label}
    </Text>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        isNew ? label : `Avis · ${label}`
      }
      hitSlop={8}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: {
    ...typography.caption,
    color: colors.primaryDark,
    fontFamily: fonts.semiBold,
    marginTop: 2,
  },
  newText: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
  },
});
