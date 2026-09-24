import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useChance } from '../data/ChanceContext';
import { budgetChipLabel, mockHosts } from '../data/mockOutings';
import {
  formatTravelMinutes,
  getTravelMinutes,
} from '../data/travelTime';
import { Outing } from '../data/types';
import { colors, fonts, radius, shadows, spacing, typography } from '../theme';
import { formatOutingWhen } from '../utils/format';
import { hostPhotoSize } from '../utils/subscription';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Avatar } from './Avatar';
import { RatingLine } from './RatingLine';

interface Props {
  outing: Outing;
  onPress: () => void;
  /** Precomputed travel minutes from current user neighborhood. */
  travelMinutes?: number;
}

export function OutingCard({ outing, onPress, travelMinutes }: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { state } = useChance();
  const viewer = state.currentUser;
  const from = state.currentUser?.neighborhood;
  const minutes =
    travelMinutes ??
    (from ? getTravelMinutes(from, outing.neighborhood) : undefined);
  const photoSize = hostPhotoSize(viewer);
  const isFree = outing.budgetMaxEuros <= 0;

  const photoUri = useMemo(() => {
    if (state.currentUser?.id === outing.hostId) {
      return state.currentUser.photoUri;
    }
    return mockHosts.find((h) => h.id === outing.hostId)?.photoUri;
  }, [state.currentUser, outing.hostId]);

  const title = `${outing.venueName} · ${formatOutingWhen(outing.startsAt)}`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.mainRow}>
        <Avatar
          name={outing.hostName}
          photoUri={photoUri}
          seed={outing.hostId}
          size={photoSize}
        />
        <View style={styles.mainText}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.meta}>
            {outing.neighborhood}
            {minutes !== undefined
              ? ` · ${formatTravelMinutes(minutes)}`
              : ''}
          </Text>
          <View style={styles.chipsRow}>
            <View
              style={[styles.chip, isFree ? styles.chipFree : styles.chipBudget]}
            >
              <Text
                style={[
                  styles.chipText,
                  isFree ? styles.chipFreeText : styles.chipBudgetText,
                ]}
              >
                {budgetChipLabel(outing.budgetMaxEuros)}
              </Text>
            </View>
          </View>
          <RatingLine
            userId={outing.hostId}
            firstName={outing.hostName}
            onPress={() =>
              navigation.navigate('HostProfile', {
                userId: outing.hostId,
              })
            }
          />
        </View>
      </View>
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
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  mainText: { flex: 1 },
  title: {
    ...typography.subtitle,
    fontFamily: fonts.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.text,
    marginBottom: 4,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  chipsRow: {
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
  chipBudget: { backgroundColor: colors.surfaceMuted },
  chipFree: { backgroundColor: colors.successSoft },
  chipText: { ...typography.small, color: colors.textSecondary },
  chipBudgetText: { color: colors.text },
  chipFreeText: { color: colors.success, fontFamily: fonts.semiBold },
});
