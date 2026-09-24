import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useChance } from '../data/ChanceContext';
import { colors, fonts, typography } from '../theme';
import { formatRatingAverage, formatRatingLine } from '../utils/format';

interface Props {
  userId: string;
  firstName: string;
  /** When set, tapping opens reviews (caller handles nav). */
  onPress?: () => void;
  style?: object;
}

/** « 4,6 · 12 sorties » or new-user empty-state copy with branded « Chance ». */
export function RatingLine({ userId, firstName, onPress, style }: Props) {
  const { getRatingStats } = useChance();
  const stats = getRatingStats(userId);
  const isNew = stats.outingCount <= 0 || stats.average == null;
  const label = formatRatingLine(firstName, stats.average, stats.outingCount);

  const content = isNew ? (
    <Text style={[styles.text, styles.newText, style]} numberOfLines={2}>
      {`${firstName} vient d’arriver. Donne-lui sa `}
      <Text style={styles.chanceBrand}>Chance</Text>
      {'.'}
    </Text>
  ) : (
    <Text style={[styles.text, style]} numberOfLines={2}>
      {`${formatRatingAverage(stats.average!)} · ${
        stats.outingCount === 1 ? '1 sortie' : `${stats.outingCount} sorties`
      }`}
    </Text>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={isNew ? label : `Avis · ${label}`}
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
  chanceBrand: {
    color: colors.primary,
    fontFamily: fonts.bold,
  },
});
