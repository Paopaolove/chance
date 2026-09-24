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
import { LowStarReasonKind } from '../data/types';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type R = RouteProp<RootStackParamList, 'LeaveReview'>;

const LOW_STAR_MOTIVES: { kind: LowStarReasonKind; label: string }[] = [
  { kind: 'comportement_genant', label: 'Comportement gênant' },
  { kind: 'absent_retard', label: 'Absent ou très en retard' },
  { kind: 'autre', label: 'Autre' },
];

export function LeaveReviewScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const { addReview } = useChance();
  const { outingId, toUserId, toUserName } = route.params;
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [wantToSeeAgain, setWantToSeeAgain] = useState<boolean | null>(null);
  const [lowStarKind, setLowStarKind] = useState<LowStarReasonKind | null>(
    null,
  );
  const [lowStarOther, setLowStarOther] = useState('');
  const [comment, setComment] = useState('');

  const needsMotive = rating === 1 || rating === 2;

  const onSubmit = () => {
    if (!rating) {
      Alert.alert(
        'Note requise',
        'Réponds à « La sortie s’est-elle bien passée ? » (1 à 5 étoiles).',
      );
      return;
    }
    if (wantToSeeAgain === null) {
      Alert.alert(
        'Réponse requise',
        'Indique si tu as envie de revoir cette personne.',
      );
      return;
    }
    if (needsMotive) {
      if (!lowStarKind) {
        Alert.alert(
          'Motif requis',
          'Pour une note de 1 ou 2, choisis un motif.',
        );
        return;
      }
      if (lowStarKind === 'autre' && !lowStarOther.trim()) {
        Alert.alert('Précise', 'Écris une ligne pour le motif « Autre ».');
        return;
      }
    }

    const result = addReview({
      outingId,
      toUserId,
      rating,
      comment: comment.trim() || undefined,
      wantToSeeAgain,
      ...(needsMotive && lowStarKind
        ? {
            lowStarReason: {
              kind: lowStarKind,
              ...(lowStarKind === 'autre'
                ? { detail: lowStarOther.trim() }
                : {}),
            },
          }
        : {}),
    });
    if (!result.ok) {
      const messages: Record<string, string> = {
        already_reviewed: 'Tu as déjà noté cette sortie.',
        self: 'Tu ne peux pas te noter toi-même.',
        no_user: 'Profil manquant.',
        invalid_rating: 'Note invalide.',
        low_star_reason_required: 'Motif requis pour une note basse.',
      };
      Alert.alert('Impossible', messages[result.reason] ?? result.reason);
      return;
    }
    Alert.alert('Merci', 'Ton avis est publié. Le commentaire n’est plus modifiable.');
    navigation.goBack();
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.hero}>Comment c’était ?</Text>
      <Text style={styles.intro}>
        {`Tu notes le respect et la rencontre, pas le feeling.\nPas d’étincelle, ce n’est pas une mauvaise note.`}
      </Text>
      <Text style={styles.personHint}>À propos de {toUserName}</Text>

      <Text style={styles.label}>
        La sortie s’est-elle bien passée ? (ponctualité, respect)
      </Text>
      <View style={styles.starsRow}>
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <Pressable
            key={n}
            onPress={() => {
              setRating(n);
              if (n >= 3) {
                setLowStarKind(null);
                setLowStarOther('');
              }
            }}
            style={styles.starBtn}
            accessibilityRole="button"
            accessibilityLabel={`${n} étoile${n > 1 ? 's' : ''}`}
          >
            <Text
              style={[
                styles.star,
                rating != null && n <= rating && styles.starOn,
              ]}
            >
              ★
            </Text>
          </Pressable>
        ))}
      </View>

      {needsMotive ? (
        <View style={styles.motiveBox}>
          <Text style={styles.motiveHint}>
            Si c’était juste un manque de feeling, mets plutôt 3 ou 4 et « envie
            de revoir : non ».
          </Text>
          <Text style={styles.label}>Motif (obligatoire)</Text>
          {LOW_STAR_MOTIVES.map((m) => (
            <Pressable
              key={m.kind}
              onPress={() => setLowStarKind(m.kind)}
              style={[
                styles.chip,
                lowStarKind === m.kind && styles.chipOn,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: lowStarKind === m.kind }}
            >
              <Text
                style={[
                  styles.chipText,
                  lowStarKind === m.kind && styles.chipTextOn,
                ]}
              >
                {m.label}
              </Text>
            </Pressable>
          ))}
          {lowStarKind === 'autre' ? (
            <TextInput
              style={styles.inputOneLine}
              placeholder="Précise en une ligne…"
              placeholderTextColor={colors.textMuted}
              value={lowStarOther}
              onChangeText={setLowStarOther}
              maxLength={120}
            />
          ) : null}
        </View>
      ) : null}

      <Text style={styles.label}>Envie de revoir cette personne ?</Text>
      <Text style={styles.privateNote}>
        Réponse privée — jamais affichée sur le profil.
      </Text>
      <View style={styles.yesNoRow}>
        <Pressable
          onPress={() => setWantToSeeAgain(true)}
          style={[
            styles.yesNoBtn,
            wantToSeeAgain === true && styles.yesNoOn,
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: wantToSeeAgain === true }}
        >
          <Text
            style={[
              styles.yesNoText,
              wantToSeeAgain === true && styles.yesNoTextOn,
            ]}
          >
            Oui
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setWantToSeeAgain(false)}
          style={[
            styles.yesNoBtn,
            wantToSeeAgain === false && styles.yesNoOn,
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: wantToSeeAgain === false }}
        >
          <Text
            style={[
              styles.yesNoText,
              wantToSeeAgain === false && styles.yesNoTextOn,
            ]}
          >
            Non
          </Text>
        </Pressable>
      </View>

      <View style={styles.divider} />

      <Text style={styles.label}>Commentaire (optionnel)</Text>
      <Text style={styles.sectionSub}>
        Libre — lieu ou rencontre. Non modifiable après envoi.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Comment s’est passée la sortie / le lieu ?"
        placeholderTextColor={colors.textMuted}
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={400}
      />
      <Text style={styles.immutableNote}>
        Commentaire non modifiable après envoi. Une seule réponse possible.
      </Text>

      <Button title="Publier l’avis" onPress={onSubmit} />
      <Button
        title="Annuler"
        variant="ghost"
        onPress={() => navigation.goBack()}
        style={{ marginTop: spacing.sm }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  hero: { ...typography.hero, color: colors.text, marginBottom: spacing.sm },
  intro: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 24,
  },
  personHint: {
    ...typography.caption,
    color: colors.textMuted,
    fontFamily: fonts.semiBold,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  privateNote: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: -4,
    marginBottom: spacing.sm,
  },
  starsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  starBtn: { padding: spacing.xs },
  star: { fontSize: 36, color: colors.border },
  starOn: { color: colors.primary },
  motiveBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  motiveHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    lineHeight: 18,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  chipOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  chipText: {
    ...typography.body,
    color: colors.text,
  },
  chipTextOn: {
    color: colors.white,
    fontFamily: fonts.semiBold,
  },
  inputOneLine: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.text,
  },
  yesNoRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  yesNoBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  yesNoOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  yesNoText: {
    ...typography.subtitle,
    color: colors.text,
    fontFamily: fonts.semiBold,
  },
  yesNoTextOn: {
    color: colors.white,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.xl,
  },
  sectionSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 100,
    marginBottom: spacing.sm,
    ...typography.body,
    color: colors.text,
    textAlignVertical: 'top',
  },
  immutableNote: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },
});
