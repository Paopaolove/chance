import React, { useRef } from 'react';
import {
  KeyboardTypeOptions,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { colors, fonts, radius, spacing, typography } from '../theme';

export type PillOption<T extends string | number> = { id: T; label: string };

interface Props<T extends string | number> {
  options: PillOption<T>[];
  /** Pastille sélectionnée (ignorée quand `otherActive`). */
  selected?: T | null;
  /** Multi-sélection (ex. catégories Dispo). Prioritaire sur `selected`. */
  selectedIds?: T[];
  onSelect: (id: T) => void;
  /** « Autre » actif : champ libre rempli / choisi. */
  otherActive: boolean;
  otherValue: string;
  onChangeOther: (text: string) => void;
  /** Tap sur la pastille « Autre » (en plus du focus du champ). */
  onPressOther?: () => void;
  /**
   * false → pas de pastille « Autre » en plus (ex. catégorie, où « Autre »
   * est déjà une vraie option) : seul le champ libre est ajouté.
   */
  showOtherPill?: boolean;
  otherLabel?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  /** Unité affichée après le champ (€, min, %). */
  suffix?: string;
  maxLength?: number;
  /** Largeur du champ (compact pour les nombres). Défaut : s’étire. */
  inputWidth?: number;
  /** Message doux sous le groupe (date passée, bornes…). */
  hint?: string | null;
  hintTone?: 'muted' | 'error';
  /** chip = pastilles pleines (filtres) ; outline = style bouton (Publier). */
  look?: 'chip' | 'outline';
  /** Pastilles en ligne défilante (longues listes) ; le champ reste dessous, visible. */
  scroll?: boolean;
  /**
   * Une seule ligne défilante : pastilles + « Autre » + champ libre au bout,
   * même niveau, toujours visible (filtres compacts d’Autour de toi).
   */
  inline?: boolean;
  /** Pastilles plus basses (filtres). */
  compact?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Pastilles + « Autre » + champ libre au même niveau (toujours visible).
 * Taper « Autre » met le focus dans le champ ; écrire sélectionne « Autre »
 * (le parent désélectionne les pastilles) ; choisir une pastille vide le champ
 * (géré par le parent dans `onSelect`).
 */
export function PillsWithOther<T extends string | number>({
  options,
  selected,
  selectedIds,
  onSelect,
  otherActive,
  otherValue,
  onChangeOther,
  onPressOther,
  showOtherPill = true,
  otherLabel = 'Autre',
  placeholder,
  keyboardType,
  suffix,
  maxLength,
  inputWidth,
  hint,
  hintTone = 'muted',
  look = 'chip',
  scroll = false,
  inline = false,
  compact = false,
  accessibilityLabel,
  style,
}: Props<T>) {
  const inputRef = useRef<TextInput>(null);
  const outline = look === 'outline';

  const isOn = (id: T) =>
    selectedIds ? selectedIds.includes(id) : !otherActive && selected === id;

  const pill = (key: string, label: string, on: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        compact && styles.pillCompact,
        outline ? styles.pillOutline : styles.pillChip,
        on && styles.pillOn,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.pillText,
          outline && styles.pillTextOutline,
          on && styles.pillTextOn,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  const pills = options.map((o) =>
    pill(String(o.id), o.label, isOn(o.id), () => onSelect(o.id)),
  );

  const otherUnit = (
    <View
      style={[
        styles.otherUnit,
        !inputWidth && !inline && styles.otherUnitGrow,
      ]}
    >
      {showOtherPill
        ? pill('__other', otherLabel, otherActive, () => {
            onPressOther?.();
            inputRef.current?.focus();
          })
        : null}
      <TextInput
        selectionColor={colors.primary}
        cursorColor={colors.primary}
        ref={inputRef}
        style={[
          styles.input,
          compact && styles.inputCompact,
          inputWidth
            ? { width: inputWidth }
            : inline
              ? styles.inputInline
              : styles.inputGrow,
          otherActive && styles.inputOn,
        ]}
        value={otherValue}
        onChangeText={onChangeOther}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoCorrect={false}
        returnKeyType="done"
        accessibilityLabel={
          accessibilityLabel ?? `${otherLabel} : ${placeholder ?? 'champ libre'}`
        }
      />
      {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
    </View>
  );

  return (
    <View style={style}>
      {inline ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollRow}
          style={styles.inlineScroll}
        >
          {pills}
          {otherUnit}
        </ScrollView>
      ) : scroll ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollRow}
            style={styles.scroll}
          >
            {pills}
          </ScrollView>
          <View style={styles.row}>{otherUnit}</View>
        </>
      ) : (
        <View style={styles.row}>
          {pills}
          {otherUnit}
        </View>
      )}
      {hint ? (
        <Text style={[styles.hint, hintTone === 'error' && styles.hintError]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scroll: { flexGrow: 0, marginBottom: spacing.sm },
  scrollRow: { gap: spacing.sm, alignItems: 'center', paddingBottom: 4 },
  pill: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillCompact: { minHeight: 34, paddingHorizontal: spacing.md },
  /** Inactive : fond blanc, bord #E6DFD4, texte #1C1917. */
  pillChip: { backgroundColor: colors.chip, borderColor: colors.chipBorder },
  pillOutline: { backgroundColor: colors.chip, borderColor: colors.chipBorder },
  /** Active : fond orange #E25B1A, texte blanc. */
  pillOn: { backgroundColor: colors.chipActive, borderColor: colors.chipActive },
  pressed: { opacity: 0.88 },
  pillText: {
    ...typography.caption,
    fontFamily: fonts.semiBold,
    color: colors.chipText,
  },
  /** Pastille plus grande (écran Publier), mêmes couleurs que les autres. */
  pillTextOutline: {
    ...typography.bodyStrong,
    fontFamily: fonts.semiBold,
    color: colors.chipText,
  },
  pillTextOn: { color: colors.chipActiveText },
  otherUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  otherUnitGrow: { flexGrow: 1, minWidth: 200 },
  input: {
    minHeight: 40,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.caption,
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
  inputGrow: { flex: 1, minWidth: 120 },
  inputInline: { width: 140 },
  inputCompact: { minHeight: 34, paddingVertical: 6 },
  inlineScroll: { flexGrow: 0 },
  inputOn: { borderColor: colors.primary },
  suffix: { ...typography.caption, color: colors.textMuted },
  hint: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  hintError: { color: colors.danger },
});
