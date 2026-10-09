import { CompositeNavigationProp, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { ensureAndroidChannel } from '../utils/notifications';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { genderLabel } from '../components/GenderPills';
import { GivenReviewSummary } from '../components/GivenReviewSummary';
import {
  MomentPhotoConsentCard,
  OwnPastMoment,
} from '../components/MomentPhotos';
import { RatingLine } from '../components/RatingLine';
import { useChance } from '../data/ChanceContext';
import { mergeProfileTags } from '../data/interests';
import { categoryLabels } from '../data/mockOutings';
import { describeDepositForfeitMoment, pricing } from '../data/pricing';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import {
  dispoSlotCreatePrefill,
  dispoSlotLabel,
} from '../utils/dispo';
import { formatOutingWhen, planLabel } from '../utils/format';
import {
  hasFullPhotoAccess,
  isTrialActive,
  outingCreditsOf,
  trialDaysRemaining,
} from '../utils/subscription';
import { pickMomentPhoto, pickProfilePhoto } from '../utils/pickProfilePhoto';
import { useOpenUserProfile } from '../utils/openUserProfile';
import {
  PARTNER_CULTURE_MAX_SAME_EVENING,
  PARTNER_KIND_LABELS,
  PARTNER_WARNINGS_BEFORE_CLOSE,
} from '../utils/partners';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Profile'>,
  NativeStackNavigationProp<RootStackParamList>
>;
type ProfileRoute = RouteProp<MainTabParamList, 'Profile'>;

export function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const openProfile = useOpenUserProfile();
  const route = useRoute<ProfileRoute>();
  const scrollRef = useRef<ScrollView>(null);
  const rateSectionY = useRef(0);
  const photosSectionY = useRef(0);
  const {
    state,
    getActiveOutingForUser,
    setPermissions,
    updateProfile,
    getOutingsToRate,
    getMyRatedOutingPairs,
    getCompletedOutingsMissingPresent,
    demoMarkConfirmedPresent,
    hasJokerAvailable,
    getMyPastMoments,
    getPendingMomentPhotoConsentsForMe,
    canAddMomentPhoto,
    addMomentPhoto,
    deleteMomentPhoto,
    respondMomentPhoto,
  } = useChance();
  const user = state.currentUser;
  const active = getActiveOutingForUser();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const focus = route.params?.focusSection;
    if (focus !== 'rate' && focus !== 'photos') return;
    const t = setTimeout(() => {
      const y = focus === 'photos' ? photosSectionY.current : rateSectionY.current;
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - 24),
        animated: true,
      });
      // Clear so a later rate_after tap can scroll again
      navigation.setParams({ focusSection: undefined });
    }, 350);
    return () => clearTimeout(t);
  }, [route.params?.focusSection, navigation]);

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

  // Ce qu’on ne demande plus à l’entrée : rappel doux, jamais bloquant.
  const missingItems: { key: string; label: string; hint: string }[] = [
    !user.photoUri
      ? {
          key: 'photo',
          label: 'Une photo',
          hint: 'Pour qu’on te reconnaisse sur place.',
        }
      : null,
    !user.phone?.trim()
      ? {
          key: 'phone',
          label: 'Ton téléphone',
          hint: 'Demandé avant ton premier moment.',
        }
      : null,
    !user.gender
      ? {
          key: 'gender',
          label: 'Ton genre',
          hint: 'Utile pour les moments « Femmes uniquement ».',
        }
      : null,
    !(user.interests?.length || user.customFilters?.length)
      ? {
          key: 'interests',
          label: 'Tes centres d’intérêt',
          hint: 'De quoi lancer la conversation.',
        }
      : null,
    !user.bio.trim()
      ? { key: 'bio', label: 'Une bio', hint: 'Deux lignes suffisent.' }
      : null,
  ].filter((x): x is { key: string; label: string; hint: string } => !!x);
  const profileIncomplete = missingItems.length > 0;
  const subParts = [
    `${user.age} ans`,
    genderLabel(user.gender, user.genderDetail),
    user.neighborhood,
  ].filter(Boolean);
  const displayTags = mergeProfileTags(user.interests, user.customFilters);

  const pastMoments = getMyPastMoments();
  const pendingConsents = getPendingMomentPhotoConsentsForMe();
  const nextConsent = pendingConsents[0];

  const onAddMomentPhoto = async (outingId: string) => {
    const gate = canAddMomentPhoto(outingId);
    if (!gate.ok) {
      Alert.alert(
        'Impossible',
        gate.reason === 'limit'
          ? 'Deux photos maximum par moment.'
          : 'Les photos s’ajoutent seulement après un moment terminé, si tu y étais.',
      );
      return;
    }
    const uri = await pickMomentPhoto();
    if (!uri) return;
    const r = addMomentPhoto(outingId, uri);
    if (!r.ok) Alert.alert('Impossible', 'La photo n’a pas pu être ajoutée.');
  };

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
          'Sans localisation, Moment reste limité à Paris intramuros en liste classique.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <Text style={styles.brand}>Moment</Text>
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
                'Absence après confirmation — priorité réduite dans les files hôte.'}
            </Text>
          </View>
        ) : (user.guestNoShowCount ?? 0) === 1 ? (
          <View style={styles.warnBanner}>
            <Text style={styles.warnTitle}>Caution perdue</Text>
            <Text style={styles.warnBody}>
              1re absence après confirmation — {describeDepositForfeitMoment()}{' '}
              Un 2e baisse ta priorité ; au bout de trois, le compte est fermé.
            </Text>
          </View>
        ) : null}
        <View style={styles.jokerBanner}>
          <Text style={styles.jokerText}>
            {hasJokerAvailable()
              ? 'Joker du mois disponible (Europe/Paris).'
              : 'Joker déjà utilisé ce mois (Europe/Paris).'}
          </Text>
        </View>
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
          <Text style={styles.ratingRespectNote}>
            Les notes parlent du respect en sortie, pas d’un crush. « X sorties »
            = sorties honorées, pas le nombre d’avis.
          </Text>
          <Text style={styles.sub}>
            {subParts.join(' · ')}
          </Text>
        </View>

        {profileIncomplete ? (
          <View style={styles.ctaCard}>
            <Text style={styles.ctaTitle}>Complète ton profil</Text>
            <Text style={styles.ctaBody}>
              Rien d’obligatoire tout de suite. Ça aide les autres à te
              connaître avant un moment.
            </Text>
            {missingItems.map((item, i) => (
              <Pressable
                key={item.key}
                style={[styles.missingRow, i > 0 && styles.missingRowBorder]}
                onPress={() => navigation.navigate('EditProfile')}
                accessibilityRole="button"
                accessibilityLabel={`Ajouter : ${item.label}`}
              >
                <View style={styles.missingText}>
                  <Text style={styles.missingLabel}>{item.label}</Text>
                  <Text style={styles.missingHint}>{item.hint}</Text>
                </View>
                <Text style={styles.ctaLink}>Ajouter</Text>
              </Pressable>
            ))}
          </View>
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

        <View
          onLayout={(e) => {
            photosSectionY.current = e.nativeEvent.layout.y;
          }}
        >
          {nextConsent ? (
            <MomentPhotoConsentCard
              photo={nextConsent.photo}
              outing={nextConsent.outing}
              remaining={pendingConsents.length - 1}
              onAccept={() => respondMomentPhoto(nextConsent.photo.id, 'accepted')}
              onDecline={() => respondMomentPhoto(nextConsent.photo.id, 'declined')}
            />
          ) : null}
          {pastMoments.length ? (
            <View style={styles.pastSection}>
              <Text style={styles.pastTitle}>Moments passés</Text>
              <Text style={styles.pastHint}>
                Une photo apparaît sur vos profils quand toute la table est
                d’accord.
              </Text>
              {pastMoments.map((m) => {
                const myCount = m.photos.filter((p) => p.mine).length;
                return (
                  <OwnPastMoment
                    key={m.outing.id}
                    outing={m.outing}
                    photos={m.photos}
                    myPhotoCount={myCount}
                    canAdd={canAddMomentPhoto(m.outing.id).ok}
                    onAdd={() => void onAddMomentPhoto(m.outing.id)}
                    onDelete={(id) => deleteMomentPhoto(id)}
                    onWithdraw={(id) => respondMomentPhoto(id, 'declined')}
                  />
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Dispo</Text>
          <Text style={styles.cardValue}>
            {user.dispoSoir ? 'Activée' : 'Désactivée'}
          </Text>
          {user.dispoSoir ? (
            <Text style={styles.cardHint}>
              {[
                dispoSlotLabel(user.dispoSlot) || user.dispoSlot,
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
                const slot = user.dispoSlot ?? 'soir';
                const cats = user.dispoCategories ?? [];
                const primary = (
                  cats.includes('autre')
                    ? 'autre'
                    : (cats[0] ?? 'restaurant')
                );
                const slotPrefill = dispoSlotCreatePrefill(slot);
                navigation.navigate('MainTabs', {
                  screen: 'Create',
                  params: {
                    fromDispo: true,
                    category: primary,
                    categoryDetail:
                      primary === 'autre'
                        ? user.dispoCategoryDetail
                        : undefined,
                    neighborhood:
                      user.dispoNeighborhood ?? user.neighborhood,
                    topic: user.dispoTopic,
                    excludedTopics: user.dispoExclusions?.join(', '),
                    timeLabel: slotPrefill.timeLabel,
                    dateOffsetDays: slotPrefill.dateOffsetDays,
                  },
                });
              }}
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
        </View>

        <View style={[styles.card, styles.partnerCard]}>
          <Text style={styles.cardLabel}>Espace lieu</Text>
          {(() => {
            const st = user.partnerStatus ?? 'none';
            if (st === 'pending') {
              return (
                <>
                  <Text style={styles.cardValue}>Demande envoyée</Text>
                  <Text style={styles.cardHint}>
                    {user.partnerVenueName ?? 'Ton lieu'}
                    {user.partnerKind
                      ? ` · ${PARTNER_KIND_LABELS[user.partnerKind]}`
                      : ''}
                    {user.partnerNeighborhood
                      ? ` · ${user.partnerNeighborhood}`
                      : ''}
                  </Text>
                  <Text style={styles.cardHint}>
                    L’équipe Moment vérifie ton lieu. Tu restes particulier en
                    attendant.
                  </Text>
                </>
              );
            }
            if (st === 'active') {
              const warnings = user.partnerWarnings ?? 0;
              return (
                <>
                  <Text style={styles.cardValue}>
                    {user.partnerVenueName ?? 'Ton lieu'} · Partenaire
                  </Text>
                  <Text style={styles.cardHint}>
                    {[
                      user.partnerKind
                        ? PARTNER_KIND_LABELS[user.partnerKind]
                        : null,
                      user.partnerNeighborhood,
                      user.partnerPhone,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {user.partnerPhrase ? (
                    <Text style={styles.cardHint}>« {user.partnerPhrase} »</Text>
                  ) : null}
                  <Text style={styles.cardHint}>
                    {user.partnerKind === 'culture'
                      ? `Places offertes : 2 par invitation, max ${PARTNER_CULTURE_MAX_SAME_EVENING} invitations le même soir.`
                      : 'Offre : un geste et/ou une remise, 1 annonce active, 1–3 places.'}
                  </Text>
                  <Text style={styles.cardHint}>
                    Avertissements : {warnings}/{PARTNER_WARNINGS_BEFORE_CLOSE}
                    {warnings > 0
                      ? ' — au prochain désistement du lieu, le compte partenaire est fermé.'
                      : ''}
                  </Text>
                  {user.partnerPinned ? (
                    <Text style={styles.cardHint}>
                      Remontée en tête active (démo).
                    </Text>
                  ) : null}
                </>
              );
            }
            if (st === 'closed') {
              return (
                <>
                  <Text style={[styles.cardValue, { color: colors.danger }]}>
                    Compte partenaire fermé
                  </Text>
                  <Text style={styles.cardHint}>
                    {user.partnerVenueName ?? 'Le lieu'} a eu 2 avertissements
                    (sorties annulées ou non honorées). Publication en tant que
                    lieu bloquée.
                  </Text>
                </>
              );
            }
            return (
              <>
                <Text style={styles.cardValue}>
                  {st === 'refused'
                    ? 'Demande non validée'
                    : 'Tu as un resto, un bar ou un lieu culturel ?'}
                </Text>
                <Text style={styles.cardHint}>
                  {st === 'refused'
                    ? 'L’équipe Moment n’a pas validé la demande — tu restes particulier. Tu peux renvoyer une fiche.'
                    : 'Invite des gens chez toi : un geste, une remise ou des places offertes. 0 % de commission.'}
                </Text>
                <Button
                  title="Je représente un lieu"
                  variant="secondary"
                  onPress={() => navigation.navigate('PartnerApply')}
                  style={{ marginTop: spacing.md }}
                />
              </>
            );
          })()}
          <Text style={[styles.cardHint, { marginTop: spacing.md }]}>
            Bientôt : forfait lieu 29 €/mois = 2 remontées en tête du fil. Rien
            à payer pour l’instant.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Compte</Text>
          <Text style={styles.cardValue}>
            {user.authProvider === 'apple'
              ? 'Apple (démo)'
              : user.authProvider === 'google'
                ? 'Google (démo)'
                : 'E-mail (démo)'}
          </Text>
          <Text style={styles.cardHint}>
            Pas de vraie authentification — connexion simulée locale.
          </Text>
          {user.email ? (
            <Text style={styles.cardHint}>{user.email}</Text>
          ) : null}
          <Text style={styles.cardHint}>
            {user.phone?.trim() ? `Tél. ${user.phone}` : 'Tél. pas encore renseigné'}
          </Text>
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
            Prioritaires : nouvelle demande, accepté (+10 min), rappel ~3 min,
            confirmé, chat H−1, retard, annulation, nouveau lieu, noter après.
            Pas de notif pour chaque annonce du fil. Fallback : bandeau + Alert
            si push indisponible.
          </Text>
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
                : 'Aucun moment crédité — rachète pour confirmer'}
            </Text>
          ) : null}
          <Button
            title="Gérer ma formule"
            variant="secondary"
            onPress={() => navigation.navigate('Paywall')}
            style={{ marginTop: spacing.md }}
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


        <View
          style={styles.card}
          onLayout={(e) => {
            rateSectionY.current = e.nativeEvent.layout.y;
          }}
        >
          <Text style={styles.cardLabel}>Mes moments</Text>
          <Text style={styles.cardHint}>
            Après une sortie terminée, note la personne et le lieu
            séparément (commentaires optionnels). Une fois notée, elle
            passe dans Passées.
          </Text>
          {(() => {
            const toRate = getOutingsToRate();
            const rated = getMyRatedOutingPairs();
            const missingPresent = getCompletedOutingsMissingPresent();
            if (!toRate.length && !rated.length && !missingPresent.length) {
              return (
                <Text style={[styles.cardHint, { marginTop: spacing.sm }]}>
                  Aucun moment pour l’instant.
                </Text>
              );
            }
            return (
              <>
                {toRate.length || missingPresent.length ? (
                  <>
                    <Text style={styles.sortieSection}>À noter</Text>
                    {toRate.map((item) => (
                      <View
                        key={`${item.outing.id}-${item.toUserId}`}
                        style={{ marginTop: spacing.md }}
                      >
                        <Text style={styles.cardValue}>{item.outing.title}</Text>
                        <Pressable
                          onPress={() => openProfile(item.toUserId)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Voir le profil de ${item.toUserName}`}
                          style={styles.personLinkRow}
                        >
                          <Avatar
                            name={item.toUserName}
                            seed={item.toUserId}
                            size={28}
                          />
                          <Text style={styles.cardHint}>
                            Noter{' '}
                            <Text style={styles.personLinkText}>
                              {item.toUserName}
                            </Text>
                          </Text>
                        </Pressable>
                        <Button
                          title="Noter le moment"
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
                    {missingPresent.map((item) => (
                      <View
                        key={`missing-${item.outing.id}`}
                        style={{ marginTop: spacing.md }}
                      >
                        <Text style={styles.cardValue}>{item.outing.title}</Text>
                        <Text style={styles.cardHint}>
                          Sortie terminée — personne n’est marquée présente
                          (démo).
                        </Text>
                        <Button
                          title="Marquer présent et noter"
                          variant="secondary"
                          onPress={() => {
                            const marked = demoMarkConfirmedPresent(
                              item.outing.id,
                            );
                            const toUserId =
                              marked.ok && marked.rateTarget
                                ? marked.rateTarget.toUserId
                                : item.rateTarget.toUserId;
                            const toUserName =
                              marked.ok && marked.rateTarget
                                ? marked.rateTarget.toUserName
                                : item.rateTarget.toUserName;
                            // Defer so MARK_GUEST_PRESENT is committed before LeaveReview gates.
                            setTimeout(() => {
                              navigation.navigate('LeaveReview', {
                                outingId: item.outing.id,
                                toUserId,
                                toUserName,
                              });
                            }, 0);
                          }}
                          style={{ marginTop: spacing.sm }}
                        />
                      </View>
                    ))}
                  </>
                ) : null}
                {rated.length ? (
                  <>
                    <Text style={styles.sortieSection}>Passées</Text>
                    {rated.map((item) => (
                      <View
                        key={`rated-${item.outing.id}-${item.toUserId}`}
                        style={{ marginTop: spacing.md }}
                      >
                        <Text style={styles.cardValue}>{item.outing.title}</Text>
                        <Text style={styles.cardHint}>
                          {formatOutingWhen(item.outing.startsAt)} ·{' '}
                          {item.outing.venueName || item.outing.neighborhood}
                        </Text>
                        <Pressable
                          onPress={() => openProfile(item.toUserId)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Voir le profil de ${item.toUserName}`}
                          style={styles.personLinkRow}
                        >
                          <Avatar
                            name={item.toUserName}
                            seed={item.toUserId}
                            size={28}
                          />
                          <Text style={styles.cardHint}>
                            avec{' '}
                            <Text style={styles.personLinkText}>
                              {item.toUserName}
                            </Text>
                          </Text>
                        </Pressable>
                        <GivenReviewSummary
                          review={item.review}
                          onPressVoirAvis={() =>
                            navigation.navigate('Reviews', {
                              userId: item.toUserId,
                              userName: item.toUserName,
                            })
                          }
                        />
                      </View>
                    ))}
                  </>
                ) : null}
              </>
            );
          })()}
        </View>

        <Text style={styles.demoNote}>
          Mode démo local — pas de Stripe ni Supabase pour l’instant. Outils QA :
          5 taps sur le logo Moment.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  personLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  personLinkText: {
    color: colors.text,
    fontFamily: fonts.semiBold,
  },
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  jokerBanner: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  jokerText: { ...typography.caption, color: colors.text, fontFamily: fonts.semiBold },
  banBanner: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.danger,
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
    borderWidth: 1,
    borderColor: colors.warning,
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
    color: colors.text,
    marginTop: 4,
  },
  title: { ...typography.title, color: colors.text, marginTop: spacing.sm },
  ratingRespectNote: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
    marginHorizontal: spacing.lg,
  },
  sub: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  ctaCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  ctaTitle: {
    ...typography.subtitle,
    color: colors.text,
    marginBottom: 6,
  },
  ctaBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  ctaLink: { ...typography.bodyStrong, color: colors.text },
  missingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  missingRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  missingText: { flex: 1 },
  missingLabel: { ...typography.bodyStrong, color: colors.text },
  missingHint: { ...typography.caption, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: { ...typography.caption, color: colors.textMuted },
  partnerCard: { borderColor: colors.border },
  editLink: {
    ...typography.caption,
    color: colors.text,
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
  pastSection: { marginBottom: spacing.md },
  pastTitle: {
    ...typography.subtitle,
    color: colors.text,
    marginTop: spacing.sm,
  },
  pastHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  sortieSection: {
    ...typography.bodyStrong,
    color: colors.text,
    fontFamily: fonts.semiBold,
    marginTop: spacing.lg,
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
    borderWidth: 1,
    borderColor: colors.chipBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  chipText: { ...typography.small, color: colors.chipText },
  customChip: { backgroundColor: colors.chip },
  customChipText: {
    color: colors.text,
    fontFamily: fonts.medium,
  },
  envieChip: { backgroundColor: colors.chip },
  envieText: { color: colors.text },
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
