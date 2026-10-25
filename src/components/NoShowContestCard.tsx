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
import { PARTNER_VENUE_ABSENT_TEXT } from '../utils/partners';

/**
 * Encart invité « Contester » un « Pas venu » déclaré par l’hôte :
 * temps restant (24 h), phrase obligatoire. Carte blanche, filet, sans ombre ;
 * bouton secondaire (un seul bouton plein par écran).
 */
export function NoShowContestCard({ request }: { request: Request }) {
  const { contestNoShow } = useChance();
  // 25/10 soir · Partenaire calé The Fork : décoché sur la liste du lieu → caution entière au lieu.
  const partner = !!request.partnerVenueAbsent;
  const lossLabel = partner
    ? `les ${DEPOSIT_EUROS} € de caution vont au lieu`
    : `la caution est perdue (${describeDepositForfeitSplit()})`;
  const [note, setNote] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (request.depositStatus === 'contested') {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>
          {/* 18/10 : désaccord présent / « Pas venu », contestation ouverte d’office. */}
          {request.noShowContest?.viaPresence ? 'Contestation ouverte' : 'Contestation envoyée'}
        </Text>
        <Text style={styles.body}>
          Ta caution de {DEPOSIT_EUROS} € est en attente de revue. Ni perdue ni rendue tant que
          Moment n’a pas tranché ; sans décision sous 7 jours, elle t’est rendue.
        </Text>
      </View>
    );
  }
  if (request.depositStatus !== 'noshow_pending') return null;
  // Gel 17/10 (point 3) : contestation possible aussi pendant la suspension.
  const open = isContestWindowOpen(request, nowMs);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{partner ? PARTNER_VENUE_ABSENT_TEXT : 'L’hôte t’a signalé « Pas venu »'}</Text>
      <Text style={styles.body}>
        {request.noShowContestPausedAt
          ? `Délai en pause tant que l’absence ${partner ? 'du lieu' : 'de l’hôte'} est en attente. Tu peux déjà contester, avec une phrase.`
          : open
          ? partner
            ? `Tu étais là ? Il te reste ${contestTimeLeftLabel(request, nowMs)} pour dire « je suis venu », avec une phrase. Sans réponse, ${lossLabel}.`
            : `Tu étais là ? Il te reste ${contestTimeLeftLabel(request, nowMs)} pour contester, avec une phrase. Sans contestation, ${lossLabel}.`
          : `Délai de 24 h écoulé — ${lossLabel}.`}
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
            title={partner ? 'Je suis venu' : 'Contester'}
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
