import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Review } from '../data/types';
import { colors, fonts, spacing, typography } from '../theme';
import { formatGivenReviewScores } from '../utils/format';

type Props = {
  review: Review;
  onPressVoirAvis: () => void;
  style?: object;
};

/** Après envoi d’un avis : notes + lien « Voir l’avis » (pas d’édition). */
export function GivenReviewSummary({
  review,
  onPressVoirAvis,
  style,
}: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.scores}>{formatGivenReviewScores(review)}</Text>
      <Pressable
        onPress={onPressVoirAvis}
        accessibilityRole="link"
        accessibilityLabel="Voir l’avis"
        hitSlop={8}
      >
        <Text style={styles.link}>Voir l’avis</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  scores: {
    ...typography.body,
    color: colors.text,
    fontFamily: fonts.semiBold,
  },
  link: {
    ...typography.caption,
    color: colors.primaryDark,
    fontFamily: fonts.semiBold,
    textDecorationLine: 'underline',
  },
});
