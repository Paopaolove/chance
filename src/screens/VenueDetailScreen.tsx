import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useChance } from '../data/ChanceContext';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { formatRatingAverage } from '../utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type R = RouteProp<RootStackParamList, 'VenueDetail'>;

function stars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

export function VenueDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const { getVenueReviews, getVenueRatingStats } = useChance();
  const { venueKey, venueName, neighborhood } = route.params;
  const reviews = getVenueReviews(venueKey);
  const stats = getVenueRatingStats(venueKey);
  const isEmpty = stats.reviewCount <= 0 || stats.average == null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>{venueName}</Text>
      {neighborhood ? (
        <Text style={styles.neighborhood}>{neighborhood}</Text>
      ) : null}

      {isEmpty ? (
        <Text style={styles.headerEmpty}>Pas encore d’avis sur ce lieu</Text>
      ) : (
        <Text style={styles.header}>
          {`${formatRatingAverage(stats.average!)} · ${
            stats.reviewCount === 1
              ? '1 avis'
              : `${stats.reviewCount} avis`
          }`}
        </Text>
      )}
      <Text style={styles.sub}>
        Avis sur le lieu uniquement — cuisine, bruit, accueil. Les notes
        personnes sont sur les profils.
      </Text>

      {!reviews.length ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Aucun commentaire lieu</Text>
          <Text style={styles.emptySub}>
            Les avis lieu apparaîtront ici après les sorties.
          </Text>
        </View>
      ) : (
        reviews.map((review) => (
          <View key={review.id} style={styles.card}>
            <Text style={styles.stars}>
              {stars(review.venueRating ?? 0)}
            </Text>
            <Text style={styles.meta}>
              {new Date(review.createdAt).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </Text>
            {review.venueComment ? (
              <Text style={styles.comment}>{review.venueComment}</Text>
            ) : (
              <Text style={styles.noComment}>Sans commentaire</Text>
            )}
          </View>
        ))
      )}

      <Button
        title="Fermer"
        variant="ghost"
        onPress={() => navigation.goBack()}
        style={{ marginTop: spacing.lg }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  title: {
    ...typography.hero,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  neighborhood: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  header: {
    ...typography.subtitle,
    color: colors.text,
    fontFamily: fonts.semiBold,
  },
  headerEmpty: {
    ...typography.subtitle,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
  },
  sub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  emptyWrap: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  emptyTitle: {
    ...typography.subtitle,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptySub: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  stars: {
    fontSize: 18,
    color: colors.primaryDark,
    letterSpacing: 2,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  comment: { ...typography.body, color: colors.text },
  noComment: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
});
