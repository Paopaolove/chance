import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { useChance } from '../data/ChanceContext';
import { ALL_CATEGORIES, categoryLabels } from '../data/mockOutings';
import { PARIS_NEIGHBORHOODS } from '../data/neighborhoods';
import { OutingCategory } from '../data/types';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, shadows, spacing, typography } from '../theme';
import {
  DISPO_SLOT_OPTIONS,
  dispoSlotLabel,
  nextLocalMidnight,
} from '../utils/dispo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const BUDGET_PRESETS = [15, 25, 40] as const;

export function DispoSoirScreen() {
  const navigation = useNavigation<Nav>();
  const { state, setDispoProfile } = useChance();
  const user = state.currentUser;

  const [on, setOn] = useState(!!user?.dispoSoir);
  const [slot, setSlot] = useState(
    user?.dispoSlot ?? '19:30',
  );
  const [categories, setCategories] = useState<OutingCategory[]>(
    user?.dispoCategories?.length
      ? [...user.dispoCategories]
      : ['restaurant', 'bar'],
  );
  const [categoryDetail, setCategoryDetail] = useState(
    user?.dispoCategoryDetail ?? '',
  );
  const [quartier, setQuartier] = useState(
    user?.dispoNeighborhood ?? user?.neighborhood ?? 'Le Marais',
  );
  const [showQuartiers, setShowQuartiers] = useState(false);
  const [budgetMax, setBudgetMax] = useState<number>(
    user?.dispoBudgetMax ?? 25,
  );
  const [topic, setTopic] = useState(user?.dispoTopic ?? '');
  const [exclusions, setExclusions] = useState(
    (user?.dispoExclusions ?? []).join(', '),
  );

  const toggleCategory = (id: OutingCategory) => {
    setCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const hint = useMemo(() => {
    if (on && categories.length === 0) {
      return 'Choisis au moins une catégorie.';
    }
    return null;
  }, [on, categories.length]);

  const buildPayload = (forceOn = on) => {
    let nextCats = categories;
    if (forceOn && nextCats.length === 0) {
      nextCats = [...ALL_CATEGORIES];
      setCategories(nextCats);
    }
    const excl = exclusions
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      dispoSoir: forceOn,
      dispoCategories: nextCats,
      dispoCategoryDetail:
        forceOn && nextCats.includes('autre')
          ? categoryDetail.trim() || null
          : null,
      dispoSlot: forceOn ? slot : null,
      dispoNeighborhood: forceOn ? quartier : null,
      dispoBudgetMax: forceOn ? budgetMax : null,
      dispoTopic: forceOn ? topic.trim() || null : null,
      dispoExclusions: forceOn ? (excl.length ? excl : null) : null,
      dispoExpiresAt: forceOn
        ? nextLocalMidnight().toISOString()
        : null,
    };
  };

  const onSave = () => {
    if (on && !quartier.trim()) {
      Alert.alert('Quartier requis', 'Indique le quartier pour ce soir.');
      return;
    }
    if (on && categories.includes('autre') && !categoryDetail.trim()) {
      Alert.alert(
        'Précise la catégorie',
        'Quand tu coches Autre, indique ce que tu as en tête (ex. bowling…).',
      );
      return;
    }
    setDispoProfile(buildPayload());
    Alert.alert(
      on ? 'Tu es dispo ce soir' : 'Dispo désactivée',
      on
        ? `Visible jusqu’à minuit · ${dispoSlotLabel(slot)} · ${quartier}. Expire aussi à la confirmation d’une sortie.`
        : 'Tu n’es plus signalé comme dispo.',
    );
    navigation.goBack();
  };

  const onCreateAnnonce = () => {
    if (!quartier.trim()) {
      Alert.alert('Quartier requis', 'Indique le quartier pour ce soir.');
      return;
    }
    if (categories.includes('autre') && !categoryDetail.trim()) {
      Alert.alert(
        'Précise la catégorie',
        'Quand tu coches Autre, indique ce que tu as en tête (ex. bowling…).',
      );
      return;
    }
    // Tap 1: persist prefs + go Create prefilled (tap 2 = publier).
    setOn(true);
    const payload = buildPayload(true);
    setDispoProfile(payload);
    const primaryCat = (
      payload.dispoCategories.includes('autre')
        ? 'autre'
        : (payload.dispoCategories[0] ?? 'restaurant')
    ) as OutingCategory;
    navigation.navigate('MainTabs', {
      screen: 'Create',
      params: {
        fromDispo: true,
        category: primaryCat,
        categoryDetail:
          primaryCat === 'autre' ? categoryDetail.trim() : undefined,
        neighborhood: quartier,
        budgetMaxEuros: budgetMax,
        topic: topic.trim() || undefined,
        excludedTopics: exclusions.trim() || undefined,
        timeLabel: slot === 'flexible' ? '19:30' : slot,
        flexibleSlot: slot === 'flexible',
      },
    });
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.wrap}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Dispo ce soir</Text>
      <Text style={styles.body}>
        Signale ta disponibilité pour une sortie improvisée ce soir
        (créneau, catégorie, quartier, budget). Pas un fil social — juste
        pour se retrouver IRL. Expire à minuit ou à la confirmation.
      </Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Je suis dispo ce soir</Text>
            <Text style={styles.hint}>
              {on
                ? 'Visible dans Dispo ce soir · expire à minuit'
                : 'Masqué pour l’instant'}
            </Text>
          </View>
          <Switch
            value={on}
            onValueChange={setOn}
            trackColor={{ true: colors.primarySoft, false: colors.border }}
            thumbColor={on ? colors.primary : colors.surface}
          />
        </View>
      </View>

      <Text style={styles.section}>Créneau *</Text>
      <Text style={styles.sectionHint}>À partir de quelle heure ?</Text>
      <View style={styles.chips}>
        {DISPO_SLOT_OPTIONS.map((s) => {
          const selected = slot === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => setSlot(s.id)}
              style={[styles.chip, selected && styles.chipOn]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.section}>Catégorie *</Text>
      <Text style={styles.sectionHint}>
        Restaurant, bar, culture… au moins une si tu actives la dispo.
      </Text>
      <View style={styles.chips}>
        {ALL_CATEGORIES.map((id) => {
          const selected = categories.includes(id);
          return (
            <Pressable
              key={id}
              onPress={() => toggleCategory(id)}
              style={[styles.chip, selected && styles.chipOn]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                {categoryLabels[id]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text style={styles.error}>{hint}</Text> : null}
      {categories.includes('autre') ? (
        <>
          <Text style={styles.sectionHint}>Précise *</Text>
          <TextInput
            style={styles.input}
            value={categoryDetail}
            onChangeText={setCategoryDetail}
            placeholder="Ex. bowling, pique-nique…"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            accessibilityLabel="Précise la catégorie Autre"
          />
        </>
      ) : null}

      <Text style={styles.section}>Quartier *</Text>
      <Text style={styles.sectionHint}>
        Choisis une suggestion ou écris n’importe quel quartier.
      </Text>
      <TextInput
        style={styles.input}
        value={quartier}
        onChangeText={(t) => {
          setQuartier(t);
          setShowQuartiers(true);
        }}
        onFocus={() => setShowQuartiers(true)}
        placeholder="Écris ton quartier…"
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
      />
      {showQuartiers ? (
        <View style={styles.quartierList}>
          {PARIS_NEIGHBORHOODS.filter((q) =>
            q.toLowerCase().includes(quartier.trim().toLowerCase()),
          ).map((q) => (
            <Pressable
              key={q}
              onPress={() => {
                setQuartier(q);
                setShowQuartiers(false);
              }}
              style={[
                styles.quartierItem,
                q === quartier && styles.quartierItemOn,
              ]}
            >
              <Text
                style={[
                  styles.quartierText,
                  q === quartier && styles.quartierTextOn,
                ]}
              >
                {q}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Text style={styles.section}>Budget max *</Text>
      <Text style={styles.sectionHint}>
        Ce que tu es prêt à mettre pour une sortie ce soir.
      </Text>
      <View style={styles.chips}>
        {BUDGET_PRESETS.map((b) => {
          const selected = budgetMax === b;
          return (
            <Pressable
              key={b}
              onPress={() => setBudgetMax(b)}
              style={[styles.chip, selected && styles.chipOn]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                ≤ {b} €
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.sectionHint}>Autre budget max</Text>
      <TextInput
        style={styles.input}
        value={
          (BUDGET_PRESETS as readonly number[]).includes(budgetMax)
            ? ''
            : String(budgetMax)
        }
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, '');
          if (digits === '') return;
          const n = parseInt(digits, 10);
          if (!Number.isNaN(n)) setBudgetMax(n);
        }}
        placeholder="Ex. 30"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        maxLength={4}
        selectTextOnFocus
      />

      <Text style={styles.section}>Sujet (optionnel)</Text>
      <TextInput
        style={styles.input}
        value={topic}
        onChangeText={setTopic}
        placeholder="Ex. vin nature, expos, afterwork…"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.section}>Exclusions (optionnel)</Text>
      <Text style={styles.sectionHint}>Séparées par des virgules.</Text>
      <TextInput
        style={styles.input}
        value={exclusions}
        onChangeText={setExclusions}
        placeholder="Ex. politique, travail…"
        placeholderTextColor={colors.textMuted}
      />

      <Button title="Enregistrer" onPress={onSave} style={styles.cta} />
      <Button
        title="Créer une annonce"
        variant="secondary"
        onPress={onCreateAnnonce}
        style={styles.ctaSecondary}
      />
      <Text style={styles.footerHint}>
        Même règles qu’une sortie : 10 min pour confirmer, caution 20 €,
        adresse exacte après confirmation.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  wrap: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  title: { ...typography.title, color: colors.text, marginBottom: spacing.md },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { ...typography.bodyStrong, color: colors.text },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  section: {
    ...typography.subtitle,
    fontFamily: fonts.semiBold,
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  sectionHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    backgroundColor: colors.chip,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
  },
  chipTextOn: { color: colors.white },
  error: {
    ...typography.caption,
    color: colors.warning,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  quartierList: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 220,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  quartierItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  quartierItemOn: { backgroundColor: colors.primarySoft },
  quartierText: { ...typography.body, color: colors.text },
  quartierTextOn: { color: colors.primaryDark, fontFamily: fonts.semiBold },
  cta: { marginTop: spacing.xxl },
  ctaSecondary: { marginTop: spacing.md },
  footerHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
