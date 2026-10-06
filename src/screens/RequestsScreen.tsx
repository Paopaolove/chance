import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
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
import { Outing, Request } from '../data/types';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { formatCountdown } from '../utils/format';
import { useOpenUserProfile } from '../utils/openUserProfile';
import {
  isOutingAcceptingRequests,
  isUrgentOnSite,
} from '../utils/outingActive';
import { Avatar } from '../components/Avatar';
import { isPartnerListing } from '../utils/partners';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type SectionKey = 'urgent' | 'confirm' | 'pending';

const SECTION_ORDER: SectionKey[] = ['urgent', 'confirm', 'pending'];

const SECTION_TITLES: Record<SectionKey, string> = {
  urgent: 'Urgentes',
  confirm: 'À confirmer',
  pending: 'En attente',
};

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

/** Actifs only — terminées / notées / expirées → Profil (pas Historique). */
function classifyRequest(
  r: Request,
  outing: Outing | undefined,
  nowMs: number,
): SectionKey | null {
  if (
    r.status === 'expired' ||
    r.status === 'declined' ||
    r.status === 'cancelled'
  ) {
    return null;
  }

  if (r.status === 'confirmed') {
    const outingFinished =
      !!outing &&
      (outing.status === 'completed' || outing.status === 'cancelled');
    if (outingFinished) return null;
    if (outing && isUrgentOnSite(outing)) return 'urgent';
    // À venir / chat / imprévu
    return 'pending';
  }

  if (r.status === 'accepted') {
    const left = remainingMs(r.confirmDeadlineAt, nowMs);
    const outingDead =
      !!outing &&
      (outing.status === 'completed' ||
        outing.status === 'cancelled' ||
        outing.status === 'closed');
    if (left <= 0 || outingDead) return null;
    if (outing && isUrgentOnSite(outing)) return 'urgent';
    return 'confirm';
  }

  // pending
  if (outing && isUrgentOnSite(outing) && isOutingAcceptingRequests(outing, nowMs)) {
    return 'urgent';
  }
  if (
    outing &&
    (outing.status === 'completed' ||
      outing.status === 'cancelled' ||
      !isOutingAcceptingRequests(outing, nowMs))
  ) {
    return null;
  }
  return 'pending';
}

