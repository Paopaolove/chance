import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { useChance } from '../data/ChanceContext';
import { Request } from '../data/types';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { formatCountdown } from '../utils/format';
import { isStartsAtPast } from '../utils/parisTime';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const statusLabels: Record<string, string> = {
  pending: 'En attente',
  accepted: 'À confirmer (10 min)',
  confirmed: 'Confirmée',
  expired: 'Expirée',
  declined: 'Refusée',
  cancelled: 'Annulée',
};

function remainingMs(deadlineIso: string | undefined, nowMs: number): number {
  if (!deadlineIso) return 0;
  return Math.max(0, new Date(deadlineIso).getTime() - nowMs);
}

export function RequestsScreen() {
  const navigation = useNavigation<Nav>();
  const {
    incomingRequests,
    outgoingRequests,
    getOutingById,
    acceptRequest,
    declineRequest,
    cancelRequest,
    expireRequestIfNeeded,
    state,
  } = useChance();

  const [now, setNow] = useState(Date.now());
  const hasAcceptedOutgoing = outgoingRequests.some(
    (r) => r.status === 'accepted',
  );

  // Tick countdown on Demandes cards while a guest must confirm within 10 min.
  useEffect(() => {
    if (!hasAcceptedOutgoing) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasAcceptedOutgoing]);

  useEffect(() => {
    outgoingRequests.forEach((r) => {
      if (r.status === 'accepted') expireRequestIfNeeded(r.id);
    });
  }, [now, outgoingRequests, expireRequestIfNeeded]);

  const renderIncoming = (r: Request) => {
    const outing = getOutingById(r.outingId);
    return (
      <View key={r.id} style={styles.card}>
        <Text style={styles.cardTitle}>
          {r.userName}, {r.userAge}
        </Text>
        <Text style={styles.cardMeta}>
          pour « {outing?.title ?? 'sortie'} » · {statusLabels[r.status]}
        </Text>
        {r.message ? <Text style={styles.msg}>« {r.message} »</Text> : null}
        {r.suggestedDate ? (
          <Text style={styles.msg}>
            Autre date proposée · {r.suggestedDate}
          </Text>
        ) : null}
        {r.status === 'pending' ? (
          outing &&
          (outing.status === 'completed' || isStartsAtPast(outing.startsAt)) ? (
            <Text style={styles.msg}>
              {outing.status === 'completed'
                ? 'Sortie terminée — plus d’acceptation.'
                : 'L’heure est passée — plus d’acceptation.'}
            </Text>
          ) : (
            <View style={styles.row}>
              <Button
                title="Accepter"
                onPress={() => {
                  const res = acceptRequest(r.id);
                  if (!res.ok) {
                    const messages: Record<string, string> = {
                      outing_started:
                        'L’heure de la sortie est passée — tu ne peux plus accepter.',
                      outing_finished: 'Cette sortie est terminée.',
                      invalid: 'Demande invalide.',
                      not_found: 'Sortie introuvable.',
                    };
                    Alert.alert(
                      'Impossible',
                      messages[res.reason] ?? res.reason,
                    );
                    return;
                  }
                  Alert.alert(
                    'Acceptée',
                    `${r.userName} a 10 minutes pour confirmer. Sinon la place est libérée. Ses autres demandes en attente sont annulées.`,
                  );
                }}
                style={styles.flex}
              />
              <Button
                title="Refuser"
                variant="ghost"
                onPress={() => declineRequest(r.id)}
                style={styles.flex}
              />
            </View>
          )
        ) : null}
        {r.status === 'confirmed' && outing ? (
          <>
            <Button
              title="Ouvrir le chat"
              variant="secondary"
              onPress={() =>
                navigation.navigate('ChatPlaceholder', {
                  outingId: outing.id,
                  requestId: r.id,
                })
              }
              style={{ marginTop: spacing.md }}
            />
            {outing.status === 'completed' && r.attendance === 'present' ? (
              <Button
                title={`Noter ${r.userName}`}
                variant="secondary"
                onPress={() =>
                  navigation.navigate('LeaveReview', {
                    outingId: outing.id,
                    toUserId: r.userId,
                    toUserName: r.userName,
                  })
                }
                style={{ marginTop: spacing.sm }}
              />
            ) : null}
          </>
        ) : null}
      </View>
    );
  };

  const renderOutgoing = (r: Request) => {
    const outing = getOutingById(r.outingId);
    const leftMs = remainingMs(r.confirmDeadlineAt, now);
    const underOneMinute = leftMs > 0 && leftMs < 60_000;
    const countdown = r.confirmDeadlineAt
      ? formatCountdown(r.confirmDeadlineAt, now)
      : '0:00';

    const body = (
      <>
        <Text style={styles.cardTitle}>{outing?.title ?? 'Sortie'}</Text>
        <Text style={styles.cardMeta}>
          chez {outing?.hostName} · {statusLabels[r.status]}
        </Text>
        {r.status === 'accepted' ? (
          <>
            <View style={styles.acceptRow}>
              <Button
                title="J’accepte"
                onPress={() =>
                  navigation.navigate('ConfirmSlot', { requestId: r.id })
                }
                style={styles.acceptBtn}
              />
              <Text
                style={[
                  styles.cardCountdown,
                  underOneMinute && styles.cardCountdownDanger,
                ]}
                accessibilityRole="timer"
              >
                {countdown}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                cancelRequest(r.id, 'guest');
                Alert.alert(
                  'Place libérée',
                  'La place est de nouveau disponible.',
                );
              }}
              hitSlop={8}
              style={styles.releaseWrap}
            >
              <Text style={styles.releaseLink}>Libérer ma place</Text>
            </Pressable>
          </>
        ) : null}
        {r.status === 'confirmed' && outing ? (
          <>
            <Text style={styles.actionHint}>
              Touche pour le chat (ouvert 1 h avant)
            </Text>
            {outing.status === 'completed' && r.attendance === 'present' ? (
              <Button
                title="Noter la sortie"
                variant="secondary"
                onPress={() =>
                  navigation.navigate('LeaveReview', {
                    outingId: outing.id,
                    toUserId: outing.hostId,
                    toUserName: outing.hostName,
                  })
                }
                style={{ marginTop: spacing.sm }}
              />
            ) : null}
          </>
        ) : null}
      </>
    );

    // Accepted: card is source of truth — CTA + countdown visible; no body tap nav.
    if (r.status === 'accepted') {
      return (
        <View key={r.id} style={styles.card}>
          {body}
        </View>
      );
    }

    return (
      <Pressable
        key={r.id}
        style={styles.card}
        onPress={() => {
          if (r.status === 'confirmed' && outing) {
            navigation.navigate('ChatPlaceholder', {
              outingId: outing.id,
              requestId: r.id,
            });
          } else if (outing) {
            navigation.navigate('OutingDetail', { outingId: outing.id });
          }
        }}
      >
        {body}
      </Pressable>
    );
  };

  const empty =
    incomingRequests.length === 0 && outgoingRequests.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Demandes</Text>
        <Text style={styles.sub}>
          Bonjour {state.currentUser?.firstName} — reçues et envoyées
        </Text>

        {empty ? (
          <EmptyState
            title="Rien pour l’instant"
            subtitle="Rejoins une sortie autour de toi, ou publie la tienne."
          />
        ) : (
          <>
            <Text style={styles.section}>Reçues (hôte)</Text>
            {incomingRequests.length === 0 ? (
              <Text style={styles.emptyLine}>Aucune demande reçue.</Text>
            ) : (
              incomingRequests.map(renderIncoming)
            )}

            <Text style={[styles.section, { marginTop: spacing.xl }]}>
              Envoyées
            </Text>
            {outgoingRequests.length === 0 ? (
              <Text style={styles.emptyLine}>Aucune demande envoyée.</Text>
            ) : (
              outgoingRequests.map(renderOutgoing)
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  title: { ...typography.title, color: colors.text },
  sub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  section: {
    ...typography.bodyStrong,
    color: colors.text,
    marginBottom: spacing.md,
  },
  emptyLine: { ...typography.caption, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: { ...typography.bodyStrong, color: colors.text },
  cardMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  msg: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  flex: { flex: 1 },
  actionHint: {
    ...typography.caption,
    color: colors.primaryDark,
    marginTop: spacing.sm,
  },
  acceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  acceptBtn: {
    flex: 1,
  },
  cardCountdown: {
    fontSize: 36,
    lineHeight: 40,
    fontFamily: fonts.bold,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
    minWidth: 72,
    textAlign: 'right',
  },
  cardCountdownDanger: {
    color: colors.danger,
  },
  releaseWrap: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  releaseLink: {
    ...typography.caption,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
