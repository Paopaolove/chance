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
import { OutingCategory, PartnerGesture } from '../data/types';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import {
  isStartsAtPast,
  parisWallToUtc,
  parisYmd,
} from '../utils/parisTime';
import { clampInt, parseLooseInt } from '../utils/parseLooseNumber';
import {
  countPartnerCultureSameEvening,
  isPartnerClosed,
  isPartnerCultureHost,
  isPartnerUser,
  PARTNER_CULTURE_CAPACITY,
  PARTNER_CULTURE_MAX_SAME_EVENING,
  PARTNER_DISCOUNT_MAX,
  PARTNER_DISCOUNT_MIN,
  PARTNER_DISCOUNT_PRESETS,
  PARTNER_GESTURES,
  PARTNER_KIND_LABELS,
  partnerOfferChips,
} from '../utils/partners';
import { CheckNote } from '../components/CheckNote';
import { PillsWithOther } from '../components/PillsWithOther';
import { useOpenUserProfile } from '../utils/openUserProfile';
import {
  formatYmdShort,
  freeDateHint,
  freeIntHint,
  parseFreeDate,
  parseFreeInt,
  ymdToFr,
} from '../utils/freeDate';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type CreateRoute = RouteProp<MainTabParamList, 'Create'>;

const categories: { id: OutingCategory; label: string }[] = [
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'bar', label: 'Bar' },
  { id: 'culture', label: 'Culture' },
  { id: 'sport', label: 'Sport' },
  { id: 'autre', label: 'Autre' },
];

const BUDGET_PRESETS = [10, 20, 30, 40] as const;
/** Default invite cap for restaurant / bar. */
const BUDGET_DEFAULT_EUROS = 20;

/** Prefill exact — urgent « déjà sur place » (≠ no-show / lapin Moment). */
const URGENT_ON_SITE_MESSAGE =
  'Une place est libre, mon ami ne vient plus.';

function clampCreateBudget(n: number): number {
  return clampInt(n, BUDGET_MIN_EUROS, BUDGET_MAX_EUROS);
}

/** Restaurant / bar: chips + free amount. Culture / sport / autre: no € cap. */
function isPaidInviteCategory(category: OutingCategory): boolean {
  return category === 'restaurant' || category === 'bar';
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

const DAY_PILLS: { id: 0 | 1 | 2; label: string }[] = [
  { id: 0, label: 'Aujourd’hui' },
  { id: 1, label: 'Demain' },
  { id: 2, label: 'Après-demain' },
];

function dateStrForOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return formatDateInput(d);
}

/**
 * Jour : Aujourd’hui / Demain / Après-demain / Autre (date libre JJ/MM).
 * `dateStr` reste au format JJ/MM/AAAA (buildStartsAt inchangé).
 */
