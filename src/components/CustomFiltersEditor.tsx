import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  MAX_CUSTOM_FILTER_LENGTH,
  MAX_CUSTOM_FILTERS,
  tryAddCustomFilter,
} from '../data/interests';
import { colors, fonts, radius, spacing, typography } from '../theme';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  /** Optional error shown under the field (parent-driven). */
  error?: string;
  /** Optional label override (default: Créer un centre d'intérêt). */
  label?: string;
}

export function CustomFiltersEditor({
  value,
  onChange,
  error,
  label = 'Créer un centre d’intérêt',
}: Props) {
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState('');

  const add = () => {
    const result = tryAddCustomFilter(value, draft);
    if (!result.ok) {
      setLocalError(result.reason);
      return;
    }
    setLocalError('');
    setDraft('');
    onChange(result.next);
  };

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
    if (localError) setLocalError('');
  };

  const atMax = value.length >= MAX_CUSTOM_FILTERS;

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>
        Écris un mot puis appuie sur Ajouter — Ex. vegan, afterwork, calme,
        bilingual…
      </Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={(t) => {
            setDraft(t.slice(0, MAX_CUSTOM_FILTER_LENGTH));
            if (localError) setLocalError('');
          }}
          placeholder="Ex. vegan"
          placeholderTextColor={colors.textMuted}
          maxLength={MAX_CUSTOM_FILTER_LENGTH}
          returnKeyType="done"
          blurOnSubmit={false}
          onSubmitEditing={add}
          editable={!atMax}
        />
        <Pressable
          onPress={add}
          accessibilityRole="button"
          accessibilityLabel="Ajouter le centre d’intérêt"
          hitSlop={8}
          style={({ pressed }) => [
            styles.addBtn,
            pressed && styles.addPressed,
            atMax && styles.addDisabled,
          ]}
          disabled={atMax}
        >
          <Text style={styles.addText}>Ajouter</Text>
        </Pressable>
      </View>
      {value.length ? (
        <View style={styles.chips}>
          {value.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => remove(tag)}
              style={styles.chip}
              accessibilityLabel={`Retirer ${tag}`}
            >
              <Text style={styles.chipText}>{tag}</Text>
              <Text style={styles.chipX}>×</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={styles.counter}>
        {value.length}/{MAX_CUSTOM_FILTERS}
      </Text>
      {localError || error ? (
        <Text style={styles.error}>{localError || error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  hint: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
  },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  addPressed: { opacity: 0.9 },
  addDisabled: { opacity: 0.45 },
  addText: {
    ...typography.caption,
    color: colors.white,
    fontFamily: fonts.semiBold,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  chipText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontFamily: fonts.semiBold,
  },
  chipX: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
    lineHeight: 18,
  },
  counter: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.sm,
  },
});
