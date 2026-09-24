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
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type R = RouteProp<RootStackParamList, 'LeaveReview'>;

export function LeaveReviewScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const { addReview } = useChance();
  const { outingId, toUserId, toUserName } = route.params;
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [comment, setComment] = useState('');

  const onSubmit = () => {
    if (!rating) {
      Alert.alert('Note requise', 'Choisis une note de 1 à 5 étoiles.');
      return;
    }
    const result = addReview({
      outingId,
      toUserId,
      rating,
      comment: comment.trim() || undefined,
    });
    if (!result.ok) {
      const messages: Record<string, string> = {
        already_reviewed: 'Tu as déjà noté cette sortie.',
        self: 'Tu ne peux pas te noter toi-même.',
        no_user: 'Profil manquant.',
        invalid_rating: 'Note invalide.',
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
      <Text style={styles.hero}>Noter {toUserName}</Text>
      <Text style={styles.body}>
        Simple : 1 à 5 étoiles, commentaire optionnel. Pas de modification après
        envoi.
      </Text>

      <Text style={styles.label}>Note</Text>
      <View style={styles.starsRow}>
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <Pressable
            key={n}
            onPress={() => setRating(n)}
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

      <Text style={styles.label}>Commentaire (optionnel)</Text>
      <TextInput
        style={styles.input}
        placeholder="Comment s’est passée la sortie ?"
        placeholderTextColor={colors.textMuted}
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={400}
      />

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
  body: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  starsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  starBtn: { padding: spacing.xs },
  star: { fontSize: 36, color: colors.border },
  starOn: { color: colors.primary },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 100,
    marginBottom: spacing.xl,
    ...typography.body,
    color: colors.text,
    textAlignVertical: 'top',
  },
});
