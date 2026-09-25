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
  budgetChipLabel,
} from '../data/mockOutings';
import { PARIS_NEIGHBORHOODS } from '../data/neighborhoods';
import { OutingCategory } from '../data/types';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import {
  isStartsAtPast,
  parisWallToUtc,
  parisYmd,
} from '../utils/parisTime';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type CreateRoute = RouteProp<MainTabParamList, 'Create'>;

const categories: { id: OutingCategory; label: string }[] = [
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'bar', label: 'Bar' },
  { id: 'culture', label: 'Culture' },
  { id: 'autre', label: 'Autre' },
];

const BUDGET_PRESETS = [15, 25, 40] as const;

/** Prefill exact — urgent « déjà sur place » (≠ no-show / lapin Chance). */
const URGENT_ON_SITE_MESSAGE =
  'Une place est libre, mon ami ne vient plus.';
function clampCreateBudget(n: number): number {
  return Math.min(
    BUDGET_MAX_EUROS,
    Math.max(BUDGET_MIN_EUROS, Math.round(n)),
  );
}

/** Preset chips / initial default — OK to auto-switch to Gratuit on Autre. */
function isPresetDefaultBudget(euros: number): boolean {
  const n = Math.round(euros);
  return (BUDGET_PRESETS as readonly number[]).includes(n);
}

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
  const ymd = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  const utc = parisWallToUtc(ymd, time.h, time.m);
  if (!Number.isFinite(utc.getTime())) return null;
  return utc;
}

/** True if the typed date alone is before today's Paris calendar day. */
function isDateStrBeforeParisToday(dateStr: string): boolean {
  const date = parseDateInput(dateStr);
  if (!date) return false;
  const ymd = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  const today = parisYmd(Date.now());
  return !!today && ymd < today;
}

