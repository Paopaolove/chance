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
  /**
   * underPhoto: short line under the avatar — « 5,0 · 2 sorties »
   * or « vient d’arriver » (no long Chance copy).
   */
  variant?: 'default' | 'underPhoto';
}

/** « 4,6 · 12 sorties » or new-user empty-state copy with branded « Chance ». */
export function RatingLine({
  userId,
  firstName,
  onPress,
  style,
  variant = 'default',
}: Props) {
  const { getRatingStats } = useChance();
  const stats = getRatingStats(userId);
  const isNew = stats.outingCount <= 0 || stats.average == null;
  const label = formatRatingLine(firstName, stats.average, stats.outingCount);

  let content: React.ReactNode;
  if (variant === 'underPhoto') {
    content = (
      <Text
        style={[styles.underPhoto, isNew && styles.underPhotoNew, style]}
        numberOfLines={2}
      >
        {isNew
          ? 'vient d’arriver'
          : `${formatRatingAverage(stats.average!)} · ${
              stats.outingCount === 1
                ? '1 sortie'
                : `${stats.outingCount} sorties`
            }`}
      </Text>
    );
  } else if (isNew) {
    content = (
      <Text style={[styles.text, styles.newText, style]} numberOfLines={2}>
        {`${firstName} vient d’arriver. Donne-lui sa `}
        <Text style={styles.chanceBrand}>Chance</Text>
        {'.'}
      </Text>
    );
  } else {
    content = (
      <Text style={[styles.text, style]} numberOfLines={2}>
        {`${formatRatingAverage(stats.average!)} · ${
          stats.outingCount === 1 ? '1 sortie' : `${stats.outingCount} sorties`
        }`}
      </Text>
    );
  }

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
  underPhoto: {
    ...typography.small,
    color: colors.primaryDark,
    fontFamily: fonts.semiBold,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 72,
  },
  underPhotoNew: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
  },
});
