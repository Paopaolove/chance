import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { useChance } from '../data/ChanceContext';
import { mockHosts } from '../data/mockOutings';
import { OutingCategory } from '../data/types';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { dispoSlotCreatePrefill } from '../utils/dispo';
import { formatRatingAverage } from '../utils/format';
import { hostPhotoSize } from '../utils/subscription';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type R = RouteProp<RootStackParamList, 'HostProfile'>;

function stars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

export function HostProfileScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const { userId } = route.params;
  const {
    state,
    getReviewsForUser,
    getRatingStats,
    getDisplayName,
    reportUser,
    blockUser,
    isBlocked,
    peopleDispo,
  } = useChance();
  const [reportReason, setReportReason] = useState('');
  const [reportOpen, setReportOpen] = useState(false);

  const host = useMemo(() => {
    if (state.currentUser?.id === userId) return state.currentUser;
    return mockHosts.find((h) => h.id === userId) ?? null;
  }, [state.currentUser, userId]);

  const outingFallback = useMemo(
    () => state.outings.find((o) => o.hostId === userId),
    [state.outings, userId],
  );

  const firstName =
    host?.firstName ??
    outingFallback?.hostName ??
    getDisplayName(userId);
  const age = host?.age ?? outingFallback?.hostAge;
  const bio = host?.bio?.trim() ? host.bio : undefined;
  const neighborhood =
    host?.neighborhood ?? outingFallback?.neighborhood ?? undefined;
  const photoUri = host?.photoUri;

  const reviews = getReviewsForUser(userId);
  const stats = getRatingStats(userId);
  const isNew = stats.outingCount <= 0 || stats.average == null;
  const photoSize = Math.max(72, hostPhotoSize(state.currentUser));

  /** Prefer open, else first active (open | full). */
  const activeOuting = useMemo(() => {
    const open = state.outings.find(
      (o) => o.hostId === userId && o.status === 'open',
    );
    if (open) return open;
    return state.outings.find(
      (o) => o.hostId === userId && o.status === 'full',
    );
  }, [state.outings, userId]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: firstName || 'Profil' });
  }, [navigation, firstName]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <View style={styles.hero}>
        <Avatar
          name={firstName}
          photoUri={photoUri}
          seed={userId}
          size={photoSize}
        />
        <Text style={styles.name}>
          {firstName}
          {age != null ? ` · ${age}` : ''}
        </Text>
        {neighborhood ? (
          <Text style={styles.quartier}>{neighborhood}</Text>
        ) : null}
        {bio ? <Text style={styles.bio}>{bio}</Text> : null}
      </View>

      {activeOuting ? (
        <Button
          title="Voir sa sortie"
          variant="ghost"
          onPress={() =>
            navigation.navigate('OutingDetail', { outingId: activeOuting.id })
          }
          style={styles.cta}
        />
      ) : null}

      {(() => {
        const me = state.currentUser;
        if (!me || me.id === userId) return null;
        const dispoPerson = peopleDispo.find((p) => p.id === userId);
        if (!dispoPerson) return null;
        const cats = dispoPerson.dispoCategories?.length
          ? dispoPerson.dispoCategories
          : [];
        const primary = (
          cats.includes('autre') ? 'autre' : (cats[0] ?? 'restaurant')
        ) as OutingCategory;
        const slot = dispoPerson.dispoSlot ?? 'soir';
        const slotPrefill = dispoSlotCreatePrefill(slot);
        return (
          <Button
            title={`Proposer une sortie à ${firstName}`}
            onPress={() =>
              navigation.navigate('MainTabs', {
                screen: 'Create',
                params: {
                  fromDispo: true,
                  inviteeUserId: dispoPerson.id,
                  inviteeName: dispoPerson.firstName,
                  category: primary,
                  categoryDetail:
                    primary === 'autre'
                      ? dispoPerson.dispoCategoryDetail
                      : undefined,
                  neighborhood:
                    dispoPerson.dispoNeighborhood ??
                    dispoPerson.neighborhood,
                  budgetMaxEuros: dispoPerson.dispoBudgetMax ?? 25,
                  topic: dispoPerson.dispoTopic,
                  excludedTopics: dispoPerson.dispoExclusions?.join(', '),
                  timeLabel: slotPrefill.timeLabel,
                  dateOffsetDays: slotPrefill.dateOffsetDays,
                },
              })
            }
            style={styles.cta}
          />
        );
      })()}

      {state.currentUser && state.currentUser.id !== userId ? (
        <View style={styles.moderation}>
          <Text style={styles.moderationNote}>
            Signaler ou bloquer n’affecte pas la note publique. Un signalement =
            une action (pas de multi-sanctions inventées).
          </Text>
          {isBlocked(userId) ? (
            <Text style={styles.blockedLabel}>Tu as bloqué {firstName}.</Text>
          ) : (
            <Button
              title="Bloquer"
              variant="ghost"
              onPress={() => {
                Alert.alert(
                  `Bloquer ${firstName} ?`,
                  'Tu ne verras plus sa dispo. Cela ne change pas les notes.',
                  [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Bloquer',
                      style: 'destructive',
                      onPress: () => {
                        const r = blockUser(userId);
                        if (r.ok) {
                          Alert.alert('Bloqué', `${firstName} est bloqué (démo).`);
                        }
                      },
                    },
                  ],
                );
              }}
              style={{ marginBottom: spacing.sm }}
            />
          )}
          {reportOpen ? (
            <View style={styles.reportBox}>
              <Text style={styles.label}>Motif du signalement</Text>
              <TextInput
                style={styles.input}
                value={reportReason}
                onChangeText={setReportReason}
                placeholder="Décris le problème…"
                placeholderTextColor={colors.textMuted}
                multiline
              />
              <Button
                title="Envoyer le signalement"
                variant="secondary"
                onPress={() => {
                  const r = reportUser(userId, reportReason);
                  if (!r.ok) {
                    Alert.alert(
                      'Impossible',
                      r.reason === 'empty_reason'
                        ? 'Indique un motif.'
                        : r.reason,
                    );
                    return;
                  }
                  setReportOpen(false);
                  setReportReason('');
                  Alert.alert(
                    'Signalement enregistré',
                    'Privé — n’apparaît pas comme une note. Un seul enregistrement (démo).',
                  );
                }}
              />
              <Button
                title="Annuler"
                variant="ghost"
                onPress={() => setReportOpen(false)}
                style={{ marginTop: spacing.sm }}
              />
            </View>
          ) : (
            <Button
              title="Signaler"
              variant="ghost"
              onPress={() => setReportOpen(true)}
            />
          )}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Avis rencontre</Text>
        {isNew ? (
          <Text style={[styles.stats, styles.statsNew]}>
            {`${firstName} vient d’arriver. Donne-lui sa `}
            <Text style={styles.chanceBrand}>Chance</Text>
            {'.'}
          </Text>
        ) : (
          <Text style={styles.stats}>
            {`${formatRatingAverage(stats.average!)} · ${
              stats.outingCount === 1
                ? '1 sortie'
                : `${stats.outingCount} sorties`
            }`}
          </Text>
        )}
        <Text style={styles.statsNote}>
          Les notes parlent du respect en sortie, pas d’un crush. « X sorties »
          = sorties honorées (terminées), pas le nombre d’avis.
        </Text>
      </View>

      {!reviews.length ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Pas encore d’avis</Text>
          <Text style={styles.emptySub}>
            {`${firstName} vient d’arriver. Donne-lui sa `}
            <Text style={styles.chanceBrand}>Chance</Text>
            {'.'}
          </Text>
        </View>
      ) : (
        reviews.map((review) => {
          const fromName = getDisplayName(review.fromUserId);
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
                        Réponse de {firstName}
                      </Text>
                      <Text style={styles.replyText}>{review.reply}</Text>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  name: {
    ...typography.title,
    fontFamily: fonts.semiBold,
    color: colors.text,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  quartier: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  bio: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  cta: { marginBottom: spacing.lg },
  moderation: {
    marginBottom: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  moderationNote: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  blockedLabel: {
    ...typography.bodyStrong,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  reportBox: { marginTop: spacing.sm, gap: spacing.sm },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 80,
    ...typography.body,
    color: colors.text,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  section: { marginBottom: spacing.md },
  sectionTitle: {
    ...typography.subtitle,
    fontFamily: fonts.semiBold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  stats: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
    fontFamily: fonts.semiBold,
  },
  statsNew: {
    color: colors.textSecondary,
    fontFamily: fonts.medium,
  },
  chanceBrand: {
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  statsNote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
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
});
