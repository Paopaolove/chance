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

  const openHostProfile = () => {
    navigation.navigate('HostProfile', { userId: outing.hostId });
  };

  return (
    <View style={styles.card}>
      <View style={styles.mainRow}>
        <Pressable
          onPress={openHostProfile}
          accessibilityRole="button"
          accessibilityLabel={`Profil de ${outing.hostName}`}
          hitSlop={6}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Avatar
            name={outing.hostName}
            photoUri={photoUri}
            seed={outing.hostId}
            size={photoSize}
          />
        </Pressable>
        <View style={styles.mainText}>
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`Sortie ${outing.venueName}`}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.title} numberOfLines={1}>
              {outing.hostName} t'invite
            </Text>
            <Text style={styles.venue} numberOfLines={1}>
              {outing.venueName}
            </Text>
            <Text style={styles.meta}>
              {formatOutingWhen(outing.startsAt)} · {outing.neighborhood}
              {minutes !== undefined
                ? ` · ${formatTravelMinutes(minutes)}`
                : ''}
            </Text>
            {outing.description.trim() ? (
              <Text style={styles.message} numberOfLines={2}>
                {outing.description.trim()}
              </Text>
            ) : null}
            <View style={styles.chipsRow}>
              <View
                style={[
                  styles.chip,
                  isFree ? styles.chipFree : styles.chipBudget,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    isFree ? styles.chipFreeText : styles.chipBudgetText,
                  ]}
                >
                  {isFree
                    ? 'Gratuit'
                    : `J'invite jusqu'à ${outing.budgetMaxEuros} €`}
                </Text>
              </View>
            </View>
          </Pressable>
          <RatingLine
            userId={outing.hostId}
            firstName={outing.hostName}
            onPress={openHostProfile}
          />
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
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.text,
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
