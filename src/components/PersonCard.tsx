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

export function PersonCard({ person, onPress, onPropose }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { state } = useChance();
  const viewer = state.currentUser;
  // Own card stays readable; others follow subscription photo size.
  const photoSize =
    viewer?.id === person.id ? 56 : hostPhotoSize(viewer);
  const quartier = person.dispoNeighborhood ?? person.neighborhood;
  const slot = dispoSlotLabel(person.dispoSlot);

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (onPropose) {
      onPropose();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Avatar
          name={person.firstName}
          photoUri={person.photoUri}
          seed={person.id}
          size={photoSize}
        />
        <View style={styles.headerText}>
          <Text style={styles.name}>
            {person.firstName} · {person.age}
          </Text>
          <RatingLine
            userId={person.id}
            firstName={person.firstName}
            onPress={() =>
              navigation.navigate('Reviews', {
                userId: person.id,
                userName: person.firstName,
              })
            }
          />
          <Text style={styles.neighborhood}>
            {quartier}
            {slot ? ` · ${slot}` : ''}
            {person.dispoBudgetMax
              ? ` · ≤ ${person.dispoBudgetMax} €`
              : ''}
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Dispo ce soir</Text>
        </View>
      </View>

      {person.dispoTopic ? (
        <Text style={styles.topic} numberOfLines={2}>
          Sujet · {person.dispoTopic}
        </Text>
      ) : person.bio ? (
        <Text style={styles.bio} numberOfLines={2}>
          {person.bio}
        </Text>
      ) : null}

      {person.dispoExclusions?.length ? (
        <Text style={styles.excl} numberOfLines={1}>
          Pas de · {person.dispoExclusions.join(', ')}
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

      {onPropose ? (
        <Pressable
          onPress={onPropose}
          style={styles.cta}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>Proposer une sortie</Text>
        </Pressable>
      ) : null}
    </Pressable>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerText: { flex: 1 },
  name: {
    ...typography.subtitle,
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
  neighborhood: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  badge: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeText: {
    ...typography.small,
    color: colors.success,
    fontFamily: fonts.semiBold,
  },
  bio: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  topic: {
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.sm,
    fontFamily: fonts.medium,
  },
  excl: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    backgroundColor: colors.chip,
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
  cta: {
    marginTop: spacing.sm,
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
