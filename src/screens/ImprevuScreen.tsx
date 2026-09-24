import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { useChance } from '../data/ChanceContext';
import { ImprevuMotive } from '../data/types';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import {
  IMPREVU_MOTIVES,
  IMPREVU_REASON_MAX_CHARS,
  IMPREVU_REASON_PLACEHOLDER,
  imprevuMotiveLabel,
  normalizeImprevuReason,
} from '../utils/imprevu';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Imprevu'>;
type R = RouteProp<RootStackParamList, 'Imprevu'>;

export function ImprevuScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const { reportImprevu, getMyImprevu } = useChance();
  const { outingId, requestId } = route.params;

  const existing = getMyImprevu(outingId);
  const [motive, setMotive] = useState<ImprevuMotive | null>(null);
  const [reason, setReason] = useState('');

  const onSend = () => {
    if (!motive) {
      Alert.alert('Motif requis', 'Choisis un motif.');
      return;
    }
    if (!normalizeImprevuReason(reason)) {
      Alert.alert('Raison requise', 'Explique en 1 à 3 lignes (obligatoire).');
      return;
    }
    const result = reportImprevu(outingId, motive, reason, requestId);
    if (!result.ok) {
      const messages: Record<string, string> = {
        already_reported: 'Tu as déjà signalé un imprévu pour cette sortie.',
        not_confirmed: 'Disponible uniquement une fois la place confirmée.',
        invalid_reason: 'Raison invalide (1–3 lignes).',
        outing_closed: 'Cette sortie est déjà clôturée.',
        no_responder: 'Personne à qui signaler.',
        no_user: 'Connecte-toi pour continuer.',
      };
      Alert.alert('Impossible', messages[result.reason] ?? result.reason);
      return;
    }
    Alert.alert(
      'Imprévu envoyé',
      'L’autre personne voit le motif et la raison. Pas de chat libre — elle peut accepter ou refuser.',
      [{ text: 'OK', onPress: () => navigation.goBack() }],
    );
  };

  if (existing) {
    const statusLabel =
      existing.status === 'pending'
        ? 'En attente de réponse'
        : existing.status === 'accepted'
          ? 'Accepté — pas de no-show · caution rendue · sortie annulée'
          : existing.status === 'auto_refused'
            ? 'Sans réponse à l’heure — refus + absence (caution perdue si invité)'
            : 'Refusé — caution toujours bloquée · règle des 3 h (pas d’amende)';
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Imprévu déjà signalé</Text>
        <Text style={styles.body}>Une seule fois par personne et par sortie.</Text>
        <View style={styles.card}>
          <Text style={styles.section}>Statut</Text>
          <Text style={styles.bodyStrong}>{statusLabel}</Text>
          <Text style={[styles.section, { marginTop: spacing.md }]}>Motif</Text>
          <Text style={styles.body}>{imprevuMotiveLabel(existing.motive)}</Text>
          <Text style={[styles.section, { marginTop: spacing.md }]}>Raison</Text>
          <Text style={styles.body}>{existing.reason}</Text>
        </View>
        <Button
          title="Retour"
          variant="secondary"
          onPress={() => navigation.goBack()}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Signaler un imprévu</Text>
      <Text style={styles.body}>
        Une fois par personne et par sortie. Motif + raison écrite ; l’autre
        accepte ou refuse — pas de chat libre (réservé à H−1). Accepté → caution
        20 € rendue et sortie annulée (pas de no-show). Refusé → règle des 3 h,
        sans amende inventée.
      </Text>

      <Text style={[styles.section, { marginTop: spacing.lg }]}>Motif</Text>
      <View style={styles.motives}>
        {IMPREVU_MOTIVES.map((m) => {
          const on = motive === m.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => setMotive(m.id)}
              style={[styles.motiveChip, on && styles.motiveChipOn]}
            >
              <Text style={[styles.motiveText, on && styles.motiveTextOn]}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.section, { marginTop: spacing.lg }]}>
        Raison (obligatoire)
      </Text>
      <TextInput
        style={styles.input}
        placeholder={IMPREVU_REASON_PLACEHOLDER}
        placeholderTextColor={colors.textMuted}
        value={reason}
        onChangeText={setReason}
        multiline
        maxLength={IMPREVU_REASON_MAX_CHARS}
        textAlignVertical="top"
      />
      <Text style={styles.hint}>
        1 à 3 lignes · {reason.trim().length}/{IMPREVU_REASON_MAX_CHARS}
      </Text>

      <Button
        title="Envoyer"
        onPress={onSend}
        style={{ marginTop: spacing.lg }}
        disabled={!motive || !reason.trim()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  title: {
    ...typography.title,
    color: colors.text,
    fontFamily: fonts.semiBold,
    marginBottom: spacing.sm,
  },
  body: { ...typography.body, color: colors.textSecondary },
  bodyStrong: {
    ...typography.bodyStrong,
    color: colors.text,
    fontFamily: fonts.semiBold,
  },
  section: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    fontFamily: fonts.semiBold,
  },
  motives: { gap: spacing.sm },
  motiveChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  motiveChipOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  motiveText: { ...typography.body, color: colors.text },
  motiveTextOn: {
    color: colors.primaryDark,
    fontFamily: fonts.semiBold,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 96,
    ...typography.body,
    color: colors.text,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginVertical: spacing.lg,
  },
});
