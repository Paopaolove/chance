import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Slider from '@react-native-community/slider';
import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DemoMenuModal } from '../components/DemoMenuModal';
import { OutingCard } from '../components/OutingCard';
import { MomentsMap } from '../components/MomentsMap';
import { pinPartnerOutingsNearSoon } from '../utils/partners';
import { PersonCard } from '../components/PersonCard';
import { useChance } from '../data/ChanceContext';
import { categoryLabels } from '../data/mockOutings';
import { PARIS_NEIGHBORHOODS } from '../data/neighborhoods';
import { getTravelMinutes, isResolvableNeighborhood } from '../data/travelTime';
import { Outing, OutingCategory, User } from '../data/types';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { formatParisTime, parisYmd } from '../utils/parisTime';
import {
  computeDispoExpiresAt,
  dispoSlotCreatePrefill,
} from '../utils/dispo';
import { clampInt } from '../utils/parseLooseNumber';
import { PillsWithOther } from '../components/PillsWithOther';
import {
  formatYmdShort,
  freeDateHint,
  freeIntHint,
  parseFreeDate,
  parseFreeInt,
} from '../utils/freeDate';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type FilterId = 'all' | OutingCategory;
type FeedMode = 'sorties' | 'dispos';
type BudgetFilter = number | 'all';
type FilterPanel = 'quartier' | 'jour' | 'distance' | 'more' | null;

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'restaurant', label: categoryLabels.restaurant },
  { id: 'bar', label: categoryLabels.bar },
  { id: 'culture', label: categoryLabels.culture },
  { id: 'sport', label: categoryLabels.sport },
  { id: 'autre', label: categoryLabels.autre },
];

const BUDGET_FILTERS: { id: BudgetFilter; label: string }[] = [
  { id: 'all', label: 'Budget' },
  { id: 15, label: '≤ 15 €' },
  { id: 25, label: '≤ 25 €' },
  { id: 40, label: '≤ 40 €' },
];

const TRAVEL_SHORTCUTS = [15, 30, 45, 60] as const;
const TRAVEL_MIN_MINUTES = 5;
const TRAVEL_MAX_MINUTES = 90;
const TRAVEL_DEFAULT_MINUTES = 30;

const BUDGET_FREE_MIN = 5;
const BUDGET_FREE_MAX = 200;

type WhenDay = 'today' | 'tomorrow' | 'dayAfter' | 'other';

const WHEN_DAY_OPTIONS: { id: Exclude<WhenDay, 'other'>; label: string }[] = [
  { id: 'today', label: 'Aujourd’hui' },
  { id: 'tomorrow', label: 'Demain' },
  { id: 'dayAfter', label: 'Après-demain' },
];

/** Paris calendar Y-M-D for today / tomorrow / day-after (noon UTC anchors). */
function targetParisYmd(
  whenDay: WhenDay,
  nowMs = Date.now(),
  otherYmd?: string | null,
): string {
  const today = parisYmd(nowMs);
  if (!today) return '';
  if (whenDay === 'other') return otherYmd || today;
  if (whenDay === 'today') return today;
  const [y, m, day] = today.split('-').map(Number);
  const offset = whenDay === 'tomorrow' ? 1 : 2;
  const noonMs = Date.UTC(y, m - 1, day, 12, 0, 0) + offset * 24 * 60 * 60 * 1000;
  return parisYmd(noonMs);
}

