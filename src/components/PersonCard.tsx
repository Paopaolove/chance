import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { categoryLabels } from '../data/mockOutings';
import { User } from '../data/types';
import { colors, fonts, radius, shadows, spacing, typography } from '../theme';
import { dispoSlotLabel } from '../utils/dispo';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
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
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { state } = useChance();
  const viewer = state.currentUser;
  // Own card stays readable; others follow subscription photo size.
  const photoSize =
    viewer?.id === person.id ? 56 : hostPhotoSize(viewer);
  const quartier = person.dispoNeighborhood ?? person.neighborhood;
  const slot = dispoSlotLabel(person.dispoSlot);

  const openHostProfile = () => {
    navigation.navigate('HostProfile', { userId: person.id });
  };

  return (
    <View style={styles.card}>
      <View style={styles.mainRow}>
        <Pressable
          onPress={openHostProfile}
          accessibilityRole="button"
          accessibilityLabel={`Profil de ${person.firstName}`}
          hitSlop={6}
          style={({ pressed }) => [styles.photoCol, pressed && styles.pressed]}
        >
          <Avatar
            name={person.firstName}
            photoUri={person.photoUri}
            seed={person.id}
            size={photoSize}
          />
          <RatingLine
            userId={person.id}
            firstName={person.firstName}
            onPress={openHostProfile}
            variant="underPhoto"
          />
        </Pressable>

        <View style={styles.mainText}>
          <Pressable
            onPress={openHostProfile}
            accessibilityRole="button"
            accessibilityLabel={`Profil de ${person.firstName}`}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.name} numberOfLines={1}>
              {person.firstName}
            </Text>
            <Text style={styles.meta}>
              {slot ? `${slot} · ` : ''}
              {quartier}
            </Text>
            {person.dispoTopic ? (
              <Text style={styles.topic} numberOfLines={2}>
                {person.dispoTopic}
              </Text>
            ) : null}
            {person.dispoCategories?.length ? (
              <View style={styles.chips}>
                {person.dispoCategories.map((cat) => (
                  <View key={cat} style={[styles.chip, styles.envieChip]}>
                    <Text style={[styles.chipText, styles.envieText]}>
                      {categoryLabels[cat]}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.chips}>
              <View style={[styles.chip, styles.dispoPill]}>
                <Text style={[styles.chipText, styles.dispoPillText]}>
                  Dispo
                </Text>
              </View>
            </View>
          </Pressable>

          {onPropose ? (
            <Pressable
              onPress={onPropose}
              style={styles.cta}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>Proposer une sortie</Text>
            </Pressable>
          ) : null}
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
  name: {
    ...typography.subtitle,
    fontFamily: fonts.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.text,
    marginBottom: 2,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  topic: {
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.sm,
    fontFamily: fonts.medium,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  chipText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  envieChip: {
    backgroundColor: colors.primarySoft,
  },
  envieText: {
    color: colors.primaryDark,
    fontFamily: fonts.medium,
  },
  dispoPill: {
    backgroundColor: colors.successSoft,
  },
  dispoPillText: {
    color: colors.success,
    fontFamily: fonts.semiBold,
  },
  cta: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  ctaText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontFamily: fonts.semiBold,
  },
});
