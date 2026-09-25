import React, { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChance } from '../data/ChanceContext';
import { describeDepositForfeitMoment } from '../data/pricing';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { Button } from './Button';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Hidden QA menu (cahier I) — opened by 5 taps on the Chance logo.
 * Mid-flow « Simuler … » buttons live here ONLY — not on Profile.
 */
export function DemoMenuModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const {
    state,
    getActiveOutingForUser,
    getOutingById,
    outgoingRequests,
    incomingRequests,
    seedIncomingRequest,
    simulateHostAccept,
    simulateOutingInMinutes,
    simulateOtherLate,
    simulateOtherImprevu,
    reportVenueClosed,
    completeOuting,
    setDispoProfile,
    simulateLocalNotifications,
    showToast,
    simulateTrialEnd,
    reportGuestNoShow,
    reportHostNeverHonor,
    reportHostNoShow,
    simulateConfirmRace,
    resetDemo,
  } = useChance();

  const active = getActiveOutingForUser();
  const confirmed = [
    ...outgoingRequests.filter((r) => r.status === 'confirmed'),
    ...incomingRequests.filter((r) => r.status === 'confirmed'),
  ];
  const pendingOutgoing = outgoingRequests.find((r) => r.status === 'pending');
  const firstConfirmedOuting = confirmed
    .map((r) => getOutingById(r.outingId))
    .find(Boolean);

  const run = useCallback(
    async (_label: string, fn: () => void | Promise<void>) => {
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        Alert.alert('Démo', String(e));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.wrap, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Menu Démo</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Fermer</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          Outil QA caché (5 taps sur Chance). Tous les « Simuler … » sont ici —
          pas sur l’écran Profil.
        </Text>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.section}>Flux</Text>
          <Button
            title="Simuler demande Juliette"
            variant="secondary"
            disabled={busy || !active}
            onPress={() =>
              run('Demande Juliette ajoutée', () => {
                if (!active) {
                  Alert.alert(
                    'Démo',
                    'Publie d’abord une sortie (hôte) pour recevoir Juliette.',
                  );
                  return;
                }
                seedIncomingRequest(active.id);
                Alert.alert(
                  'Nouvelle demande',
                  'Juliette a demandé à rejoindre ta sortie.',
                );
              })
            }
            style={styles.btn}
          />
          <Button
            title="Simuler acceptation (hôte)"
            variant="secondary"
            disabled={busy || !pendingOutgoing}
            onPress={() =>
              run('Acceptation simulée', () => {
                if (!pendingOutgoing) {
                  Alert.alert(
                    'Démo',
                    'Aucune demande sortante en attente. Rejoins une sortie d’abord.',
                  );
                  return;
                }
                simulateHostAccept(pendingOutgoing.id);
                Alert.alert(
                  'Tu es accepté !',
                  'Confirme ta place dans 10 min (voir Demandes).',
                );
              })
            }
            style={styles.btn}
          />
          <Button
            title="Simuler sortie terminée"
            variant="secondary"
            disabled={busy || !firstConfirmedOuting}
            onPress={() =>
              run('Sortie terminée', () => {
                if (!firstConfirmedOuting) {
                  Alert.alert('Démo', 'Aucune sortie confirmée à terminer.');
                  return;
                }
                completeOuting(firstConfirmedOuting.id);
                Alert.alert(
                  'Noter la sortie',
                  'Tu peux noter ton binôme depuis Profil.',
                );
              })
            }
            style={styles.btn}
          />
          <Button
            title="Simuler fin d’essai (J+30)"
            variant="ghost"
            disabled={busy}
            onPress={() =>
              run('Essai terminé', () => {
                simulateTrialEnd();
                Alert.alert(
                  'Essai terminé (démo)',
                  'Choisis une formule pour confirmer une place.',
                );
              })
            }
            style={styles.btn}
          />

          <Text style={styles.section}>Jour J / chat</Text>
          <Button
            title="Simuler J−50 min (ouvrir le chat)"
            variant="secondary"
            disabled={busy || !firstConfirmedOuting}
            onPress={() =>
              run('Chat déverrouillé', () => {
                if (!firstConfirmedOuting) {
                  Alert.alert('Démo', 'Aucune sortie confirmée.');
                  return;
                }
                simulateOutingInMinutes(firstConfirmedOuting.id, 50);
                Alert.alert(
                  'Démo',
                  `« ${firstConfirmedOuting.title} » est dans ~50 min.`,
                );
              })
            }
            style={styles.btn}
          />
          <Button
            title="Simuler retard de l’autre"
            variant="ghost"
            disabled={busy || !firstConfirmedOuting}
            onPress={() =>
              run('Retard simulé', () => {
                if (!firstConfirmedOuting) return;
                const req = confirmed.find(
                  (r) => r.outingId === firstConfirmedOuting.id,
                );
                simulateOtherLate(firstConfirmedOuting.id, 10, req?.id);
              })
            }
            style={styles.btn}
          />
          <Button
            title="Simuler imprévu de l’autre"
            variant="ghost"
            disabled={busy || !firstConfirmedOuting}
            onPress={() =>
              run('Imprévu simulé', () => {
                if (!firstConfirmedOuting) return;
                const r = simulateOtherImprevu(firstConfirmedOuting.id);
                if (!r.ok) Alert.alert('Impossible', r.reason);
              })
            }
            style={styles.btn}
          />
          <Button
            title="Simuler restaurant fermé"
            variant="ghost"
            disabled={busy || !firstConfirmedOuting}
            onPress={() =>
              run('Nouveau lieu proposé', () => {
                if (!firstConfirmedOuting) return;
                const r = reportVenueClosed(firstConfirmedOuting.id);
                if (!r.ok) Alert.alert('Impossible', r.reason);
                else
                  Alert.alert(
                    'Nouveau lieu',
                    `Alternatif : ${r.alternate.venueName} · ${r.alternate.neighborhood}`,
                  );
              })
            }
            style={styles.btn}
          />

          <Text style={styles.section}>Cas limites</Text>
          <Button
            title="Simuler mon absence (caution perdue)"
            variant="ghost"
            disabled={busy}
            onPress={() =>
              run('Absence', () => {
                const req = outgoingRequests.find(
                  (r) => r.status === 'confirmed',
                );
                if (!req) {
                  Alert.alert(
                    'Démo',
                    'Il faut une place confirmée (outgoing) pour simuler une absence.',
                  );
                  return;
                }
                const r = reportGuestNoShow(req.id);
                if (!r.ok) Alert.alert('Impossible', r.reason);
                else
                  Alert.alert(
                    r.lowerPriority ? 'Priorité baissée' : 'Caution perdue',
                    r.lowerPriority
                      ? '2e absence — priorité baissée + mention profil.'
                      : `1re absence — ${describeDepositForfeitMoment()}`,
                  );
              })
            }
            style={styles.btn}
          />
          <Button
            title="Signaler l’absence d’un invité"
            variant="ghost"
            disabled={busy}
            onPress={() =>
              run('Absence invité', () => {
                const req = incomingRequests.find(
                  (r) => r.status === 'confirmed',
                );
                if (!req) {
                  Alert.alert('Démo', 'Aucun invité confirmé sur tes sorties.');
                  return;
                }
                const r = reportGuestNoShow(req.id);
                if (!r.ok) Alert.alert('Impossible', r.reason);
                else
                  Alert.alert(
                    'Absence invité',
                    r.lowerPriority
                      ? '2e — priorité baissée pour cet invité.'
                      : describeDepositForfeitMoment(),
                  );
              })
            }
            style={styles.btn}
          />
          <Button
            title="Publication jamais honorée (1er/2e)"
            variant="ghost"
            disabled={busy}
            onPress={() =>
              run('Publish strike', () => {
                const o =
                  getActiveOutingForUser() ??
                  (() => {
                    const r = [
                      ...outgoingRequests,
                      ...incomingRequests,
                    ].find((x) => x.status === 'confirmed');
                    return r ? getOutingById(r.outingId) : undefined;
                  })();
                if (!o) {
                  Alert.alert('Démo', 'Aucune sortie active / confirmée.');
                  return;
                }
                const r = reportHostNeverHonor(o.id);
                if (!r.ok) Alert.alert('Impossible', r.reason);
                else
                  Alert.alert(
                    r.banned ? 'Compte suspendu' : 'Avertissement',
                    r.banned
                      ? '2e publication jamais honorée — ban.'
                      : '1er avertissement — cautions remboursées.',
                  );
              })
            }
            style={styles.btn}
          />
          <Button
            title="Course 2 confirmations (1er timestamp)"
            variant="ghost"
            disabled={busy}
            onPress={() =>
              run('Race', () => {
                const o =
                  getActiveOutingForUser() ??
                  state.outings.find(
                    (x) => x.status === 'open' || x.status === 'full',
                  );
                if (!o) {
                  Alert.alert('Démo', 'Aucune sortie ouverte.');
                  return;
                }
                const r = simulateConfirmRace(o.id);
                if (!r.ok) Alert.alert('Impossible', r.reason);
                else
                  Alert.alert(
                    'Course',
                    `Gagnant ${r.winnerRequestId.slice(0, 12)}… — perdant expiré.`,
                  );
              })
            }
            style={styles.btn}
          />
          <Button
            title="No-show hôte sur moi (1er/2e)"
            variant="ghost"
            disabled={busy}
            onPress={() =>
              run('Host no-show', () => {
                const o = getActiveOutingForUser();
                if (!o) {
                  Alert.alert(
                    'Démo',
                    'Publie / ouvre une sortie (hôte) pour enchaîner les strikes.',
                  );
                  return;
                }
                const r = reportHostNoShow(o.id);
                if (!r.ok) Alert.alert('Impossible', r.reason);
                else
                  Alert.alert(
                    r.banned ? 'Compte suspendu' : 'Avertissement',
                    r.banned
                      ? '2e no-show hôte — ban + cautions remboursées.'
                      : '1er no-show — warning + note auto + cautions remboursées.',
                  );
              })
            }
            style={styles.btn}
          />

          <Text style={styles.section}>Notifs prioritaires</Text>
          <Button
            title="Simuler toutes les notifs"
            variant="secondary"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              try {
                const result = await simulateLocalNotifications('sortie démo');
                if (!result.ok) {
                  showToast(
                    'Notifs (fallback)',
                    'Push indisponible — bandeaux démo ci-dessous.',
                  );
                  Alert.alert(
                    'Notifications',
                    result.reason === 'permission_denied'
                      ? 'Push impossible. Les bandeaux in-app restent actifs.'
                      : result.reason,
                  );
                  const seq: [string, string, number][] = [
                    ['Nouvelle demande', 'Juliette veut rejoindre ta sortie.', 800],
                    [
                      'Tu es accepté !',
                      'Confirme ta place dans 10 min.',
                      2800,
                    ],
                    ['Plus que 3 min', 'Rappel confirmation.', 4800],
                    ['Place confirmée', 'C’est noté.', 6800],
                    ['Chat ouvert', 'Le chat est déverrouillé (H−1).', 8800],
                    ['Retard', 'L’autre a 10 min de retard.', 10800],
                    ['Annulation', 'La sortie a été annulée.', 12800],
                    ['Nouveau lieu', 'Lieu alternatif proposé.', 14800],
                    ['Noter la sortie', 'Comment s’est passée la sortie ?', 16800],
                  ];
                  seq.forEach(([t, b, d]) => {
                    setTimeout(() => showToast(t, b), d);
                  });
                  return;
                }
                Alert.alert(
                  'Démo',
                  result.pushOk
                    ? 'Notifs prioritaires programmées (~1–17 s).'
                    : 'Push partiel — bandeaux in-app si besoin.',
                );
              } finally {
                setBusy(false);
              }
            }}
            style={styles.btn}
          />

          <Text style={styles.section}>Dispo</Text>
          <Button
            title="Simuler minuit (couper Dispo)"
            variant="ghost"
            disabled={busy || !state.currentUser?.dispoSoir}
            onPress={() =>
              run('Dispo expirée', () => {
                setDispoProfile({ dispoSoir: false, dispoExpiresAt: null });
                Alert.alert(
                  'Dispo expirée',
                  'Simulation expiration — plus visible pour l’instant.',
                );
              })
            }
            style={styles.btn}
          />

          <Text style={styles.section}>Reset</Text>
          <Button
            title="Réinitialiser la démo"
            variant="ghost"
            disabled={busy}
            onPress={() => {
              Alert.alert(
                'Réinitialiser la démo ?',
                'Tu reviendras au début de l’onboarding (slides → compte → téléphone → …).',
                [
                  { text: 'Annuler', style: 'cancel' },
                  {
                    text: 'Réinitialiser',
                    style: 'destructive',
                    onPress: () => {
                      resetDemo();
                      onClose();
                    },
                  },
                ],
              );
            }}
            style={styles.btn}
          />

          <Text style={styles.footer}>
            Pas de notif pour chaque nouvelle annonce du fil. Pas de Stripe /
            Supabase dans la démo.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.text,
    fontFamily: fonts.bold,
  },
  close: {
    ...typography.bodyStrong,
    color: colors.primary,
    fontFamily: fonts.semiBold,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  section: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  btn: { marginBottom: spacing.sm },
  footer: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.xl,
  },
});
