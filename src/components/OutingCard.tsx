import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useChance } from '../data/ChanceContext';
import { budgetChipLabel, mockHosts } from '../data/mockOutings';
import { formatOutingCategoryLabel } from '../utils/categoryLabel';
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

  const photoUri = useMemo(() => {
    if (state.currentUser?.id === outing.hostId) {
      return state.currentUser.photoUri;
    }
    return mockHosts.find((h) => h.id === outing.hostId)?.photoUri;
  }, [state.currentUser, outing.hostId]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.topRow}>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{formatOutingCategoryLabel(outing.category, outing.categoryDetail)}</Text>
        </View>
        <View style={[styles.chip, styles.chipBudget]}>
          <Text style={[styles.chipText, styles.chipBudgetText]}>
            {budgetChipLabel(outing.budgetMaxEuros)}
          </Text>
        </View>
        {minutes !== undefined ? (
          <View style={[styles.chip, styles.chipTravel]}>
            <Text style={[styles.chipText, styles.chipTravelText]}>
              {formatTravelMinutes(minutes)}
            </Text>
          </View>
        ) : null}
        {outing.womenOnly ? (
          <View style={[styles.chip, styles.chipWomen]}>
            <Text style={[styles.chipText, styles.chipWomenText]}>
              Femmes uniquement
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.mainRow}>
        <Avatar
          name={outing.hostName}
          photoUri={photoUri}
          seed={outing.hostId}
          size={photoSize}
        />
        <View style={styles.mainText}>
          <Text style={styles.title}>{outing.title}</Text>
          <Text style={styles.meta}>
            {outing.venueName} · {outing.neighborhood}
          </Text>
          <Text style={styles.when}>{formatOutingWhen(outing.startsAt)}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <Text style={styles.host}>
            {outing.hostName}, {outing.hostAge}
          </Text>
          <RatingLine
            userId={outing.hostId}
            firstName={outing.hostName}
            onPress={() =>
              navigation.navigate('Reviews', {
                userId: outing.hostId,
                userName: outing.hostName,
              })
            }
          />
        </View>
        <Text style={styles.spots}>
          {outing.spotsLeft} place{outing.spotsLeft > 1 ? 's' : ''}
        </Text>
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
  topRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    backgroundColor: colors.chip,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  chipBudget: { backgroundColor: colors.surfaceMuted },
  chipTravel: { backgroundColor: colors.successSoft },
  chipWomen: { backgroundColor: colors.primarySoft },
  chipText: { ...typography.small, color: colors.textSecondary },
  chipBudgetText: { color: colors.text },
  chipTravelText: { color: colors.success, fontFamily: fonts.semiBold },
  chipWomenText: { color: colors.primaryDark },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  mainText: { flex: 1 },
  title: {
    ...typography.subtitle,
    fontFamily: fonts.semiBold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.text,
    marginBottom: 6,
  },
  meta: { ...typography.caption, color: colors.textSecondary },
  when: {
    ...typography.caption,
    color: colors.primaryDark,
    marginTop: spacing.sm,
  },
  footer: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  host: { ...typography.bodyStrong, color: colors.text },
  spots: { ...typography.caption, color: colors.textMuted },
});
