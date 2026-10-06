import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { RatingLine } from '../components/RatingLine';
import { useChance } from '../data/ChanceContext';
import {
  describeDepositForfeitMoment,
} from '../data/pricing';
import { budgetChipLabel, categoryLabels, mockHosts } from '../data/mockOutings';
import { formatOutingCategoryLabel } from '../utils/categoryLabel';
import {
  formatTravelMinutes,
  getTravelMinutes,
} from '../data/travelTime';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { chatUnlockOptsFor, isChatUnlocked, lateLabel } from '../utils/chat';
import {
  canGuestSelfArrivePartner,
  canPartnerFlagDispute,
  canPartnerMarkGuestAbsent,
  isPartnerCultureListing,
  isPartnerListing,
  partnerListingChips,
} from '../utils/partners';
import { imprevuMotiveLabel } from '../utils/imprevu';
import { formatOutingWhen } from '../utils/format';
import { isStartsAtPast } from '../utils/parisTime';
import {
  isOutingAcceptingRequests,
  isUrgentOnSite,
} from '../utils/outingActive';
import { makeVenueKey } from '../utils/venue';
import { useOpenUserProfile } from '../utils/openUserProfile';
import { hasFullPhotoAccess, hostPhotoSize } from '../utils/subscription';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type R = RouteProp<RootStackParamList, 'OutingDetail'>;

const RECOMMENDED_INTRO =
  'Salut ! Ta sortie m’intéresse — je suis motivé et dispo. À bientôt ?';