function DayPills({
  dateStr,
  onChangeDateStr,
}: {
  dateStr: string;
  onChangeDateStr: (next: string) => void;
}) {
  const [otherText, setOtherText] = useState('');
  const matched = DAY_PILLS.find((p) => dateStrForOffset(p.id) === dateStr.trim());
  const parsedOther = parseFreeDate(otherText);

  // Remise à zéro externe (publication, préremplissage) → vider « Autre ».
  useEffect(() => {
    if (!otherText.trim()) return;
    const res = parseFreeDate(otherText);
    const expected = res.ok ? ymdToFr(res.ymd) : otherText;
    if (dateStr !== expected) setOtherText('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr]);

  const otherActive = otherText.trim() !== '' || !matched;
  const otherValue = otherText !== '' ? otherText : matched ? '' : dateStr;
  const hint = otherText.trim()
    ? parsedOther.ok
      ? `Le ${formatYmdShort(parsedOther.ymd)}`
      : freeDateHint(parsedOther)
    : null;

  return (
    <PillsWithOther
      look="outline"
      options={DAY_PILLS}
      selected={matched?.id ?? null}
      onSelect={(id) => {
        setOtherText('');
        onChangeDateStr(dateStrForOffset(id));
      }}
      otherActive={otherActive}
      otherValue={otherValue}
      onChangeOther={(t) => {
        const cleaned = t.replace(/[^0-9/.\- ]/g, '').slice(0, 10);
        setOtherText(cleaned);
        const res = parseFreeDate(cleaned);
        onChangeDateStr(res.ok ? ymdToFr(res.ymd) : cleaned);
      }}
      placeholder="ex. 12/10"
      keyboardType="numbers-and-punctuation"
      maxLength={10}
      inputWidth={104}
      hint={hint}
      accessibilityLabel="Autre jour, date JJ/MM"
    />
  );
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
  const openProfile = useOpenUserProfile();
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
  const [budgetMaxEuros, setBudgetMaxEuros] = useState(() => {
    // Host invitation ceiling — never from guest Dispo budget.
    const cat = prefill?.category ?? 'restaurant';
    if (!isPaidInviteCategory(cat)) return 0;
    if (prefill?.budgetMaxEuros != null && prefill.budgetMaxEuros > 0) {
      return prefill.budgetMaxEuros;
    }
    return BUDGET_DEFAULT_EUROS;
  });
  /** Plafond « Autre » : montant libre (vide = pastille). */
  const [budgetOther, setBudgetOther] = useState('');
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
      // Urgent short form → autre = invitation sans montant €.
      setCategory('autre');
      setCategoryDetail((d) => d.trim() || 'Sur place');
      setBudgetMaxEuros(0);
    }
  }, [prefill?.urgentOnSite]);

  useEffect(() => {
    if (!prefill?.fromDispo) return;
    if (prefill.category) {
      setCategory(prefill.category);
      // Culture / sport / autre: no € chips — force 0. Never copy Dispo guest budget.
      if (!isPaidInviteCategory(prefill.category)) {
        setBudgetMaxEuros(0);
      } else {
        setBudgetMaxEuros((prev) =>
          prev <= 0 ? BUDGET_DEFAULT_EUROS : prev,
        );
      }
    }
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


  const enterUrgentMode = () => {
    setUrgentMode(true);
    setMessage(URGENT_ON_SITE_MESSAGE);
    setCapacity(1);
    setCategory('autre');
    setCategoryDetail('Sur place');
    setBudgetMaxEuros(0);
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
      budgetMaxEuros: 0,
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
    setBudgetMaxEuros(BUDGET_DEFAULT_EUROS);
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
      isPaidInviteCategory(category) &&
      budgetOther.trim() &&
      !parseFreeInt(budgetOther, BUDGET_MIN_EUROS, BUDGET_MAX_EUROS).ok
    ) {
      Alert.alert(
        'Montant',
        `Indique un montant entier entre ${BUDGET_MIN_EUROS} et ${BUDGET_MAX_EUROS} €.`,
      );
      return;
    }
    if (isPaidInviteCategory(category) && Math.round(budgetMaxEuros) <= 0) {
      Alert.alert(
        'Budget',
        'Pour un bar ou un restaurant, indique un montant (pastilles ou montant libre).',
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
        'Indique un jour (JJ/MM) et une heure (HH:mm) valides.',
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
        category === 'autre' || category === 'sport'
          ? categoryDetail.trim() || undefined
          : undefined,
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
      budgetMaxEuros: isPaidInviteCategory(category)
        ? Math.round(budgetMaxEuros)
        : 0,
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
      ...(inviteeUserId
        ? { inviteeUserId, inviteeName: inviteeName || undefined }
        : {}),
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
      inviteeName ? 'Proposition envoyée' : 'Annonce publiée',
      inviteeName
        ? `Proposition pour ${inviteeName} — visible dans ses Demandes (démo : quand currentUser = destinataire). Pas publiée sur Annonces.`
        : 'Publication gratuite. L’adresse exacte reste cachée jusqu’à confirmation. (Démo : 5 taps sur Moment → Simuler demande Juliette.)',
    );
    setVenueName('');
    setMessage('');
    setTopic('');
    setExcludedTopics('');
    setFlexibleSlot(false);
    setInviteIncludes('');
    setInviteExtras('');
    setTicketsAlreadyBought(false);
    setInviteeUserId(undefined);
    setInviteeName(undefined);
    setFromDispoBanner(false);
    setCapacity(1);
    setBudgetMaxEuros(BUDGET_DEFAULT_EUROS);
    setBudgetOther('');
    setCategoryDetail('');
    const next = defaultDateTime(false);
    setDateStr(next.dateStr);
    setTimeStr(next.timeStr);
    setWomenOnly(
      !!state.currentUser?.womenOnlyPreference &&
        state.currentUser?.gender === 'femme',
    );
  };

  const me = state.currentUser;
  if (isPartnerClosed(me)) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Créer une annonce</Text>
        </View>
        <View style={styles.blocked}>
          <Text style={styles.blockedTitle}>Compte partenaire fermé</Text>
          <Text style={styles.activeMeta}>
            2e avertissement (annulation ou invitation non honorée) — la
            publication est bloquée. Statut visible dans Profil.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Culture partenaire : jusqu’à 5 invitations le même soir — pas de blocage
  // « 1 annonce active » ici (plafond vérifié à la publication).
  if (isPartnerUser(me) && (!active || isPartnerCultureHost(me))) {
    return <PartnerCreateForm />;
  }

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
              signal d’absence d’un invité Moment.
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
          <TextInput
            style={styles.input}
            value={neighborhood}
            onChangeText={(t) => {
              setNeighborhood(t);
              setShowQuartiers(true);
            }}
            onFocus={() => setShowQuartiers(true)}
            placeholder="Choisis ou écris un quartier (ex. Batignolles)"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            accessibilityLabel="Quartier, choix ou saisie libre"
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

          <Text style={styles.label}>Invitation</Text>
          <View style={styles.budgetCard}>
            <Text style={styles.budgetFreeHint}>
              Sortie sans addition. La caution 20 € reste, pour la venue.
            </Text>
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
            {inviteeName && inviteeUserId ? (
              <Pressable
                onPress={() => openProfile(inviteeUserId)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Voir le profil de ${inviteeName}`}
              >
                <Text style={styles.dispoBannerTitle}>
                  Proposition pour{' '}
                  <Text style={styles.dispoBannerLink}>{inviteeName}</Text>
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.dispoBannerTitle}>
                {inviteeName
                  ? `Proposition pour ${inviteeName}`
                  : 'Depuis Dispo'}
              </Text>
            )}
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
        <PillsWithOther
          look="outline"
          showOtherPill={false}
          options={categories}
          selected={category}
          onSelect={(id) => {
            // Détail libre propre à Autre / Sport : pas de report de l’un à l’autre.
            if (id !== category) setCategoryDetail('');
            setCategory(id);
            if (!isPaidInviteCategory(id)) {
              setBudgetMaxEuros(0);
            } else if (budgetMaxEuros <= 0) {
              setBudgetMaxEuros(BUDGET_DEFAULT_EUROS);
            }
          }}
          otherActive={false}
          otherValue={category === 'autre' || category === 'sport' ? categoryDetail : ''}
          onChangeOther={(t) => {
            // Écrire ici = « Autre » (sauf Sport : précision du sport).
            if (category !== 'autre' && category !== 'sport') {
              setCategory('autre');
              setBudgetMaxEuros(0);
            }
            setCategoryDetail(t);
          }}
          placeholder={
            category === 'sport'
              ? 'Quel sport ? (ex. padel, footing)'
              : category === 'autre'
                ? 'Précise la sortie (ex. balade, café, atelier)'
                : 'Autre : précise (ex. balade, atelier)'
          }
          maxLength={60}
          accessibilityLabel={
            category === 'sport' ? 'Quel sport ?' : 'Autre : précise la sortie'
          }
          hint={
            category === 'autre' && !categoryDetail.trim()
              ? 'Obligatoire pour Autre.'
              : null
          }
        />

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

        <Text style={styles.label}>Jour *</Text>
        <DayPills dateStr={dateStr} onChangeDateStr={setDateStr} />

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
        {!startsAtDate ? (
          <Text style={styles.fieldError}>
            Jour ou heure invalide : JJ/MM et HH:mm.
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

        {isPaidInviteCategory(category) ? (
          <>
            <Text style={styles.label}>J'invite jusqu'à *</Text>
            <Text style={styles.inviteHint}>
              J'invite jusqu'à ce montant, réglé sur place.
            </Text>
            <PillsWithOther
              look="outline"
              options={BUDGET_PRESETS.map((b) => ({ id: b as number, label: `${b} €` }))}
              selected={Math.round(budgetMaxEuros)}
              onSelect={(b) => {
                setBudgetMaxEuros(b);
                setBudgetOther('');
              }}
              otherActive={budgetOther.trim() !== ''}
              otherValue={budgetOther}
              onChangeOther={(t) => {
                const cleaned = t.replace(/[^0-9]/g, '').slice(0, 3);
                setBudgetOther(cleaned);
                const res = parseFreeInt(cleaned, BUDGET_MIN_EUROS, BUDGET_MAX_EUROS);
                if (res.ok) setBudgetMaxEuros(res.value);
              }}
              placeholder="ex. 25"
              keyboardType="number-pad"
              suffix="€"
              maxLength={3}
              inputWidth={72}
              hint={freeIntHint(
                parseFreeInt(budgetOther, BUDGET_MIN_EUROS, BUDGET_MAX_EUROS),
                BUDGET_MIN_EUROS,
                BUDGET_MAX_EUROS,
                '€',
              )}
              hintTone="error"
              accessibilityLabel="Autre montant en euros"
            />
            <View style={[styles.budgetCard, { marginTop: spacing.sm }]}>
              <Slider
                style={styles.slider}
                minimumValue={BUDGET_MIN_EUROS}
                maximumValue={BUDGET_MAX_EUROS}
                step={1}
                value={Math.max(BUDGET_MIN_EUROS, budgetMaxEuros)}
                onValueChange={(v) => {
                  const n = clampCreateBudget(v);
                  setBudgetMaxEuros(n);
                  setBudgetOther(
                    (BUDGET_PRESETS as readonly number[]).includes(n) ? '' : String(n),
                  );
                }}
                minimumTrackTintColor={colors.primary}
                maximumTrackTintColor={colors.border}
                thumbTintColor={colors.primary}
              />
              <View style={styles.budgetEnds}>
                <Text style={styles.budgetHintEnd}>5 € · verre</Text>
                <Text style={styles.budgetHintEnd}>50 € · repas</Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.label}>Invitation</Text>
            <View style={styles.budgetCard}>
              <Text style={styles.budgetFreeHint}>
                Sortie sans addition. La caution 20 € reste, pour la venue.
              </Text>
            </View>
          </>
        )}

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

        <CheckNote center style={styles.publishFreeRow} textStyle={styles.publishFreeLabel}>
          Publication gratuite
        </CheckNote>
        <Text style={styles.publishFreeHint}>
          L'hôte ne paie rien pour publier. L'invité paie les frais Moment +
          caution 20 € à la confirmation (ce n’est pas l’addition).
        </Text>
        <Button title="Publier" onPress={onPublish} style={styles.cta} />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Création depuis un compte lieu (resto / bar / culture).
 * Resto/bar : geste (0/1) + remise (0/1), au moins un — jamais « J’invite
 * jusqu’à X € », pas de pastilles 10/20/30/40, pas de « Gratuit ».
 * Culture : places offertes, 2 places forcées, max 5 invitations le même soir.
 */
function PartnerCreateForm() {
  const navigation = useNavigation<Nav>();
  const { createOuting, state } = useChance();
  const user = state.currentUser!;
  const kind = user.partnerKind ?? 'resto';
  const culture = kind === 'culture';
  const venue = user.partnerVenueName?.trim() || user.firstName;
  const neighborhood = user.partnerNeighborhood || user.neighborhood;

  const initial = defaultDateTime(true);
  const [dateStr, setDateStr] = useState(initial.dateStr);
  const [timeStr, setTimeStr] = useState(initial.timeStr);
  const [capacity, setCapacity] = useState<1 | 2 | 3>(2);
  const [show, setShow] = useState('');
  const [exactAddress, setExactAddress] = useState('');
  const [message, setMessage] = useState(user.partnerPhrase ?? '');
  const [gesture, setGesture] = useState<PartnerGesture | undefined>(
    culture ? undefined : 'dessert',
  );
  const [gestureOther, setGestureOther] = useState('');
  const [discountMode, setDiscountMode] = useState<
    'none' | 'preset' | 'other'
  >('none');
  const [discountPreset, setDiscountPreset] = useState<number>(10);
  const [discountOther, setDiscountOther] = useState('');

  const startsAt = useMemo(
    () => buildStartsAt(dateStr, timeStr),
    [dateStr, timeStr],
  );
  const sameEvening = useMemo(
    () =>
      culture && startsAt
        ? countPartnerCultureSameEvening(
            user.id,
            startsAt.toISOString(),
            state.outings,
            state.requests,
          )
        : 0,
    [culture, startsAt, user.id, state.outings, state.requests],
  );

  const discountPct =
    discountMode === 'preset'
      ? discountPreset
      : discountMode === 'other'
        ? parseLooseInt(discountOther) ?? undefined
        : undefined;
  const offer = culture
    ? undefined
    : {
        ...(gesture ? { gesture } : {}),
        ...(gesture === 'autre' ? { gestureOther } : {}),
        ...(discountPct != null ? { discountPct } : {}),
      };
  const preview = culture
    ? [`${PARTNER_CULTURE_CAPACITY} places offertes`]
    : partnerOfferChips(offer);


  const onPublish = () => {
    if (!exactAddress.trim() || !message.trim()) {
      Alert.alert('Manque un peu', 'Adresse exacte et message sont requis.');
      return;
    }
    if (culture && !show.trim()) {
      Alert.alert('Spectacle', 'Indique le spectacle / l’événement.');
      return;
    }
    if (!startsAt) {
      Alert.alert('Date / heure', 'Format JJ/MM et HH:mm.');
      return;
    }
    if (isStartsAtPast(startsAt.toISOString()) || isDateStrBeforeParisToday(dateStr)) {
      Alert.alert('Date / heure passée', 'Choisis un créneau dans le futur (heure de Paris).');
      return;
    }
    if (!culture) {
      if (gesture === 'autre' && !gestureOther.trim()) {
        Alert.alert('Geste', 'Précise le geste « Autre » (ex. une coupe de crémant).');
        return;
      }
      if (
        discountMode === 'other' &&
        (discountPct == null ||
          discountPct < PARTNER_DISCOUNT_MIN ||
          discountPct > PARTNER_DISCOUNT_MAX)
      ) {
        Alert.alert(
          'Remise',
          `Indique un pourcentage entre ${PARTNER_DISCOUNT_MIN} et ${PARTNER_DISCOUNT_MAX}.`,
        );
        return;
      }
      if (!gesture && discountPct == null) {
        Alert.alert(
          'Offre',
          'Choisis au moins un geste OU une remise (les deux sont cumulables).',
        );
        return;
      }
    }
    const parsed = parseTimeInput(timeStr)!;
    const heure = formatHeureLabel(parsed.h, parsed.m);
    const title = culture
      ? `${show.trim()} · ${heure}`
      : `${venue} · table ${heure}`;
    const result = createOuting({
      title,
      description: message.trim(),
      category: culture ? 'culture' : kind === 'bar' ? 'bar' : 'restaurant',
      neighborhood,
      venueName: venue,
      approxArea: neighborhood,
      exactAddress: exactAddress.trim(),
      startsAt: startsAt.toISOString(),
      capacity: culture ? PARTNER_CULTURE_CAPACITY : capacity,
      womenOnly: false,
      budgetMaxEuros: 0,
      ...(culture ? { ticketsAlreadyBought: true } : { partnerOffer: offer }),
    });
    if (!result.ok) {
      const messages: Record<string, string> = {
        already_active:
          'Ton lieu a déjà une annonce active. Attends la fin ou clôture-la.',
        culture_evening_full: `Déjà ${PARTNER_CULTURE_MAX_SAME_EVENING} invitations ce soir-là (max).`,
        partner_closed: 'Compte partenaire fermé — publication bloquée.',
        partner_offer_required: 'Choisis au moins un geste ou une remise.',
        partner_offer_invalid: 'Offre invalide (texte « Autre » ou % à vérifier).',
        banned: 'Compte suspendu (démo).',
        starts_in_past: 'Ce créneau est déjà passé.',
        no_user: 'Profil manquant.',
      };
      Alert.alert('Impossible', messages[result.reason] ?? result.reason);
      return;
    }
    Alert.alert(
      'Annonce partenaire publiée',
      'Visible dans Annonces avec le badge « Partenaire ». Rien à faire de ton côté : la place est prise automatiquement quand un invité confirme (10 min + caution 20 €).',
    );
    setShow('');
    navigation.navigate('OutingDetail', { outingId: result.outingId });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Annonce partenaire</Text>
        <Text style={styles.sub}>
          {venue} · {PARTNER_KIND_LABELS[kind]} · {neighborhood}
        </Text>
        <View style={styles.partnerInfo}>
          <Text style={styles.partnerInfoTitle}>Zéro clic côté lieu</Text>
          <Text style={styles.partnerInfoBody}>
            L’invité rejoint puis confirme (10 min + caution 20 €) : la place
            est prise automatiquement s’il en reste. Chat ouvert dès la
            confirmation. Plein → annonce clôturée. 0 % de commission.
          </Text>
        </View>

        {culture ? (
          <>
            <Text style={styles.label}>Spectacle / événement *</Text>
            <TextInput
              style={styles.input}
              value={show}
              onChangeText={setShow}
              placeholder="Ex. Première — Les Fourberies"
              placeholderTextColor={colors.textMuted}
            />
          </>
        ) : null}

        <Text style={styles.label}>Jour *</Text>
        <DayPills dateStr={dateStr} onChangeDateStr={setDateStr} />
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
        {!startsAt ? (
          <Text style={styles.fieldError}>
            Jour ou heure invalide : JJ/MM et HH:mm.
          </Text>
        ) : null}

        <Text style={styles.label}>Places *</Text>
        {culture ? (
          <Text style={styles.privacyHint}>
            {PARTNER_CULTURE_CAPACITY} places par invitation (fixe) · {sameEvening}/
            {PARTNER_CULTURE_MAX_SAME_EVENING} invitations ce soir-là · chacune a
            son propre chat. 2 confirmés → clôturée ; 1 confirmé à l’heure → il
            garde sa place ; 0 → l’invitation tombe.
          </Text>
        ) : (
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
        )}

        {culture ? (
          <>
            <Text style={styles.label}>Offre</Text>
            <View style={styles.budgetCard}>
              <Text style={styles.budgetFreeHint}>
                Places offertes (billets au guichet). Pas de geste, pas de
                remise, pas de montant. La caution 20 € reste, pour la venue.
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.label}>Geste offert (optionnel)</Text>
            <PillsWithOther
              look="outline"
              options={PARTNER_GESTURES.filter((g) => g.id !== 'autre')}
              selected={gesture === 'autre' ? null : gesture ?? null}
              onSelect={(id) => {
                setGestureOther('');
                setGesture((cur) => (cur === id ? undefined : id));
              }}
              otherActive={gesture === 'autre'}
              otherValue={gestureOther}
              onPressOther={() => setGesture('autre')}
              onChangeOther={(t) => {
                setGestureOther(t);
                if (t.trim()) setGesture('autre');
                else if (gesture === 'autre') setGesture(undefined);
              }}
              placeholder="ex. une coupe de crémant"
              maxLength={60}
              accessibilityLabel="Autre geste offert"
            />

            <Text style={styles.label}>Remise (optionnel)</Text>
            <PillsWithOther
              look="outline"
              options={PARTNER_DISCOUNT_PRESETS.map((pct) => ({
                id: pct as number,
                label: `−${pct} %`,
              }))}
              selected={discountMode === 'preset' ? discountPreset : null}
              onSelect={(pct) => {
                setDiscountOther('');
                if (discountMode === 'preset' && discountPreset === pct) {
                  setDiscountMode('none');
                } else {
                  setDiscountMode('preset');
                  setDiscountPreset(pct);
                }
              }}
              otherActive={discountMode === 'other'}
              otherValue={discountOther}
              onPressOther={() => setDiscountMode('other')}
              onChangeOther={(t) => {
                const cleaned = t.replace(/[^0-9]/g, '').slice(0, 2);
                setDiscountOther(cleaned);
                if (cleaned) setDiscountMode('other');
                else if (discountMode === 'other') setDiscountMode('none');
              }}
              placeholder="ex. 15"
              keyboardType="number-pad"
              suffix="%"
              maxLength={2}
              inputWidth={64}
              hint={
                discountMode === 'other'
                  ? freeIntHint(
                      parseFreeInt(
                        discountOther,
                        PARTNER_DISCOUNT_MIN,
                        PARTNER_DISCOUNT_MAX,
                      ),
                      PARTNER_DISCOUNT_MIN,
                      PARTNER_DISCOUNT_MAX,
                      '%',
                    )
                  : null
              }
              hintTone="error"
              accessibilityLabel="Autre remise en pourcentage"
            />
            <Text style={styles.privacyHint}>
              Au moins un geste OU une remise — cumulables. Pas de montant
              « J’invite jusqu’à » pour un lieu : chacun règle sa part sur place.
            </Text>
          </>
        )}

        {preview.length ? (
          <View style={[styles.row, { marginTop: spacing.md }]}>
            <Text style={styles.privacyHint}>Aperçu carte : {venue} · Partenaire · </Text>
            {preview.map((c) => (
              <View key={c} style={styles.previewChip}>
                <Text style={styles.previewChipText}>{c}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.label}>Adresse exacte *</Text>
        <TextInput
          style={styles.input}
          value={exactAddress}
          onChangeText={setExactAddress}
          placeholder="Ex. 18 rue des Francs-Bourgeois, 75004 Paris"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
        />
        <Text style={styles.privacyHint}>
          Visible seulement après confirmation de l’invité.
        </Text>

        <Text style={styles.label}>Message *</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={message}
          onChangeText={setMessage}
          placeholder="Ambiance, ce qui attend l’invité…"
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <CheckNote center style={styles.publishFreeRow} textStyle={styles.publishFreeLabel}>
          Publication gratuite · 0 % de commission
        </CheckNote>
        <Text style={styles.publishFreeHint}>
          Caution 20 € par invité confirmé (rendue s’il vient). Lapin ou
          annulation tardive : 6,90 € Moment / 13,10 € pour le lieu. Si tu
          annules avec des confirmés : cautions rendues + 1 avertissement (2e =
          compte partenaire fermé).
        </Text>
        <Button title="Publier" onPress={onPublish} style={styles.cta} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  dispoBannerLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  partnerInfo: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  partnerInfoTitle: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
    marginBottom: 4,
  },
  partnerInfoBody: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  previewChip: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  previewChipText: {
    ...typography.small,
    color: colors.primaryDark,
    fontFamily: fonts.semiBold,
  },
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
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  dispoBannerTitle: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
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
  publishFreeRow: { marginTop: spacing.xl },
  publishFreeLabel: {
    ...typography.bodyStrong,
    color: colors.text,
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
