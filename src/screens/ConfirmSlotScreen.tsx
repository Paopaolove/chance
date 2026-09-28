import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { DEPOSIT_EUROS, useChance } from '../data/ChanceContext';
import { mockHosts } from '../data/mockOutings';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { formatCountdown } from '../utils/format';
import { useOpenUserProfile } from '../utils/openUserProfile';
import { isStartsAtPast } from '../utils/parisTime';
import { isUrgentOnSite } from '../utils/outingActive';

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

  if (done || request.status === 'confirmed') {
    return (
      <SafeAreaView style={styles.wrap}>
        <View style={styles.centerBlock}>
          <Text style={styles.hero}>C’est noté</Text>
          <Text style={styles.bodyCenter}>
            Le chat s’ouvrira 1 heure avant. L’adresse exacte est maintenant
            visible sur la sortie.
          </Text>
        </View>
        <Button
          title="Voir la sortie"
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

  const onConfirm = () => {
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
            accessibilityRole="button"
            accessibilityLabel={`Profil de ${outing.hostName}`}
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
      <View style={styles.centerBlock}>
        <Pressable
          style={styles.hostRow}
          onPress={() => openProfile(outing.hostId)}
          accessibilityRole="button"
          accessibilityLabel={`Profil de ${outing.hostName}`}
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
          style={[styles.countdown, underOneMinute && styles.countdownDanger]}
          accessibilityRole="timer"
        >
          {countdown}
        </Text>
        <Text style={styles.depositSub}>
          Caution {DEPOSIT_EUROS} € (ce n’est pas l’invitation). Rendue si tu
          viens, si tu annules au moins 3 heures avant, ou si l’hôte annule.
          Perdue si trop tard ou absence : 6,90 € Chance / 13,10 € hôte.
        </Text>
      </View>
      <Button title="Je confirme" onPress={onConfirm} />
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
    color: colors.primary,
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