function defaultDateTime(
  fromDispo: boolean,
  timeLabel?: string,
  dateOffsetDays?: number,
): {
  dateStr: string;
  timeStr: string;
} {
  const base = new Date();
  if (typeof dateOffsetDays === 'number' && dateOffsetDays >= 0) {
    base.setDate(base.getDate() + dateOffsetDays);
  } else if (!fromDispo) {
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

  const initial = defaultDateTime(
    !!prefill?.fromDispo,
    prefill?.timeLabel,
    prefill?.dateOffsetDays,
  );

  const [category, setCategory] = useState<OutingCategory>(
    prefill?.category ?? 'restaurant',
  );
  const [categoryDetail, setCategoryDetail] = useState(() => {
    if (prefill?.categoryDetail) return prefill.categoryDetail;
    if (prefill?.category === 'autre') {
      return state.currentUser?.dispoCategoryDetail ?? '';
    }
    return '';
  });
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
    // Host invitation ceiling — never from guest Dispo budget.
    prefill?.budgetMaxEuros ?? 25,
  );
  const [message, setMessage] = useState('');
  const [topic, setTopic] = useState(prefill?.topic ?? '');
  const [excludedTopics, setExcludedTopics] = useState(
    prefill?.excludedTopics ?? '',
  );
  const [flexibleSlot, setFlexibleSlot] = useState(!!prefill?.flexibleSlot);
  const [inviteIncludes, setInviteIncludes] = useState('');
  const [inviteExtras, setInviteExtras] = useState('');
  const [ticketsAlreadyBought, setTicketsAlreadyBought] = useState(false);
  const [fromDispoBanner, setFromDispoBanner] = useState(!!prefill?.fromDispo);
  const [inviteeUserId, setInviteeUserId] = useState(prefill?.inviteeUserId);
  const [inviteeName, setInviteeName] = useState(prefill?.inviteeName);
  const [urgentMode, setUrgentMode] = useState(!!prefill?.urgentOnSite);

  useEffect(() => {
    if (prefill?.urgentOnSite) {
      setUrgentMode(true);
      setMessage((prev) => (prev.trim() ? prev : URGENT_ON_SITE_MESSAGE));
      setCapacity(1);
      // Autre allows Gratuit chip — venue-agnostic short form.
      setCategory((c) => (c === 'restaurant' || c === 'bar' || c === 'culture' || c === 'autre' ? 'autre' : c));
      setCategoryDetail((d) => d.trim() || 'Sur place');
    }
  }, [prefill?.urgentOnSite]);

  useEffect(() => {
    if (!prefill?.fromDispo) return;
    if (prefill.category) setCategory(prefill.category);
    if (prefill.categoryDetail != null) setCategoryDetail(prefill.categoryDetail);
    if (prefill.neighborhood) setNeighborhood(prefill.neighborhood);
    // Do not prefill J'invite jusqu'à from Dispo guest budget.
    if (prefill.topic != null) setTopic(prefill.topic);
    if (prefill.excludedTopics != null) setExcludedTopics(prefill.excludedTopics);
    if (prefill.flexibleSlot != null) setFlexibleSlot(!!prefill.flexibleSlot);
    // Keep THAT recipient when starting from a profile / Dispo card.
    if (prefill.inviteeUserId) setInviteeUserId(prefill.inviteeUserId);
    if (prefill.inviteeName) setInviteeName(prefill.inviteeName);
    const next = defaultDateTime(true, prefill.timeLabel, prefill.dateOffsetDays);
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

  const enterUrgentMode = () => {
    setUrgentMode(true);
    setMessage(URGENT_ON_SITE_MESSAGE);
    setCapacity(1);
    setCategory('autre');
    setCategoryDetail('Sur place');
  };

  const exitUrgentMode = () => {
    setUrgentMode(false);
  };

  const onPublishUrgent = () => {
    if (!venueName.trim() || !neighborhood.trim()) {
      Alert.alert('Champs requis', 'Indique le lieu et le quartier.');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Message', 'Ajoute un court message pour les invités.');
      return;
    }
    const result = createOuting({
      title: `${venueName.trim()} · Maintenant`,
      description: message.trim(),
      category: 'autre',
      categoryDetail: categoryDetail.trim() || 'Sur place',
      neighborhood,
      venueName,
      approxArea: neighborhood,
      exactAddress:
        exactAddress.trim() ||
        `${venueName.trim()}, ${neighborhood.trim()}, Paris`,
      startsAt: new Date().toISOString(),
      capacity: 1,
      womenOnly: womenOnly && canWomenOnly,
      budgetMaxEuros: Math.round(budgetMaxEuros),
      urgentOnSite: true,
    });
    if (!result.ok) {
      const messages: Record<string, string> = {
        already_active:
          'Tu as déjà une annonce active (ouverte, ou à venir avec des confirmés). Attends la fin ou termine-la avant d’en publier une autre.',
        banned: 'Compte suspendu après 2 no-shows hôte (démo).',
        no_user: 'Profil manquant.',
        starts_in_past: 'Impossible de publier (créneau).',
      };
      Alert.alert('Impossible', messages[result.reason] ?? result.reason);
      return;
    }
    Alert.alert(
      'Annonce urgente publiée',
      'Visible ~30 min sur Annonces avec le badge « Maintenant ». Même demandes / caution / confirm 10 min. Le chat s’ouvre dès confirmation.',
    );
    setVenueName('');
    setExactAddress('');
    setMessage(URGENT_ON_SITE_MESSAGE);
    setBudgetMaxEuros(25);
    setUrgentMode(false);
    navigation.navigate('OutingDetail', { outingId: result.outingId });
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

    if (
      (category === 'restaurant' || category === 'bar') &&
      budgetMaxEuros === 0
    ) {
      Alert.alert(
        'Budget',
        'Pour un bar ou un restaurant, indique un montant (pas Gratuit).',
      );
      return;
    }
    if (category === 'autre' && !categoryDetail.trim()) {
      Alert.alert(
        'Précise la sortie',
        'Quand tu choisis Autre, indique ce que tu proposes (ex. balade, café, atelier…).',
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
    if (isStartsAtPast(when.toISOString()) || isDateStrBeforeParisToday(dateStr)) {
      Alert.alert(
        'Date / heure passée',
        'Choisis un créneau dans le futur (heure de Paris).',
      );
      return;
    }

    if (
      inviteeUserId &&
      state.currentUser &&
      inviteeUserId === state.currentUser.id
    ) {
      Alert.alert(
        'Pas de proposition à soi-même',
        'Choisis quelqu’un d’autre dans Dispo.',
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
      categoryDetail:
        category === 'autre' ? categoryDetail.trim() : undefined,
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
      inviteIncludes: inviteIncludes.trim() || undefined,
      inviteExtras: inviteExtras.trim() || undefined,
      ticketsAlreadyBought:
        category === 'culture' ? ticketsAlreadyBought : undefined,
    });

    if (!result.ok) {
      const messages: Record<string, string> = {
        already_active:
          'Tu as déjà une annonce active (ouverte, ou à venir avec des confirmés). Attends la fin ou termine-la avant d’en publier une autre.',
        banned: 'Compte suspendu après 2 no-shows hôte (démo).',
        no_user: 'Profil manquant.',
        starts_in_past:
          'Ce créneau est déjà passé. Choisis une date et une heure dans le futur.',
      };
      Alert.alert('Impossible', messages[result.reason] ?? result.reason);
      return;
    }

    Alert.alert(
      'Annonce publiée',
      'Publication gratuite. L’adresse exacte reste cachée jusqu’à confirmation. (Démo : 5 taps sur Chance → Simuler demande Juliette.)',
    );
    setVenueName('');
    setMessage('');
    setTopic('');
    setExcludedTopics('');
    setFlexibleSlot(false);
    setInviteIncludes('');
    setInviteExtras('');
    setTicketsAlreadyBought(false);
    setCapacity(1);
    setBudgetMaxEuros(25);
    setCategoryDetail('');
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
            Une seule annonce active à la fois
            {active.status === 'closed'
              ? ' — tu as encore des confirmés sur une sortie à venir (même clôturée).'
              : '. Clôture-la pour en ouvrir une autre.'}
          </Text>
          <View style={styles.activeCard}>
            <Text style={styles.activeName}>{active.title}</Text>
            <Text style={styles.activeMeta}>
              {active.neighborhood} · {budgetChipLabel(active.budgetMaxEuros)}
              {active.status === 'closed' ? ' · inscriptions closes' : ''}
            </Text>
          </View>
          <Button
            title="Voir la sortie"
            variant="secondary"
            onPress={() =>
              navigation.navigate('OutingDetail', { outingId: active.id })
            }
          />
          {active.status === 'open' || active.status === 'full' ? (
            <Button
              title="Clôturer les inscriptions"
              variant="danger"
              onPress={() => {
                closeOuting(active.id);
                Alert.alert(
                  'Inscriptions closes',
                  'Les confirmés gardent leur place — le créneau reste actif jusqu’à la fin de la sortie.',
                );
              }}
              style={{ marginTop: spacing.md }}
            />
          ) : (
            <Text style={[styles.activeMeta, { marginTop: spacing.md }]}>
              Attends la fin de la sortie (ou marque-la terminée après l’heure)
              pour libérer ton créneau d’annonce.
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (urgentMode) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Je suis déjà sur place</Text>
          <Text style={styles.sub}>
            Une place libre maintenant · visible ~30 min · 1 place · chat dès
            confirmation
          </Text>
          <View style={styles.urgentBanner}>
            <Text style={styles.urgentBannerTitle}>Invitation urgente</Text>
            <Text style={styles.urgentBannerBody}>
              Tu es déjà au lieu et une place s’est libérée. Ce n’est pas un
              signal d’absence d’un invité Chance.
            </Text>
            <Pressable onPress={exitUrgentMode} hitSlop={8}>
              <Text style={styles.urgentBannerLink}>
                Publier une sortie classique →
              </Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Lieu *</Text>
          <TextInput
            style={styles.input}
            value={venueName}
            onChangeText={setVenueName}
            placeholder="Nom du bar / resto / lieu"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Quartier *</Text>
          <Pressable
            style={styles.input}
            onPress={() => setShowQuartiers((v) => !v)}
          >
            <Text style={{ color: colors.text }}>{neighborhood}</Text>
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
                  style={styles.quartierItem}
                >
                  <Text
                    style={{
                      color:
                        q === neighborhood ? colors.primary : colors.text,
                      fontFamily:
                        q === neighborhood ? fonts.semiBold : fonts.regular,
                    }}
                  >
                    {q}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Text style={styles.label}>Heure</Text>
          <View style={styles.nowPill}>
            <Text style={styles.nowPillText}>Maintenant</Text>
          </View>
          <Text style={styles.privacyHint}>
            Pas de choix d’horaire — l’annonce reste joinable environ 30 min.
          </Text>

          <Text style={styles.label}>Places</Text>
          <Text style={styles.privacyHint}>1 place (fixe)</Text>

          <Text style={styles.label}>J'invite jusqu'à *</Text>
          <Text style={styles.inviteHint}>
            Plafond par invité, réglé sur place au lieu (pas via l'app).
          </Text>
          <View style={styles.row}>
            <Button
              title="Gratuit"
              variant={budgetMaxEuros === 0 ? 'primary' : 'ghost'}
              onPress={() => setBudgetMaxEuros(0)}
              style={styles.chip}
            />
            {BUDGET_PRESETS.map((b) => (
              <Button
                key={b}
                title={`${b} €`}
                variant={Math.round(budgetMaxEuros) === b ? 'primary' : 'ghost'}
                onPress={() => setBudgetMaxEuros(b)}
                style={styles.chip}
              />
            ))}
          </View>
          <View
            style={[
              styles.budgetCard,
              budgetMaxEuros === 0 && styles.budgetCardDisabled,
            ]}
            pointerEvents={budgetMaxEuros === 0 ? 'none' : 'auto'}
          >
            {budgetMaxEuros === 0 ? (
              <Text style={styles.budgetFreeHint}>
                Sortie gratuite — invitation sans plafond €
              </Text>
            ) : (
              <>
                <View style={styles.budgetMontantRow}>
                  <Text style={styles.budgetMontantLabel}>Montant libre</Text>
                  <TextInput
                    style={styles.budgetMontantInput}
                    value={String(Math.round(budgetMaxEuros))}
                    onChangeText={(t) => {
                      const digits = t.replace(/\D/g, '');
                      if (digits === '') return;
                      const n = parseInt(digits, 10);
                      if (!Number.isNaN(n)) {
                        setBudgetMaxEuros(clampCreateBudget(n));
                      }
                    }}
                    keyboardType="number-pad"
                    maxLength={2}
                    selectTextOnFocus
                  />
                  <Text style={styles.budgetMontantSuffix}>€</Text>
                </View>
                <Slider
                  style={styles.slider}
                  minimumValue={BUDGET_MIN_EUROS}
                  maximumValue={BUDGET_MAX_EUROS}
                  step={1}
                  value={Math.max(BUDGET_MIN_EUROS, budgetMaxEuros)}
                  onValueChange={(v) => setBudgetMaxEuros(clampCreateBudget(v))}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.primary}
                />
              </>
            )}
          </View>

          <Text style={styles.label}>Message *</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={message}
            onChangeText={setMessage}
            placeholder={URGENT_ON_SITE_MESSAGE}
            placeholderTextColor={colors.textMuted}
            multiline
          />

          <Button
            title="Publier maintenant"
            onPress={onPublishUrgent}
            style={styles.cta}
          />
        </ScrollView>
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
          Publication gratuite · 1 annonce active · adresse exacte après
          confirmation
        </Text>
        {fromDispoBanner ? (
          <View style={styles.dispoBanner}>
            <Text style={styles.dispoBannerTitle}>
              {inviteeName
                ? `Proposition pour ${inviteeName}`
                : 'Depuis Dispo'}
            </Text>
            <Text style={styles.dispoBannerBody}>
              {inviteeName
                ? `Destinataire conservé : ${inviteeName}. Prérempli depuis sa dispo — tu lui proposes cette sortie.`
                : 'Catégorie, créneau et quartier sont préremplis. Ajoute le lieu, ton plafond d’invitation et un message, puis publie.'}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={enterUrgentMode}
          style={styles.urgentEntry}
          accessibilityRole="button"
          accessibilityLabel="Je suis déjà sur place"
        >
          <Text style={styles.urgentEntryTitle}>Je suis déjà sur place</Text>
          <Text style={styles.urgentEntryBody}>
            Place libre tout de suite — annonce urgente ~30 min
          </Text>
        </Pressable>

        <Text style={styles.label}>Catégorie *</Text>
        <View style={styles.row}>
          {categories.map((c) => (
            <Button
              key={c.id}
              title={c.label}
              variant={category === c.id ? 'primary' : 'ghost'}
              onPress={() => {
                setCategory(c.id);
                if (c.id === 'autre' && isPresetDefaultBudget(budgetMaxEuros)) {
                  setBudgetMaxEuros(0);
                } else if (
                  (c.id === 'restaurant' || c.id === 'bar') &&
                  budgetMaxEuros === 0
                ) {
                  setBudgetMaxEuros(BUDGET_PRESETS[1]);
                }
              }}
              style={styles.chip}
            />
          ))}
        </View>
        {category === 'autre' ? (
          <>
            <Text style={styles.label}>Précise la sortie</Text>
            <TextInput
              style={styles.input}
              value={categoryDetail}
              onChangeText={setCategoryDetail}
              placeholder="Ex. balade, promenade de chien, café, atelier…"
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              accessibilityLabel="Précise la sortie"
            />
          </>
        ) : null}

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

        <Text style={styles.label}>J'invite jusqu'à *</Text>
        <Text style={styles.inviteHint}>
          Plafond par invité, réglé sur place au lieu (pas via l'app). Au-delà =
          hors invitation. Pas de transfert entre personnes.
        </Text>
        <View style={styles.row}>
          {category === 'autre' || category === 'culture' ? (
            <Button
              title="Gratuit"
              variant={budgetMaxEuros === 0 ? 'primary' : 'ghost'}
              onPress={() => setBudgetMaxEuros(0)}
              style={styles.chip}
            />
          ) : null}
          {BUDGET_PRESETS.map((b) => (
            <Button
              key={b}
              title={`${b} €`}
              variant={Math.round(budgetMaxEuros) === b ? 'primary' : 'ghost'}
              onPress={() => setBudgetMaxEuros(b)}
              style={styles.chip}
            />
          ))}
        </View>
        <View
          style={[
            styles.budgetCard,
            budgetMaxEuros === 0 && styles.budgetCardDisabled,
          ]}
          pointerEvents={budgetMaxEuros === 0 ? 'none' : 'auto'}
        >
          {budgetMaxEuros === 0 ? (
            <Text style={styles.budgetFreeHint}>
              Sortie gratuite — invitation sans plafond €
            </Text>
          ) : (
            <>
              <View style={styles.budgetMontantRow}>
                <Text style={styles.budgetMontantLabel}>Montant libre</Text>
                <TextInput
                  style={styles.budgetMontantInput}
                  value={String(Math.round(budgetMaxEuros))}
                  onChangeText={(t) => {
                    const digits = t.replace(/\D/g, '');
                    if (digits === '') return;
                    const n = parseInt(digits, 10);
                    if (!Number.isNaN(n)) {
                      setBudgetMaxEuros(clampCreateBudget(n));
                    }
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                  accessibilityLabel="Montant budget en euros"
                />
                <Text style={styles.budgetMontantSuffix}>€</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={BUDGET_MIN_EUROS}
                maximumValue={BUDGET_MAX_EUROS}
                step={1}
                value={Math.max(BUDGET_MIN_EUROS, budgetMaxEuros)}
                onValueChange={(v) => setBudgetMaxEuros(clampCreateBudget(v))}
                minimumTrackTintColor={colors.primary}
                maximumTrackTintColor={colors.border}
                thumbTintColor={colors.primary}
              />
              <View style={styles.budgetEnds}>
                <Text style={styles.budgetHintEnd}>5 € · verre</Text>
                <Text style={styles.budgetHintEnd}>50 € · repas</Text>
              </View>
            </>
          )}
        </View>

        <Text style={styles.label}>Ce que j'offre (optionnel)</Text>
        <TextInput
          style={styles.input}
          value={inviteIncludes}
          onChangeText={setInviteIncludes}
          placeholder="Ex. plat + boisson, entrée spectacle…"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>Hors invitation (optionnel)</Text>
        <TextInput
          style={styles.input}
          value={inviteExtras}
          onChangeText={setInviteExtras}
          placeholder="Ex. dessert, 2e verre…"
          placeholderTextColor={colors.textMuted}
        />

        {category === 'culture' ? (
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Billets déjà achetés</Text>
              <Text style={styles.switchHint}>
                Tu as déjà les places / tickets pour tes invités
              </Text>
            </View>
            <Switch
              value={ticketsAlreadyBought}
              onValueChange={setTicketsAlreadyBought}
              trackColor={{ true: colors.primarySoft, false: colors.border }}
              thumbColor={
                ticketsAlreadyBought ? colors.primary : colors.surface
              }
            />
          </View>
        ) : null}

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

        <Text style={styles.publishFreeLabel}>Publication gratuite</Text>
        <Text style={styles.publishFreeHint}>
          L'hôte ne paie rien pour publier. L'invité paie les frais Chance +
          caution 20 € à la confirmation (ce n’est pas l’addition).
        </Text>
        <Button title="Publier" onPress={onPublish} style={styles.cta} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  urgentBanner: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  urgentBannerTitle: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
    marginBottom: 4,
  },
  urgentBannerBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  urgentBannerLink: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  urgentEntry: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  urgentEntryTitle: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
  },
  urgentEntryBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  nowPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginBottom: spacing.sm,
  },
  nowPillText: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
    fontFamily: fonts.semiBold,
  },
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
  inviteHint: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  publishFreeLabel: {
    ...typography.bodyStrong,
    color: colors.success,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  publishFreeHint: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
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
  budgetCardDisabled: {
    opacity: 0.55,
    backgroundColor: colors.surfaceMuted,
  },
  budgetFreeHint: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  budgetValue: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  budgetMontantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  budgetMontantLabel: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  budgetMontantInput: {
    minWidth: 56,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.bodyStrong,
    color: colors.text,
    textAlign: 'center',
  },
  budgetMontantSuffix: {
    ...typography.bodyStrong,
    color: colors.text,
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