export function RequestsScreen() {
  const navigation = useNavigation<Nav>();
  const openProfile = useOpenUserProfile();
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

  type Row = { kind: 'in' | 'out'; request: Request };

  const sections = useMemo(() => {
    const buckets: Record<SectionKey, Row[]> = {
      urgent: [],
      confirm: [],
      pending: [],
    };

    const push = (kind: 'in' | 'out', r: Request) => {
      const outing = getOutingById(r.outingId);
      const key = classifyRequest(r, outing, now);
      if (!key) return;
      buckets[key].push({ kind, request: r });
    };

    incomingRequests.forEach((r) => push('in', r));
    outgoingRequests.forEach((r) => push('out', r));

    return SECTION_ORDER.map((key) => ({
      key,
      title: SECTION_TITLES[key],
      rows: buckets[key],
    })).filter((s) => s.rows.length > 0);
  }, [incomingRequests, outgoingRequests, getOutingById, now]);

  const renderIncoming = (r: Request) => {
    const outing = getOutingById(r.outingId);
    return (
      <View key={`in-${r.id}`} style={styles.card}>
        <View style={styles.cardHeader}>
          <Pressable
            style={styles.profileHit}
            onPress={() => openProfile(r.userId)}
            accessibilityRole="button"
            accessibilityLabel={`Voir le profil de ${r.userName}`}
            hitSlop={8}
          >
            <Avatar name={r.userName} seed={r.userId} size={36} />
            <Text style={styles.cardTitle}>
              {r.userName}, {r.userAge}
            </Text>
          </Pressable>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>Reçue</Text>
          </View>
        </View>
        <Pressable
          onPress={() =>
            outing &&
            navigation.navigate('OutingDetail', { outingId: outing.id })
          }
          accessibilityRole="button"
          accessibilityLabel={`Sortie ${outing?.title ?? ''}`}
        >
          <Text style={styles.cardMeta}>
            pour « {outing?.title ?? 'sortie'} » ·{' '}
            {r.partnerAutoSeat && r.status === 'accepted'
              ? 'a rejoint — confirmation en cours (rien à faire)'
              : statusLabels[r.status]}
          </Text>
        </Pressable>
        {outing && isUrgentOnSite(outing) ? (
          <View style={styles.urgentPill}>
            <Text style={styles.urgentPillText}>
              Maintenant
            </Text>
          </View>
        ) : null}
        {r.message ? <Text style={styles.msg}>« {r.message} »</Text> : null}
        {r.suggestedDate ? (
          <Text style={styles.msg}>
            Autre date proposée · {r.suggestedDate}
          </Text>
        ) : null}
        {r.status === 'pending' ? (
          outing &&
          (outing.status === 'completed' ||
            outing.status === 'cancelled' ||
            !isOutingAcceptingRequests(outing)) ? (
            <Text style={styles.msg}>
              {outing.status === 'completed'
                ? 'Sortie terminée — plus d’acceptation.'
                : outing.status === 'cancelled'
                  ? 'Sortie annulée — plus d’acceptation.'
                  : isUrgentOnSite(outing)
                    ? 'Fenêtre urgente terminée — plus d’acceptation.'
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
                    `${r.userName} a 10 minutes pour confirmer. Sinon la place est libérée. Ses autres demandes du même jour sont annulées.`,
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
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{outing?.title ?? 'Sortie'}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>Envoyée</Text>
          </View>
        </View>
        {outing ? (
          <Pressable
            style={styles.profileHit}
            onPress={() => openProfile(outing.hostId)}
            accessibilityRole="button"
            accessibilityLabel={`Voir le profil de ${outing.hostName}`}
            hitSlop={8}
          >
            <Avatar name={outing.hostName} seed={outing.hostId} size={36} />
            <Text style={styles.cardMetaInline}>
              chez {outing.hostName} · {statusLabels[r.status]}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.cardMeta}>{statusLabels[r.status]}</Text>
        )}
        {outing && isUrgentOnSite(outing) ? (
          <View style={styles.urgentPill}>
            <Text style={styles.urgentPillText}>
              Maintenant
            </Text>
          </View>
        ) : null}
        {r.status === 'accepted' ? (
          outing &&
          (outing.status === 'completed' ||
            outing.status === 'cancelled' ||
            outing.status === 'closed' ||
            leftMs <= 0) ? (
            <Text style={styles.msg}>
              {leftMs <= 0 &&
              outing.status !== 'completed' &&
              outing.status !== 'cancelled' &&
              outing.status !== 'closed'
                ? 'Délai de confirmation dépassé — place libérée.'
                : outing.status === 'cancelled'
                  ? 'Sortie annulée — plus de confirmation.'
                  : outing.status === 'completed'
                    ? 'Sortie terminée — plus de confirmation.'
                    : 'Annonce clôturée — plus de confirmation.'}
            </Text>
          ) : (
            <>
              <View style={styles.acceptRow}>
                <Button
                  title={r.partnerAutoSeat ? 'Confirmer ma venue' : 'J’accepte'}
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
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                style={styles.releaseWrap}
                accessibilityRole="button"
                accessibilityLabel="Libérer ma place"
              >
                <Text style={styles.releaseLink}>Libérer ma place</Text>
              </Pressable>
            </>
          )
        ) : null}
        {r.status === 'confirmed' && outing ? (
          <Text style={styles.actionHint}>
            {isPartnerListing(outing) || outing.urgentOnSite
              ? 'Touche pour le chat (ouvert)'
              : 'Touche pour le chat (ouvert 1 h avant)'}
          </Text>
        ) : null}
      </>
    );

    // Accepted: card is source of truth — CTA + countdown visible; no body tap nav.
    if (r.status === 'accepted') {
      return (
        <View key={`out-${r.id}`} style={[styles.card, styles.cardConfirm]}>
          {body}
        </View>
      );
    }

    return (
      <Pressable
        key={`out-${r.id}`}
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

  const empty = sections.length === 0;

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
          sections.map((section, idx) => (
            <View
              key={section.key}
              style={idx > 0 ? styles.sectionBlock : undefined}
            >
              <Text style={styles.section}>{section.title}</Text>
              {section.rows.map((row) =>
                row.kind === 'in'
                  ? renderIncoming(row.request)
                  : renderOutgoing(row.request),
              )}
            </View>
          ))
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
  sectionBlock: { marginTop: spacing.xl },
  section: {
    ...typography.subtitle,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  /** Slight border accent for cards waiting on guest confirm */
  cardConfirm: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  profileHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minHeight: 44,
  },
  cardTitle: {
    ...typography.bodyStrong,
    color: colors.text,
    flex: 1,
  },
  cardMetaInline: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  rolePill: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  rolePillText: {
    ...typography.small,
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
  },
  urgentPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    marginTop: spacing.sm,
    minHeight: 28,
    justifyContent: 'center',
  },
  urgentPillText: {
    ...typography.small,
    color: colors.primaryDark,
    fontFamily: fonts.semiBold,
  },
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
    minHeight: 56,
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
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingRight: spacing.md,
  },
  /** Secondary action — less salient than primary « J’accepte » */
  releaseLink: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
  },
});
