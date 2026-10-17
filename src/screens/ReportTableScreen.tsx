import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
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
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { TABLE_REPORT_NOTE_MAX_CHARS, tableMemberIds } from '../utils/tableReports';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ReportTable'>;
type R = RouteProp<RootStackParamList, 'ReportTable'>;

/**
 * « Signaler » — tout membre de la table (hôte ou invité confirmé), pendant
 * ou après le moment. Confidentiel : la personne concernée ne saura pas qui
 * a signalé. Démo : aucun vrai message envoyé.
 */
export function ReportTableScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const { state, getOutingById, canReportOnOuting, submitTableReport } =
    useChance();
  const outing = getOutingById(route.params.outingId);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const others = useMemo(() => {
    if (!outing || !state.currentUser) return [];
    const me = state.currentUser.id;
    return tableMemberIds(outing, state.requests)
      .filter((id) => id !== me)
      .map((id) => ({
        id,
        name:
          id === outing.hostId
            ? outing.hostName
            : state.requests.find(
                (r) => r.outingId === outing.id && r.userId === id,
              )?.userName ?? 'Membre',
        role: id === outing.hostId ? 'Hôte' : 'Invité',
      }));
  }, [outing, state.currentUser, state.requests]);

  if (!outing || !canReportOnOuting(outing.id)) {
    return (
      <View style={[styles.scroll, styles.content]}>
        <Text style={styles.body}>
          Signalement possible pour les membres de la table, à partir de
          l’heure du moment.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Signaler</Text>
      <Text style={styles.body}>
        Confidentiel : la personne ne saura pas que c’est toi. L’équipe Moment
        prend le relais.
      </Text>

      <Text style={[styles.section, { marginTop: spacing.xl }]}>
        Personne concernée
      </Text>
      <View style={styles.list}>
        {others.map((m) => {
          const on = m.id === targetId;
          return (
            <Pressable
              key={m.id}
              onPress={() => setTargetId(m.id)}
              style={[styles.card, on && styles.cardOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Text style={styles.name}>{m.name}</Text>
              <Text style={styles.meta}>{on ? `${m.role} · choisi` : m.role}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.section, { marginTop: spacing.xl }]}>
        Un mot (facultatif)
      </Text>
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={TABLE_REPORT_NOTE_MAX_CHARS}
        placeholder="Ce qui s’est passé, si tu veux."
        placeholderTextColor={colors.textMuted}
      />

      <Button
        title="Envoyer le signalement"
        disabled={!targetId}
        onPress={() => {
          if (!targetId) return;
          const res = submitTableReport(outing.id, targetId, note);
          if (!res.ok) {
            Alert.alert('Impossible', 'Signalement indisponible pour ce moment.');
            return;
          }
          Alert.alert(
            'Merci',
            'Signalement reçu. L’équipe Moment te recontacte (démo).',
          );
          navigation.goBack();
        }}
        style={{ marginTop: spacing.xl }}
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
  section: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    fontFamily: fonts.semiBold,
  },
  list: { gap: spacing.sm },
  /** Carte blanche, filet #E7DFD6, rayon 16, sans ombre. */
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  /** Sélection : filet encre (l’abricot reste au bouton principal). */
  cardOn: { borderColor: colors.text },
  name: { ...typography.bodyStrong, color: colors.text, fontFamily: fonts.semiBold },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.md,
    minHeight: 96,
    ...typography.body,
    color: colors.text,
    textAlignVertical: 'top',
  },
});