export function OutingDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const openProfile = useOpenUserProfile();
  const {
    getOutingById,
    joinOuting,
    state,
    outgoingRequests,
    incomingRequests,
    closeOuting,
    cancelOuting,
    completeOuting,
    markGuestPresent,
    reportGuestNoShow,
    cancelRequest,
    getLateReportsForOthers,
    respondVenueAlternate,
    getRequestById,
    getPendingImprevuForMe,
    getMyImprevu,
    respondImprevu,
    hasJokerAvailable,
    useJokerOnImprevu,
    guestArrivedPartner,
    partnerMarkNoShow,
  } = useChance();
  const outing = getOutingById(route.params.outingId);
  const [message, setMessage] = useState(RECOMMENDED_INTRO);
  const [suggestedDate, setSuggestedDate] = useState('');
  const [joinedId, setJoinedId] = useState<string | null>(null);

  const myRequest = useMemo(() => {
    if (!outing || !state.currentUser) return undefined;
    return (
      outgoingRequests.find(
        (r) =>
          r.outingId === outing.id &&
          (r.status === 'pending' ||
            r.status === 'accepted' ||
            r.status === 'confirmed'),
      ) ?? (joinedId ? { id: joinedId, status: 'pending' as const } : undefined)
    );
  }, [outing, state.currentUser, outgoingRequests, joinedId]);

  const photoUri = useMemo(() => {
    if (!outing) return undefined;
    if (state.currentUser?.id === outing.hostId) {
      return state.currentUser.photoUri;
    }
    return mockHosts.find((h) => h.id === outing.hostId)?.photoUri;
  }, [outing, state.currentUser]);

  if (!outing) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Sortie introuvable.</Text>
      </View>
    );
  }

  const isHost = state.currentUser?.id === outing.hostId;
  const partner = isPartnerListing(outing);
  const partnerCulture = isPartnerCultureListing(outing);
  const partnerChips = partner ? partnerListingChips(outing) : [];
  const chatOpts = chatUnlockOptsFor(outing);
  const myNoSpot =
    partner && !myRequest
      ? outgoingRequests.find(
          (r) => r.outingId === outing.id && r.partnerNoSpot,
        )
      : undefined;
  const canSeeExact =
    isHost ||
    outgoingRequests.some(
      (r) => r.outingId === outing.id && r.status === 'confirmed',
    );
  const photoSize = hostPhotoSize(state.currentUser);
  const lateFromOthers = getLateReportsForOthers(outing.id);
  const travel =
    state.currentUser?.neighborhood && !isHost
      ? getTravelMinutes(
          state.currentUser.neighborhood,
          outing.neighborhood,
        )
      : undefined;

  const onJoin = () => {
    const result = joinOuting(
      outing.id,
      message,
      suggestedDate.trim() || undefined,
    );
    if (!result.ok) {
      const messages: Record<string, string> = {
        women_only: 'Cette sortie est réservée aux femmes.',
        full: 'Plus de place disponible.',
        already_requested: 'Tu as déjà une demande en cours.',
        own_outing: 'C’est ta propre sortie.',
        outing_started:
          'Cette sortie a déjà commencé ou est terminée — plus de demandes.',
      };
      Alert.alert('Impossible', messages[result.reason] ?? result.reason);
      return;
    }
    setJoinedId(result.requestId);
    if (partner) {
      // Zéro clic côté lieu : direct à la confirmation (10 min + caution).
      navigation.navigate('ConfirmSlot', { requestId: result.requestId });
      return;
    }
    const isGuest = !state.currentUser?.registered;
    if (isGuest) {
      Alert.alert(
        'Demande envoyée',
        'Si tu es accepté, tu auras 10 minutes pour confirmer. Crée ton compte pour qu’on puisse te prévenir.',
        [
          { text: 'Plus tard', style: 'cancel' },
          {
            text: 'Créer mon compte',
            onPress: () =>
              navigation.navigate('Register', { reason: 'after_request' }),
          },
        ],
      );
    } else {
      Alert.alert(
        'Demande envoyée',
        'Si tu es accepté, tu auras 10 minutes pour confirmer. Une caution de 20 € sera bloquée à la confirmation.',
      );
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {lateFromOthers.length ? (
        <View style={styles.lateBanner}>
          {lateFromOthers.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => openProfile(r.reporterId)}
              accessibilityRole="button"
              accessibilityLabel={`Profil de ${r.reporterName}`}
            >
              <Text style={styles.lateBannerText}>
                ⏱ {r.reporterName} a un retard ({lateLabel(r.minutes, { orMore: r.orMore })})
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {(() => {
        const pending = getPendingImprevuForMe(outing.id);
        if (!pending) return null;
        return (
          <View style={styles.imprevuCard}>
            <Pressable
              onPress={() => openProfile(pending.reporterId)}
              accessibilityRole="button"
              accessibilityLabel={`Profil de ${pending.reporterName}`}
            >
              <Text style={styles.imprevuTitle}>
                {pending.reporterName} signale un imprévu.
              </Text>
            </Pressable>
            <Text style={styles.imprevuBody}>
              {imprevuMotiveLabel(pending.motive)}
            </Text>
            <Text style={styles.imprevuReason}>{pending.reason}</Text>
            <Button
              title="Accepter l’imprévu"
              onPress={() => {
                const r = respondImprevu(pending.id, 'accepted');
                if (!r.ok) Alert.alert('Impossible', r.reason);
                else
                  Alert.alert(
                    'Imprévu accepté. Caution rendue.',
                    'Participation annulée (pas une absence). Les autres places confirmées restent.',
                  );
              }}
              style={{ marginTop: spacing.md }}
            />
            <Button
              title="Refuser"
              variant="secondary"
              onPress={() => {
                const r = respondImprevu(pending.id, 'refused');
                if (!r.ok) Alert.alert('Impossible', r.reason);
                else
                  Alert.alert(
                    'Imprévu refusé',
                    'Caution encore bloquée. Annule au moins 3 heures avant pour la récupérer ; trop tard ou absence → perdue (6,90 € Moment / 13,10 € hôte). L’invité peut utiliser son joker.',
                  );
              }}
              style={{ marginTop: spacing.sm }}
            />
          </View>
        );
      })()}

      {outing.venueIssue ? (
        <View style={styles.venueIssueCard}>
          <Text style={styles.venueIssueTitle}>Restaurant fermé</Text>
          {outing.venueIssue.alternate ? (
            <Text style={styles.venueIssueBody}>
              Proposition · {outing.venueIssue.alternate.venueName} ·{' '}
              {outing.venueIssue.alternate.neighborhood} · ≤{' '}
              {outing.venueIssue.alternate.budgetMaxEuros} €
            </Text>
          ) : null}
          {(() => {
            const me = state.currentUser?.id;
            const acceptedIds = outing.venueIssue.acceptedByUserIds ?? [];
            const refusedIds = outing.venueIssue.refusedByUserIds ?? [];
            const iAccepted = !!me && acceptedIds.includes(me);
            const iRefused = !!me && refusedIds.includes(me);
            const canRespondVenue =
              !isHost &&
              outing.venueIssue.status === 'alternate_proposed' &&
              !!outing.venueIssue.alternate &&
              myRequest?.status === 'confirmed' &&
              !iAccepted &&
              !iRefused;
            return (
              <>
                {canRespondVenue ? (
                  <View style={styles.venueIssueActions}>
                    <Button
                      title="Accepter le lieu alternatif"
                      onPress={() => {
                        const r = respondVenueAlternate(outing.id, 'accepted');
                        if (!r.ok) Alert.alert('Impossible', r.reason);
                        else
                          Alert.alert(
                            'Lieu mis à jour',
                            'Même quartier, budget proche. Caution conservée.',
                          );
                      }}
                    />
                    <Button
                      title="Refuser (caution remboursée)"
                      variant="secondary"
                      onPress={() => {
                        const r = respondVenueAlternate(outing.id, 'refused');
                        if (!r.ok) Alert.alert('Impossible', r.reason);
                        else
                          Alert.alert(
                            'Tu sors',
                            'Caution rendue — tu n’es plus participant. Pas d’absence. Les autres peuvent encore répondre.',
                          );
                      }}
                      style={{ marginTop: spacing.sm }}
                    />
                  </View>
                ) : null}
                {iAccepted ||
                (outing.venueIssue.status === 'alternate_accepted' &&
                  !iRefused) ? (
                  <Text style={styles.venueIssueOk}>
                    Nouveau lieu accepté — caution conservée.
                  </Text>
                ) : null}
                {iRefused ? (
                  <Text style={styles.venueIssueOk}>
                    Tu as refusé — tu sors, caution rendue (pas d’absence).
                  </Text>
                ) : null}
                {outing.venueIssue.status === 'refused' && !iRefused ? (
                  <Text style={styles.venueIssueOk}>
                    Nouveau lieu refusé par les invités — cautions rendues.
                  </Text>
                ) : null}
              </>
            );
          })()}
        </View>
      ) : null}


      {/* Visible before accept: listing, 1 photo, place, budget */}
      <Pressable
        style={styles.hostBlock}
        onPress={() => openProfile(outing.hostId)}
        accessibilityRole="button"
        accessibilityLabel={`Profil de ${outing.hostName}`}
      >
        <Avatar
          name={outing.hostName}
          photoUri={photoUri}
          seed={outing.hostId}
          size={photoSize}
        />
        <View style={styles.hostText}>
          {partner ? (
            <View style={styles.partnerNameRow}>
              <Text style={styles.hostName}>{outing.hostName}</Text>
              <View style={styles.partnerBadge}>
                <Text style={styles.partnerBadgeText}>Partenaire</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.hostName}>
              {outing.hostName}, {outing.hostAge}
            </Text>
          )}
          <RatingLine
            userId={outing.hostId}
            firstName={outing.hostName}
            onPress={() => openProfile(outing.hostId)}
          />
          <Text style={styles.hostMeta}>
            {outing.neighborhood}
            {travel !== undefined
              ? ` · ${formatTravelMinutes(travel)}`
              : ''}
          </Text>
          {!hasFullPhotoAccess(state.currentUser) ? (
            <Pressable onPress={() => navigation.navigate('Paywall')}>
              <Text style={styles.unlockHint}>
                Photo en grand avec essai ou abonnement →
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>

      <Pressable
        onPress={() => openProfile(outing.hostId)}
        accessibilityRole="button"
        accessibilityLabel={`Profil de ${outing.hostName}`}
      >
        <Text style={styles.inviteLine}>
          {partner
            ? `${outing.hostName} · Partenaire${partnerChips.length ? ` · ${partnerChips.join(' · ')}` : ''}`
            : `${outing.hostName} t'invite${
                outing.budgetMaxEuros <= 0
                  ? ' · Gratuit'
                  : ` · jusqu'à ${outing.budgetMaxEuros} €`
              }`}
        </Text>
      </Pressable>
      <View style={styles.chips}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{formatOutingCategoryLabel(outing.category, outing.categoryDetail)}</Text>
        </View>
        {partner ? (
          partnerChips.map((c) => (
            <View key={c} style={[styles.chip, styles.chipWomen]}>
              <Text style={[styles.chipText, { color: colors.primaryDark }]}>
                {c}
              </Text>
            </View>
          ))
        ) : (
          <View style={styles.chip}>
            <Text style={styles.chipText}>
              {budgetChipLabel(outing.budgetMaxEuros)}
            </Text>
          </View>
        )}
        {outing.womenOnly ? (
          <View style={[styles.chip, styles.chipWomen]}>
            <Text style={[styles.chipText, { color: colors.primaryDark }]}>
              Femmes uniquement
            </Text>
          </View>
        ) : null}
        {outing.flexibleSlot ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>Créneau flexible</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.title}>{outing.title}</Text>
      <Text style={styles.when}>{formatOutingWhen(outing.startsAt)}</Text>

      <View style={styles.card}>
        <Text style={styles.section}>Lieu</Text>
        <Pressable
          onPress={() =>
            navigation.navigate('VenueDetail', {
              venueKey: makeVenueKey(outing.venueName, outing.neighborhood),
              venueName: outing.venueName,
              neighborhood: outing.neighborhood,
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`Voir les avis du lieu ${outing.venueName}`}
        >
          <Text style={[styles.body, styles.venueLink]}>
            {outing.venueName} · {outing.neighborhood}
            {outing.approxArea && outing.approxArea !== outing.neighborhood
              ? ` · ${outing.approxArea}`
              : ''}
          </Text>
          <Text style={styles.venueAvisLink}>Voir les avis du lieu</Text>
        </Pressable>
        {canSeeExact ? (
          <>
            <Text style={[styles.section, { marginTop: spacing.md }]}>
              Adresse exacte
            </Text>
            <Text style={styles.body}>{outing.exactAddress}</Text>
          </>
        ) : (
          <Text style={styles.hint}>
            L’adresse exacte n’est visible qu’après confirmation.
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>
          {partner ? 'Offre du lieu' : 'Invitation'}
        </Text>
        <Text style={styles.body}>
          {partnerCulture
            ? `${outing.capacity} places offertes par le lieu (billets). Cette invitation a son propre chat.`
            : partner
              ? `${partnerChips.join(' + ') || 'Offre du lieu'} — chacun règle le reste de sa part sur place (pas via l’app).`
              : outing.budgetMaxEuros <= 0
                ? 'Sortie gratuite — réglée sur place, pas via l’app.'
                : `J'invite jusqu'à ${outing.budgetMaxEuros} € par personne, réglé sur place au lieu (pas via l'app). Au-delà = hors invitation.`}
        </Text>
        {partner ? (
          <Text style={[styles.hint, { marginTop: spacing.sm }]}>
            Pas d’acceptation à attendre : tu rejoins, tu confirmes en 10 min
            (caution 20 €) et la place est à toi s’il en reste. Chat ouvert dès
            la confirmation.
          </Text>
        ) : null}
        {outing.inviteIncludes ? (
          <Text style={[styles.hint, { marginTop: spacing.sm }]}>
            Inclus · {outing.inviteIncludes}
          </Text>
        ) : null}
        {outing.inviteExtras ? (
          <Text style={styles.hint}>Hors invitation · {outing.inviteExtras}</Text>
        ) : null}
        {outing.ticketsAlreadyBought && !partner ? (
          <Text style={styles.hint}>Billets déjà achetés par l’hôte</Text>
        ) : null}
        <Text style={[styles.hint, { marginTop: spacing.sm }]}>
          Caution 20 € à la confirmation — ce n’est pas l’addition. Pas de
          transfert entre personnes.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Le moment</Text>
        <Text style={styles.body}>{outing.description}</Text>
        {outing.topic ? (
          <Text style={[styles.hint, { marginTop: spacing.sm }]}>
            Sujet · {outing.topic}
          </Text>
        ) : null}
        {outing.excludedTopics?.length ? (
          <Text style={styles.hint}>
            À éviter · {outing.excludedTopics.join(', ')}
          </Text>
        ) : null}
        <Text style={[styles.hint, { marginTop: spacing.sm }]}>
          {outing.spotsLeft} place{outing.spotsLeft > 1 ? 's' : ''} · capacité{' '}
          {outing.capacity}
        </Text>
      </View>

      {(() => {
        // Host: pending/accepted/confirmed. Autres: confirmés seulement (pas les demandes).
        const guests = (isHost ? incomingRequests : state.requests).filter(
          (r) =>
            r.outingId === outing.id &&
            (isHost
              ? r.status === 'pending' ||
                r.status === 'accepted' ||
                r.status === 'confirmed'
              : r.status === 'confirmed' &&
                r.userId !== state.currentUser?.id),
        );
        if (!guests.length) return null;
        return (
          <View style={styles.card}>
            <Text style={styles.section}>
              {isHost ? 'Demandes & invités' : 'Autres participants'}
            </Text>
            {guests.map((r) => (
              <Pressable
                key={r.id}
                style={styles.guestRow}
                onPress={() => openProfile(r.userId)}
                accessibilityRole="button"
                accessibilityLabel={`Profil de ${r.userName}`}
              >
                <Avatar
                  name={r.userName}
                  seed={r.userId}
                  size={40}
                />
                <View style={styles.guestText}>
                  <Text style={styles.guestName}>
                    {r.userName}, {r.userAge}
                  </Text>
                  <Text style={styles.guestMeta}>
                    {r.status === 'pending'
                      ? 'Demande en attente'
                      : r.status === 'accepted'
                        ? r.partnerAutoSeat
                          ? 'A rejoint — confirmation en cours (chaise non réservée)'
                          : 'Accepté — à confirmer'
                        : r.status === 'confirmed'
                          ? r.partnerDispute
                            ? 'Litige présence'
                            : r.guestArrivedAt
                              ? 'Confirmé · arrivé'
                              : 'Confirmé'
                          : r.status}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        );
      })()}

      {isHost ? (
        <View style={styles.actions}>
          {outing.status === 'open' || outing.status === 'full' ? (
            <>
              <Button
                title="Clôturer les inscriptions"
                variant="secondary"
                onPress={() => {
                  Alert.alert(
                    'Clôturer les inscriptions ?',
                    'Plus de nouvelles demandes. Les invités déjà confirmés gardent leur place.',
                    [
                      { text: 'Retour', style: 'cancel' },
                      {
                        text: 'Clôturer',
                        onPress: () => {
                          closeOuting(outing.id);
                          Alert.alert(
                            'Inscriptions closes',
                            'Les confirmés gardent leur place.',
                          );
                        },
                      },
                    ],
                  );
                }}
              />
              <Button
                title="Annuler la sortie"
                variant="danger"
                onPress={() => {
                  const hasConfirmed = incomingRequests.some(
                    (r) =>
                      r.outingId === outing.id && r.status === 'confirmed',
                  );
                  Alert.alert(
                    'Annuler toute la sortie ?',
                    partner && hasConfirmed
                      ? 'Toutes les cautions seront rendues. Ton lieu reçoit 1 avertissement — au 2e, le compte partenaire est fermé.'
                      : hasConfirmed
                        ? 'Les places confirmées seront annulées et les cautions rendues (mock).'
                        : 'La sortie sera fermée et les demandes en cours annulées.',
                    [
                      { text: 'Retour', style: 'cancel' },
                      {
                        text: 'Annuler la sortie',
                        style: 'destructive',
                        onPress: () => {
                          const res = cancelOuting(outing.id);
                          if (res.ok) {
                            Alert.alert('Sortie annulée', 'Cautions rendues si besoin (mock).');
                            navigation.goBack();
                          }
                        },
                      },
                    ],
                  );
                }}
                style={{ marginTop: spacing.md }}
              />
            </>
          ) : (
            <Text style={styles.hint}>
              {outing.status === 'completed'
                ? 'Sortie terminée.'
                : outing.status === 'cancelled'
                  ? 'Sortie annulée.'
                  : outing.status === 'closed'
                    ? partner && outing.partnerAutoClosedFull
                      ? 'Complet — annonce clôturée automatiquement. Les confirmés gardent leur place.'
                      : partnerCulture &&
                          !incomingRequests.some(
                            (r) =>
                              r.outingId === outing.id &&
                              r.status === 'confirmed',
                          )
                        ? 'Invitation tombée — personne n’a confirmé à l’heure.'
                        : 'Inscriptions closes — les confirmés gardent leur place.'
                    : null}
            </Text>
          )}
          {outing.status !== 'completed' &&
          outing.status !== 'cancelled' &&
          isStartsAtPast(outing.startsAt) ? (
            <Button
              title="Marquer comme terminée"
              variant="secondary"
              onPress={() => {
                completeOuting(outing.id);
                Alert.alert(
                  'Sortie terminée',
                  'Confirme la présence de chaque invité pour rendre la caution et débloquer les avis (confirmé ≠ présent).',
                );
              }}
              style={{ marginTop: spacing.md }}
            />
          ) : null}
          {incomingRequests
            .filter((r) => r.outingId === outing.id && r.status === 'confirmed')
            .map((r) => (
              <View key={r.id} style={{ marginTop: spacing.md }}>
                <Button
                  title={`Chat avec ${r.userName}`}
                  variant="secondary"
                  onPress={() =>
                    navigation.navigate('ChatPlaceholder', {
                      outingId: outing.id,
                      requestId: r.id,
                    })
                  }
                />
                {partner ? (
                  <View style={{ marginTop: spacing.sm }}>
                    <Text style={styles.hint}>
                      {r.partnerDispute
                        ? `Litige · ${r.partnerDispute.note}`
                        : r.attendance === 'present'
                          ? `${r.userName} · arrivé · caution rendue`
                          : r.attendance === 'absent'
                            ? `${r.userName} · pas venu · caution perdue (6,90 € Moment / 13,10 € pour ton lieu)`
                            : r.depositStatus === 'returned'
                              ? `${r.userName} · caution rendue (silence le lendemain)`
                              : 'Rien à faire si la personne est là. « Pas venu » seulement si la chaise reste vide, le soir même.'}
                    </Text>
                    {canPartnerMarkGuestAbsent(outing, r, state.currentUser?.id ?? '') ? (
                      <Button
                        title={`Pas venu (${r.userName})`}
                        variant="danger"
                        onPress={() => {
                          Alert.alert(
                            'Chaise vide ?',
                            `${r.userName} n’a pas signalé son arrivée. « Pas venu » = lapin : caution perdue (6,90 € Moment / 13,10 € pour ton lieu).`,
                            [
                              { text: 'Retour', style: 'cancel' },
                              {
                                text: 'Pas venu',
                                style: 'destructive',
                                onPress: () => {
                                  const res = partnerMarkNoShow(r.id);
                                  if (!res.ok) Alert.alert('Impossible', res.reason);
                                },
                              },
                            ],
                          );
                        }}
                        style={{ marginTop: spacing.sm }}
                      />
                    ) : null}
                    {canPartnerFlagDispute(outing, r, state.currentUser?.id ?? '') ? (
                      <Button
                        title={`Pas venu (${r.userName} dit être arrivé)`}
                        variant="ghost"
                        onPress={() => {
                          const res = partnerMarkNoShow(r.id);
                          if (!res.ok) Alert.alert('Impossible', res.reason);
                          else
                            Alert.alert(
                              'Litige ouvert',
                              'Arrivé selon l’invité, pas venu selon toi : l’équipe Moment demandera une photo plus tard. Aucune sanction automatique.',
                            );
                        }}
                        style={{ marginTop: spacing.sm }}
                      />
                    ) : null}
                  </View>
                ) : null}
                {!partner && outing.status !== 'cancelled' && !r.attendance ? (
                  <Button
                    title={`Marquer ${r.userName} présent`}
                    variant="secondary"
                    onPress={() => {
                      const res = markGuestPresent(r.id);
                      if (res.ok) {
                        Alert.alert(
                          'Présent',
                          `Caution rendue pour ${r.userName} (mock). Confirmé ≠ présent.`,
                        );
                      } else {
                        Alert.alert('Impossible', res.reason);
                      }
                    }}
                    style={{ marginTop: spacing.sm }}
                  />
                ) : null}
                {!partner && r.attendance === 'present' ? (
                  <Text style={[styles.hint, { marginTop: spacing.sm }]}>
                    {r.userName} · présent · caution rendue
                  </Text>
                ) : null}
                {!partner && r.attendance === 'absent' ? (
                  <Text style={[styles.hint, { marginTop: spacing.sm }]}>
                    {r.userName} · absence · caution perdue
                  </Text>
                ) : null}
                {!partner &&
                outing.status !== 'cancelled' &&
                !r.attendance &&
                isStartsAtPast(outing.startsAt) ? (
                  <Button
                    title={`Signaler absence de ${r.userName}`}
                    variant="ghost"
                    onPress={() => {
                      const res = reportGuestNoShow(r.id);
                      if (res.ok) {
                        Alert.alert(
                          res.banned
                            ? 'Compte fermé'
                            : res.lowerPriority
                              ? 'Priorité baissée'
                              : 'Absence signalée',
                          res.banned
                            ? '3e absence — compte fermé. Caution perdue : 6,90 € Moment / 13,10 € hôte.'
                            : res.lowerPriority
                              ? '2e absence — priorité baissée + mention profil.'
                              : 'Caution perdue : 6,90 € Moment / 13,10 € hôte.',
                        );
                      } else {
                        Alert.alert('Impossible', res.reason);
                      }
                    }}
                    style={{ marginTop: spacing.sm }}
                  />
                ) : null}
              </View>
            ))}
          {incomingRequests.some(
            (r) => r.outingId === outing.id && r.status === 'confirmed',
          ) ? (
            <>
              {getMyImprevu(outing.id) ? (
                <Text style={[styles.hint, { marginTop: spacing.md }]}>
                  Imprévu signalé ·{' '}
                  {getMyImprevu(outing.id)!.jokerUsed
                    ? 'joker — caution rendue'
                    : getMyImprevu(outing.id)!.status === 'pending'
                      ? 'en attente'
                      : getMyImprevu(outing.id)!.status === 'accepted'
                        ? 'accepté — sortie annulée'
                        : getMyImprevu(outing.id)!.status === 'auto_refused'
                          ? 'sans réponse à l’heure'
                          : 'refusé — au moins 3 heures / joker'}
                </Text>
              ) : (
                <Button
                  title="Imprévu"
                  variant="ghost"
                  onPress={() =>
                    navigation.navigate('Imprevu', {
                      outingId: outing.id,
                      requestId: incomingRequests.find(
                        (r) =>
                          r.outingId === outing.id && r.status === 'confirmed',
                      )?.id,
                    })
                  }
                  style={{ marginTop: spacing.md }}
                />
              )}
            </>
          ) : null}
        </View>
      ) : myRequest ? (
        <View style={styles.actions}>
          {myRequest.status === 'pending' && (
            <>
              <Text style={styles.statusOk}>Demande envoyée — en attente.</Text>
              {'id' in myRequest ? (
                <Button
                  title="Annuler ma demande"
                  variant="ghost"
                  onPress={() => {
                    cancelRequest(myRequest.id, 'guest');
                    Alert.alert('Demande annulée', 'Tu peux en rejoindre une autre.');
                    navigation.goBack();
                  }}
                  style={{ marginTop: spacing.md }}
                />
              ) : null}
            </>
          )}
          {myRequest.status === 'accepted' && (
            <>
              {outing.status === 'completed' ||
              outing.status === 'cancelled' ||
              (isUrgentOnSite(outing)
                ? outing.status !== 'open' && outing.status !== 'full'
                : isStartsAtPast(outing.startsAt)) ? (
                <Text style={styles.hint}>
                  {outing.status === 'completed'
                    ? 'Sortie terminée — confirmation impossible.'
                    : outing.status === 'cancelled'
                      ? 'Sortie annulée — confirmation impossible.'
                      : isUrgentOnSite(outing)
                        ? 'Invitation urgente close — confirmation impossible.'
                        : 'L’heure est passée — confirmation impossible.'}
                </Text>
              ) : (
                <>
                  {partner ? (
                    <Text style={styles.hint}>
                      Confirme en 10 min (caution 20 €) : la place est prise à
                      la confirmation s’il en reste — premier confirmé, premier
                      servi.
                    </Text>
                  ) : null}
                  <Button
                    title={partner ? 'Confirmer ma venue' : 'Confirmer ma place'}
                    onPress={() =>
                      navigation.navigate('ConfirmSlot', {
                        requestId: 'id' in myRequest ? myRequest.id : joinedId!,
                      })
                    }
                    style={partner ? { marginTop: spacing.sm } : undefined}
                  />
                </>
              )}
              {'id' in myRequest ? (
                <Button
                  title="Libérer ma place"
                  variant="ghost"
                  onPress={() => {
                    cancelRequest(myRequest.id, 'guest');
                    Alert.alert('Place libérée', 'La place est de nouveau disponible.');
                    navigation.goBack();
                  }}
                  style={{ marginTop: spacing.md }}
                />
              ) : null}
            </>
          )}
          {myRequest.status === 'confirmed' && (
            <>
              <Text style={styles.statusOk}>Place confirmée.</Text>
              {partner && 'id' in myRequest
                ? (() => {
                    const full = getRequestById(myRequest.id);
                    if (!full) return null;
                    if (full.partnerDispute) {
                      return (
                        <Text style={[styles.hint, { marginTop: spacing.sm }]}>
                          Litige présence ouvert — l’équipe Moment te demandera
                          une photo plus tard. Pas de sanction automatique.
                        </Text>
                      );
                    }
                    if (full.guestArrivedAt) {
                      return (
                        <Text style={styles.depositReturned}>
                          Arrivée signalée — tu es présent, caution rendue.
                        </Text>
                      );
                    }
                    const canArrive = canGuestSelfArrivePartner(
                      outing,
                      full,
                      state.currentUser?.id ?? '',
                    );
                    const doArrive = (withPhoto: boolean) => {
                      const res = guestArrivedPartner(
                        full.id,
                        withPhoto ? { arrivalPhotoUri: 'stub://facade' } : undefined,
                      );
                      if (!res.ok) {
                        Alert.alert('Pas encore', 'Disponible dès 15 min avant l’heure, le soir même.');
                        return;
                      }
                      Alert.alert(
                        res.dispute ? 'Litige ouvert' : 'Bien arrivé',
                        res.dispute
                          ? 'Le lieu avait signalé « Pas venu » — litige ouvert, pas de sanction automatique.'
                          : 'Tu es présent : caution rendue. Le lieu n’a rien à faire.',
                      );
                    };
                    return canArrive ? (
                      <Button
                        title="Je suis arrivé"
                        onPress={() =>
                          Alert.alert(
                            'Je suis arrivé',
                            'Photo de la façade facultative (démo : stub) — elle ne bloque rien et n’est pas une preuve à elle seule.',
                            [
                              { text: 'Retour', style: 'cancel' },
                              {
                                text: 'Avec photo (facultatif)',
                                onPress: () => doArrive(true),
                              },
                              { text: 'Confirmer', onPress: () => doArrive(false) },
                            ],
                          )
                        }
                        style={{ marginTop: spacing.md }}
                      />
                    ) : (
                      <Text style={[styles.hint, { marginTop: spacing.sm }]}>
                        Sur place : bouton « Je suis arrivé » dès 15 min avant
                        l’heure. Pas de scan obligatoire.
                      </Text>
                    );
                  })()
                : null}
              {getMyImprevu(outing.id) ? (
                <Text style={[styles.hint, { marginTop: spacing.sm }]}>
                  Imprévu signalé ·{' '}
                  {getMyImprevu(outing.id)!.jokerUsed
                    ? 'joker — caution rendue'
                    : getMyImprevu(outing.id)!.status === 'pending'
                      ? 'en attente de réponse'
                      : getMyImprevu(outing.id)!.status === 'accepted'
                        ? 'accepté — caution rendue'
                        : getMyImprevu(outing.id)!.status === 'auto_refused'
                          ? 'sans réponse — absence'
                          : 'refusé — au moins 3 heures / joker'}
                </Text>
              ) : (
                <Button
                  title="Imprévu"
                  variant="ghost"
                  onPress={() =>
                    navigation.navigate('Imprevu', {
                      outingId: outing.id,
                      requestId: 'id' in myRequest ? myRequest.id : undefined,
                    })
                  }
                  style={{ marginTop: spacing.md }}
                />
              )}
              {'id' in myRequest &&
              getRequestById(myRequest.id)?.depositStatus === 'returned' ? (
                <Text style={styles.depositReturned}>
                  Caution remboursée (mock).
                </Text>
              ) : 'id' in myRequest &&
                getRequestById(myRequest.id)?.depositStatus === 'forfeited' ? (
                <Text style={styles.hint}>
                  {describeDepositForfeitMoment()}
                </Text>
              ) : 'id' in myRequest &&
                getRequestById(myRequest.id)?.depositStatus === 'held' ? (
                <Text style={styles.hint}>
                  Caution 20 € bloquée (mock). Rendue si tu annules au moins 3
                  heures avant, si l’hôte annule / imprévu accepté / joker ;
                  perdue si trop tard ou absence (6,90 € Moment / 13,10 € hôte).
                </Text>
              ) : null}

              {(() => {
                const mine = getMyImprevu(outing.id);
                if (
                  !mine ||
                  mine.jokerUsed ||
                  (mine.status !== 'refused' && mine.status !== 'auto_refused')
                ) {
                  return null;
                }
                if (!hasJokerAvailable()) {
                  return (
                    <Text style={[styles.hint, { marginTop: spacing.sm }]}>
                      Joker déjà utilisé ce mois — caution selon la règle des 3
                      heures.
                    </Text>
                  );
                }
                return (
                  <Button
                    title="Utiliser mon joker"
                    variant="secondary"
                    onPress={() => {
                      const r = useJokerOnImprevu(mine.id);
                      if (!r.ok) {
                        Alert.alert('Impossible', r.reason);
                        return;
                      }
                      Alert.alert(
                        'Joker utilisé',
                        'Caution rendue — ce n’est pas une absence. L’hôte ne touche rien.',
                      );
                    }}
                    style={{ marginTop: spacing.sm }}
                  />
                );
              })()}

              <Text style={styles.hint}>
                {isChatUnlocked(outing.startsAt, Date.now(), chatOpts)
                  ? partner
                    ? 'Le chat est ouvert (invitation du lieu).'
                    : outing.urgentOnSite
                      ? 'Le chat est ouvert (invitation urgente).'
                      : 'Le chat est ouvert (H−1).'
                  : 'Le chat s’ouvre 1 h avant la sortie.'}
              </Text>
              <Button
                title={
                  isChatUnlocked(outing.startsAt, Date.now(), chatOpts)
                    ? 'Ouvrir le chat'
                    : 'Voir le chat (verrouillé)'
                }
                variant="secondary"
                onPress={() =>
                  navigation.navigate('ChatPlaceholder', {
                    outingId: outing.id,
                    requestId: 'id' in myRequest ? myRequest.id : undefined,
                  })
                }
                style={{ marginTop: spacing.md }}
              />
              {'id' in myRequest ? (
                <Button
                  title="Me désister"
                  variant="ghost"
                  onPress={() => {
                    const res = cancelRequest(myRequest.id, 'guest');
                    if (!res.ok) return;
                    Alert.alert(
                      'Désistement',
                      res.depositReturned
                        ? 'Place libérée — caution rendue (au moins 3 heures avant, mock). Les autres confirmés restent.'
                        : res.depositForfeited
                          ? `Place libérée — ${describeDepositForfeitMoment()} Les autres confirmés restent.`
                          : 'Place libérée. Les autres confirmés restent.',
                    );
                    navigation.goBack();
                  }}
                  style={{ marginTop: spacing.md }}
                />
              ) : null}
            </>
          )}
        </View>
      ) : myNoSpot &&
        (outing.status !== 'open' || outing.spotsLeft < 1) ? (
        <View style={styles.actions}>
          <Text style={styles.statusOk}>Plus de place.</Text>
          <Text style={styles.hint}>
            Quelqu’un a confirmé juste avant toi — caution non bloquée (ou
            rendue immédiatement).
          </Text>
        </View>
      ) : partner &&
        (outing.status === 'closed' || outing.spotsLeft < 1) &&
        outing.status !== 'cancelled' &&
        outing.status !== 'completed' ? (
        <View style={styles.actions}>
          <Text style={styles.statusOk}>Plus de place.</Text>
          <Text style={styles.hint}>
            {partnerCulture && !outing.partnerAutoClosedFull
              ? 'Invitation close.'
              : 'Toutes les places ont été prises — annonce clôturée.'}
          </Text>
        </View>
      ) : outing.status === 'completed' ||
        outing.status === 'cancelled' ||
        !isOutingAcceptingRequests(outing) ? (
        <View style={styles.actions}>
          <Text style={styles.hint}>
            {outing.status === 'completed'
              ? 'Sortie terminée — plus de demandes.'
              : outing.status === 'cancelled'
                ? 'Sortie annulée — plus de demandes.'
                : isUrgentOnSite(outing)
                  ? 'Fenêtre urgente terminée — plus de demandes.'
                  : 'L’heure est passée — cette annonce n’accepte plus de demandes.'}
          </Text>
        </View>
      ) : partner ? (
        <View style={styles.actions}>
          <Text style={styles.joinNote}>
            Pas d’acceptation à attendre : rejoins, puis confirme ta venue en 10
            min (caution 20 €, Stripe mock). La place est prise à la
            confirmation s’il en reste ; sinon caution non bloquée.
          </Text>
          <Button title="Rejoindre" onPress={onJoin} />
        </View>
      ) : (
        <View style={styles.actions}>
          <Text style={styles.joinNote}>
            Après acceptation : confirmation en 10 min. Caution 20 € bloquée à
            la confirmation (Stripe mock).
          </Text>
          <Text style={styles.section}>Message d’intro recommandé</Text>
          <TextInput
            style={styles.input}
            placeholder={RECOMMENDED_INTRO}
            placeholderTextColor={colors.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
          />
          <Text style={[styles.section, { marginTop: spacing.md }]}>
            Proposer une autre date (optionnel)
          </Text>
          <Text style={styles.hint}>
            Conservée pour l’hôte avec ta demande — ex. « demain 20h » ou
            « samedi soir ».
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Ex. demain 20h, samedi soir…"
            placeholderTextColor={colors.textMuted}
            value={suggestedDate}
            onChangeText={setSuggestedDate}
          />
          <Pressable
            onPress={() => setMessage(RECOMMENDED_INTRO)}
            style={styles.resetMsg}
          >
            <Text style={styles.resetMsgText}>Réutiliser le message suggéré</Text>
          </Pressable>
          <Button title="Demander à rejoindre" onPress={onJoin} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missingText: { ...typography.body, color: colors.textSecondary },
  hostBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  hostText: { flex: 1 },
  hostName: { ...typography.subtitle, fontFamily: fonts.semiBold, color: colors.text },
  hostMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  unlockHint: {
    ...typography.small,
    color: colors.primary,
    marginTop: 4,
    fontFamily: fonts.semiBold,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    backgroundColor: colors.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipWomen: { backgroundColor: colors.primarySoft },
  chipText: { ...typography.small, color: colors.textSecondary },
  categoryDetail: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  inviteLine: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
    marginBottom: spacing.sm,
  },
  title: { ...typography.title, color: colors.text },
  when: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  section: { ...typography.caption, color: colors.textMuted, marginBottom: 4 },
  body: { ...typography.body, color: colors.text },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
  actions: { marginTop: spacing.lg },
  joinNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 88,
    marginBottom: spacing.sm,
    ...typography.body,
    color: colors.text,
    textAlignVertical: 'top',
  },
  resetMsg: { marginBottom: spacing.md },
  resetMsgText: {
    ...typography.caption,
    color: colors.primary,
    fontFamily: fonts.semiBold,
  },
  statusOk: {
    ...typography.bodyStrong,
    color: colors.success,
    textAlign: 'center',
  },
  venueIssueCard: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  venueIssueTitle: {
    ...typography.bodyStrong,
    color: colors.warning,
    fontFamily: fonts.semiBold,
  },
  venueIssueBody: {
    ...typography.body,
    color: colors.text,
  },
  venueIssueActions: { marginTop: spacing.sm },
  venueIssueOk: {
    ...typography.caption,
    color: colors.success,
    fontFamily: fonts.semiBold,
  },
  venueLink: {
    color: colors.primaryDark,
    fontFamily: fonts.semiBold,
  },
  venueAvisLink: {
    ...typography.caption,
    color: colors.primary,
    fontFamily: fonts.semiBold,
    marginTop: spacing.xs,
  },
    depositReturned: {
    ...typography.caption,
    color: colors.success,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontFamily: fonts.semiBold,
  },
  lateBanner: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
    gap: 4,
  },
  lateBannerText: {
    ...typography.bodyStrong,
    color: colors.warning,
    fontFamily: fonts.semiBold,
  },
  imprevuCard: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  imprevuTitle: {
    ...typography.bodyStrong,
    color: colors.warning,
    fontFamily: fonts.semiBold,
  },
  imprevuBody: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.sm,
    fontFamily: fonts.semiBold,
  },
  imprevuReason: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  guestText: { flex: 1 },
  partnerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  partnerBadge: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  partnerBadgeText: {
    ...typography.small,
    color: colors.primaryDark,
    fontFamily: fonts.semiBold,
  },
  guestName: {
    ...typography.bodyStrong,
    color: colors.text,
    fontFamily: fonts.semiBold,
  },
  guestMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