/** Normalize « HH:MM » / « H:MM » for lexicographic compare. */
function normalizeHhMm(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})[:hH.](\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Outing matches Quand: same Paris calendar day as selected shortcut,
 * and startsAt time ≥ threshold (chosen time, or now if today+empty, or 00:00).
 * Urgent « Maintenant »: always match on « today » (startsAt ≈ now, time filter would hide it).
 */
function outingMatchesWhen(
  startsAt: string,
  whenDay: WhenDay,
  whenFromTime: string,
  nowMs = Date.now(),
  opts?: { urgentOnSite?: boolean; otherYmd?: string | null },
): boolean {
  const target = targetParisYmd(whenDay, nowMs, opts?.otherYmd);
  if (!target || parisYmd(startsAt) !== target) return false;
  const isToday = target === parisYmd(nowMs);

  if (opts?.urgentOnSite && isToday) return true;

  const outingHhMm = normalizeHhMm(formatParisTime(startsAt));
  if (!outingHhMm) return false;

  const free = normalizeHhMm(whenFromTime);
  let threshold: string;
  if (free) {
    threshold = free;
  } else if (isToday) {
    threshold = normalizeHhMm(formatParisTime(new Date(nowMs).toISOString())) ?? '00:00';
  } else {
    threshold = '00:00';
  }
  return outingHhMm >= threshold;
}

/** Champ libre catégorie (« Autre : padel, expo… ») — recherche souple. */
function normalizeFree(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function textMatchesFree(parts: (string | undefined | null)[], needle: string): boolean {
  if (!needle) return true;
  return normalizeFree(parts.filter(Boolean).join(' ')).includes(needle);
}

type OutingWithTravel = Outing & { travelMinutes: number; matchScore: number };

function dispoMatchScore(
  prefs: {
    categories?: OutingCategory[];
    neighborhood?: string;
    budgetMax?: number;
  },
  target: {
    category?: OutingCategory;
    categories?: OutingCategory[];
    neighborhood: string;
    budgetMax?: number;
  },
  travelMinutes: number,
): number {
  let score = 0;
  const cats = prefs.categories ?? [];
  if (cats.length) {
    if (target.category && cats.includes(target.category)) score += 40;
    if (target.categories?.some((c) => cats.includes(c))) score += 40;
  }
  if (
    prefs.neighborhood &&
    target.neighborhood &&
    prefs.neighborhood === target.neighborhood
  ) {
    score += 30;
  }
  if (
    prefs.budgetMax != null &&
    target.budgetMax != null &&
    target.budgetMax <= prefs.budgetMax
  ) {
    score += 20;
  }
  // Soft travel preference (closer = higher)
  score += Math.max(0, 20 - Math.floor(travelMinutes / 2));
  return score;
}

export function FeedScreen() {
  const navigation = useNavigation<Nav>();
  const { visibleOutings, peopleDispo, state, setDispoProfile } = useChance();
  const [demoMenuOpen, setDemoMenuOpen] = useState(false);
  const logoTaps = useRef(0);
  const logoTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLogoTap = () => {
    logoTaps.current += 1;
    if (logoTapTimer.current) clearTimeout(logoTapTimer.current);
    if (logoTaps.current >= 5) {
      logoTaps.current = 0;
      setDemoMenuOpen(true);
      return;
    }
    logoTapTimer.current = setTimeout(() => {
      logoTaps.current = 0;
    }, 1200);
  };
  const [mode, setMode] = useState<FeedMode>('sorties');
  /** Liste / Carte — Annonces seulement (pas de carte des personnes). */
  const [view, setView] = useState<'liste' | 'carte'>('liste');
  const [categoryFilter, setCategoryFilter] = useState<FilterId>('all');
  /** Catégorie « Autre » libre : précision (ex. padel, expo) combinée à la pastille. */
  const [categoryText, setCategoryText] = useState('');
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilter>('all');
  const [budgetOther, setBudgetOther] = useState('');
  const [quartierFilter, setQuartierFilter] = useState<string>('all');
  /** Annonces: prefer alignment with my Dispo prefs when toggled. */
  const [alignDispo, setAlignDispo] = useState(false);
  /** Un seul panneau ouvert à la fois sous la ligne de filtres. */
  const [openPanel, setOpenPanel] = useState<FilterPanel>(null);
  const [travelMaxMinutes, setTravelMaxMinutes] = useState(
    TRAVEL_DEFAULT_MINUTES,
  );
  /** Annonces: optional quartier origin (chip or free text). Empty = profile. */
  const [annoncesQuartier, setAnnoncesQuartier] = useState('');
  const [whenDay, setWhenDay] = useState<WhenDay>('today');
  /** « HH:MM » or empty (= now if today, start of day otherwise). */
  const [whenFromTime, setWhenFromTime] = useState('');
  /** Jour « Autre » : JJ/MM libre. */
  const [whenOtherDate, setWhenOtherDate] = useState('');
  /** Durée « Autre » : minutes libres. */
  const [travelOther, setTravelOther] = useState('');

  const clampTravelMinutes = (n: number) =>
    clampInt(n, TRAVEL_MIN_MINUTES, TRAVEL_MAX_MINUTES);

  const user = state.currentUser;
  const isDispo = !!user?.dispoSoir;
  const userNeighborhood =
    user?.dispoNeighborhood ?? user?.neighborhood ?? '';
  /**
   * Quartier d’origine trajet (Annonces):
   * - chip / free-text résolu → l’utiliser
   * - fragment court en cours de frappe → garder le profil (évite jump centre Paris)
   * - free-text long même inconnu → l’appliquer (pas d’ignore silencieux)
   */
  const filterOriginNeighborhood = useMemo(() => {
    const free = annoncesQuartier.trim();
    if (!free) return userNeighborhood;
    if (isResolvableNeighborhood(free)) return free;
    if (free.length < 4) return userNeighborhood;
    return free;
  }, [annoncesQuartier, userNeighborhood]);

  /** Keep last valid HH:MM while typing incomplete « 19:0 » (avoid flicker to now). */
  const lastValidWhenFromRef = useRef('');
  const appliedWhenFromTime = useMemo(() => {
    const trimmed = whenFromTime.trim();
    if (!trimmed) {
      lastValidWhenFromRef.current = '';
      return '';
    }
    const normalized = normalizeHhMm(whenFromTime);
    if (normalized) {
      lastValidWhenFromRef.current = normalized;
      return normalized;
    }
    return lastValidWhenFromRef.current;
  }, [whenFromTime]);

  const whenOtherParsed = useMemo(
    () => parseFreeDate(whenOtherDate),
    [whenOtherDate],
  );
  /** Dernière date libre valide (évite de vider la liste pendant la frappe). */
  const lastValidOtherYmdRef = useRef<string | null>(null);
  const whenOtherYmd = useMemo(() => {
    if (whenOtherParsed.ok) {
      lastValidOtherYmdRef.current = whenOtherParsed.ymd;
      return whenOtherParsed.ymd;
    }
    if (!whenOtherDate.trim()) lastValidOtherYmdRef.current = null;
    return lastValidOtherYmdRef.current;
  }, [whenOtherParsed, whenOtherDate]);
  const categoryNeedle = useMemo(
    () => (categoryText.trim().length >= 2 ? normalizeFree(categoryText) : ''),
    [categoryText],
  );

  const myDispoPrefs = {
    categories: user?.dispoCategories,
    neighborhood: userNeighborhood || undefined,
    budgetMax: user?.dispoBudgetMax,
  };

  const quartierOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of peopleDispo) {
      const q = p.dispoNeighborhood ?? p.neighborhood;
      if (q) set.add(q);
    }
    return ['all', ...Array.from(set).sort()];
  }, [peopleDispo]);

  const filteredOutings = useMemo(() => {
    const origin = filterOriginNeighborhood;
    let list: OutingWithTravel[] = visibleOutings.map((o) => {
      const travelMinutes = origin
        ? getTravelMinutes(origin, o.neighborhood)
        : 25;
      return {
        ...o,
        travelMinutes,
        matchScore: dispoMatchScore(
          myDispoPrefs,
          {
            category: o.category,
            neighborhood: o.neighborhood,
            budgetMax: o.budgetMaxEuros,
          },
          travelMinutes,
        ),
      };
    });

    list = list.filter((o) => o.travelMinutes <= travelMaxMinutes);
    list = list.filter((o) =>
      outingMatchesWhen(o.startsAt, whenDay, appliedWhenFromTime, Date.now(), {
        urgentOnSite: o.urgentOnSite,
        otherYmd: whenOtherYmd,
      }),
    );

    if (categoryFilter !== 'all') {
      list = list.filter((o) => o.category === categoryFilter);
    }
    if (categoryNeedle) {
      list = list.filter((o) =>
        textMatchesFree(
          [
            categoryLabels[o.category],
            o.categoryDetail,
            o.title,
            o.venueName,
            o.description,
            o.topic,
          ],
          categoryNeedle,
        ),
      );
    }
    // Invitation model: do NOT hide outings when invite cap > guest budget
    // preference (ex. 40 EUR invite stays visible under a 25 EUR filter).
    // budgetFilter is a soft preference signal (matchScore), not a hard cut.
    if (budgetFilter !== 'all') {
      list = list.map((o) => ({
        ...o,
        matchScore:
          o.matchScore +
          (o.budgetMaxEuros <= budgetFilter ? 25 : 0),
      }));
    }
    if (alignDispo && isDispo) {
      if (myDispoPrefs.categories?.length) {
        list = list.filter((o) =>
          myDispoPrefs.categories!.includes(o.category),
        );
      }
    }

    list.sort((a, b) => {
      // Urgent « Maintenant » first on Annonces / autour de toi.
      const au = a.urgentOnSite ? 1 : 0;
      const bu = b.urgentOnSite ? 1 : 0;
      if (bu !== au) return bu - au;
      if (alignDispo || isDispo || budgetFilter !== 'all') {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      }
      if (a.travelMinutes !== b.travelMinutes) {
        return a.travelMinutes - b.travelMinutes;
      }
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
    // Partenaires mélangés (badge) ; max 2 en tête seulement si proches +
    // bientôt (pinned démo compte parmi les 2). Pas de priorité systématique.
    return pinPartnerOutingsNearSoon(list, origin);
  }, [
    visibleOutings,
    categoryFilter,
    budgetFilter,
    travelMaxMinutes,
    filterOriginNeighborhood,
    whenDay,
    whenOtherYmd,
    appliedWhenFromTime,
    categoryNeedle,
    alignDispo,
    isDispo,
    myDispoPrefs.categories,
    myDispoPrefs.budgetMax,
  ]);

  const filteredPeople = useMemo(() => {
    let list = peopleDispo.map((p) => {
      const q = p.dispoNeighborhood ?? p.neighborhood;
      const travelMinutes = userNeighborhood
        ? getTravelMinutes(userNeighborhood, q)
        : 25;
      return {
        person: p,
        travelMinutes,
        matchScore: dispoMatchScore(
          myDispoPrefs,
          {
            categories: p.dispoCategories,
            neighborhood: q,
            budgetMax: p.dispoBudgetMax,
          },
          travelMinutes,
        ),
      };
    });
    list = list.filter((x) => x.travelMinutes <= travelMaxMinutes);
    if (categoryFilter !== 'all') {
      list = list.filter((x) =>
        x.person.dispoCategories?.includes(categoryFilter),
      );
    }
    if (categoryNeedle) {
      list = list.filter((x) =>
        textMatchesFree(
          [
            ...(x.person.dispoCategories ?? []).map((c) => categoryLabels[c]),
            x.person.dispoCategoryDetail,
            x.person.dispoTopic,
            ...(x.person.interests ?? []),
            ...(x.person.customFilters ?? []),
          ],
          categoryNeedle,
        ),
      );
    }
    if (budgetFilter !== 'all') {
      list = list.filter((x) => {
        const b = x.person.dispoBudgetMax;
        // No preference set → keep visible; otherwise honor max.
        if (b == null || !Number.isFinite(b)) return true;
        return b <= budgetFilter;
      });
    }
    if (quartierFilter !== 'all') {
      const needle = quartierFilter.trim().toLowerCase();
      list = list.filter((x) => {
        const q = (
          x.person.dispoNeighborhood ?? x.person.neighborhood ?? ''
        ).toLowerCase();
        return q === needle || (needle.length >= 3 && q.includes(needle));
      });
    }
    list.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return a.travelMinutes - b.travelMinutes;
    });
    return list;
  }, [
    peopleDispo,
    categoryFilter,
    categoryNeedle,
    budgetFilter,
    quartierFilter,
    travelMaxMinutes,
    userNeighborhood,
    myDispoPrefs.categories,
    myDispoPrefs.budgetMax,
    myDispoPrefs.neighborhood,
  ]);

  const goCreateFromDispo = (person?: User) => {
    // No propose-to-self: if person is me (or missing), create for feed only.
    const me = user;
    const target =
      person && me && person.id !== me.id ? person : undefined;
    if (person && me && person.id === me.id) {
      // Own dispo card should not propose to self — open Dispo settings instead.
      navigation.navigate('DispoSoir');
      return;
    }
    const cats =
      target?.dispoCategories?.length
        ? target.dispoCategories
        : me?.dispoCategories ?? [];
    const primary = (
      cats.includes('autre') ? 'autre' : (cats[0] ?? 'restaurant')
    ) as OutingCategory;
    const slot = target?.dispoSlot ?? me?.dispoSlot ?? 'soir';
    const detail =
      target?.dispoCategoryDetail ?? me?.dispoCategoryDetail ?? undefined;
    const slotPrefill = dispoSlotCreatePrefill(slot);
    navigation.navigate('MainTabs', {
      screen: 'Create',
      params: {
        fromDispo: true,
        ...(target
          ? { inviteeUserId: target.id, inviteeName: target.firstName }
          : {}),
        category: primary,
        categoryDetail: primary === 'autre' ? detail : undefined,
        neighborhood:
          target?.dispoNeighborhood ??
          target?.neighborhood ??
          me?.dispoNeighborhood ??
          me?.neighborhood,
        topic: target?.dispoTopic ?? me?.dispoTopic,
        excludedTopics: (target?.dispoExclusions ?? me?.dispoExclusions)?.join(
          ', ',
        ),
        timeLabel: slotPrefill.timeLabel,
        dateOffsetDays: slotPrefill.dateOffsetDays,
      },
    });
  };

  /** Entrées « J’invite » / « Je suis déjà sur place » : après la liste (la liste d’abord). */
  const inviteFooter = (
    <View style={styles.footerBlock}>
      <Text style={styles.footerTitle}>J’invite ce soir</Text>
      <Text style={styles.footerBody}>
        Propose une table, un verre ou un moment.
      </Text>
      <View style={styles.footerRow}>
        <Pressable
          onPress={() => navigation.navigate('MainTabs', { screen: 'Create' })}
          style={({ pressed }) => [styles.primaryPill, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Inviter"
        >
          <Text style={styles.primaryPillText}>Inviter</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            navigation.navigate('MainTabs', {
              screen: 'Create',
              params: { urgentOnSite: true },
            })
          }
          style={({ pressed }) => [styles.secondaryPill, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Je suis déjà sur place"
        >
          <Text style={styles.secondaryPillText}>Je suis déjà sur place</Text>
        </Pressable>
      </View>
    </View>
  );

  const onToggleDispo = (value: boolean) => {
    if (!value) {
      setDispoProfile({ dispoSoir: false });
      return;
    }
    const slot = user?.dispoSlot ?? 'soir';
    setDispoProfile({
      dispoSoir: true,
      dispoSlot: slot,
      dispoExpiresAt: computeDispoExpiresAt(slot).toISOString(),
    });
  };

  /** Dispo : une ligne compacte (interrupteur + réglages). */
  const dispoRow = (
    <View style={styles.dispoRow}>
      <View style={styles.dispoRowCopy}>
        <Text style={styles.dispoRowLabel}>Je suis dispo</Text>
        <Text style={styles.dispoRowHint} numberOfLines={2}>
          {isDispo
            ? 'Visible jusqu’à la fin du créneau, minuit, ou ta prochaine table.'
            : 'Invisible pour l’instant.'}
        </Text>
      </View>
      <Pressable
        onPress={() => navigation.navigate('DispoSoir')}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Réglages Dispo"
      >
        <Text style={styles.textLink}>Réglages</Text>
      </Pressable>
      <Switch
        value={isDispo}
        onValueChange={onToggleDispo}
        trackColor={{ true: colors.primary, false: colors.border }}
        ios_backgroundColor={colors.border}
        thumbColor={colors.white}
        accessibilityLabel="Je suis dispo"
      />
    </View>
  );

  /** Filtres derrière l’engrenage (catégorie, budget, aligné à ma dispo). */
  const moreFiltersActive =
    categoryFilter !== 'all' ||
    categoryText.trim() !== '' ||
    budgetFilter !== 'all' ||
    alignDispo;

  const togglePanel = (p: FilterPanel) =>
    setOpenPanel((cur) => (cur === p ? null : p));

  const quartierChipLabel =
    mode === 'sorties'
      ? annoncesQuartier.trim() || 'Quartier'
      : quartierFilter === 'all'
        ? 'Quartier'
        : quartierFilter;
  const jourChipLabel =
    (whenDay === 'other'
      ? whenOtherParsed.ok
        ? formatYmdShort(whenOtherParsed.ymd)
        : 'Autre jour'
      : WHEN_DAY_OPTIONS.find((d) => d.id === whenDay)?.label ?? 'Jour') +
    (appliedWhenFromTime ? ` · ${appliedWhenFromTime}` : '');
  const distanceChipLabel = `${travelMaxMinutes} min`;

  const filterChip = (
    panel: Exclude<FilterPanel, 'more'>,
    label: string,
    a11y: string,
  ) => {
    const on = openPanel === panel;
    return (
      <Pressable
        key={panel}
        onPress={() => togglePanel(panel)}
        style={[styles.chip, on && styles.chipSelected]}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityState={{ selected: on, expanded: on }}
      >
        <Text
          style={[styles.chipText, on && styles.chipTextSelected]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Ionicons
          name={on ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={on ? colors.white : colors.text}
        />
      </Pressable>
    );
  };

  /** UNE ligne : quartier · jour · distance … engrenage. */
  const filterRow = (
    <View style={styles.filterRow}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={styles.filtersScrollFlex}
        keyboardShouldPersistTaps="handled"
      >
        {filterChip('quartier', quartierChipLabel, 'Filtre quartier')}
        {mode === 'sorties'
          ? filterChip('jour', jourChipLabel, 'Filtre jour et heure')
          : null}
        {filterChip('distance', distanceChipLabel, 'Filtre distance en minutes')}
      </ScrollView>
      <Pressable
        onPress={() => togglePanel('more')}
        style={[
          styles.gear,
          (openPanel === 'more' || moreFiltersActive) && styles.chipSelected,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Autres filtres"
        accessibilityState={{ selected: openPanel === 'more', expanded: openPanel === 'more' }}
      >
        <Ionicons
          name="settings-outline"
          size={18}
          color={
            openPanel === 'more' || moreFiltersActive
              ? colors.white
              : colors.primary
          }
        />
      </Pressable>
    </View>
  );

  const categoryChips = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filters}
      style={styles.panelRow}
      keyboardShouldPersistTaps="handled"
    >
      {FILTERS.map((f) => {
        const selected = categoryFilter === f.id;
        return (
          <Pressable
            key={f.id}
            onPress={() => setCategoryFilter(f.id)}
            style={[styles.chip, selected && styles.chipSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
              {f.label}
            </Text>
          </Pressable>
        );
      })}
      {/* Champ libre au même niveau que les pastilles (règle « Autre ») */}
      <TextInput
        selectionColor={colors.primary}
        cursorColor={colors.primary}
        style={[
          styles.inlineInput,
          categoryText.trim() !== '' && styles.inlineInputOn,
        ]}
        value={categoryText}
        onChangeText={(t) => setCategoryText(t.trimStart().slice(0, 40))}
        placeholder="Autre : padel, karaoké…"
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Autre catégorie : précise une activité"
      />
    </ScrollView>
  );

  const budgetOtherParsed = parseFreeInt(budgetOther, BUDGET_FREE_MIN, BUDGET_FREE_MAX);
  const travelOtherParsed = parseFreeInt(
    travelOther,
    TRAVEL_MIN_MINUTES,
    TRAVEL_MAX_MINUTES,
  );
  const quartierInList = (PARIS_NEIGHBORHOODS as readonly string[]).includes(
    annoncesQuartier,
  );
  const dispoQuartierOther =
    quartierFilter !== 'all' && !quartierOptions.includes(quartierFilter);

  let panel: React.ReactNode = null;
  if (openPanel === 'quartier') {
    panel =
      mode === 'sorties' ? (
        <PillsWithOther
          inline
          compact
          options={[
            { id: '', label: 'Chez moi' },
            ...PARIS_NEIGHBORHOODS.map((q) => ({ id: q as string, label: q })),
          ]}
          selected={quartierInList ? annoncesQuartier : annoncesQuartier.trim() === '' ? '' : null}
          onSelect={(id) =>
            setAnnoncesQuartier((prev) => (prev === id ? '' : id))
          }
          otherActive={annoncesQuartier.trim() !== '' && !quartierInList}
          otherValue={quartierInList ? '' : annoncesQuartier}
          onChangeOther={(t) => setAnnoncesQuartier(t.trimStart())}
          placeholder="ex. Batignolles"
          maxLength={40}
          accessibilityLabel="Autre quartier d’origine"
        />
      ) : (
        <PillsWithOther
          inline
          compact
          options={quartierOptions.map((q) => ({
            id: q,
            label: q === 'all' ? 'Tous' : q,
          }))}
          selected={dispoQuartierOther ? null : quartierFilter}
          onSelect={(id) => setQuartierFilter(id)}
          otherActive={dispoQuartierOther}
          otherValue={dispoQuartierOther ? quartierFilter : ''}
          onChangeOther={(t) => {
            const trimmed = t.trimStart();
            setQuartierFilter(trimmed === '' ? 'all' : trimmed);
          }}
          placeholder="ex. Batignolles"
          maxLength={40}
          accessibilityLabel="Filtrer par autre quartier"
        />
      );
  } else if (openPanel === 'jour' && mode === 'sorties') {
    panel = (
      <>
        <PillsWithOther
          inline
          compact
          options={WHEN_DAY_OPTIONS}
          selected={whenDay === 'other' ? null : whenDay}
          onSelect={(id) => {
            setWhenDay(id);
            setWhenOtherDate('');
          }}
          otherActive={whenDay === 'other'}
          otherValue={whenOtherDate}
          onPressOther={() => setWhenDay('other')}
          onChangeOther={(t) => {
            const cleaned = t.replace(/[^0-9/.\- ]/g, '').slice(0, 10);
            setWhenOtherDate(cleaned);
            if (cleaned.trim()) {
              setWhenDay('other');
            } else if (whenDay === 'other') {
              setWhenDay('today');
            }
          }}
          placeholder="ex. 12/10"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          inputWidth={96}
          hint={
            whenDay === 'other'
              ? whenOtherParsed.ok
                ? `Le ${formatYmdShort(whenOtherParsed.ymd)}`
                : freeDateHint(whenOtherParsed) ??
                  'Écris une date JJ/MM (ex. 12/10).'
              : null
          }
          accessibilityLabel="Autre jour, date JJ/MM"
        />
        <View style={styles.inlineField}>
          <Text style={styles.panelLabel}>À partir de</Text>
          <TextInput
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={[
              styles.inlineInput,
              styles.timeInput,
              whenFromTime.trim() !== '' && styles.inlineInputOn,
            ]}
            value={whenFromTime}
            onChangeText={(t) => {
              // Allow typing HH:MM; soft-normalize digits and separators
              const cleaned = t.replace(/[^0-9:hH.]/g, '').slice(0, 5);
              setWhenFromTime(cleaned);
            }}
            placeholder="15:30"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            autoCorrect={false}
            accessibilityLabel="Heure minimum à partir de"
          />
        </View>
      </>
    );
  } else if (openPanel === 'distance') {
    panel = (
      <>
        <Text style={styles.panelLabel}>
          {mode === 'sorties' && annoncesQuartier.trim()
            ? `Moins de ${travelMaxMinutes} min depuis ${annoncesQuartier.trim()}`
            : `Moins de ${travelMaxMinutes} min`}
        </Text>
        <PillsWithOther
          inline
          compact
          options={TRAVEL_SHORTCUTS.map((m) => ({ id: m as number, label: `${m} min` }))}
          selected={travelMaxMinutes}
          onSelect={(m) => {
            setTravelMaxMinutes(m);
            setTravelOther('');
          }}
          otherActive={travelOther.trim() !== ''}
          otherValue={travelOther}
          onChangeOther={(t) => {
            const cleaned = t.replace(/[^0-9]/g, '').slice(0, 3);
            setTravelOther(cleaned);
            const res = parseFreeInt(cleaned, TRAVEL_MIN_MINUTES, TRAVEL_MAX_MINUTES);
            if (res.ok) setTravelMaxMinutes(res.value);
          }}
          placeholder="ex. 20"
          keyboardType="number-pad"
          suffix="min"
          maxLength={3}
          inputWidth={64}
          hint={freeIntHint(
            travelOtherParsed,
            TRAVEL_MIN_MINUTES,
            TRAVEL_MAX_MINUTES,
            'min',
          )}
          accessibilityLabel="Autre durée de trajet en minutes"
        />
        <Slider
          style={styles.travelSlider}
          minimumValue={TRAVEL_MIN_MINUTES}
          maximumValue={TRAVEL_MAX_MINUTES}
          step={5}
          value={travelMaxMinutes}
          onValueChange={(v) => {
            const n = clampTravelMinutes(v);
            setTravelMaxMinutes(n);
            setTravelOther(
              (TRAVEL_SHORTCUTS as readonly number[]).includes(n) ? '' : String(n),
            );
          }}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          thumbTintColor={colors.primary}
          accessibilityLabel="Temps de trajet maximum"
        />
      </>
    );
  } else if (openPanel === 'more') {
    panel = (
      <>
        <Text style={styles.panelLabel}>Catégorie</Text>
        {categoryChips}
        <Text style={styles.panelLabel}>Budget max</Text>
        <PillsWithOther
          inline
          compact
          options={BUDGET_FILTERS}
          selected={budgetFilter}
          onSelect={(id) => {
            setBudgetFilter(id);
            setBudgetOther('');
          }}
          otherActive={budgetOther.trim() !== ''}
          otherValue={budgetOther}
          onChangeOther={(t) => {
            const cleaned = t.replace(/[^0-9]/g, '').slice(0, 3);
            setBudgetOther(cleaned);
            if (!cleaned) {
              setBudgetFilter('all');
              return;
            }
            const res = parseFreeInt(cleaned, BUDGET_FREE_MIN, BUDGET_FREE_MAX);
            if (res.ok) setBudgetFilter(res.value);
          }}
          placeholder="ex. 30"
          keyboardType="number-pad"
          suffix="€"
          maxLength={3}
          inputWidth={72}
          hint={freeIntHint(budgetOtherParsed, BUDGET_FREE_MIN, BUDGET_FREE_MAX, '€')}
          accessibilityLabel="Autre budget maximum en euros"
        />
        {mode === 'sorties' && isDispo ? (
          <View style={styles.alignRow}>
            <Pressable
              onPress={() => setAlignDispo((v) => !v)}
              style={[styles.chip, alignDispo && styles.chipSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected: alignDispo }}
            >
              <Text
                style={[styles.chipText, alignDispo && styles.chipTextSelected]}
              >
                Aligné à ma dispo
              </Text>
            </Pressable>
          </View>
        ) : null}
      </>
    );
  }

  const filtersPanel = panel ? <View style={styles.panel}>{panel}</View> : null;

  const listHeader = (
    <View style={styles.listHeader}>
      {/* Segment Annonces / Dispo : la pastille choisie reste orange */}
      <View style={styles.segment}>
        {(['sorties', 'dispos'] as FeedMode[]).map((m) => {
          const selected = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => {
                setMode(m);
                setOpenPanel((cur) => (cur === 'jour' ? null : cur));
              }}
              style={[styles.segmentItem, selected && styles.segmentItemOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text
                style={[styles.segmentText, selected && styles.segmentTextOn]}
              >
                {m === 'sorties' ? 'Annonces' : 'Dispo'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {mode === 'dispos' ? dispoRow : null}
      {mode === 'sorties' ? (
        <View style={styles.viewToggle}>
          {(['liste', 'carte'] as const).map((v) => {
            const on = view === v;
            return (
              <Pressable
                key={v}
                onPress={() => setView(v)}
                style={[styles.chip, on && styles.chipSelected]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.chipText, on && styles.chipTextSelected]}>
                  {v === 'liste' ? 'Liste' : 'Carte'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {filterRow}
      {filtersPanel}
    </View>
  );

  const emptyMoments = (hint?: string) => (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Encore peu de moments ici.</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
      <Pressable
        onPress={() => navigation.navigate('MainTabs', { screen: 'Create' })}
        hitSlop={12}
        accessibilityRole="link"
        accessibilityLabel="Propose le premier"
      >
        <Text style={styles.emptyLink}>Propose le premier.</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={onLogoTap} hitSlop={12}>
          <Text style={styles.brand}>Moment</Text>
        </Pressable>
        <Text style={styles.title}>Autour de toi</Text>
        <Text style={styles.sub}>Des moments, pas des profils.</Text>
      </View>

      {mode === 'sorties' && view === 'carte' ? (
        <View style={styles.mapScreen}>
          <ScrollView
            style={styles.mapHeader}
            contentContainerStyle={styles.mapHeaderContent}
            keyboardShouldPersistTaps="handled"
          >
            {listHeader}
          </ScrollView>
          <MomentsMap
            outings={filteredOutings}
            onOpen={(id) => navigation.navigate('OutingDetail', { outingId: id })}
            emptyOverlay={emptyMoments()}
          />
        </View>
      ) : mode === 'sorties' ? (
        <FlatList
          data={filteredOutings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={listHeader}
          ListEmptyComponent={emptyMoments(
            categoryFilter !== 'all' || categoryText.trim() !== ''
              ? 'Élargis la catégorie ou la distance.'
              : undefined,
          )}
          ListFooterComponent={inviteFooter}
          renderItem={({ item }) => (
            <OutingCard
              outing={item}
              travelMinutes={item.travelMinutes}
              onPress={() =>
                navigation.navigate('OutingDetail', { outingId: item.id })
              }
            />
          )}
        />
      ) : (
        <FlatList
          data={filteredPeople}
          keyExtractor={(item) => item.person.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={listHeader}
          ListEmptyComponent={emptyMoments(
            'Personne n’est dispo pour l’instant. Active Dispo ou change de filtre.',
          )}
          renderItem={({ item }) => (
            <PersonCard
              person={item.person}
              onPropose={() => goCreateFromDispo(item.person)}
            />
          )}
        />
      )}
      <DemoMenuModal
        visible={demoMenuOpen}
        onClose={() => setDemoMenuOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  brand: {
    ...typography.caption,
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  title: { ...typography.title, color: colors.text, marginTop: 2 },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  listHeader: { marginBottom: spacing.lg },
  viewToggle: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  mapScreen: { flex: 1 },
  mapHeader: { flexGrow: 0, maxHeight: '55%' },
  mapHeaderContent: { paddingHorizontal: spacing.screen },
  /** Annonces / Dispo : pastille active orange + texte blanc, l’autre blanche + liseré. */
  segment: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  segmentItem: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemOn: {
    backgroundColor: colors.chipActive,
    borderColor: colors.chipActive,
  },
  segmentText: {
    ...typography.caption,
    color: colors.chipText,
    fontFamily: fonts.semiBold,
  },
  segmentTextOn: { color: colors.chipActiveText },
  dispoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  dispoRowCopy: { flex: 1 },
  dispoRowLabel: { ...typography.bodyStrong, color: colors.text },
  dispoRowHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  textLink: {
    ...typography.caption,
    fontFamily: fonts.semiBold,
    color: colors.text,
    textDecorationLine: 'underline',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  filtersScrollFlex: { flexGrow: 1, flexShrink: 1 },
  filters: {
    gap: spacing.sm,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.chip,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.chipBorder,
  },
  chipSelected: {
    backgroundColor: colors.chipActive,
    borderColor: colors.chipActive,
  },
  chipText: {
    ...typography.caption,
    color: colors.chipText,
    fontFamily: fonts.semiBold,
    maxWidth: 160,
  },
  chipTextSelected: { color: colors.chipActiveText },
  gear: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  panel: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  panelRow: { flexGrow: 0 },
  panelLabel: {
    ...typography.caption,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
  },
  inlineField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inlineInput: {
    minHeight: 36,
    width: 170,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    ...typography.caption,
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
  inlineInputOn: { borderColor: colors.primary },
  timeInput: { width: 84 },
  alignRow: { flexDirection: 'row' },
  travelSlider: { width: '100%', height: 36 },
  list: {
    paddingHorizontal: spacing.screen,
    paddingBottom: spacing.xxxl,
    flexGrow: 1,
  },
  empty: {
    paddingVertical: spacing.block,
    alignItems: 'flex-start',
  },
  emptyTitle: { ...typography.subtitle, color: colors.text },
  emptyHint: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  emptyLink: {
    ...typography.bodyStrong,
    color: colors.text,
    textDecorationLine: 'underline',
    marginTop: spacing.md,
  },
  footerBlock: {
    marginTop: spacing.block,
    paddingTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerTitle: { ...typography.bodyStrong, color: colors.text },
  footerBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  footerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  primaryPill: {
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPillText: {
    ...typography.caption,
    fontFamily: fonts.semiBold,
    color: colors.white,
  },
  secondaryPill: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.chipBorder,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryPillText: {
    ...typography.caption,
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
  pressed: { opacity: 0.88 },
});
