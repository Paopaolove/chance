import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Slider from '@react-native-community/slider';
import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DemoMenuModal } from '../components/DemoMenuModal';
import { EmptyState } from '../components/EmptyState';
import { OutingCard } from '../components/OutingCard';
import { PersonCard } from '../components/PersonCard';
import { useChance } from '../data/ChanceContext';
import { categoryLabels } from '../data/mockOutings';
import { getTravelMinutes } from '../data/travelTime';
import { Outing, OutingCategory, User } from '../data/types';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, shadows, spacing, typography } from '../theme';
import { dispoSlotLabel } from '../utils/dispo';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type FilterId = 'all' | OutingCategory;
type FeedMode = 'sorties' | 'dispos';
type BudgetFilter = number | 'all';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'restaurant', label: categoryLabels.restaurant },
  { id: 'bar', label: categoryLabels.bar },
  { id: 'culture', label: categoryLabels.culture },
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

function clampBudgetEuros(n: number): number {
  return Math.min(BUDGET_FREE_MAX, Math.max(BUDGET_FREE_MIN, Math.round(n)));
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
  const { visibleOutings, peopleDispo, state } = useChance();
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
  const [categoryFilter, setCategoryFilter] = useState<FilterId>('all');
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilter>('all');
  const [quartierFilter, setQuartierFilter] = useState<string>('all');
  /** Annonces: prefer alignment with my Dispo prefs when toggled. */
  const [alignDispo, setAlignDispo] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [travelMaxMinutes, setTravelMaxMinutes] = useState(
    TRAVEL_DEFAULT_MINUTES,
  );

  const clampTravelMinutes = (n: number) =>
    Math.min(TRAVEL_MAX_MINUTES, Math.max(TRAVEL_MIN_MINUTES, Math.round(n)));

  const user = state.currentUser;
  const isDispo = !!user?.dispoSoir;
  const envieCount = user?.dispoCategories?.length ?? 0;
  const userNeighborhood =
    user?.dispoNeighborhood ?? user?.neighborhood ?? '';
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
    let list: OutingWithTravel[] = visibleOutings.map((o) => {
      const travelMinutes = userNeighborhood
        ? getTravelMinutes(userNeighborhood, o.neighborhood)
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

    if (categoryFilter !== 'all') {
      list = list.filter((o) => o.category === categoryFilter);
    }
    // Invitation model: do NOT hide outings when invite cap > guest budget
    // preference (ex. 40 EUR invite stays visible under a 25 EUR filter).
    // budgetFilter / dispo budgetMax are preference signals only — not used
    // to hide higher host invitation caps.
    if (alignDispo && isDispo) {
      if (myDispoPrefs.categories?.length) {
        list = list.filter((o) =>
          myDispoPrefs.categories!.includes(o.category),
        );
      }
    }

    list.sort((a, b) => {
      if (alignDispo || isDispo) {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      }
      if (a.travelMinutes !== b.travelMinutes) {
        return a.travelMinutes - b.travelMinutes;
      }
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
    return list;
  }, [
    visibleOutings,
    categoryFilter,
    budgetFilter,
    travelMaxMinutes,
    userNeighborhood,
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
    if (budgetFilter !== 'all') {
      list = list.filter(
        (x) =>
          x.person.dispoBudgetMax === undefined ||
          x.person.dispoBudgetMax <= budgetFilter,
      );
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
    const slot = target?.dispoSlot ?? me?.dispoSlot ?? '19:30';
    const detail =
      target?.dispoCategoryDetail ?? me?.dispoCategoryDetail ?? undefined;
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
        budgetMaxEuros:
          target?.dispoBudgetMax ?? me?.dispoBudgetMax ?? 25,
        topic: target?.dispoTopic ?? me?.dispoTopic,
        excludedTopics: (target?.dispoExclusions ?? me?.dispoExclusions)?.join(
          ', ',
        ),
        timeLabel: slot === 'flexible' ? '19:30' : slot,
        flexibleSlot: slot === 'flexible',
      },
    });
  };

  const dispoBanner = (
    <Pressable
      onPress={() => navigation.navigate('DispoSoir')}
      style={[styles.banner, isDispo ? styles.bannerOn : styles.bannerOff]}
    >
      <Text style={[styles.bannerTitle, isDispo && styles.bannerTitleOn]}>
        {isDispo
          ? envieCount > 0
            ? `Dispo ce soir · ${envieCount} catégorie${envieCount > 1 ? 's' : ''}${
                user?.dispoSlot ? ` · ${dispoSlotLabel(user.dispoSlot)}` : ''
              }`
            : 'Tu es dispo ce soir'
          : 'Dispo ce soir ?'}
      </Text>
      <Text style={[styles.bannerBody, isDispo && styles.bannerBodyOn]}>
        {isDispo
          ? 'Les autres peuvent te proposer une sortie, ou crée une annonce en 2 taps. Expire à minuit.'
          : 'Indique créneau, catégorie, quartier et budget pour une sortie improvisée ce soir.'}
      </Text>
      <Text style={[styles.bannerCta, isDispo && styles.bannerCtaOn]}>
        {isDispo ? 'Modifier / créer une annonce →' : 'Passer dispo →'}
      </Text>
    </Pressable>
  );

  const filtersActive =
    budgetFilter !== 'all' ||
    alignDispo ||
    (mode === 'dispos' && quartierFilter !== 'all') ||
    travelMaxMinutes !== TRAVEL_DEFAULT_MINUTES;

  const categoryChips = (
    <View style={styles.categoryRow}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={styles.filtersScrollFlex}
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
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        onPress={() => setShowFilters((v) => !v)}
        style={[
          styles.chip,
          styles.filtresChip,
          (showFilters || filtersActive) && styles.chipSelected,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: showFilters }}
      >
        <Text
          style={[
            styles.chipText,
            (showFilters || filtersActive) && styles.chipTextSelected,
          ]}
        >
          Filtres
        </Text>
      </Pressable>
    </View>
  );

  const extraFiltersPanel = showFilters ? (
    <View style={styles.filtersPanel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={styles.filtersScroll}
      >
        {mode === 'sorties' && isDispo ? (
          <Pressable
            onPress={() => setAlignDispo((v) => !v)}
            style={[styles.chip, alignDispo && styles.chipSelected]}
          >
            <Text
              style={[styles.chipText, alignDispo && styles.chipTextSelected]}
            >
              Aligné à ma dispo
            </Text>
          </Pressable>
        ) : null}
        {BUDGET_FILTERS.map((f) => {
          const selected = budgetFilter === f.id;
          return (
            <Pressable
              key={String(f.id)}
              onPress={() => setBudgetFilter(f.id)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.quartierFreeLabel}>Budget max libre</Text>
      <View style={styles.budgetFreeRow}>
        <Text style={styles.travelInputPrefix}>max</Text>
        <TextInput
          style={styles.budgetFreeInput}
          value={budgetFilter === 'all' ? '' : String(budgetFilter)}
          onChangeText={(t) => {
            const digits = t.replace(/\D/g, '');
            if (digits === '') {
              setBudgetFilter('all');
              return;
            }
            const n = parseInt(digits, 10);
            if (!Number.isNaN(n)) {
              setBudgetFilter(clampBudgetEuros(n));
            }
          }}
          placeholder="_"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={3}
          selectTextOnFocus
          accessibilityLabel="Budget maximum en euros"
        />
        <Text style={styles.travelInputSuffix}>€</Text>
      </View>
      {mode === 'dispos' ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
            style={styles.filtersScroll}
          >
            {quartierOptions.map((q) => {
              const selected = quartierFilter === q;
              const label = q === 'all' ? 'Quartier' : q;
              return (
                <Pressable
                  key={q}
                  onPress={() => setQuartierFilter(q)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.quartierFreeLabel}>Autre quartier</Text>
          <TextInput
            style={styles.quartierFreeInput}
            value={
              quartierFilter === 'all' || quartierOptions.includes(quartierFilter)
                ? ''
                : quartierFilter
            }
            onChangeText={(t) => {
              const trimmed = t.trimStart();
              setQuartierFilter(trimmed === '' ? 'all' : trimmed);
            }}
            placeholder="Écris un quartier…"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            accessibilityLabel="Filtrer par quartier saisi"
          />
        </>
      ) : null}
      <View style={styles.travelBlock}>
        <Text style={styles.travelLabel}>
          Moins de {travelMaxMinutes} min
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          style={styles.filtersScroll}
        >
          {TRAVEL_SHORTCUTS.map((m) => {
            const selected = travelMaxMinutes === m;
            return (
              <Pressable
                key={m}
                onPress={() => setTravelMaxMinutes(m)}
                style={[styles.chip, selected && styles.chipSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    styles.chipText,
                    selected && styles.chipTextSelected,
                  ]}
                >
                  {m} min
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.travelSliderRow}>
          <Slider
            style={styles.travelSlider}
            minimumValue={TRAVEL_MIN_MINUTES}
            maximumValue={TRAVEL_MAX_MINUTES}
            step={5}
            value={travelMaxMinutes}
            onValueChange={(v) => setTravelMaxMinutes(clampTravelMinutes(v))}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.primary}
          />
          <View style={styles.travelInputWrap}>
            <Text style={styles.travelInputPrefix}>max</Text>
            <TextInput
              style={styles.travelInput}
              value={String(travelMaxMinutes)}
              onChangeText={(t) => {
                const digits = t.replace(/\D/g, '');
                if (digits === '') return;
                const n = parseInt(digits, 10);
                if (!Number.isNaN(n)) {
                  setTravelMaxMinutes(clampTravelMinutes(n));
                }
              }}
              keyboardType="number-pad"
              maxLength={2}
              selectTextOnFocus
              accessibilityLabel="Temps de trajet maximum en minutes"
            />
            <Text style={styles.travelInputSuffix}>min</Text>
          </View>
        </View>
      </View>
    </View>
  ) : null;

  const listHeader = (
    <View>
      <View style={styles.segment}>
        {(['sorties', 'dispos'] as FeedMode[]).map((m) => {
          const selected = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.segmentItem, selected && styles.segmentItemOn]}
            >
              <Text
                style={[styles.segmentText, selected && styles.segmentTextOn]}
              >
                {m === 'sorties' ? 'Annonces' : 'Dispo ce soir'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {dispoBanner}
      {categoryChips}
      {extraFiltersPanel}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={onLogoTap} hitSlop={8}>
          <Text style={styles.brand}>Chance</Text>
        </Pressable>
        <Text style={styles.title}>Autour de toi</Text>
        <Text style={styles.sub}>
          {userNeighborhood
            ? `Depuis ${userNeighborhood} · Moins de ${travelMaxMinutes} min`
            : `Paris intramuros · Moins de ${travelMaxMinutes} min`}
        </Text>
      </View>

      {mode === 'sorties' ? (
        <FlatList
          data={filteredOutings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              title="Encore peu de sorties ici."
              subtitle="Crée la première, ou passe en Dispo ce soir."
              actionLabel="Créer la première"
              onAction={() =>
                navigation.navigate('MainTabs', { screen: 'Create' })
              }
              secondaryActionLabel={
                categoryFilter === 'all' ? 'Dispo ce soir' : 'Voir toutes'
              }
              onSecondaryAction={() => {
                if (categoryFilter === 'all') {
                  navigation.navigate('DispoSoir');
                } else {
                  setCategoryFilter('all');
                }
              }}
            />
          }
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
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              title="Personne n’est dispo ce soir."
              subtitle="Active Dispo ce soir (créneau, catégorie, quartier, budget) ou change de filtre."
              actionLabel="Dispo ce soir"
              onAction={() => navigation.navigate('DispoSoir')}
            />
          }
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  brand: {
    ...typography.caption,
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  title: { ...typography.title, color: colors.text, marginTop: 2 },
  sub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.full,
    padding: 4,
    marginBottom: spacing.lg,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  segmentItemOn: {
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  segmentText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
  },
  segmentTextOn: { color: colors.text },
  banner: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadows.soft,
  },
  bannerOff: {
    backgroundColor: colors.primarySoft,
  },
  bannerOn: {
    backgroundColor: colors.successSoft,
  },
  bannerTitle: {
    ...typography.subtitle,
    fontFamily: fonts.semiBold,
    color: colors.primaryDark,
    marginBottom: 6,
  },
  bannerTitleOn: { color: colors.success },
  bannerBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  bannerBodyOn: { color: colors.textSecondary },
  bannerCta: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  bannerCtaOn: { color: colors.success },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  filtersScrollFlex: { flexGrow: 1, flexShrink: 1 },
  filtersScroll: { flexGrow: 0, marginBottom: spacing.sm },
  filters: {
    gap: spacing.sm,
    alignItems: 'center',
    paddingBottom: 4,
  },
  filtersPanel: {
    marginBottom: spacing.sm,
  },
  chip: {
    backgroundColor: colors.chip,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filtresChip: {
    flexShrink: 0,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
  },
  chipTextSelected: { color: colors.white },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    flexGrow: 1,
  },
  quartierFreeLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  quartierFreeInput: {
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
  travelBlock: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  travelLabel: {
    ...typography.bodyStrong,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  travelSliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  travelSlider: {
    flex: 1,
    height: 40,
  },
  travelInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  travelInputPrefix: {
    ...typography.caption,
    color: colors.textMuted,
  },
  travelInput: {
    width: 44,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    ...typography.caption,
    fontFamily: fonts.semiBold,
    color: colors.text,
    textAlign: 'center',
  },
  travelInputSuffix: {
    ...typography.caption,
    color: colors.textMuted,
  },
  budgetFreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  budgetFreeInput: {
    width: 56,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    ...typography.caption,
    fontFamily: fonts.semiBold,
    color: colors.text,
    textAlign: 'center',
  },
});
