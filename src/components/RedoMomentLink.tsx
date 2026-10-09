import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, spacing, typography } from '../theme';

/**
 * Après la note : une relance, pas un fil ni un abonnement.
 * Ouvre Publier prérempli comme proposition à cette personne
 * (même flux que « Proposer un moment à X »).
 */
export function RedoMomentLink({
  userId,
  firstName,
  compact,
}: {
  userId: string;
  firstName: string;
  compact?: boolean;
}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Pressable
      onPress={() =>
        navigation.navigate('MainTabs', {
          screen: 'Create',
          params: {
            fromDispo: true,
            inviteeUserId: userId,
            inviteeName: firstName,
          },
        })
      }
      hitSlop={8}
      accessibilityRole="link"
      style={({ pressed }) => [compact ? styles.compact : styles.wrap, pressed && { opacity: 0.7 }]}
    >
      <Text style={compact ? styles.textSmall : styles.text}>
        Refaire un moment avec {firstName}.
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', marginBottom: spacing.xl },
  compact: { alignSelf: 'flex-start', marginTop: spacing.sm },
  text: {
    ...typography.body,
    fontFamily: fonts.semiBold,
    color: colors.text,
    textDecorationLine: 'underline',
  },
  textSmall: {
    ...typography.caption,
    fontFamily: fonts.semiBold,
    color: colors.text,
    textDecorationLine: 'underline',
  },
});
