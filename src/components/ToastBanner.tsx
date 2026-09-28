import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChance } from '../data/ChanceContext';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { openNotificationTarget } from '../utils/openNotificationTarget';

/** In-app mock notification — tappable when type + ids are present. */
export function ToastBanner() {
  const {
    state,
    clearToast,
    getOutingById,
    getRequestById,
    getPendingImprevuForMe,
    canLeaveReview,
    getOutingsToRate,
  } = useChance();
  const insets = useSafeAreaInsets();
  const toast = state.toast;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => clearToast(), 4500);
    return () => clearTimeout(t);
  }, [toast, clearToast]);

  if (!toast) return null;

  const clickable = !!(
    toast.type &&
    (toast.outingId || toast.requestId || toast.type === 'new_request')
  );

  const onPress = () => {
    clearToast();
    if (!clickable || !toast.type) return;
    openNotificationTarget(
      {
        type: toast.type,
        outingId: toast.outingId,
        requestId: toast.requestId,
      },
      {
        getOutingById,
        getRequestById,
        getPendingImprevuForMe,
        canLeaveReview,
        getOutingsToRate,
      },
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + spacing.sm }]}
    >
      <Pressable
        style={styles.card}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityHint={
          clickable ? 'Ouvre l’écran concerné' : 'Ferme la notification'
        }
      >
        <Text style={styles.title}>{toast.title}</Text>
        <Text style={styles.body}>{toast.body}</Text>
        <Text style={styles.dismiss}>
          {clickable ? 'Toucher pour ouvrir' : 'Toucher pour fermer'}
        </Text>
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
