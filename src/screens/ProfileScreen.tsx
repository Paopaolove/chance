import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { ensureAndroidChannel } from '../utils/notifications';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { RatingLine } from '../components/RatingLine';
import { useChance } from '../data/ChanceContext';
import { mergeProfileTags } from '../data/interests';
import { categoryLabels } from '../data/mockOutings';
import { pricing } from '../data/pricing';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, shadows, spacing, typography } from '../theme';
import { planLabel } from '../utils/format';
import {
  hasFullPhotoAccess,
  isTrialActive,
  outingCreditsOf,
  trialDaysRemaining,
} from '../utils/subscription';
import { pickProfilePhoto } from '../utils/pickProfilePhoto';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const {
    state,
    getActiveOutingForUser,
    setPermissions,
    resetDemo,
    updateProfile,
    simulateOutingInMinutes,
    simulateTrialEnd,
    outgoingRequests,
    incomingRequests,
    getOutingById,
    getOutingsToRate,
    completeOuting,
    simulateLocalNotifications,
    reportGuestNoShow,
    reportHostNeverHonor,
    reportHostNoShow,
    simulateConfirmRace,
  } = useChance();
  const user = state.currentUser;
  const active = getActiveOutingForUser();
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <View style={styles.center}>
        <Text>Profil manquant</Text>
      </View>
    );
  }

  const trialDate = new Date(user.trialEndsAt).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const profileIncomplete = !user.bio.trim() || !user.firstName.trim();
  const displayTags = mergeProfileTags(user.interests, user.customFilters);

  const onPickPhoto = async () => {
    const uri = await pickProfilePhoto();
    if (uri) updateProfile({ photoUri: uri });
  };

  const enableNotifications = async () => {
    setBusy(true);
    try {
      await ensureAndroidChannel();
      const { status } = await Notifications.requestPermissionsAsync();
      setPermissions({ notificationsGranted: status === 'granted' });
      if (status !== 'granted') {
        Alert.alert(
          'Notifications refusées',
          'Tu pourras les activer plus tard dans les réglages du téléphone.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const enableLocation = async () => {
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissions({ locationGranted: status === 'granted' });
      if (status !== 'granted') {
        Alert.alert(
          'Localisation refusée',
          'Sans localisation, Chance reste limité à Paris intramuros en liste classique.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const onReset = () => {
    Alert.alert(
      'Réinitialiser la démo ?',
      'Tu reviendras au début de l’onboarding (slides → compte → téléphone → …).',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: () => resetDemo(),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>Chance</Text>
        {user.banned ? (
          <View style={styles.banBanner}>
            <Text style={styles.banTitle}>Compte suspendu (démo)</Text>
            <Text style={styles.banBody}>
              {user.bannedReason ??
                '2e no-show en tant qu’hôte — tu ne peux plus publier.'}
            </Text>
          </View>
        ) : (user.hostNoShowCount ?? 0) === 1 ||
          (user.hostPublishStrikeCount ?? 0) === 1 ? (
          <View style={styles.warnBanner}>
            <Text style={styles.warnTitle}>Avertissement</Text>
            <Text style={styles.warnBody}>
              {(user.hostNoShowCount ?? 0) === 1
                ? '1er no-show hôte. Un 2e entraînera un ban (démo).'
                : '1er avertissement publication jamais honorée. Un 2e = ban (démo).'}
            </Text>
          </View>
        ) : null}
        {user.lowerPriority || user.profileMention ? (
          <View style={styles.warnBanner}>
            <Text style={styles.warnTitle}>Priorité baissée</Text>
            <Text style={styles.warnBody}>
              {user.profileMention ??
                'Ghost après confirmation — priorité réduite dans les files hôte.'}
            </Text>
          </View>
        ) : (user.guestNoShowCount ?? 0) === 1 ? (
          <View style={styles.warnBanner}>
            <Text style={styles.warnTitle}>Caution perdue (ghost)</Text>
            <Text style={styles.warnBody}>
              1er ghost après confirmation. Un 2e baisse ta priorité + mention
              profil.
            </Text>
          </View>
        ) : null}
        <View style={styles.hero}>
          <Pressable onPress={onPickPhoto} accessibilityLabel="Photo de profil">
            <Avatar
              name={user.firstName}
              photoUri={user.photoUri}
              seed={user.id}
              size={hasFullPhotoAccess(user) ? 104 : 56}
            />
          </Pressable>
          <Pressable onPress={onPickPhoto}>
            <Text style={styles.photoLink}>
              {user.photoUri ? 'Changer la photo' : 'Ajouter une photo'}
            </Text>
          </Pressable>
          <Text style={styles.title}>{user.firstName}</Text>
          <RatingLine
            userId={user.id}
            firstName={user.firstName}
            onPress={() =>
              navigation.navigate('Reviews', {
                userId: user.id,
                userName: user.firstName,
              })
            }
          />
          <Text style={styles.sub}>
            {user.age} ans · {user.gender} · {user.neighborhood}
          </Text>
        </View>

        {profileIncomplete ? (
          <Pressable
            style={styles.ctaCard}
            onPress={() => navigation.navigate('EditProfile')}
          >
            <Text style={styles.ctaTitle}>Complète ton profil</Text>
            <Text style={styles.ctaBody}>
              Bio et centres d’intérêt aident les autres à te connaître avant
              une sortie.
            </Text>
            <Text style={styles.ctaLink}>Compléter →</Text>
          </Pressable>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>À propos</Text>
            <Pressable onPress={() => navigation.navigate('EditProfile')}>
              <Text style={styles.editLink}>Modifier</Text>
            </Pressable>
          </View>
          <Text style={styles.bio}>
            {user.bio.trim()
              ? user.bio
              : 'Pas encore de bio — ajoute-en une pour te présenter.'}
          </Text>
          {displayTags.length ? (
            <View style={styles.chips}>
              {displayTags.map((tag) => {
                const isCustom = (user.customFilters ?? []).some(
                  (c) => c.toLowerCase() === tag.toLowerCase(),
                );
                return (
                  <View
                    key={tag}
                    style={[styles.chip, isCustom && styles.customChip]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isCustom && styles.customChipText,
                      ]}
                    >
                      {tag}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.cardHint}>Aucun centre d’intérêt pour l’instant.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Dispo ce soir</Text>
          <Text style={styles.cardValue}>
            {user.dispoSoir ? 'Activée · expire à minuit' : 'Désactivée'}
          </Text>
          {user.dispoSoir ? (
            <Text style={styles.cardHint}>
              {[
                user.dispoSlot,
                user.dispoNeighborhood ?? user.neighborhood,
                user.dispoBudgetMax != null
                  ? `≤ ${user.dispoBudgetMax} €`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          {user.dispoSoir && user.dispoCategories?.length ? (
            <View style={styles.chips}>
              {user.dispoCategories.map((c) => (
                <View key={c} style={[styles.chip, styles.envieChip]}>
                  <Text style={[styles.chipText, styles.envieText]}>
                    {categoryLabels[c]}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <Button
            title="Gérer"
            variant="ghost"
            onPress={() => navigation.navigate('DispoSoir')}
            style={{ marginTop: spacing.md }}
          />
          {user.dispoSoir ? (
            <Button
              title="Créer une annonce"
              variant="secondary"
              onPress={() => {
                const slot = user.dispoSlot ?? '19:30';
                navigation.navigate('MainTabs', {
                  screen: 'Create',
                  params: {
                    fromDispo: true,
                    category: user.dispoCategories?.[0] ?? 'restaurant',
                    neighborhood:
                      user.dispoNeighborhood ?? user.neighborhood,
                    budgetMaxEuros: user.dispoBudgetMax ?? 25,
                    topic: user.dispoTopic,
                    excludedTopics: user.dispoExclusions?.join(', '),
                    timeLabel: slot === 'flexible' ? '19:30' : slot,
                    flexibleSlot: slot === 'flexible',
                  },
                });
              }}
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Compte</Text>
          <Text style={styles.cardValue}>
            {user.authProvider === 'apple'
              ? 'Apple'
              : user.authProvider === 'google'
                ? 'Google'
                : 'E-mail'}
          </Text>
          {user.email ? (
            <Text style={styles.cardHint}>{user.email}</Text>
          ) : null}
          <Text style={styles.cardHint}>Tél. {user.phone}</Text>
          {user.gender === 'femme' && user.womenOnlyPreference ? (
            <Text style={styles.cardHint}>Préférence : Femmes uniquement</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Notifications</Text>
          <Text style={styles.cardValue}>
            {user.notificationsGranted ? 'Activées' : 'Désactivées'}
          </Text>
          {!user.notificationsGranted ? (
            <Button
              title="Autoriser les notifications"
              variant="secondary"
              loading={busy}
              onPress={enableNotifications}
              style={{ marginTop: spacing.md }}
            />
          ) : null}
          <Text style={[styles.cardHint, { marginTop: spacing.md }]}>
            Locals : acceptation (délai 10 min), rappel à 3 min, chat à H−1.
          </Text>
          <Button
            title="Démo · simuler les 3 notifs"
            variant="ghost"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              try {
                const result = await simulateLocalNotifications('sortie démo');
                if (!result.ok) {
                  Alert.alert(
                    'Notifications',
                    result.reason === 'permission_denied'
                      ? 'Autorise d’abord les notifications.'
                      : result.reason,
                  );
                  return;
                }
                Alert.alert(
                  'Démo',
                  '3 notifs programmées (~1s / 4s / 7s) : accepté, rappel 3 min, chat H−1.',
                );
              } finally {
                setBusy(false);
              }
            }}
            style={{ marginTop: spacing.sm }}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Localisation</Text>
          <Text style={styles.cardValue}>
            {user.locationGranted ? 'Activée' : 'Désactivée'}
          </Text>
          <Text style={styles.cardHint}>
            Optionnel. Le feed reste basé sur le quartier et le temps de trajet
            (~30–40 min), pas sur un GPS continu.
          </Text>
          {!user.locationGranted ? (
            <Button
              title="Autoriser la localisation"
              variant="secondary"
              loading={busy}
              onPress={enableLocation}
              style={{ marginTop: spacing.md }}
            />
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Formule</Text>
          <Text style={styles.cardValue}>{planLabel(user.plan)}</Text>
          {isTrialActive(user) ? (
            <Text style={styles.cardHint}>
              Essai illimité · {trialDaysRemaining(user)} j. restant
              {trialDaysRemaining(user) > 1 ? 's' : ''} (jusqu’au {trialDate})
            </Text>
          ) : user.plan === 'essai' ? (
            <Text style={styles.cardHint}>
              Essai terminé le {trialDate} — choisis une formule pour confirmer
              une place.
            </Text>
          ) : null}
          {user.plan === 'essentiel' ? (
            <Text style={styles.cardHint}>
              {outingCreditsOf(user)} / 4 sorties restantes
              {user.planInterval === 'year'
                ? ' · annuel'
                : user.planInterval === 'month'
                  ? ' · mensuel'
                  : ''}
            </Text>
          ) : null}
          {user.plan === 'illimite' ? (
            <Text style={styles.cardHint}>
              Sorties illimitées
              {user.planInterval === 'year'
                ? ' · annuel'
                : user.planInterval === 'month'
                  ? ' · mensuel'
                  : ''}
            </Text>
          ) : null}
          {user.plan === 'payg' ? (
            <Text style={styles.cardHint}>
              {outingCreditsOf(user) > 0
                ? `${outingCreditsOf(user)} sortie(s) créditée(s)`
                : 'Aucune sortie créditée — rachète pour confirmer'}
            </Text>
          ) : null}
          <Button
            title="Gérer ma formule"
            variant="secondary"
            onPress={() => navigation.navigate('Paywall')}
            style={{ marginTop: spacing.md }}
          />
          <Button
            title="Simuler fin d’essai (J+30)"
            variant="ghost"
            onPress={() => {
              Alert.alert(
                'Simuler fin d’essai ?',
                'Ton essai passera à expiré. Confirmer une place ouvrira le paywall.',
                [
                  { text: 'Annuler', style: 'cancel' },
                  {
                    text: 'Simuler',
                    style: 'destructive',
                    onPress: () => {
                      simulateTrialEnd();
                      Alert.alert(
                        'Essai terminé (démo)',
                        'Choisis une formule pour confirmer une place.',
                      );
                    },
                  },
                ],
              );
            }}
            style={{ marginTop: spacing.sm }}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Annonce active</Text>
          <Text style={styles.cardValue}>
            {active ? active.title : 'Aucune (1 max)'}
          </Text>
          {active ? (
            <Button
              title="Voir"
              variant="ghost"
              onPress={() =>
                navigation.navigate('OutingDetail', { outingId: active.id })
              }
              style={{ marginTop: spacing.md }}
            />
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Rappels produit</Text>
          <Text style={styles.bullet}>• {pricing.trial}</Text>
          <Text style={styles.bullet}>• {pricing.payg}</Text>
          <Text style={styles.bullet}>• {pricing.essentielMonth} / {pricing.essentielYear}</Text>
          <Text style={styles.bullet}>• {pricing.illimiteMonth} / {pricing.illimiteYear}</Text>
          <Text style={styles.bullet}>• {pricing.deposit}</Text>
          <Text style={styles.bullet}>• Hôte : publication gratuite</Text>
          <Text style={styles.bullet}>
            • Chat 1 h avant · adresse après confirmation
          </Text>
          <Text style={styles.bullet}>
            • Confirmation en 10 min après acceptation
          </Text>
        </View>


        <View style={styles.card}>
          <Text style={styles.cardLabel}>Mes sorties à noter</Text>
          <Text style={styles.cardHint}>
            Après une sortie terminée, laisse une note (1–5) et un commentaire
            optionnel.
          </Text>
          {(() => {
            const toRate = getOutingsToRate();
            const confirmed = [
              ...outgoingRequests.filter((r) => r.status === 'confirmed'),
              ...incomingRequests.filter((r) => r.status === 'confirmed'),
            ];
            if (!toRate.length && !confirmed.length) {
              return (
                <Text style={[styles.cardHint, { marginTop: spacing.sm }]}>
                  Aucune sortie à noter pour l’instant.
                </Text>
              );
            }
            return (
              <>
                {toRate.map((item) => (
                  <View key={`${item.outing.id}-${item.toUserId}`} style={{ marginTop: spacing.md }}>
                    <Text style={styles.cardValue}>{item.outing.title}</Text>
                    <Text style={styles.cardHint}>Noter {item.toUserName}</Text>
                    <Button
                      title="Noter la sortie"
                      variant="secondary"
                      onPress={() =>
                        navigation.navigate('LeaveReview', {
                          outingId: item.outing.id,
                          toUserId: item.toUserId,
                          toUserName: item.toUserName,
                        })
                      }
                      style={{ marginTop: spacing.sm }}
                    />
                  </View>
                ))}
                {confirmed
                  .filter((r) => {
                    const o = getOutingById(r.outingId);
                    return o && o.status !== 'completed';
                  })
                  .map((r) => {
                    const o = getOutingById(r.outingId)!;
                    return (
                      <View key={`sim-${r.id}`} style={{ marginTop: spacing.md }}>
                        <Text style={styles.cardValue}>{o.title}</Text>
                        <Button
                          title="Simuler sortie terminée"
                          variant="ghost"
                          onPress={() => {
                            completeOuting(o.id);
                            Alert.alert(
                              'Sortie terminée',
                              'Tu peux maintenant noter ton binôme ci-dessus.',
                            );
                          }}
                          style={{ marginTop: spacing.sm }}
                        />
                      </View>
                    );
                  })}
              </>
            );
          })()}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Démo QA · chat</Text>
          <Text style={styles.cardHint}>
            « Simuler J−50 min » place une sortie confirmée dans ~50 min pour
            déverrouiller le chat sans attendre.
          </Text>
          {(() => {
            const confirmed = [
              ...outgoingRequests.filter((r) => r.status === 'confirmed'),
              ...incomingRequests.filter((r) => r.status === 'confirmed'),
            ];
            const seen = new Set<string>();
            const items = confirmed.filter((r) => {
              if (seen.has(r.outingId)) return false;
              seen.add(r.outingId);
              return true;
            });
            if (!items.length) {
              return (
                <Text style={[styles.cardHint, { marginTop: spacing.sm }]}>
                  Aucune sortie confirmée pour l’instant.
                </Text>
              );
            }
            return items.map((r) => {
              const o = getOutingById(r.outingId);
              if (!o) return null;
              return (
                <View key={r.outingId} style={{ marginTop: spacing.md }}>
                  <Text style={styles.cardValue}>{o.title}</Text>
                  <Button
                    title="Simuler J−50 min"
                    variant="secondary"
                    onPress={() => {
                      simulateOutingInMinutes(o.id, 50);
                      Alert.alert(
                        'Démo',
                        `« ${o.title} » est maintenant dans ~50 min. Ouvre le chat depuis Demandes.`,
                      );
                    }}
                    style={{ marginTop: spacing.sm }}
                  />
                  <Button
                    title="Ouvrir le chat"
                    variant="ghost"
                    onPress={() =>
                      navigation.navigate('ChatPlaceholder', {
                        outingId: o.id,
                        requestId: r.id,
                      })
                    }
                    style={{ marginTop: spacing.sm }}
                  />
                </View>
              );
            });
          })()}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Démo QA · cas limites</Text>
          <Text style={styles.cardHint}>
            Ghost invité, publication jamais honorée, course 2 confirmations,
            no-show hôte (1er/2e).
          </Text>
          <Button
            title="Simuler mon ghost (caution perdue)"
            variant="ghost"
            onPress={() => {
              const req = outgoingRequests.find((r) => r.status === 'confirmed');
              if (!req) {
                Alert.alert(
                  'Démo',
                  'Il faut une place confirmée (outgoing) pour simuler un ghost.',
                );
                return;
              }
              const r = reportGuestNoShow(req.id);
              if (!r.ok) Alert.alert('Impossible', r.reason);
              else
                Alert.alert(
                  r.lowerPriority ? 'Priorité baissée' : 'Caution perdue',
                  r.lowerPriority
                    ? '2e ghost — priorité baissée + mention profil.'
                    : '1er ghost — caution non remboursée.',
                );
            }}
            style={{ marginTop: spacing.sm }}
          />
          <Button
            title="Signaler ghost d’un invité"
            variant="ghost"
            onPress={() => {
              const req = incomingRequests.find((r) => r.status === 'confirmed');
              if (!req) {
                Alert.alert('Démo', 'Aucun invité confirmé sur tes sorties.');
                return;
              }
              const r = reportGuestNoShow(req.id);
              if (!r.ok) Alert.alert('Impossible', r.reason);
              else
                Alert.alert(
                  'Ghost invité',
                  r.lowerPriority
                    ? '2e — priorité baissée pour cet invité.'
                    : 'Caution de l’invité perdue (mock).',
                );
            }}
            style={{ marginTop: spacing.sm }}
          />
          <Button
            title="Publication jamais honorée (1er/2e)"
            variant="ghost"
            onPress={() => {
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
            }}
            style={{ marginTop: spacing.sm }}
          />
          <Button
            title="Course 2 confirmations (1er timestamp)"
            variant="ghost"
            onPress={() => {
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
            }}
            style={{ marginTop: spacing.sm }}
          />
          <Button
            title="No-show hôte sur moi (1er/2e)"
            variant="ghost"
            onPress={() => {
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
            }}
            style={{ marginTop: spacing.sm }}
          />
        </View>

        <Button
          title="Réinitialiser la démo"
          variant="ghost"
          onPress={onReset}
          style={{ marginTop: spacing.md }}
        />

        <Text style={styles.demoNote}>
          Mode démo local — pas de Stripe ni Supabase pour l’instant.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  banBanner: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  banTitle: {
    ...typography.bodyStrong,
    color: colors.danger,
    fontFamily: fonts.semiBold,
  },
  banBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  warnBanner: {
    backgroundColor: colors.warningSoft,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  warnTitle: {
    ...typography.bodyStrong,
    color: colors.warning,
    fontFamily: fonts.semiBold,
  },
  warnBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  brand: {

    ...typography.caption,
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  hero: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  photoLink: {
    ...typography.bodyStrong,
    color: colors.primary,
    marginTop: 4,
  },
  title: { ...typography.title, color: colors.text, marginTop: spacing.sm },
  sub: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  ctaCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.md,
    ...shadows.soft,
  },
  ctaTitle: {
    ...typography.subtitle,
    color: colors.primaryDark,
    marginBottom: 6,
  },
  ctaBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  ctaLink: { ...typography.bodyStrong, color: colors.primary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.soft,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: { ...typography.caption, color: colors.textMuted },
  editLink: {
    ...typography.caption,
    color: colors.primary,
    fontFamily: fonts.semiBold,
  },
  cardValue: {
    ...typography.subtitle,
    color: colors.text,
    marginTop: 4,
  },
  cardHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  bio: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chip: {
    backgroundColor: colors.chip,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  chipText: { ...typography.small, color: colors.textSecondary },
  customChip: { backgroundColor: colors.primarySoft },
  customChipText: {
    color: colors.primaryDark,
    fontFamily: fonts.medium,
  },
  envieChip: { backgroundColor: colors.primarySoft },
  envieText: { color: colors.primaryDark },
  bullet: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  demoNote: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
