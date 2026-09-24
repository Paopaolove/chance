import Slider from '@react-native-community/slider';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { useChance } from '../data/ChanceContext';
import {
  BUDGET_MAX_EUROS,
  BUDGET_MIN_EUROS,
} from '../data/mockOutings';
import { PARIS_NEIGHBORHOODS } from '../data/neighborhoods';
import { OutingCategory } from '../data/types';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type CreateRoute = RouteProp<MainTabParamList, 'Create'>;

const categories: { id: OutingCategory; label: string }[] = [
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'bar', label: 'Bar' },
  { id: 'culture', label: 'Culture' },
  { id: 'autre', label: 'Autre' },
];

/** Core seats 1–3 (brief). */
const capacities: Array<1 | 2 | 3> = [1, 2, 3];

const DAY_OPTIONS = [
  { id: 0, label: 'Ce soir' },
  { id: 1, label: 'Demain' },
  { id: 2, label: 'Après-demain' },
  { id: 3, label: '+3 j' },
] as const;

const TIME_OPTIONS = [
  { h: 18, m: 0, label: '18:00' },
  { h: 19, m: 0, label: '19:00' },
  { h: 19, m: 30, label: '19:30' },
  { h: 20, m: 0, label: '20:00' },
  { h: 21, m: 0, label: '21:00' },
] as const;

