import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useChance } from '../data/ChanceContext';
import {
  PLAN_OFFERS,
  PRICING,
  SubscribeablePlanId,
} from '../data/pricing';
import { PlanInterval } from '../data/types';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';
import {
  isTrialActive,
  outingCreditsOf,
  trialDaysRemaining,
} from '../utils/subscription';
import { planLabel } from '../utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type R = RouteProp<RootStackParamList, 'Paywall'>;

type IntervalChoice = PlanInterval;

export function PaywallScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const returnRequestId = route.params?.returnToConfirmRequestId;
  const { state, subscribe } = useChance();
  const user = state.currentUser;
  const [interval, setInterval] = useState<IntervalChoice>('month');

  const trialActive = isTrialActive(user);
  const daysLeft = trialDaysRemaining(user);
  const current = user?.plan;

  const afterSubscribe = (planTitle: string) => {
    Alert.alert(
      'Formule activée (démo)',
      `${planTitle} — aucun paiement réel. Stripe arrivera plus tard.`,
      [
        {
          text: 'OK',
          onPress: () => {
            if (returnRequestId) {
              navigation.replace('ConfirmSlot', {
                requestId: returnRequestId,
              });
            } else {
              navigation.goBack();
            }
          },
        },
      ],
    );
  };

  const onSelect = (id: SubscribeablePlanId) => {
    if (id === 'payg') {
      subscribe('payg', null);
      afterSubscribe(`${PRICING.payg.title} · ${PRICING.payg.priceLabel}`);
      return;
    }
    subscribe(id, interval);
    const label =
      id === 'essentiel'
        ? interval === 'year'
          ? PRICING.essentiel.labelYear
          : PRICING.essentiel.labelMonth
        : interval === 'year'
          ? PRICING.illimite.labelYear
          : PRICING.illimite.labelMonth;
    afterSubscribe(label);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>Choisis ta formule</Text>
      <Text style={styles.sub}>
        Après l’essai, confirme une place avec À la sortie, Essentiel ou
        Illimité. Publier une annonce reste gratuit. Caution{' '}
        {PRICING.deposit.euros} € à la confirmation (mock).
      </Text>

      {trialActive ? (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Essai en cours</Text>
          <Text style={styles.bannerBody}>
            {daysLeft === 1
              ? 'Il te reste 1 jour d’essai illimité.'
              : `Il te reste ${daysLeft} jours d’essai illimité.`}
          </Text>
        </View>
      ) : (
        <View style={[styles.banner, styles.bannerWarn]}>
          <Text style={styles.bannerTitle}>Essai terminé</Text>
          <Text style={styles.bannerBody}>
            Choisis une formule pour confirmer une place (hôte : publication
            gratuite).
          </Text>
        </View>
      )}

      {user ? (
        <Text style={styles.current}>
          Actuelle : {planLabel(user.plan)}
          {user.plan === 'essentiel'
            ? ` · ${outingCreditsOf(user)} crédit${
                outingCreditsOf(user) === 1 ? '' : 's'
              }`
            : ''}
          {user.planInterval === 'year'
            ? ' · annuel'
            : user.planInterval === 'month'
              ? ' · mensuel'
              : ''}
        </Text>
      ) : null}

      <View style={styles.intervalRow}>
        <Text style={styles.intervalLabel}>Facturation</Text>
        <View style={styles.segment}>
          <Pressable
            style={[
              styles.segmentBtn,
              interval === 'month' && styles.segmentOn,
            ]}
            onPress={() => setInterval('month')}
          >
            <Text
              style={[
                styles.segmentText,
                interval === 'month' && styles.segmentTextOn,
              ]}
            >
              Mensuel
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.segmentBtn,
              interval === 'year' && styles.segmentOn,
            ]}
            onPress={() => setInterval('year')}
          >
            <Text
              style={[
                styles.segmentText,
                interval === 'year' && styles.segmentTextOn,
              ]}
            >
              Annuel
            </Text>
          </Pressable>
        </View>
      </View>

      {PLAN_OFFERS.map((p) => {
        const active =
          current === p.id &&
          (p.kind === 'payg' ||
            (user?.planInterval ?? 'month') === interval);
        const priceLine =
          p.kind === 'payg'
            ? p.priceLabel!
            : interval === 'year'
              ? p.yearLabel!
              : p.monthLabel!;
        return (
          <View
            key={p.id}
            style={[styles.card, active && styles.cardActive]}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.planTitle}>{p.title}</Text>
              {active ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Actuelle</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.price}>{priceLine}</Text>
            {p.kind === 'subscription' &&
            interval === 'month' &&
            p.yearLabel ? (
              <Text style={styles.yearHint}>{p.yearLabel}</Text>
            ) : null}
            <Text style={styles.detail}>{p.detail}</Text>
            {p.id === 'essentiel' && interval === 'month' ? (
              <Text style={styles.detail}>
                {PRICING.essentiel.outingsPerMonth} sorties / mois
              </Text>
            ) : null}
            <Button
              title={
                p.kind === 'payg'
                  ? 'Acheter 1 sortie'
                  : active
                    ? 'Sélectionnée'
                    : 'S’abonner'
              }
              variant={active && p.kind !== 'payg' ? 'secondary' : 'primary'}
              onPress={() => onSelect(p.id)}
              disabled={active && p.kind !== 'payg'}
              style={{ marginTop: spacing.md }}
            />
          </View>
        );
      })}

      <Text style={styles.fine}>
        Le premier mois est offert, sans limite. Publier une invitation est
        gratuit.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  title: { ...typography.title, color: colors.text },
  sub: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  banner: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  bannerWarn: {
    backgroundColor: colors.warningSoft,
  },
  bannerTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  bannerBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  current: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  intervalRow: {
    marginBottom: spacing.lg,
  },
  intervalLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: radius.full,
  },
  segmentOn: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  segmentTextOn: {
    color: colors.white,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planTitle: { ...typography.subtitle, color: colors.text },
  badge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: { ...typography.small, color: colors.white },
  price: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
    marginTop: spacing.sm,
  },
  detail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  yearHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  fine: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
