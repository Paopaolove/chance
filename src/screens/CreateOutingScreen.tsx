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

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

/** Local calendar day as JJ/MM/AAAA. */
function formatDateInput(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Local time as HH:mm. */
function formatTimeInput(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** French heure label for auto title (20h / 20h30). */
function formatHeureLabel(hours: number, minutes: number): string {
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${pad2(minutes)}`;
}

function parseDateInput(raw: string): { y: number; m: number; d: number } | null {
  const s = raw.trim();
  const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return null;
  }
  return { y: year, m: month, d: day };
}

function parseTimeInput(raw: string): { h: number; m: number } | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  let match = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (match) {
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) return null;
    return { h, m };
  }
  match = /^(\d{1,2})h(\d{2})?$/.exec(s);
  if (match) {
    const h = Number(match[1]);
    const m = match[2] ? Number(match[2]) : 0;
    if (h > 23 || m > 59) return null;
    return { h, m };
  }
  return null;
}

function buildStartsAt(dateStr: string, timeStr: string): Date | null {
  const date = parseDateInput(dateStr);
  const time = parseTimeInput(timeStr);
  if (!date || !time) return null;
  return new Date(date.y, date.m - 1, date.d, time.h, time.m, 0, 0);
}

function defaultDateTime(fromDispo: boolean, timeLabel?: string): {
  dateStr: string;
  timeStr: string;
} {
  const base = new Date();
  if (!fromDispo) {
    base.setDate(base.getDate() + 1);
  }
  base.setHours(20, 0, 0, 0);
  let timeStr = formatTimeInput(base);
  if (timeLabel) {
    const parsed = parseTimeInput(timeLabel);
    if (parsed) {
      timeStr = `${pad2(parsed.h)}:${pad2(parsed.m)}`;
    }
  }
  return { dateStr: formatDateInput(base), timeStr };
}

export function CreateOutingScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<CreateRoute>();
  const prefill = route.params;
  const { createOuting, getActiveOutingForUser, closeOuting, state } =
    useChance();
  const active = getActiveOutingForUser();

  const initial = defaultDateTime(!!prefill?.fromDispo, prefill?.timeLabel);

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
  const [exactAddress, setExactAddress] = useState('');
  const [dateStr, setDateStr] = useState(initial.dateStr);
  const [timeStr, setTimeStr] = useState(initial.timeStr);
  const [capacity, setCapacity] = useState<1 | 2 | 3>(1);
  const [budgetMaxEuros, setBudgetMaxEuros] = useState(
    prefill?.budgetMaxEuros ?? state.currentUser?.dispoBudgetMax ?? 25,
  );
  const [message, setMessage] = useState('');
  const [topic, setTopic] = useState(prefill?.topic ?? '');
  const [excludedTopics, setExcludedTopics] = useState(
    prefill?.excludedTopics ?? '',
  );
  const [flexibleSlot, setFlexibleSlot] = useState(!!prefill?.flexibleSlot);
  const [fromDispoBanner, setFromDispoBanner] = useState(!!prefill?.fromDispo);

  useEffect(() => {
    if (!prefill?.fromDispo) return;
    if (prefill.category) setCategory(prefill.category);
    if (prefill.neighborhood) setNeighborhood(prefill.neighborhood);
    if (prefill.budgetMaxEuros != null) setBudgetMaxEuros(prefill.budgetMaxEuros);
    if (prefill.topic != null) setTopic(prefill.topic);
    if (prefill.excludedTopics != null) setExcludedTopics(prefill.excludedTopics);
    if (prefill.flexibleSlot != null) setFlexibleSlot(!!prefill.flexibleSlot);
    const next = defaultDateTime(true, prefill.timeLabel);
    setDateStr(next.dateStr);
    setTimeStr(next.timeStr);
    setFromDispoBanner(true);
  }, [prefill]);

  const canWomenOnly = state.currentUser?.gender === 'femme';
  const [womenOnly, setWomenOnly] = useState(
    !!state.currentUser?.womenOnlyPreference &&
      state.currentUser?.gender === 'femme',
  );
  const [showQuartiers, setShowQuartiers] = useState(false);

  const startsAtDate = useMemo(
    () => buildStartsAt(dateStr, timeStr),
    [dateStr, timeStr],
  );

  const autoTitle = useMemo(() => {
    const lieu = venueName.trim() || 'Lieu';
    const parsed = parseTimeInput(timeStr);
    const heure = parsed
      ? formatHeureLabel(parsed.h, parsed.m)
      : timeStr.trim() || '…';
    return `${lieu} · ${heure}`;
  }, [venueName, timeStr]);

  const applyShortcut = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(20, 0, 0, 0);
    setDateStr(formatDateInput(d));
    setTimeStr('20:00');
  };

  const onPublish = () => {
    if (
      !venueName.trim() ||
      !exactAddress.trim() ||
      !neighborhood.trim() ||
      !message.trim()
    ) {
      Alert.alert(
        'Manque un peu',
        'Catégorie, lieu, adresse exacte, quartier, date/heure, places, budget et message sont requis.',
      );
      return;
    }

    const when = buildStartsAt(dateStr, timeStr);
    if (!when) {
      Alert.alert(
        'Date / heure',
        'Indique une date (JJ/MM/AAAA) et une heure (HH:mm) valides.',
      );
      return;
    }

    const parsedTime = parseTimeInput(timeStr)!;
    const title = `${venueName.trim()} · ${formatHeureLabel(
      parsedTime.h,
      parsedTime.m,
    )}`;

    const result = createOuting({
      title,
      description: message.trim(),
      category,
      neighborhood,
      venueName,
      approxArea: neighborhood,
      // Exact address never shown before confirmation — host types it freely.
      exactAddress:
        exactAddress.trim() ||
        `${venueName.trim()}, ${neighborhood.trim()}, Paris`,
      startsAt: when.toISOString(),
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
      const messages: Record<string, string> = {
        already_active:
          'Tu as déjà une sortie en cours. Clôture-la pour en ouvrir une autre.',
        banned: 'Compte suspendu après 2 no-shows hôte (démo).',
        no_user: 'Profil manquant.',
      };
      Alert.alert('Impossible', messages[result.reason] ?? result.reason);
      return;
    }

    Alert.alert(
      'Annonce publiée',
      'Gratuit pour l’hôte. L’adresse exacte reste cachée jusqu’à confirmation. (Démo : 5 taps sur Chance → Simuler demande Juliette.)',
    );
    setVenueName('');
    setMessage('');
    setTopic('');
    setExcludedTopics('');
    setFlexibleSlot(false);
    setCapacity(1);
    setBudgetMaxEuros(25);
    const next = defaultDateTime(false);
    setDateStr(next.dateStr);
    setTimeStr(next.timeStr);
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

        <Text style={styles.label}>Lieu *</Text>
        <TextInput
          style={styles.input}
          value={venueName}
          onChangeText={setVenueName}
          placeholder="Nom du bar / resto / lieu"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Adresse exacte *</Text>
        <TextInput
          style={styles.input}
          value={exactAddress}
          onChangeText={setExactAddress}
          placeholder="Ex. 12 rue de Rivoli, 75004 Paris"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
        />
        <Text style={styles.privacyHint}>
          Adresse visible seulement après confirmation — avant, seul le
          quartier / nom du lieu est affiché.
        </Text>

        <Text style={styles.label}>Quartier *</Text>
        <TextInput
          style={styles.input}
          value={neighborhood}
          onChangeText={(t) => {
            setNeighborhood(t);
            setShowQuartiers(true);
          }}
          onFocus={() => setShowQuartiers(true)}
          placeholder="Quartier (ex. Le Marais)"
          placeholderTextColor={colors.textMuted}
        />
        {showQuartiers ? (
          <View style={styles.quartierList}>
            {PARIS_NEIGHBORHOODS.filter((q) =>
              q.toLowerCase().includes(neighborhood.trim().toLowerCase()),
            ).map((q) => (
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

        <Text style={styles.label}>Date *</Text>
        <TextInput
          style={styles.input}
          value={dateStr}
          onChangeText={setDateStr}
          placeholder="JJ/MM/AAAA"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Heure *</Text>
        <TextInput
          style={styles.input}
          value={timeStr}
          onChangeText={setTimeStr}
          placeholder="HH:mm (ex. 20:00 ou 20h30)"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={[styles.row, { marginTop: spacing.sm }]}>
          <Button
            title="Ce soir 20h"
            variant="ghost"
            onPress={() => applyShortcut(0)}
            style={styles.chip}
          />
          <Button
            title="Demain 20h"
            variant="ghost"
            onPress={() => applyShortcut(1)}
            style={styles.chip}
          />
        </View>
        {!startsAtDate ? (
          <Text style={styles.fieldError}>
            Date ou heure invalide — format JJ/MM/AAAA et HH:mm.
          </Text>
        ) : null}

        <Text style={styles.autoTitleHint}>Titre auto : {autoTitle}</Text>

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
  fieldError: {
    ...typography.small,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  autoTitleHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
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
