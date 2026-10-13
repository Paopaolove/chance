import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { categoryLabels } from '../data/mockOutings';
import { Outing, OutingCategory } from '../data/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import {
  formatParisTime,
  isParisSameDay,
  isParisTomorrow,
} from '../utils/parisTime';
import { useOpenUserProfile } from '../utils/openUserProfile';
import { isPartnerListing, partnerListingChips } from '../utils/partners';

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

const CATEGORY_ICONS: Record<
  OutingCategory,
  keyof typeof Ionicons.glyphMap
> = {
  restaurant: 'restaurant-outline',
  bar: 'wine-outline',
  culture: 'ticket-outline',
  sport: 'football-outline',
  autre: 'sparkles-outline',
};

function dayLabel(startsAt: string, nowMs = Date.now()): string | null {
  if (isParisSameDay(startsAt, nowMs)) return 'Ce soir';
  if (isParisTomorrow(startsAt, nowMs)) return 'Demain';
  const d = new Date(startsAt);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function OutingCard({ outing, onPress }: Props) {
  const openProfile = useOpenUserProfile();
  const partner = isPartnerListing(outing);
  const pill = cardPill(outing, partner);
  const time = formatParisTime(outing.startsAt);
  const iconName = CATEGORY_ICONS[outing.category] ?? 'sparkles-outline';

  const openHost = () => openProfile(outing.hostId);

  // Une ligne : jour · lieu · quartier (l’heure est affichée à part, en grand).
  const showWhen = !(outing.urgentOnSite && !outing.urgentAutoH90);
  const place =
    outing.venueName && outing.venueName !== outing.title
      ? outing.venueName
      : null;
  const placeLine = [
    showWhen ? dayLabel(outing.startsAt) : null,
    place,
    outing.neighborhood,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Moment ${outing.title}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.mainRow}>
        <View
          style={styles.iconWrap}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons name={iconName} size={22} color={colors.primary} />
        </View>
        <View style={styles.mainText}>
          <Text style={styles.time} accessibilityLabel={`À ${time}`}>
            {time}
          </Text>
          <Text style={styles.title} numberOfLines={2}>
            {outing.title}
          </Text>
          <View style={styles.hostRow}>
            <Pressable
              onPress={openHost}
              accessibilityRole="button"
              accessibilityLabel={`Voir le profil de ${outing.hostName}`}
              hitSlop={{ top: 6, bottom: 6 }}
              style={({ pressed }) => [styles.nameTap, pressed && styles.pressed]}
            >
              <Text style={styles.hostName} numberOfLines={1}>
                {partner ? outing.hostName : `${outing.hostName} t’invite`}
              </Text>
            </Pressable>
            {partner ? <Text style={styles.partnerTag}> · Partenaire</Text> : null}
          </View>
          {placeLine ? (
            <Text style={styles.place} numberOfLines={1}>
              {placeLine}
            </Text>
          ) : null}
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
    backgroundColor: colors.cardWarm,
    borderRadius: radius.card,
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
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerTag: {
    ...typography.small,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    minWidth: 0,
  },
  hostName: {
    ...typography.caption,
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
  mainText: { flex: 1, minWidth: 0 },
  nameTap: { flexShrink: 1 },
  time: {
    fontFamily: fonts.semiBold,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
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
