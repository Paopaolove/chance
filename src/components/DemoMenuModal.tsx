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
import { navigationRef } from '../navigation/navigationRef';
import { Button } from './Button';
import { isPartnerListing } from '../utils/partners';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Hidden QA menu (cahier I) — opened by 5 taps on the Moment logo.
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
    demoMarkConfirmedPresent,
    setDispoProfile,
    simulateLocalNotifications,
    showToast,
    simulateTrialEnd,
    reportGuestNoShow,
    reportHostNeverHonor,
    reportHostNoShow,
    simulateConfirmRace,
    resetDemo,
    demoBecomePartner,
    demoLeavePartner,
    reviewPartnerApplication,
    setPartnerPinned,
    simulatePartnerGuestConfirms,
    simulatePartnerNextDay,
    seedDemoPastMoments,
    simulateOtherAddsMomentPhoto,
    simulateOtherMomentPhotoResponse,
  } = useChance();

  const me = state.currentUser;
  const partnerStatus = me?.partnerStatus ?? 'none';
  /** Ma dernière annonce lieu (open ou closed pleine), sinon null. */
  const myPartnerOuting = me
    ? [...state.outings]
        .filter(
          (o) =>
            o.hostId === me.id &&
            isPartnerListing(o) &&
            o.status !== 'cancelled' &&
            o.status !== 'completed',
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
    : null;
  const mockPartnerOuting =
    state.outings.find(
      (o) => o.id === 'outing-partner-resto-1' && o.status === 'open',
    ) ?? null;
  /** Cible des confirmations simulées : mon annonce lieu, sinon Le Frank (mock). */
  const partnerConfirmTarget =
    myPartnerOuting && myPartnerOuting.status === 'open'
      ? myPartnerOuting
      : mockPartnerOuting;
  /** Ma venue confirmée sur une annonce lieu (côté invité). */
  const myPartnerGuestReq = outgoingRequests.find((r) => {
    if (r.status !== 'confirmed') return false;
    const o = getOutingById(r.outingId);
    return !!o && isPartnerListing(o) && o.status !== 'cancelled';
  });
  const myPartnerGuestOuting = myPartnerGuestReq
    ? getOutingById(myPartnerGuestReq.outingId) ?? null
    : null;
  const nextDayTarget = myPartnerOuting ?? myPartnerGuestOuting;

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
          Outil QA caché (5 taps sur Moment). Tous les « Simuler … » sont ici —
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
                const outingId = firstConfirmedOuting.id;
                // terminée ≠ présent (lot 6) — la simu marque present explicitement.
                completeOuting(outingId);
                const marked = demoMarkConfirmedPresent(outingId);
                onClose();
                // State updates flush before next paint; navigate after tick.
                setTimeout(() => {
                  if (!navigationRef.isReady()) return;
                  if (marked.ok && marked.rateTarget) {
                    navigationRef.navigate('LeaveReview', {
                      outingId: marked.rateTarget.outingId,
                      toUserId: marked.rateTarget.toUserId,
                      toUserName: marked.rateTarget.toUserName,
                    });
                    return;
                  }
                  navigationRef.navigate('MainTabs', {
                    screen: 'Profile',
                    params: { focusSection: 'rate' },
                  });
                }, 0);
                Alert.alert(
                  'Noter la sortie',
                  marked.ok && marked.rateTarget
                    ? 'Sortie terminée + présents marqués (démo).'
                    : marked.ok
                      ? 'Sortie terminée. Pas de cible à noter.'
                      : `Sortie terminée. Présence non marquée (${marked.reason}) — vois Profil.`,
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
                else if (r.jokerExempted)
                  Alert.alert(
                    'Joker — caution protégée',
                    'Ce cas a déjà utilisé le joker : caution rendue pour de bon, pas d’absence comptée.',
                  );
                else
                  Alert.alert(
                    r.banned
                      ? 'Compte fermé'
                      : r.lowerPriority
                        ? 'Priorité baissée'
                        : 'Caution perdue',
                    r.banned
                      ? '3e absence — compte fermé.'
                      : r.lowerPriority
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
                else if (r.jokerExempted)
                  Alert.alert(
                    'Joker — caution protégée',
                    'Ce cas a déjà utilisé le joker : caution rendue pour de bon, pas d’absence comptée.',
                  );
                else
                  Alert.alert(
                    'Absence invité',
                    r.banned
                      ? '3e — compte fermé pour cet invité.'
                      : r.lowerPriority
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
                // Lot 6: acteur = invité confirmé (pas l’hôte).
                const req = outgoingRequests.find(
                  (x) => x.status === 'confirmed',
                );
                if (!req) {
                  Alert.alert(
                    'Démo',
                    'Il faut une place confirmée (outgoing) pour signaler le no-show hôte. Un 2e strike nécessite une autre sortie.',
                  );
                  return;
                }
                const r = reportHostNoShow(req.outingId);
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

          <Text style={styles.section}>Partenaires (lieux)</Text>
          <Text style={styles.sectionHint}>
            Statut lieu : {partnerStatus}
            {me?.partnerVenueName ? ` · ${me.partnerVenueName}` : ''}
            {me?.partnerWarnings ? ` · ${me.partnerWarnings} avert.` : ''}
            {me?.partnerPinned ? ' · remontée en tête' : ''}
          </Text>
          {(['resto', 'bar', 'culture'] as const).map((k) => (
            <Button
              key={k}
              title={`Passer en partenaire (${k === 'resto' ? 'resto' : k === 'bar' ? 'bar' : 'culture'})`}
              variant="secondary"
              disabled={busy || !me}
              onPress={() =>
                run('Partenaire', () => {
                  demoBecomePartner(k);
                  Alert.alert(
                    'Compte partenaire actif (démo)',
                    k === 'culture'
                      ? 'Créer → places offertes (2 par invitation, max 5 le même soir).'
                      : 'Créer → geste et/ou remise, 1 annonce active, 1–3 places.',
                  );
                })
              }
              style={styles.btn}
            />
          ))}
          <Button
            title="Confirmer la demande lieu (équipe Moment)"
            variant="secondary"
            disabled={busy || partnerStatus !== 'pending'}
            onPress={() =>
              run('Validation lieu', () => {
                reviewPartnerApplication('active');
              })
            }
            style={styles.btn}
          />
          <Button
            title="Refuser la demande lieu"
            variant="ghost"
            disabled={busy || partnerStatus !== 'pending'}
            onPress={() =>
              run('Refus lieu', () => {
                reviewPartnerApplication('refused');
              })
            }
            style={styles.btn}
          />
          <Button
            title={
              me?.partnerPinned
                ? 'Remontée en tête : désactiver'
                : 'Remontée en tête : activer (forfait futur)'
            }
            variant="ghost"
            disabled={busy || partnerStatus !== 'active'}
            onPress={() =>
              run('Remontée', () => {
                setPartnerPinned(!me?.partnerPinned);
              })
            }
            style={styles.btn}
          />
          <Button
            title="Repasser particulier"
            variant="ghost"
            disabled={busy || partnerStatus === 'none'}
            onPress={() =>
              run('Particulier', () => {
                demoLeavePartner();
              })
            }
            style={styles.btn}
          />
          <Button
            title="Lieu : 1 invité confirme sa venue"
            variant="secondary"
            disabled={busy || !partnerConfirmTarget}
            onPress={() =>
              run('Confirmation partenaire', () => {
                if (!partnerConfirmTarget) return;
                const res = simulatePartnerGuestConfirms(
                  partnerConfirmTarget.id,
                  1,
                );
                if (!res.ok) Alert.alert('Démo', res.reason);
              })
            }
            style={styles.btn}
          />
          <Button
            title="Lieu : 2 confirmations simultanées (1 chaise)"
            variant="secondary"
            disabled={busy || !partnerConfirmTarget}
            onPress={() =>
              run('Course partenaire', () => {
                if (!partnerConfirmTarget) return;
                // Remplit toutes les chaises restantes + 1 de trop :
                // le premier confirmé a la chaise, le dernier « Plus de place ».
                const res = simulatePartnerGuestConfirms(
                  partnerConfirmTarget.id,
                  Math.max(2, partnerConfirmTarget.spotsLeft + 1),
                );
                if (!res.ok) Alert.alert('Démo', res.reason);
              })
            }
            style={styles.btn}
          />
          <Text style={styles.sectionHint}>
            Cible : {partnerConfirmTarget
              ? `« ${partnerConfirmTarget.title} » (${partnerConfirmTarget.spotsLeft} place(s))`
              : 'aucune annonce lieu ouverte'}
          </Text>
          <Button
            title="Invité : sortie lieu dans ~10 min (« Je suis arrivé »)"
            variant="secondary"
            disabled={busy || !myPartnerGuestOuting}
            onPress={() =>
              run('H−10', () => {
                if (!myPartnerGuestOuting) return;
                simulateOutingInMinutes(myPartnerGuestOuting.id, 10);
                Alert.alert(
                  'Démo',
                  'Ouvre la sortie : « Je suis arrivé » est disponible (dès H−15).',
                );
              })
            }
            style={styles.btn}
          />
          <Button
            title="Lieu : mon annonce a commencé il y a 5 min (« Pas venu »)"
            variant="secondary"
            disabled={busy || !myPartnerOuting}
            onPress={() =>
              run('H+5', () => {
                if (!myPartnerOuting) return;
                simulateOutingInMinutes(myPartnerOuting.id, -5);
                Alert.alert(
                  'Démo',
                  'Ouvre ton annonce : « Pas venu » apparaît pour chaque chaise vide (soir même).',
                );
              })
            }
            style={styles.btn}
          />
          <Button
            title="Simuler lendemain (silence → caution rendue)"
            variant="ghost"
            disabled={busy || !nextDayTarget}
            onPress={() =>
              run('Lendemain', () => {
                if (!nextDayTarget) return;
                const res = simulatePartnerNextDay(nextDayTarget.id);
                Alert.alert(
                  'Lendemain (démo)',
                  res.ok
                    ? `${res.refunded} caution(s) rendue(s) — silence des deux, aucune pénalité.`
                    : res.reason,
                );
              })
            }
            style={styles.btn}
          />

          <Text style={styles.section}>Moments passés (photos)</Text>
          <Text style={styles.sectionHint}>
            Photos après le moment, profil seulement. Publiées quand toute
            la table est d’accord.
          </Text>
          <Button
            title="Seed : moment passé avec photo acceptée (Nina)"
            variant="secondary"
            disabled={busy}
            onPress={() =>
              run('Moment passé', () => {
                const r = seedDemoPastMoments();
                if (!r.ok) {
                  Alert.alert('Démo', r.reason);
                  return;
                }
                onClose();
                setTimeout(() => {
                  if (!navigationRef.isReady()) return;
                  navigationRef.navigate('HostProfile', { userId: r.mockUserId });
                }, 0);
                Alert.alert(
                  'Moment passé (démo)',
                  `Profil de ${r.mockUserName} : « Moments passés » avec une photo acceptée. Un moment passé avec toi est aussi dans ton Profil, pour tester l’ajout.`,
                );
              })
            }
            style={styles.btn}
          />
          <Button
            title="L’autre ajoute une photo (à accepter)"
            variant="secondary"
            disabled={busy || !me}
            onPress={() =>
              run('Photo de l’autre', () => {
                const r = simulateOtherAddsMomentPhoto();
                if (!r.ok) Alert.alert('Démo', r.reason);
                else onClose();
              })
            }
            style={styles.btn}
          />
          <Button
            title="L’autre accepte la photo"
            variant="ghost"
            disabled={busy || !me}
            onPress={() =>
              run('Accord photo', () => {
                const r = simulateOtherMomentPhotoResponse('accepted');
                if (!r.ok) Alert.alert('Démo', r.reason);
              })
            }
            style={styles.btn}
          />
          <Button
            title="L’autre refuse la photo"
            variant="ghost"
            disabled={busy || !me}
            onPress={() =>
              run('Refus photo', () => {
                const r = simulateOtherMomentPhotoResponse('declined');
                if (!r.ok) Alert.alert('Démo', r.reason);
              })
            }
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
                'Tu reviendras au début : 3 slides, puis compte → prénom et âge → quartier → règles.',
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
    color: colors.text,
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
  sectionHint: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  footer: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.xl,
  },
});
