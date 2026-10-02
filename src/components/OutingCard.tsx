import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useChance } from '../data/ChanceContext';
import { mockHosts } from '../data/mockOutings';
import {
  formatTravelMinutes,
  getTravelMinutes,
} from '../data/travelTime';
import { Outing } from '../data/types';
import { colors, fonts, radius, shadows, spacing, typography } from '../theme';
import { formatOutingWhen } from '../utils/format';
import { useOpenUserProfile } from '../utils/openUserProfile';
import { hostPhotoSize } from '../utils/subscription';
import { isPartnerListing, partnerListingChips } from '../utils/partners';
import { Avatar } from './Avatar';
import { RatingLine } from './RatingLine';

interface Props {
  outing: Outing;
  onPress: () => void;
  /** Precomputed travel minutes from current user neighborhood. */
  travelMinutes?: number;
}

export function OutingCard({ outing, onPress, travelMinutes }: Props) {
  const openProfile = useOpenUserProfile();
  const { state } = useChance();
  const viewer = state.currentUser;
  const from = state.currentUser?.neighborhood;
  const minutes =
    travelMinutes ??
    (from ? getTravelMinutes(from, outing.neighborhood) : undefined);
  const photoSize = hostPhotoSize(viewer);
  const isFree = outing.budgetMaxEuros <= 0;
  const partner = isPartnerListing(outing);
  const partnerChips = partner ? partnerListingChips(outing) : [];

  const photoUri = useMemo(() => {
    if (state.currentUser?.id === outing.hostId) {
      return state.currentUser.photoUri;
    }
    return mockHosts.find((h) => h.id === outing.hostId)?.photoUri;
  }, [state.currentUser, outing.hostId]);

  const openHost = () => openProfile(outing.hostId);

  return (
    <View style={[styles.card, partner && styles.cardPartner]}>
      <View style={styles.mainRow}>
        <Pressable
          onPress={openHost}
          accessibilityRole="button"
          accessibilityLabel={`Profil de ${outing.hostName}`}
          hitSlop={12}
          style={({ pressed }) => [styles.photoCol, pressed && styles.pressed]}
        >
          <Avatar
            name={outing.hostName}
            photoUri={photoUri}
            seed={outing.hostId}
            size={photoSize}
          />
          <RatingLine
            userId={outing.hostId}
            firstName={outing.hostName}
            onPress={openHost}
            variant="underPhoto"
          />
        </Pressable>
        <View style={styles.mainText}>
          {/* Photo / prénom / notes → profil (Pressable séparé) */}
          <Pressable
            onPress={openHost}
            accessibilityRole="button"
            accessibilityLabel={`Profil de ${outing.hostName}`}
            style={({ pressed }) => pressed && styles.pressed}
          >
            {partner ? (
              <View style={styles.partnerTitleRow}>
                <Text style={[styles.title, styles.partnerTitle]} numberOfLines={1}>
                  {outing.hostName}
                </Text>
                <View style={styles.partnerBadge}>
                  <Text style={styles.partnerBadgeText}>Partenaire</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.title} numberOfLines={1}>
                {outing.hostName} t'invite
              </Text>
            )}
            {outing.description.trim() ? (
              <Text style={styles.message} numberOfLines={2}>
                {outing.description.trim()}
              </Text>
            ) : null}
          </Pressable>
          {/* Reste carte → sortie */}
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`Sortie ${outing.venueName}`}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.venue} numberOfLines={1}>
              {partner ? outing.title : outing.venueName}
            </Text>
            <Text style={styles.meta}>
              {outing.urgentOnSite && !outing.urgentAutoH90
                ? 'Maintenant'
                : formatOutingWhen(outing.startsAt)}{' '}
              · {outing.neighborhood}
              {minutes !== undefined
                ? ` · ${formatTravelMinutes(minutes)}`
                : ''}
            </Text>
            <View style={styles.chipsRow}>
              {outing.urgentOnSite ? (
                <View style={[styles.chip, styles.chipUrgent]}>
                  <Text style={[styles.chipText, styles.chipUrgentText]}>
                    {outing.urgentAutoH90 ? 'Urgent' : 'Maintenant'}
                  </Text>
                </View>
              ) : null}
              {partner ? (
                // Partenaire : geste / remise / places offertes — jamais de €.
                partnerChips.map((c) => (
                  <View key={c} style={[styles.chip, styles.chipOrange]}>
                    <Text style={[styles.chipText, styles.chipOrangeText]}>
                      {c}
                    </Text>
                  </View>
                ))
              ) : (
                <View style={[styles.chip, styles.chipOrange]}>
                  <Text style={[styles.chipText, styles.chipOrangeText]}>
                    {isFree
                      ? 'Gratuit'
                      : `J'invite jusqu'à ${outing.budgetMaxEuros} €`}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  /** Liseré orange discret — pas une carte pub. */
  cardPartner: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  partnerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  partnerTitle: { flexShrink: 1, marginBottom: 0 },
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
  pressed: { opacity: 0.94 },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  photoCol: {
    alignItems: 'center',
    width: 72,
  },
  mainText: { flex: 1 },
  title: {
    ...typography.subtitle,
    fontFamily: fonts.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.text,
    marginBottom: 2,
  },
  venue: {
    ...typography.body,
    fontFamily: fonts.semiBold,
    color: colors.text,
    marginBottom: 4,
    marginTop: spacing.xs,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    minHeight: 32,
    justifyContent: 'center',
  },
  chipOrange: { backgroundColor: colors.primarySoft },
  chipUrgent: { backgroundColor: colors.primarySoft },
  chipText: { ...typography.small, color: colors.textSecondary },
  chipOrangeText: { color: colors.primaryDark, fontFamily: fonts.semiBold },
  chipUrgentText: { color: colors.primaryDark, fontFamily: fonts.semiBold },
});
