import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { useFirstMomentGate } from '../components/FirstMomentSheet';
import { DEPOSIT_EUROS, useChance } from '../data/ChanceContext';
import { mockHosts } from '../data/mockOutings';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { formatCountdown } from '../utils/format';
import { useOpenUserProfile } from '../utils/openUserProfile';
import { isStartsAtPast } from '../utils/parisTime';
import { isUrgentOnSite } from '../utils/outingActive';
import { isPartnerListing, partnerListingChips } from '../utils/partners';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type R = RouteProp<RootStackParamList, 'ConfirmSlot'>;

function remainingMs(deadlineIso: string | undefined, nowMs: number): number {
  if (!deadlineIso) return 0;
  return Math.max(0, new Date(deadlineIso).getTime() - nowMs);
}

export function ConfirmSlotScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const openProfile = useOpenUserProfile();
  const {
    getRequestById,
    getOutingById,
    confirmSlot,
    expireRequestIfNeeded,
    showToast,
    canConfirmOuting,
    state,
  } = useChance();
  const request = getRequestById(route.params.requestId);
  const outing = request ? getOutingById(request.outingId) : undefined;
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(false);
  const [noSpot, setNoSpot] = useState(false);
  const { requireBeforeMoment, sheet: firstMomentSheet } = useFirstMomentGate();

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!request || request.status !== 'accepted' || !request.confirmDeadlineAt) {
      return;
    }
    if (now > new Date(request.confirmDeadlineAt).getTime()) {
      expireRequestIfNeeded(request.id);
      setExpired(true);
    }
  }, [now, request, expireRequestIfNeeded]);

  const goFeed = () => {
    navigation.navigate('MainTabs', { screen: 'Feed' });
  };

  useEffect(() => {
    if (!(expired || request?.status === 'expired')) return;
    const t = setTimeout(goFeed, 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired, request?.status]);

  if (!request || !outing) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.body}>Demande introuvable.</Text>
      </SafeAreaView>
    );
  }

  const partner = isPartnerListing(outing);

  if (noSpot || (partner && request.partnerNoSpot)) {
    return (
      <SafeAreaView style={styles.wrap}>
        <View style={styles.centerBlock}>
          <Text style={styles.hero}>Plus de place</Text>
          <Text style={styles.bodyCenter}>
            Quelqu’un a confirmé juste avant toi. Ta caution n’a pas été
            bloquée (ou t’est rendue immédiatement).
          </Text>
        </View>
        <Button title="Retour aux annonces" onPress={goFeed} />
      </SafeAreaView>
    );
  }

  if (done || request.status === 'confirmed') {
    return (
      <SafeAreaView style={styles.wrap}>
        <View style={styles.centerBlock}>
          <Text style={styles.hero}>{partner ? 'Ta place est prise' : 'C’est noté'}</Text>
          <Text style={styles.bodyCenter}>
            {partner
              ? 'Le lieu n’a rien à valider. Le chat est déjà ouvert et l’adresse exacte est visible sur la sortie. Sur place : « Je suis arrivé » dès 15 min avant.'
              : 'Le chat s’ouvrira 1 heure avant. L’adresse exacte est maintenant visible sur la sortie.'}
          </Text>
        </View>
        <Button
          title="Voir le moment"
          onPress={() =>
            navigation.replace('OutingDetail', { outingId: outing.id })
          }
        />
      </SafeAreaView>
    );
  }

  // Urgent: startsAt is « now » — still confirmable while open/full (H+30 window).
  const urgentBlocked =
    isUrgentOnSite(outing) &&
    outing.status !== 'open' &&
    outing.status !== 'full';
  const normalPast =
    !isUrgentOnSite(outing) && isStartsAtPast(outing.startsAt);

  if (
    outing.status === 'completed' ||
    outing.status === 'cancelled' ||
    urgentBlocked ||
    normalPast
  ) {
    return (
      <SafeAreaView style={styles.wrap}>
        <View style={styles.centerBlock}>
          <Text style={styles.hero}>Trop tard</Text>
          <Text style={styles.bodyCenter}>
            {outing.status === 'completed'
              ? 'Cette sortie est terminée — confirmation impossible.'
              : outing.status === 'cancelled'
                ? 'Cette sortie est annulée — confirmation impossible.'
                : isUrgentOnSite(outing)
                  ? 'Cette invitation urgente n’accepte plus de confirmation.'
                  : 'L’heure de la sortie est passée — tu ne peux plus confirmer.'}
          </Text>
        </View>
        <Button title="Retour aux annonces" onPress={goFeed} />
      </SafeAreaView>
    );
  }

  if (expired || request.status === 'expired') {
    return (
      <SafeAreaView style={styles.wrap}>
        <View style={styles.centerBlock}>
          <Text style={styles.hero}>Place libérée.</Text>
        </View>
        <Button title="Retour au fil" onPress={goFeed} />
      </SafeAreaView>
    );
  }

  if (request.status !== 'accepted') {
    return (
      <SafeAreaView style={styles.wrap}>
        <View style={styles.centerBlock}>
          <Text style={styles.hero}>Pas encore</Text>
          <Text style={styles.bodyCenter}>
            Cette demande n’est pas en attente de confirmation.
          </Text>
        </View>
        <Button title="Retour" onPress={() => navigation.goBack()} />
      </SafeAreaView>
    );
  }

  const leftMs = remainingMs(request.confirmDeadlineAt, now);
  const underOneMinute = leftMs > 0 && leftMs < 60_000;
  const countdown = request.confirmDeadlineAt
    ? formatCountdown(request.confirmDeadlineAt, now)
    : '--:--';

  const gate = canConfirmOuting();

  // Pas de téléphone (plus demandé à l’entrée) → on le demande ici, sans la
  // photo, puis on confirme. Rien ne change sur la caution / les 10 min.
  const onConfirm = () => requireBeforeMoment(submitConfirm, 'phoneOnly');

  const submitConfirm = () => {
    if (!gate.ok) {
      navigation.navigate('Paywall', {
        returnToConfirmRequestId: request.id,
      });
      return;
    }
    const result = confirmSlot(request.id);
    if (!result.ok) {
      if (result.reason === 'paywall') {
        navigation.navigate('Paywall', {
          returnToConfirmRequestId: request.id,
        });
        return;
      }
      if (result.reason === 'no_spot') {
        showToast(
          'Plus de place',
          'Quelqu’un a confirmé juste avant toi — caution non bloquée.',
        );
        setNoSpot(true);
        return;
      }
      if (result.reason === 'race_lost') {
        showToast(
          'Place prise',
          'Une autre confirmation est arrivée avant (1er timestamp gagne).',
        );
        setExpired(true);
        return;
      }
      if (
        result.reason === 'outing_started' ||
        result.reason === 'outing_finished'
      ) {
        showToast(
          'Trop tard',
          result.reason === 'outing_finished'
            ? 'Cette sortie est terminée.'
            : 'L’heure de la sortie est passée — confirmation impossible.',
        );
        setExpired(true);
        return;
      }
      setExpired(true);
      return;
    }
    setDone(true);
  };

  // Minimal paywall path when gate not ok
  const hostPhotoUri =
    state.currentUser?.id === outing.hostId
      ? state.currentUser.photoUri
      : mockHosts.find((h) => h.id === outing.hostId)?.photoUri;

  if (!gate.ok) {
    return (
      <SafeAreaView style={styles.wrap}>
        <View style={styles.centerBlock}>
          <Pressable
            style={styles.hostRow}
            onPress={() => openProfile(outing.hostId)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Voir le profil de ${outing.hostName}`}
          >
            <Avatar
              name={outing.hostName}
              photoUri={hostPhotoUri}
              seed={outing.hostId}
              size={56}
            />
            <View style={styles.hostText}>
              <Text style={styles.hostName}>{outing.hostName}</Text>
              <Text style={styles.hostMeta}>{outing.title}</Text>
            </View>
          </Pressable>
          <Text
            style={[
              styles.countdown,
              underOneMinute && styles.countdownDanger,
            ]}
          >
            {countdown}
          </Text>
          <Text style={styles.bodyCenter}>
            {gate.message ?? 'Choisis une formule pour confirmer ta place.'}
          </Text>
        </View>
        <Button
          title="Voir les formules"
          onPress={() =>
            navigation.navigate('Paywall', {
              returnToConfirmRequestId: request.id,
            })
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.wrap}>
      {firstMomentSheet}
      <View style={styles.centerBlock}>
        <Pressable
          style={styles.hostRow}
          onPress={() => openProfile(outing.hostId)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Voir le profil de ${outing.hostName}`}
        >
          <Avatar
            name={outing.hostName}
            photoUri={hostPhotoUri}
            seed={outing.hostId}
            size={56}
          />
          <View style={styles.hostText}>
            <Text style={styles.hostName}>
              {outing.hostName}
              {partner ? ' · Partenaire' : ''}
            </Text>
            <Text style={styles.hostMeta}>
              {outing.title}
              {partner && partnerListingChips(outing).length
                ? ` · ${partnerListingChips(outing).join(' · ')}`
                : ''}
            </Text>
          </View>
        </Pressable>
        <Text
          style={[styles.countdown, underOneMinute && styles.countdownDanger]}
          accessibilityRole="timer"
        >
          {countdown}
        </Text>
        {partner ? (
          <Text style={styles.depositSub}>
            {outing.spotsLeft > 0
              ? `${outing.spotsLeft} place${outing.spotsLeft > 1 ? 's' : ''} encore libre${outing.spotsLeft > 1 ? 's' : ''} — la place est prise à ta confirmation (premier confirmé, premier servi).`
              : 'Plus de place pour l’instant.'}
          </Text>
        ) : null}
        <Text style={styles.depositSub}>
          Caution {DEPOSIT_EUROS} € (ce n’est pas l’invitation). Rendue si tu
          viens, si tu annules au moins 3 heures avant, ou si {partner ? 'le lieu' : 'l’hôte'} annule.
          Perdue si trop tard ou absence : 6,90 € Moment / 13,10 € {partner ? 'lieu' : 'hôte'}.
        </Text>
      </View>
      <Button title={partner ? 'Je confirme ma venue' : 'Je confirme'} onPress={onConfirm} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  wrap: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    justifyContent: 'space-between',
  },
  centerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  hero: {
    ...typography.hero,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
  bodyCenter: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  countdown: {
    fontSize: 88,
    lineHeight: 96,
    fontFamily: fonts.bold,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
    textAlign: 'center',
  },
  countdownDanger: {
    color: colors.danger,
  },
  depositSub: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    minHeight: 44,
  },
  hostText: { flex: 1 },
  hostName: {
    ...typography.subtitle,
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
  hostMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
