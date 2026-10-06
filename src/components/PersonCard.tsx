import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { categoryLabels } from '../data/mockOutings';
import { User } from '../data/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { dispoSlotLabel } from '../utils/dispo';
import { useOpenUserProfile } from '../utils/openUserProfile';
import { hostPhotoSize } from '../utils/subscription';
import { useChance } from '../data/ChanceContext';
import { Avatar } from './Avatar';
import { RatingLine } from './RatingLine';

interface Props {
  person: User;
  onPress?: () => void;
  /** Propose / create outing prefilled from their dispo. */
  onPropose?: () => void;
}

export function PersonCard({ person, onPropose }: Props) {
  const openProfile = useOpenUserProfile();
  const { state } = useChance();
  const viewer = state.currentUser;
  // Own card stays readable; others follow subscription photo size.
  const photoSize =
    viewer?.id === person.id ? 56 : hostPhotoSize(viewer);
  const quartier = person.dispoNeighborhood ?? person.neighborhood;
  const slot = dispoSlotLabel(person.dispoSlot);

  const openPerson = () => openProfile(person.id);

  // Une seule pastille : l’envie (1re catégorie, « +N » si plusieurs).
  const cats = person.dispoCategories ?? [];
  const firstCat =
    cats[0] === 'autre' && person.dispoCategoryDetail?.trim()
      ? person.dispoCategoryDetail.trim()
      : cats[0]
        ? categoryLabels[cats[0]]
        : null;
  const pillLabel = firstCat
    ? cats.length > 1
      ? `${firstCat} +${cats.length - 1}`
      : firstCat
    : 'Dispo';
  const placeLine = [slot, quartier].filter(Boolean).join(' · ');

  return (
    <View style={styles.card}>
      <View style={styles.mainRow}>
        {/* Photo → profil (Pressable séparé) */}
        <Pressable
          onPress={openPerson}
          accessibilityRole="button"
          accessibilityLabel={`Voir le profil de ${person.firstName}`}
          hitSlop={8}
          style={({ pressed }) => [styles.photoCol, pressed && styles.pressed]}
        >
          <Avatar
            name={person.firstName}
            photoUri={person.photoUri}
            seed={person.id}
            size={photoSize}
          />
          {/* Note sous la photo */}
          <RatingLine
            userId={person.id}
            firstName={person.firstName}
            onPress={openPerson}
            variant="underPhoto"
          />
        </Pressable>

        <View style={styles.mainText}>
          {/* Prénom → profil (Pressable séparé) */}
          <Pressable
            onPress={openPerson}
            accessibilityRole="button"
            accessibilityLabel={`Voir le profil de ${person.firstName}`}
            hitSlop={{ top: 8, bottom: 4 }}
            style={({ pressed }) => [styles.nameTap, pressed && styles.pressed]}
          >
            <Text style={styles.name} numberOfLines={1}>
              {person.firstName}
            </Text>
          </Pressable>
          {placeLine ? (
            <Text style={styles.meta} numberOfLines={1}>
              {placeLine}
            </Text>
          ) : null}
          <View style={styles.pill}>
            <Text style={styles.pillText} numberOfLines={1}>
              {pillLabel}
            </Text>
          </View>
        </View>
      </View>

      {onPropose ? (
        <Pressable
          onPress={onPropose}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>Proposer un moment</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
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
  mainText: { flex: 1, minWidth: 0 },
  nameTap: { alignSelf: 'flex-start', maxWidth: '100%' },
  name: {
    ...typography.subtitle,
    fontFamily: fonts.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.text,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  /** Pastille neutre : blanc + liseré #E4DDD2, texte #1C1917. */
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
  pillText: {
    ...typography.small,
    fontFamily: fonts.semiBold,
    color: colors.chipText,
  },
  /** Bouton secondaire (pilule contour) : un seul bouton orange par écran. */
  cta: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    ...typography.caption,
    color: colors.text,
    fontFamily: fonts.semiBold,
  },
});
