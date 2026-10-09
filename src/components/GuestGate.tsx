import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChance } from '../data/ChanceContext';
import { openAccountFlow } from '../navigation/accountGate';
import { colors, radius, spacing, typography } from '../theme';
import { Button } from './Button';

export const GUEST_CTA_TEXT = 'Crée ton compte pour proposer ou rejoindre un moment.';

/** Carte simple pour un visiteur sans compte (Profil, Demandes, Publier…). */
export function GuestAccountCard({ title }: { title?: string }) {
  return (
    <View style={styles.card}>
      {title ? (
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <Text style={styles.body}>{GUEST_CTA_TEXT}</Text>
      <Button title="Créer mon compte" onPress={() => openAccountFlow()} />
    </View>
  );
}

/**
 * Enveloppe d’écran : sans compte, la carte ; avec compte, l’écran.
 * L’écran réel est monté seulement après création du compte (hooks propres).
 */
export function withAccount<P extends object>(
  Screen: React.ComponentType<P>,
  title?: string,
) {
  return function Gated(props: P) {
    const { state } = useChance();
    if (!state.currentUser) {
      return (
        <SafeAreaView style={styles.safe} edges={['top']}>
          <GuestAccountCard title={title} />
        </SafeAreaView>
      );
    }
    return <Screen {...props} />;
  };
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: { ...typography.title, color: colors.text },
  body: { ...typography.body, color: colors.text },
});
