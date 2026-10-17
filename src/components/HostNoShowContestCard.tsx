import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from './Button';
import { useChance } from '../data/ChanceContext';
import type { Outing } from '../data/types';
import { colors, radius, spacing, typography } from '../theme';
import { NOSHOW_CONTEST_NOTE_MAX_CHARS, normalizeContestNote } from '../utils/noShowContest';
import {
  hostContestDeadlineMs,
  hostContestRefusalLabel,
  hostContestTimeLeftLabel,
} from '../utils/hostNoShowContest';

/**
 * Encart hôte « Contester » son absence déclarée (table normale) : 24 h,
 * phrase obligatoire (jamais montrée aux invités). Carte blanche, filet,
 * sans ombre ; bouton secondaire (un seul bouton plein par écran).
 */
export function HostNoShowContestCard({ outing }: { outing: Outing }) {
  const { contestHostNoShow } = useChance();
  const [note, setNote] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const c = outing.hostNoShowCase;
  if (!c) return null;
  if (c.status === 'contested') {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Contestation envoyée</Text>
        <Text style={styles.body}>
          Ton absence est en attente de revue. Aucune sanction tant que Moment n’a pas tranché.
        </Text>
      </View>
    );
  }
  if (c.status !== 'pending') return null;
  const open = nowMs < hostContestDeadlineMs(outing);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Un invité t’a signalé absent</Text>
      <Text style={styles.body}>
        {open
          ? `Tu étais là ? Il te reste ${hostContestTimeLeftLabel(outing, nowMs)} pour contester, avec une phrase. Sans contestation, l’absence est retenue.`
          : 'Délai de 24 h écoulé — absence retenue.'}
      </Text>
      {open ? (
        <>
          <TextInput
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="Une phrase : ce qui s’est passé"
            placeholderTextColor={colors.textMuted}
            maxLength={NOSHOW_CONTEST_NOTE_MAX_CHARS}
            multiline
            accessibilityLabel="Phrase de contestation"
          />
          <Button
            title="Contester"
            variant="secondary"
            disabled={!normalizeContestNote(note)}
            onPress={() => {
              const res = contestHostNoShow(outing.id, note);
              if (!res.ok) {
                Alert.alert('Impossible', hostContestRefusalLabel(res.reason));
                return;
              }
              setNote('');
            }}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  title: { ...typography.body, color: colors.text, marginBottom: spacing.xs },
  body: { ...typography.caption, color: colors.textSecondary },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 72,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    ...typography.body,
    color: colors.text,
    textAlignVertical: 'top',
  },
});
