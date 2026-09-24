import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { useChance } from '../data/ChanceContext';
import { Review } from '../data/types';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { formatRatingAverage } from '../utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type R = RouteProp<RootStackParamList, 'Reviews'>;

function stars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

export function ReviewsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const {
    state,
    getReviewsForUser,
    getRatingStats,
    getDisplayName,
    replyToReview,
    requestHideReviewText,
    simulateOtherHideConsent,
  } = useChance();
  const { userId, userName } = route.params;
  const reviews = getReviewsForUser(userId);
  const stats = getRatingStats(userId);
  const me = state.currentUser;
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const isNew = stats.outingCount <= 0 || stats.average == null;

  const onReply = (review: Review) => {
    const text = (replyDrafts[review.id] ?? '').trim();
    if (!text) {
      Alert.alert('Réponse vide', 'Écris une courte réponse.');
      return;
    }
    const result = replyToReview(review.id, text);
    if (!result.ok) {
      const messages: Record<string, string> = {
        already_replied: 'Une seule réponse est autorisée.',
        not_owner: 'Seul le profil noté peut répondre.',
        text_hidden: 'Texte masqué — réponse impossible.',
        empty: 'Écris une courte réponse.',
        not_found: 'Avis introuvable.',
        no_user: 'Profil manquant.',
      };
      Alert.alert('Impossible', messages[result.reason] ?? result.reason);
      return;
    }
    setReplyDrafts((d) => {
      const next = { ...d };
      delete next[review.id];
      return next;
    });
    Alert.alert(
      'Réponse publiée',
      'Une seule réponse, non modifiable.',
    );
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {isNew ? (
        <Text style={[styles.header, styles.headerNew]}>
          {`${userName} vient d’arriver. Donne-lui sa `}
          <Text style={styles.chanceBrand}>Chance</Text>
          {'.'}
        </Text>
      ) : (
        <Text style={styles.header}>
          {`${formatRatingAverage(stats.average!)} · ${
            stats.outingCount === 1
              ? '1 sortie'
              : `${stats.outingCount} sorties`
          }`}
        </Text>
      )}
      <Text style={styles.sub}>
        Commentaire et réponse non modifiables. Le texte peut être masqué
        d’un commun accord — la note et le nombre de sorties restent.
      </Text>

      {!reviews.length ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Pas encore d’avis</Text>
          <Text style={styles.emptySub}>
            {`${userName} vient d’arriver. Donne-lui sa `}
            <Text style={styles.chanceBrand}>Chance</Text>
            {'.'}
          </Text>
        </View>
      ) : (
        reviews.map((review) => {
          const fromName = getDisplayName(review.fromUserId);
          const canReply =
            me?.id === review.toUserId && !review.reply && !review.textHidden;
          const isParty =
            !!me &&
            (me.id === review.fromUserId || me.id === review.toUserId);
          const hasText = !!(review.comment || review.reply);
          const myConsent = !!(
            me &&
            (review.hideTextConsentUserIds ?? []).includes(me.id)
          );
          const canRequestHide =
            isParty && !review.textHidden && hasText && !myConsent;
          const waitingOther =
            isParty && !review.textHidden && hasText && myConsent;

          return (
            <View key={review.id} style={styles.card}>
              <Text style={styles.stars}>{stars(review.rating)}</Text>
              <Text style={styles.meta}>
                {fromName} ·{' '}
                {new Date(review.createdAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>

              {review.textHidden ? (
                <Text style={styles.hidden}>
                  Texte masqué d’un commun accord. La note est conservée.
                </Text>
              ) : (
                <>
                  {review.comment ? (
                    <Text style={styles.comment}>{review.comment}</Text>
                  ) : (
                    <Text style={styles.noComment}>Sans commentaire</Text>
                  )}
                  {review.reply ? (
                    <View style={styles.replyBox}>
                      <Text style={styles.replyLabel}>
                        Réponse de {userName}
                      </Text>
                      <Text style={styles.replyText}>{review.reply}</Text>
                    </View>
                  ) : null}
                </>
              )}

              {canReply ? (
                <View style={styles.replyForm}>
                  <TextInput
                    style={styles.input}
                    placeholder="Une réponse (1 max)…"
                    placeholderTextColor={colors.textMuted}
                    value={replyDrafts[review.id] ?? ''}
                    onChangeText={(t) =>
                      setReplyDrafts((d) => ({ ...d, [review.id]: t }))
                    }
                    multiline
                  />
                  <Button
                    title="Répondre"
                    variant="secondary"
                    onPress={() => onReply(review)}
                  />
                </View>
              ) : null}

              {canRequestHide ? (
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      'Masquer le texte',
                      'Les deux personnes doivent accepter. Seul le texte disparaît — la note et le nombre de sorties restent.',
                      [
                        { text: 'Annuler', style: 'cancel' },
                        {
                          text: 'Donner mon accord',
                          onPress: () => {
                            const result = requestHideReviewText(review.id);
                            if (!result.ok) {
                              Alert.alert('Impossible', result.reason);
                              return;
                            }
                            if (result.hidden) {
                              Alert.alert(
                                'Texte masqué',
                                'Accord mutuel — la note est conservée.',
                              );
                            } else {
                              Alert.alert(
                                'En attente',
                                'Ton accord est enregistré. L’autre personne doit aussi accepter.',
                              );
                            }
                          },
                        },
                      ],
                    );
                  }}
                  style={styles.hideBtn}
                >
                  <Text style={styles.hideText}>
                    Demander à masquer le texte
                  </Text>
                </Pressable>
              ) : null}

              {waitingOther ? (
                <View style={styles.waitingBox}>
                  <Text style={styles.waitingHide}>
                    En attente de l’accord de l’autre personne. La note et le
                    compteur de sorties restent.
                  </Text>
                  <Pressable
                    onPress={() => {
                      const result = simulateOtherHideConsent(review.id);
                      if (!result.ok) {
                        Alert.alert('Impossible', result.reason);
                        return;
                      }
                      Alert.alert(
                        result.hidden ? 'Texte masqué' : 'En attente',
                        result.hidden
                          ? 'Accord mutuel simulé — texte masqué, note conservée.'
                          : 'Accord de l’autre enregistré.',
                      );
                    }}
                    style={styles.hideBtn}
                  >
                    <Text style={styles.hideText}>
                      Démo · simuler accord de l’autre
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })
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
  header: {
    ...typography.subtitle,
    color: colors.text,
    fontFamily: fonts.semiBold,
  },
  headerNew: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
  },
  chanceBrand: {
    color: colors.primary,
    fontFamily: fonts.bold,
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
  hidden: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  replyBox: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  replyLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontFamily: fonts.semiBold,
    marginBottom: 4,
  },
  replyText: { ...typography.body, color: colors.text },
  replyForm: { marginTop: spacing.md, gap: spacing.sm },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 72,
    ...typography.body,
    color: colors.text,
    textAlignVertical: 'top',
  },
  hideBtn: { marginTop: spacing.md },
  hideText: {
    ...typography.caption,
    color: colors.primary,
    fontFamily: fonts.semiBold,
  },
  waitingBox: { marginTop: spacing.sm },
  waitingHide: {
    ...typography.caption,
    color: colors.warning,
  },
});