export function CreateOutingScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<CreateRoute>();
  const prefill = route.params;
  const { createOuting, getActiveOutingForUser, closeOuting, state } =
    useChance();
  const active = getActiveOutingForUser();

  const initialTimeIdx = (() => {
    if (!prefill?.timeLabel) return 2;
    const idx = TIME_OPTIONS.findIndex((t) => t.label === prefill.timeLabel);
    return idx >= 0 ? idx : 2;
  })();

  const [category, setCategory] = useState<OutingCategory>(
    prefill?.category ?? 'restaurant',
  );
  const [neighborhood, setNeighborhood] = useState(
    prefill?.neighborhood ??
      state.currentUser?.dispoNeighborhood ??
      state.currentUser?.neighborhood ??
      'Le Marais',
  );
  const [venueName, setVenueName] = useState('');
  const [dayOffset, setDayOffset] = useState(prefill?.fromDispo ? 0 : 1);
  const [timeIdx, setTimeIdx] = useState(initialTimeIdx);
  const [capacity, setCapacity] = useState<1 | 2 | 3>(1);
  const [budgetMaxEuros, setBudgetMaxEuros] = useState(
    prefill?.budgetMaxEuros ?? state.currentUser?.dispoBudgetMax ?? 25,
  );
  const [message, setMessage] = useState('');
  const [topic, setTopic] = useState(prefill?.topic ?? '');
  const [excludedTopics, setExcludedTopics] = useState(
    prefill?.excludedTopics ?? '',
  );
  const [flexibleSlot, setFlexibleSlot] = useState(
    !!prefill?.flexibleSlot,
  );
  const [fromDispoBanner, setFromDispoBanner] = useState(!!prefill?.fromDispo);

  useEffect(() => {
    if (!prefill?.fromDispo) return;
    if (prefill.category) setCategory(prefill.category);
    if (prefill.neighborhood) setNeighborhood(prefill.neighborhood);
    if (prefill.budgetMaxEuros != null) setBudgetMaxEuros(prefill.budgetMaxEuros);
    if (prefill.topic != null) setTopic(prefill.topic);
    if (prefill.excludedTopics != null) setExcludedTopics(prefill.excludedTopics);
    if (prefill.flexibleSlot != null) setFlexibleSlot(!!prefill.flexibleSlot);
    setDayOffset(0);
    if (prefill.timeLabel) {
      const idx = TIME_OPTIONS.findIndex((t) => t.label === prefill.timeLabel);
      if (idx >= 0) setTimeIdx(idx);
    }
    setFromDispoBanner(true);
  }, [prefill]);
  const canWomenOnly = state.currentUser?.gender === 'femme';
  const [womenOnly, setWomenOnly] = useState(
    !!state.currentUser?.womenOnlyPreference &&
      state.currentUser?.gender === 'femme',
  );
  const [showQuartiers, setShowQuartiers] = useState(false);

  const startsAt = useMemo(() => {
    const t = TIME_OPTIONS[timeIdx] ?? TIME_OPTIONS[2];
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(t.h, t.m, 0, 0);
    return d.toISOString();
  }, [dayOffset, timeIdx]);

  const onPublish = () => {
    if (!venueName.trim() || !neighborhood.trim() || !message.trim()) {
      Alert.alert(
        'Manque un peu',
        'Catégorie, lieu + quartier, date/heure, places, budget et message sont requis.',
      );
      return;
    }

    const title =
      message.trim().length > 48
        ? `${message.trim().slice(0, 45)}…`
        : message.trim();

    const result = createOuting({
      title,
      description: message.trim(),
      category,
      neighborhood,
      venueName,
      approxArea: neighborhood,
      // Exact address never shown before confirmation — host can refine later.
      exactAddress: `${venueName.trim()}, ${neighborhood.trim()}, Paris`,
      startsAt,
      capacity,
      womenOnly: womenOnly && canWomenOnly,
      budgetMaxEuros: Math.round(budgetMaxEuros),
      topic: topic.trim() || undefined,
      excludedTopics: excludedTopics
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      flexibleSlot,
    });

    if (!result.ok) {
      Alert.alert(
        'Impossible',
        result.reason === 'already_active'
          ? 'Tu as déjà une sortie en cours. Clôture-la pour en ouvrir une autre.'
          : 'Profil manquant.',
      );
      return;
    }

    Alert.alert(
      'Annonce publiée',
      'Gratuit pour l’hôte. Une demande démo (Juliette) a été ajoutée dans Demandes. L’adresse exacte reste cachée jusqu’à confirmation.',
    );
    setVenueName('');
    setMessage('');
    setTopic('');
    setExcludedTopics('');
    setFlexibleSlot(false);
    setCapacity(1);
    setBudgetMaxEuros(25);
    setWomenOnly(
      !!state.currentUser?.womenOnlyPreference &&
        state.currentUser?.gender === 'femme',
    );
  };

  if (active) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Créer une annonce</Text>
        </View>
        <View style={styles.blocked}>
          <Text style={styles.blockedTitle}>
            Une seule annonce active à la fois. Clôture-la pour en ouvrir une
            autre.
          </Text>
          <View style={styles.activeCard}>
            <Text style={styles.activeName}>{active.title}</Text>
            <Text style={styles.activeMeta}>
              {active.neighborhood} · Budget max · {active.budgetMaxEuros} €
            </Text>
          </View>
          <Button
            title="Voir la sortie"
            variant="secondary"
            onPress={() =>
              navigation.navigate('OutingDetail', { outingId: active.id })
            }
          />
          <Button
            title="Clôturer"
            variant="danger"
            onPress={() => {
              closeOuting(active.id);
              Alert.alert('Clôturée', 'Tu peux publier une nouvelle sortie.');
            }}
            style={{ marginTop: spacing.md }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Créer une annonce</Text>
        <Text style={styles.sub}>
          Gratuit pour l’hôte · 1 annonce active · adresse exacte après
          confirmation
        </Text>
        {fromDispoBanner ? (
          <View style={styles.dispoBanner}>
            <Text style={styles.dispoBannerTitle}>Depuis Dispo ce soir</Text>
            <Text style={styles.dispoBannerBody}>
              Catégorie, créneau, quartier et budget sont préremplis. Ajoute le
              lieu + un message, puis publie (2e tap).
            </Text>
          </View>
        ) : null}

        <Text style={styles.label}>Catégorie *</Text>
        <View style={styles.row}>
          {categories.map((c) => (
            <Button
              key={c.id}
              title={c.label}
              variant={category === c.id ? 'primary' : 'ghost'}
              onPress={() => setCategory(c.id)}
              style={styles.chip}
            />
          ))}
        </View>

        <Text style={styles.label}>Lieu (nom) *</Text>
        <TextInput
          style={styles.input}
          value={venueName}
          onChangeText={setVenueName}
          placeholder="Nom du bar / resto / lieu"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Quartier *</Text>
        <Pressable
          onPress={() => setShowQuartiers((v) => !v)}
          style={styles.input}
        >
          <Text style={{ ...typography.body, color: colors.text }}>
            {neighborhood}
          </Text>
        </Pressable>
        {showQuartiers ? (
          <View style={styles.quartierList}>
            {PARIS_NEIGHBORHOODS.map((q) => (
              <Pressable
                key={q}
                onPress={() => {
                  setNeighborhood(q);
                  setShowQuartiers(false);
                }}
                style={[
                  styles.quartierItem,
                  q === neighborhood && styles.quartierItemOn,
                ]}
              >
                <Text
                  style={[
                    styles.quartierText,
                    q === neighborhood && styles.quartierTextOn,
                  ]}
                >
                  {q}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Text style={styles.privacyHint}>
          Avant confirmation, seul le quartier / nom du lieu est visible — pas
          l’adresse exacte.
        </Text>

        <Text style={styles.label}>Date *</Text>
        <View style={styles.row}>
          {DAY_OPTIONS.map((d) => (
            <Button
              key={d.id}
              title={d.label}
              variant={dayOffset === d.id ? 'primary' : 'ghost'}
              onPress={() => setDayOffset(d.id)}
              style={styles.chip}
            />
          ))}
        </View>

        <Text style={styles.label}>Heure *</Text>
        <View style={styles.row}>
          {TIME_OPTIONS.map((t, idx) => (
            <Button
              key={t.label}
              title={t.label}
              variant={timeIdx === idx ? 'primary' : 'ghost'}
              onPress={() => setTimeIdx(idx)}
              style={styles.chip}
            />
          ))}
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Créneau flexible (optionnel)</Text>
            <Text style={styles.switchHint}>
              Indique que l’horaire peut bouger un peu
            </Text>
          </View>
          <Switch
            value={flexibleSlot}
            onValueChange={setFlexibleSlot}
            trackColor={{ true: colors.primarySoft, false: colors.border }}
            thumbColor={flexibleSlot ? colors.primary : colors.surface}
          />
        </View>

        <Text style={styles.label}>Places (1–3) *</Text>
        <View style={styles.row}>
          {capacities.map((n) => (
            <Button
              key={n}
              title={String(n)}
              variant={capacity === n ? 'primary' : 'ghost'}
              onPress={() => setCapacity(n)}
              style={styles.capChip}
            />
          ))}
        </View>

        <Text style={styles.label}>Budget approx. *</Text>
        <View style={styles.budgetCard}>
          <Text style={styles.budgetValue}>{Math.round(budgetMaxEuros)} €</Text>
          <Slider
            style={styles.slider}
            minimumValue={BUDGET_MIN_EUROS}
            maximumValue={BUDGET_MAX_EUROS}
            step={1}
            value={budgetMaxEuros}
            onValueChange={setBudgetMaxEuros}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.primary}
          />
          <View style={styles.budgetEnds}>
            <Text style={styles.budgetHintEnd}>5 € · verre</Text>
            <Text style={styles.budgetHintEnd}>50 € · repas</Text>
          </View>
        </View>

        <Text style={styles.label}>Message *</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={message}
          onChangeText={setMessage}
          placeholder="Ambiance, envie, format… (visible sur l’annonce)"
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <Text style={styles.label}>Sujet (optionnel)</Text>
        <TextInput
          style={styles.input}
          value={topic}
          onChangeText={setTopic}
          placeholder="Ex. voyage, cuisine, cinéma…"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Sujets exclus (optionnel)</Text>
        <TextInput
          style={styles.input}
          value={excludedTopics}
          onChangeText={setExcludedTopics}
          placeholder="Séparés par des virgules"
          placeholderTextColor={colors.textMuted}
        />

        {canWomenOnly ? (
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Femmes uniquement</Text>
              <Text style={styles.switchHint}>
                Visible seulement pour les profils femme
              </Text>
            </View>
            <Switch
              value={womenOnly}
              onValueChange={setWomenOnly}
              trackColor={{ true: colors.primarySoft, false: colors.border }}
              thumbColor={womenOnly ? colors.primary : colors.surface}
            />
          </View>
        ) : null}

        <Button title="Publier (gratuit)" onPress={onPublish} style={styles.cta} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  dispoBanner: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  dispoBannerTitle: {
    ...typography.bodyStrong,
    color: colors.success,
    marginBottom: 4,
  },
  dispoBannerBody: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  title: { ...typography.title, color: colors.text },
  sub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
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
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  privacyHint: {
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: spacing.md },
  capChip: { minHeight: 44, minWidth: 52, paddingHorizontal: spacing.md },
  budgetCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  budgetValue: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  slider: { width: '100%', height: 40 },
  budgetEnds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  budgetHintEnd: { ...typography.small, color: colors.textMuted },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  switchLabel: { ...typography.bodyStrong, color: colors.text },
  switchHint: { ...typography.caption, color: colors.textMuted },
  cta: { marginTop: spacing.xxl },
  blocked: { padding: spacing.xl },
  blockedTitle: {
    ...typography.subtitle,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  activeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  activeName: { ...typography.bodyStrong, color: colors.text },
  activeMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  quartierList: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginTop: spacing.sm,
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
});
