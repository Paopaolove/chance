import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useChance } from '../data/ChanceContext';
import { categoryLabels, mockHosts } from '../data/mockOutings';
import { Outing } from '../data/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { formatOutingWhen } from '../utils/format';
import { useOpenUserProfile } from '../utils/openUserProfile';
import { hostPhotoSize } from '../utils/subscription';
import { isPartnerListing, partnerListingChips } from '../utils/partners';
import { Avatar } from './Avatar';
import { RatingLine } from './RatingLine';

interface Props {
  outing: Outing;
  onPress: () => void;
  /**
   * Trajet précalculé (gardé pour compatibilité ; affiché dans la fiche,
   * plus sur la carte — une seule ligne de lieu).
   */
  travelMinutes?: number;
}

type CardPill = { label: string; tone: 'now' | 'neutral' };

/**
 * Une seule pastille par carte, par priorité :
 * Maintenant > offre partenaire (geste / remise / places offertes) >
 * catégorie (+ plafond « jusqu’à X € » si invitation payante).
 * « Partenaire » est un simple badge texte à côté du nom.
 * Le détail (trajet, message, autres offres) reste sur la fiche.
 */
function cardPill(outing: Outing, partner: boolean): CardPill {
  if (outing.urgentOnSite) return { label: 'Maintenant', tone: 'now' };
  if (partner) {
    const offer = partnerListingChips(outing)[0];
    if (offer) return { label: offer, tone: 'neutral' };
  }
  const cat =
    outing.category === 'autre' && outing.categoryDetail?.trim()
      ? outing.categoryDetail.trim()
      : categoryLabels[outing.category];
  return {
    label:
      outing.budgetMaxEuros > 0
        ? `${cat} · jusqu’à ${outing.budgetMaxEuros} €`
        : cat,
    tone: 'neutral',
  };
}

export function OutingCard({ outing, onPress }: Props) {
  const openProfile = useOpenUserProfile();
  const { state } = useChance();
  const viewer = state.currentUser;
  const photoSize = hostPhotoSize(viewer);
  const partner = isPartnerListing(outing);
  const pill = cardPill(outing, partner);

  const photoUri = useMemo(() => {
    if (state.currentUser?.id === outing.hostId) {
      return state.currentUser.photoUri;
    }
    return mockHosts.find((h) => h.id === outing.hostId)?.photoUri;
  }, [state.currentUser, outing.hostId]);

  const openHost = () => openProfile(outing.hostId);

  // Une ligne : quand · lieu · quartier (pas de « Maintenant » en double avec la pastille).
  const showWhen = !(outing.urgentOnSite && !outing.urgentAutoH90);
  const place = partner ? outing.title : outing.venueName;
  const placeLine = [
    showWhen ? formatOutingWhen(outing.startsAt) : null,
    place,
    outing.neighborhood,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Sortie ${place}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.mainRow}>
        {/* Photo → profil (Pressable séparé) */}
        <Pressable
          onPress={openHost}
          accessibilityRole="button"
          accessibilityLabel={`Voir le profil de ${outing.hostName}`}
          hitSlop={8}
          style={({ pressed }) => [styles.photoCol, pressed && styles.pressed]}
        >
          <Avatar
            name={outing.hostName}
            photoUri={photoUri}
            seed={outing.hostId}
            size={photoSize}
          />
          {/* Note sous la photo */}
          <RatingLine
            userId={outing.hostId}
            firstName={outing.hostName}
            onPress={openHost}
            variant="underPhoto"
          />
        </Pressable>
        <View style={styles.mainText}>
          {/* Prénom → profil (Pressable séparé, n’ouvre pas la sortie) */}
          <Pressable
            onPress={openHost}
            accessibilityRole="button"
            accessibilityLabel={`Voir le profil de ${outing.hostName}`}
            hitSlop={{ top: 8, bottom: 4 }}
            style={({ pressed }) => [styles.nameTap, pressed && styles.pressed]}
          >
            <Text style={styles.title} numberOfLines={1}>
              {partner ? outing.hostName : `${outing.hostName} t’invite`}
            </Text>
          </Pressable>
          {partner ? <Text style={styles.partnerTag}>Partenaire</Text> : null}
          <Text style={styles.place} numberOfLines={1}>
            {placeLine}
          </Text>
          <View
            style={[
              styles.pill,
              pill.tone === 'now' && styles.pillNow,
            ]}
          >
            <Text
              style={[
                styles.pillText,
                pill.tone === 'now' && styles.pillTextNow,
              ]}
              numberOfLines={1}
            >
              {pill.label}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.92 },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  photoCol: { alignItems: 'center', width: 72 },
  /** Badge texte, pas de carte colorée. */
  partnerTag: {
    ...typography.small,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    marginTop: 2,
  },
  mainText: { flex: 1, minWidth: 0 },
  nameTap: { alignSelf: 'flex-start', maxWidth: '100%' },
  title: {
    ...typography.subtitle,
    fontFamily: fonts.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.text,
  },
  place: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  /** Une seule pastille : blanche + liseré ; « Maintenant » en noir plein (pas de vert sur la carte). */
  pill: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    backgroundColor: colors.chip,
    maxWidth: '100%',
  },
  pillNow: { backgroundColor: colors.text, borderColor: colors.text },
  pillText: {
    ...typography.small,
    fontFamily: fonts.semiBold,
    color: colors.chipText,
  },
  pillTextNow: { color: colors.white },
});
