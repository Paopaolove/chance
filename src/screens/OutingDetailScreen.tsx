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
import { isChatUnlocked, lateLabel } from '../utils/chat';
import { imprevuMotiveLabel } from '../utils/imprevu';
import { formatOutingWhen } from '../utils/format';
import { isStartsAtPast } from '../utils/parisTime';
import { makeVenueKey } from '../utils/venue';
import { hasFullPhotoAccess, hostPhotoSize } from '../utils/subscription';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type R = RouteProp<RootStackParamList, 'OutingDetail'>;

const RECOMMENDED_INTRO =
  'Salut ! Ta sortie m’intéresse — je suis motivé et dispo. À bientôt ?';

export function OutingDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const {
    getOutingById,
    joinOuting,
    state,
    outgoingRequests,
    incomingRequests,
    closeOuting,
    cancelOuting,
    completeOuting,
    cancelRequest,
    getLateReportsForOthers,
    respondVenueAlternate,
    getRequestById,
    getPendingImprevuForMe,
    getMyImprevu,
    respondImprevu,
    hasJokerAvailable,
    useJokerOnImprevu,
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
            <Text key={r.id} style={styles.lateBannerText}>
              ⏱ {r.reporterName} a un retard ({lateLabel(r.minutes, { orMore: r.orMore })})
            </Text>
          ))}
        </View>
      ) : null}

      {(() => {
        const pending = getPendingImprevuForMe(outing.id);
        if (!pending) return null;
        return (
          <View style={styles.imprevuCard}>
            <Text style={styles.imprevuTitle}>
              {pending.reporterName} signale un imprévu.
            </Text>
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
                    'La sortie est annulée — ce n’est pas une absence.',
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
                    'Caution encore bloquée. Annule au moins 3 heures avant pour la récupérer ; trop tard ou absence → perdue (6,90 € Chance / 13,10 € hôte). L’invité peut utiliser son joker.',
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
          {outing.venueIssue.status === 'alternate_proposed' && !isHost ? (
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
                      'Annulé',
                      'Tu refuses sans perdre ta caution (mock).',
                    );
                }}
                style={{ marginTop: spacing.sm }}
              />
            </View>
          ) : null}
          {outing.venueIssue.status === 'alternate_accepted' ? (
            <Text style={styles.venueIssueOk}>
              Nouveau lieu accepté — caution conservée.
            </Text>
          ) : null}
          {outing.venueIssue.status === 'refused' ? (
            <Text style={styles.venueIssueOk}>
              Refus — caution remboursée aux invités concernés.
            </Text>
          ) : null}
        </View>
      ) : null}


      {/* Visible before accept: listing, 1 photo, place, budget */}
      <Pressable
        style={styles.hostBlock}
        onPress={() =>
          navigation.navigate('HostProfile', { userId: outing.hostId })
        }
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
          <Text style={styles.hostName}>
            {outing.hostName}, {outing.hostAge}
          </Text>
          <RatingLine
            userId={outing.hostId}
            firstName={outing.hostName}
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

      <Text style={styles.inviteLine}>
        {outing.hostName} t'invite
        {outing.budgetMaxEuros <= 0
          ? ' · Gratuit'
          : ` · jusqu'à ${outing.budgetMaxEuros} €`}
      </Text>
      <View style={styles.chips}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{formatOutingCategoryLabel(outing.category, outing.categoryDetail)}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>
            {budgetChipLabel(outing.budgetMaxEuros)}
          </Text>
        </View>
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
        <Text style={styles.section}>Invitation</Text>
        <Text style={styles.body}>
          {outing.budgetMaxEuros <= 0
            ? 'Sortie gratuite — réglée sur place, pas via l’app.'
            : `J'invite jusqu'à ${outing.budgetMaxEuros} € par personne, réglé sur place au lieu (pas via l'app). Au-delà = hors invitation.`}
        </Text>
        {outing.inviteIncludes ? (
          <Text style={[styles.hint, { marginTop: spacing.sm }]}>
            Inclus · {outing.inviteIncludes}
          </Text>
        ) : null}
        {outing.inviteExtras ? (
          <Text style={styles.hint}>Hors invitation · {outing.inviteExtras}</Text>
        ) : null}
        {outing.ticketsAlreadyBought ? (
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
                    hasConfirmed
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
                : 'Sortie clôturée / annulée.'}
            </Text>
          )}
          {outing.status !== 'completed' && isStartsAtPast(outing.startsAt) ? (
            <Button
              title="Marquer comme terminée"
              variant="secondary"
              onPress={() => {
                completeOuting(outing.id);
                Alert.alert(
                  'Sortie terminée',
                  'Les présents peuvent laisser un avis. Caution rendue pour les présents (confirmé ≠ présent — les absences signalées restent perdues).',
                );
              }}
              style={{ marginTop: spacing.md }}
            />
          ) : null}
          {incomingRequests
            .filter((r) => r.outingId === outing.id && r.status === 'confirmed')
            .map((r) => (
              <Button
                key={r.id}
                title={`Chat avec ${r.userName}`}
                variant="secondary"
                onPress={() =>
                  navigation.navigate('ChatPlaceholder', {
                    outingId: outing.id,
                    requestId: r.id,
                  })
                }
                style={{ marginTop: spacing.md }}
              />
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
              isStartsAtPast(outing.startsAt) ? (
                <Text style={styles.hint}>
                  {outing.status === 'completed'
                    ? 'Sortie terminée — confirmation impossible.'
                    : 'L’heure est passée — confirmation impossible.'}
                </Text>
              ) : (
                <Button
                  title="Confirmer ma place"
                  onPress={() =>
                    navigation.navigate('ConfirmSlot', {
                      requestId: 'id' in myRequest ? myRequest.id : joinedId!,
                    })
                  }
                />
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
                  perdue si trop tard ou absence (6,90 € Chance / 13,10 € hôte).
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
                {isChatUnlocked(outing.startsAt, Date.now(), { urgentOnSite: outing.urgentOnSite })
                  ? outing.urgentOnSite
                    ? 'Le chat est ouvert (invitation urgente).'
                    : 'Le chat est ouvert (H−1).'
                  : 'Le chat s’ouvre 1 h avant la sortie.'}
              </Text>
              <Button
                title={
                  isChatUnlocked(outing.startsAt, Date.now(), { urgentOnSite: outing.urgentOnSite })
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
      ) : outing.status === 'completed' || isStartsAtPast(outing.startsAt) ? (
        <View style={styles.actions}>
          <Text style={styles.hint}>
            {outing.status === 'completed'
              ? 'Sortie terminée — plus de demandes.'
              : 'L’heure est passée — cette annonce n’accepte plus de demandes.'}
          </Text>
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
});
