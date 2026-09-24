import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { DEPOSIT_EUROS, useChance } from '../data/ChanceContext';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';
import { formatCountdown } from '../utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type R = RouteProp<RootStackParamList, 'ConfirmSlot'>;

export function ConfirmSlotScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const {
    getRequestById,
    getOutingById,
    confirmSlot,
    expireRequestIfNeeded,
    showToast,
    canConfirmOuting,
  } = useChance();
  const request = getRequestById(route.params.requestId);
  const outing = request ? getOutingById(request.outingId) : undefined;
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(false);
  /** Mock Stripe step: user acknowledges deposit hold before confirm. */
  const [depositAck, setDepositAck] = useState(false);

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

  if (!request || !outing) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Demande introuvable.</Text>
      </View>
    );
  }

  if (done || request.status === 'confirmed') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.hero}>C’est noté</Text>
        <Text style={styles.body}>
          Le chat s’ouvrira 1 heure avant. L’adresse exacte est maintenant
          visible sur la sortie.
        </Text>
        <View style={styles.box}>
          <Text style={styles.boxLabel}>Adresse</Text>
          <Text style={styles.boxValue}>{outing.exactAddress}</Text>
          <Text style={[styles.boxLabel, { marginTop: spacing.md }]}>
            Caution
          </Text>
          <Text style={styles.boxValue}>
            {DEPOSIT_EUROS} € bloquée (simulation Stripe — pas de vrai paiement)
          </Text>
        </View>
        <Button
          title="Voir la sortie"
          onPress={() =>
            navigation.replace('OutingDetail', { outingId: outing.id })
          }
        />
        <Button
          title="Voir le chat"
          variant="secondary"
          onPress={() =>
            navigation.navigate('ChatPlaceholder', {
              outingId: outing.id,
              requestId: request.id,
            })
          }
          style={{ marginTop: spacing.md }}
        />
        <Text style={[styles.fine, { marginTop: spacing.md }]}>
          Le chat reste verrouillé tant que la sortie n’est pas dans moins d’1 h.
        </Text>
      </View>
    );
  }

  if (expired || request.status === 'expired') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.hero}>Trop tard</Text>
        <Text style={styles.body}>
          Ta place n’a pas été confirmée à temps (10 min). Elle a été libérée.
        </Text>
        <Button
          title="Retour au fil"
          onPress={() => navigation.navigate('MainTabs')}
        />
      </View>
    );
  }

  if (request.status !== 'accepted') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.hero}>Pas encore</Text>
        <Text style={styles.body}>
          Cette demande n’est pas en attente de confirmation (
          {request.status}).
        </Text>
      </View>
    );
  }

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
    if (!depositAck) {
      setDepositAck(true);
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
      setExpired(true);
      return;
    }
    setDone(true);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.hero}>C’est à toi</Text>
      <Text style={styles.body}>
        Ta place est réservée 10 minutes. Confirme maintenant — sinon elle est
        libérée automatiquement.
      </Text>

      <View style={styles.timerBox}>
        <Text style={styles.timerLabel}>Temps restant</Text>
        <Text style={styles.timer}>{countdown}</Text>
      </View>

      <View style={styles.box}>
        <Text style={styles.boxLabel}>Sortie</Text>
        <Text style={styles.boxValue}>{outing.title}</Text>
        <Text style={[styles.boxLabel, { marginTop: spacing.sm }]}>Lieu</Text>
        <Text style={styles.boxValue}>
          {outing.venueName} · {outing.neighborhood}
        </Text>
      </View>

      {!gate.ok ? (
        <View style={styles.paywallHint}>
          <Text style={styles.depositTitle}>Formule requise</Text>
          <Text style={styles.depositBody}>
            {gate.message ??
              'Choisis une formule pour confirmer ta place.'}
          </Text>
          <Button
            title="Voir les formules"
            onPress={() =>
              navigation.navigate('Paywall', {
                returnToConfirmRequestId: request.id,
              })
            }
            style={{ marginBottom: spacing.md }}
          />
        </View>
      ) : null}

      {gate.ok ? (
        depositAck ? (
          <View style={styles.depositBox}>
            <Text style={styles.depositTitle}>Caution bloquée</Text>
            <Text style={styles.depositBody}>
              {DEPOSIT_EUROS} € seront pré-autorisés sur ta carte (Stripe mock —
              aucun débit réel). Rendue si tu viens, ou si tu annules au moins
              3 h avant. Perdue si annulation trop tard ou absence.
            </Text>
            <Button title="Confirmer ma place" onPress={onConfirm} />
          </View>
        ) : (
          <Button
            title={`Continuer · caution ${DEPOSIT_EUROS} €`}
            onPress={onConfirm}
          />
        )
      ) : null}
      <Text style={styles.fine}>
        Sans confirmation sous 10 min, la place est libérée.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  wrap: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  hero: { ...typography.hero, color: colors.text, marginBottom: spacing.md },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  timerBox: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  timerLabel: { ...typography.caption, color: colors.warning },
  timer: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
    fontVariant: ['tabular-nums'],
  },
  box: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  boxLabel: { ...typography.caption, color: colors.textMuted },
  boxValue: { ...typography.bodyStrong, color: colors.text, marginTop: 2 },
  paywallHint: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  depositBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  depositTitle: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
    marginBottom: spacing.sm,
  },
  depositBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  fine: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
