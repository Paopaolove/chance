import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from './Button';
import { useChance } from '../data/ChanceContext';
import type { Request } from '../data/types';
import { colors, radius, spacing, typography } from '../theme';
import {
  NOSHOW_CONTEST_NOTE_MAX_CHARS,
  contestRefusalLabel,
  contestTimeLeftLabel,
  isContestWindowOpen,
  normalizeContestNote,
} from '../utils/noShowContest';
import { DEPOSIT_EUROS, describeDepositForfeitSplit } from '../data/pricing';
import { isPartnerListing } from '../utils/partners';

/**
 * Encart invité « Contester » un « Pas venu » déclaré par l’hôte :
 * temps restant (24 h), phrase obligatoire. Carte blanche, filet, sans ombre ;
 * bouton secondaire (un seul bouton plein par écran).
 */
export function NoShowContestCard({ request }: { request: Request }) {
  const { contestNoShow, state } = useChance();
  const partner = isPartnerListing(state.outings.find((o) => o.id === request.outingId));
  const [note, setNote] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (request.depositStatus === 'contested') {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Contestation envoyée</Text>
        <Text style={styles.body}>
          Ta caution de {DEPOSIT_EUROS} € est en attente de revue. Ni perdue ni rendue tant que
          Moment n’a pas tranché ; sans décision sous 7 jours, elle t’est rendue.
        </Text>
      </View>
    );
  }
  if (request.depositStatus !== 'noshow_pending') return null;
  const open = isContestWindowOpen(request, nowMs);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{partner ? 'Le lieu' : 'L’hôte'} t’a signalé « Pas venu »</Text>
      <Text style={styles.body}>
        {open
          ? `Tu étais là ? Il te reste ${contestTimeLeftLabel(request, nowMs)} pour contester, avec une phrase. Sans contestation, la caution est perdue (${describeDepositForfeitSplit()}).`
          : `Délai de 24 h écoulé — caution perdue (${describeDepositForfeitSplit()}).`}
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
              const res = contestNoShow(request.id, note);
              if (!res.ok) {
                Alert.alert('Impossible', contestRefusalLabel(res.reason));
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
