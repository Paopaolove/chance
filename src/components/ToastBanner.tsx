import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChance } from '../data/ChanceContext';
import { colors, fonts, radius, spacing, typography } from '../theme';

/** In-app mock notification for late alerts etc. */
export function ToastBanner() {
  const { state, clearToast } = useChance();
  const insets = useSafeAreaInsets();
  const toast = state.toast;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => clearToast(), 4500);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!toast) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + spacing.sm }]}
    >
      <Pressable style={styles.card} onPress={clearToast}>
        <Text style={styles.title}>{toast.title}</Text>
        <Text style={styles.body}>{toast.body}</Text>
        <Text style={styles.dismiss}>Toucher pour fermer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 100,
  },
  card: {
    backgroundColor: colors.text,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.white,
    fontFamily: fonts.semiBold,
  },
  body: {
    ...typography.body,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 4,
  },
  dismiss: {
    ...typography.small,
    color: 'rgba(255,255,255,0.55)',
    marginTop: spacing.sm,
  },
});
