import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { PillsWithOther } from '../components/PillsWithOther';
import { useChance } from '../data/ChanceContext';
import { PARIS_NEIGHBORHOODS } from '../data/neighborhoods';
import { AuthProvider } from '../data/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { AGE_REQUIRED_HINT, AGE_UNDERAGE_HINT, parseAdultAge } from '../utils/age';

const { width } = Dimensions.get('window');

/**
 * 3 slides avant le tunnel : grand titre 34 à gauche (« partager. » / « Moment » en orange,
 * slide 2 sans mot en couleur),
 * beaucoup d’air. Rien sur la caution / les 10 min / le joker ici (c’est dans
 * « Comment ça marche », plus loin dans le tunnel).
 */
type SlideLine = {
  /** Mot en gras en début de ligne (ex. « Sport. »). */
  lead?: string;
  text: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Ligne mise à part (plus d’espace avant). */
  apart?: boolean;
};

const slides: {
  key: string;
  titleBefore: string;
  titleGreen: string;
  titleAfter: string;
  lines: SlideLine[];
}[] = [
  {
    key: '1',
    titleBefore: 'Un moment à ',
    titleGreen: 'partager.',
    titleAfter: '',
    lines: [
      { text: 'Pas de fil sans fin, pas de swipe.' },
      { text: 'L’échange d’abord.', apart: true },
      { text: 'Personne à convoiter.' },
      { text: 'Un moment à partager.' },
    ],
  },
  {
    key: '2',
    titleBefore: 'Autour d’une ',
    titleGreen: 'table',
    titleAfter: '. Ou pas.',
    lines: [
      { lead: 'Sport.', text: 'Foot, course, salle.', icon: 'football-outline' },
      { lead: 'Culture.', text: 'Expo, théâtre, concert.', icon: 'ticket-outline' },
      { lead: 'Table.', text: 'Resto, bar.', icon: 'restaurant-outline' },
      { text: 'On vient pour le moment. Pas pour un rencard.', apart: true },
    ],
  },
  {
    key: '3',
    titleBefore: 'Prends un ',
    titleGreen: 'Moment',
    titleAfter: '.',
    lines: [
      { text: 'Propose un moment. Ou rejoins-en un.' },
      { text: 'Le premier mois est offert.' },
    ],
  },
];

/**
 * Tunnel court après les slides : 4 étapes, rien de plus.
 * 1. Compte (Apple / Google / e-mail, démo) → 2. Prénom + âge →
 * 3. Quartier → 4. Règles (« Comment ça marche ») → l’app (Autour de toi).
 * Photo, téléphone, genre, intérêts : demandés plus tard (Profil, premier
 * moment, option « Femmes uniquement »).
 */
type Step = 'slides' | 'account' | 'email' | 'identity' | 'neighborhood' | 'rules';

const TUNNEL_STEPS = 4;

/** Indicateur discret « 1/4 » + 4 barres (encre / liseré, pas d’orange). */
function StepBars({
  current,
  onBack,
}: {
  current: 1 | 2 | 3 | 4;
  onBack?: () => void;
}) {
  return (
    <View style={styles.stepHeader}>
      <View style={styles.stepHeaderTop}>
        <Text style={styles.brand}>Moment</Text>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Text style={styles.backLink}>Retour</Text>
          </Pressable>
        ) : null}
      </View>
      <View
        style={styles.stepBarsRow}
        accessible
        accessibilityLabel={`Étape ${current} sur ${TUNNEL_STEPS}`}
      >
        <View style={styles.stepBars}>
          {Array.from({ length: TUNNEL_STEPS }, (_, i) => (
            <View
              key={i}
              style={[styles.stepBar, i < current && styles.stepBarOn]}
            />
          ))}
        </View>
        <Text style={styles.stepCount}>
          {current}/{TUNNEL_STEPS}
        </Text>
      </View>
    </View>
  );
}

export function OnboardingScreen() {
  const { completeOnboarding } = useChance();
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>('slides');
  const [authProvider, setAuthProvider] = useState<AuthProvider | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [ageText, setAgeText] = useState('');
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [absencesExpanded, setAbsencesExpanded] = useState(false);
  const [neighborhood, setNeighborhood] = useState('');
  const [error, setError] = useState('');
  const listRef = useRef<FlatList>(null);

  const go = (next: Step) => {
    setError('');
    setStep(next);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const goNextSlide = () => {
    if (index < slides.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
      return;
    }
    setStep('account');
  };

  const chooseAuth = (provider: AuthProvider) => {
    setError('');
    setAuthProvider(provider);
    if (provider === 'email') {
      setStep('email');
      return;
    }
    // Apple / Google mocked
    setEmail(
      provider === 'apple' ? 'toi@icloud.com' : 'toi@gmail.com',
    );
    setStep('identity');
  };

  const continueEmail = () => {
    const cleaned = email.trim().toLowerCase();
    if (!cleaned.includes('@') || cleaned.length < 5) {
      setError('Entre un e-mail valide.');
      return;
    }
    if (password.trim().length < 4) {
      setError('Mot de passe démo : au moins 4 caractères.');
      return;
    }
    setError('');
    setAuthProvider('email');
    setStep('identity');
  };

  const continueIdentity = () => {
    if (!firstName.trim()) {
      setError('Indique ton prénom.');
      return;
    }
    const age = parseAdultAge(ageText);
    if (age == null) {
      const n = Number.parseInt(ageText.trim(), 10);
      if (Number.isFinite(n) && n < 18) {
        setError(AGE_UNDERAGE_HINT);
      } else {
        setError(AGE_REQUIRED_HINT);
      }
      return;
    }
    go('neighborhood');
  };

  const continueNeighborhood = () => {
    if (!neighborhood.trim()) {
      setError('Indique ton quartier.');
      return;
    }
    go('rules');
  };

  /** Règles comprises → directement dans l’app (Autour de toi). */
  const continueRules = () => {
    if (!acceptedRules) {
      setError('Coche la case pour confirmer que tu as compris.');
      return;
    }
    if (!authProvider) {
      go('account');
      return;
    }
    const age = parseAdultAge(ageText);
    if (age == null || !firstName.trim()) {
      go('identity');
      return;
    }
    if (!neighborhood.trim()) {
      go('neighborhood');
      return;
    }
    setError('');
    completeOnboarding({
      firstName: firstName.trim(),
      age,
      neighborhood: neighborhood.trim(),
      authProvider,
      email: email.trim().toLowerCase() || undefined,
      entryIntent: 'feed',
    });
  };

  if (step === 'account') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.wrap}>
          <StepBars current={1} />
          <Text style={styles.title}>Crée ton compte</Text>
          <Text style={styles.hint}>
            Connexion simulée (démo) — Apple / Google / e-mail. Ce n’est pas une
            vraie authentification : aucune donnée n’est envoyée.
          </Text>
          <Button
            title="Continuer avec Apple (démo)"
            onPress={() => chooseAuth('apple')}
            style={styles.cta}
          />
          <Button
            title="Continuer avec Google (démo)"
            variant="secondary"
            onPress={() => chooseAuth('google')}
            style={styles.secondary}
          />
          <Button
            title="Continuer avec e-mail (démo)"
            variant="ghost"
            onPress={() => chooseAuth('email')}
            style={styles.secondary}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'email') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.wrapScroll}
          keyboardShouldPersistTaps="handled"
        >
          <StepBars current={1} onBack={() => go('account')} />
          <Text style={styles.title}>E-mail</Text>
          <Text style={styles.hint}>Démo locale : rien n’est envoyé.</Text>
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="toi@email.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />
          <Text style={styles.label}>Mot de passe</Text>
          <TextInput
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Continuer" onPress={continueEmail} style={styles.cta} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'identity') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.wrapScroll}
          keyboardShouldPersistTaps="handled"
        >
          <StepBars
            current={2}
            onBack={() => go(authProvider === 'email' ? 'email' : 'account')}
          />
          <Text style={styles.title}>Toi, en deux mots</Text>
          <Text style={styles.hint}>
            Ton prénom, pour qu’on sache comment t’appeler. Ton âge, parce que
            Moment est réservé aux 18 ans et plus.
          </Text>
          <Text style={styles.label}>Prénom</Text>
          <TextInput
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={styles.input}
            value={firstName}
            onChangeText={(t) => {
              setFirstName(t);
              if (error) setError('');
            }}
            placeholder="Alex"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            returnKeyType="next"
          />
          <Text style={styles.label}>Âge</Text>
          <TextInput
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={[styles.input, styles.inputAge]}
            value={ageText}
            onChangeText={(t) => {
              setAgeText(t);
              if (error) setError('');
            }}
            placeholder="Ex. 29"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={2}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            title="Continuer"
            onPress={continueIdentity}
            style={styles.cta}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'neighborhood') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.wrapScroll}
          keyboardShouldPersistTaps="handled"
        >
          <StepBars current={3} onBack={() => go('identity')} />
          <Text style={styles.title}>Ton quartier</Text>
          <Text style={styles.hint}>
            Pas de GPS continu. Choisis un quartier ou écris le tien.
          </Text>
          <PillsWithOther
            options={PARIS_NEIGHBORHOODS.map((q) => ({ id: q as string, label: q }))}
            selected={neighborhood}
            onSelect={(q) => {
              setNeighborhood(q);
              setError('');
            }}
            otherActive={
              neighborhood.trim() !== '' &&
              !(PARIS_NEIGHBORHOODS as readonly string[]).includes(neighborhood)
            }
            otherValue={
              (PARIS_NEIGHBORHOODS as readonly string[]).includes(neighborhood)
                ? ''
                : neighborhood
            }
            onChangeOther={(t) => {
              setNeighborhood(t);
              setError('');
            }}
            placeholder="ex. Batignolles"
            maxLength={40}
            accessibilityLabel="Autre quartier"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            title="Continuer"
            onPress={continueNeighborhood}
            style={styles.cta}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'rules') {
    const steps: { text: string; caption?: string }[] = [
      {
        text:
          'Tu invites à ta table jusqu’à un montant que tu choisis — ou tu rejoins une invitation.',
        caption:
          'Une expo, une place. Rien à régler sur place.\nUn dîner, tu invites pour 20 €. Tu règles sur place.',
      },
      {
        text: 'Si on t’accepte, tu as 10 minutes pour dire oui.',
      },
      {
        text:
          'Tu laisses 20 € de caution : c’est ton engagement à venir, pas le repas.',
        caption: 'On te les rend si tu es là.',
      },
      {
        text: 'Vous vous écrivez seulement 1 heure avant.',
      },
    ];
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.wrapScroll}>
          <StepBars current={4} onBack={() => go('neighborhood')} />
          <Text style={styles.title}>Comment ça marche</Text>
          <View style={styles.disclaimerBox}>
            <Text style={styles.disclaimerLead}>
              Moment n’est pas une appli pour draguer.
            </Text>
            <Text style={styles.disclaimerLead}>
              On ne swipe pas. On ne cherche pas quelqu’un.
            </Text>
            <Text style={styles.disclaimerLead}>
              On partage une table, un verre ou un moment.
            </Text>
          </View>
          <View style={styles.stepsBox}>
            {steps.map((item, i) => (
              <View key={i} style={styles.stepRow}>
                <Text style={styles.stepNum}>{i + 1}.</Text>
                <View style={styles.stepBody}>
                  <Text style={styles.stepText}>{item.text}</Text>
                  {item.caption ? (
                    <Text style={styles.stepCaption}>{item.caption}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
          <Pressable
            style={styles.accordionHeader}
            onPress={() => setAbsencesExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: absencesExpanded }}
          >
            <Text style={styles.accordionTitle}>Annulation et imprévu</Text>
            <Text style={styles.accordionChevron}>
              {absencesExpanded ? '▴' : '▾'}
            </Text>
          </Pressable>
          {absencesExpanded ? (
            <View style={styles.rulesBox}>
              <Text style={styles.rulesLine}>
                La caution de 20 €, c’est ton engagement à venir.
              </Text>
              <Text style={styles.rulesLine}>
                Ce n’est pas l’addition du restaurant, ni l’abonnement Moment.
              </Text>
              <Text style={styles.rulesLine}>Si tu es là, on te la rend.</Text>
              <Text style={[styles.rulesLine, styles.rulesGap]}>
                Si tu annules au moins 3 heures avant, on te la rend aussi.
              </Text>
              <Text style={styles.rulesLine}>
                Si tu annules trop tard ou tu ne viens pas, tu la perds :
              </Text>
              <Text style={styles.rulesLine}>
                6,90 € pour Moment, 13,10 € pour l’hôte.
              </Text>
              <Text style={[styles.rulesLine, styles.rulesGap]}>
                Un imprévu, tu peux le signaler une fois par moment, avec une
                phrase.
              </Text>
              <Text style={styles.rulesLine}>
                Si l’hôte accepte : caution rendue, ce n’est pas une absence.
              </Text>
              <Text style={[styles.rulesLine, styles.rulesGap]}>
                Tu as un joker par mois.
              </Text>
              <Text style={styles.rulesLine}>
                Même si l’hôte refuse, le joker rend la caution et ce n’est pas
                une absence. L’hôte ne touche rien.
              </Text>
              <Text style={[styles.rulesLine, styles.rulesGap]}>
                Deux absences : tu passes après les autres.
              </Text>
              <Text style={styles.rulesLine}>
                Au bout de trois, le compte est fermé.
              </Text>
              <Text style={[styles.rulesLine, styles.rulesGap]}>
                Si c’est l’hôte qui ne vient pas : un avertissement. La seconde
                fois, le compte est fermé. Les invités récupèrent leur caution.
              </Text>
            </View>
          ) : null}
          <Pressable
            style={styles.acceptRow}
            onPress={() => setAcceptedRules((v) => !v)}
          >
            <View
              style={[styles.checkbox, acceptedRules && styles.checkboxOn]}
            >
              {acceptedRules ? (
                <Text style={styles.checkmark}>✓</Text>
              ) : null}
            </View>
            <Text style={styles.acceptText}>
              J’ai compris les règles et l’essai d’un mois.
            </Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            title="C’est compris"
            onPress={continueRules}
            style={styles.cta}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.brand}>Moment</Text>
      </View>
      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <ScrollView
            style={{ width }}
            contentContainerStyle={styles.slide}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={styles.slideTitle} accessibilityRole="header">
              {item.titleBefore}
              {item.titleGreen ? (
                <Text style={styles.slideTitleGreen}>{item.titleGreen}</Text>
              ) : null}
              {item.titleAfter}
            </Text>
            <View style={styles.slideLines}>
              {item.lines.map((line: SlideLine) => (
                <View
                  key={line.text}
                  style={[styles.slideLineRow, line.apart && styles.slideLineApart]}
                >
                  {line.icon ? (
                    <Ionicons
                      name={line.icon}
                      size={22}
                      color={colors.text}
                      style={styles.slideLineIcon}
                    />
                  ) : null}
                  <Text style={styles.slideLine}>
                    {line.lead ? (
                      <Text style={styles.slideLineLead}>{`${line.lead} `}</Text>
                    ) : null}
                    {line.text}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      />
      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <View
              key={s.key}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>
        <Button
          title={index === slides.length - 1 ? 'Commencer' : 'Suivant'}
          onPress={goNextSlide}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  brand: {
    ...typography.subtitle,
    color: colors.primary,
    fontFamily: fonts.bold,
    letterSpacing: -0.4,
  },
  slide: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.xl,
    paddingBottom: spacing.block,
  },
  slideTitle: {
    ...typography.hero,
    color: colors.text,
    textAlign: 'left',
    marginBottom: spacing.block,
  },
  slideTitleGreen: {
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  slideLines: { gap: spacing.md },
  slideLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  slideLineApart: { marginTop: spacing.lg },
  slideLineIcon: { width: 24 },
  slideLine: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'left',
    flexShrink: 1,
  },
  slideLineLead: {
    fontFamily: fonts.bold,
    color: colors.text,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.text,
    opacity: 0.25,
  },
  dotActive: { backgroundColor: colors.text, width: 20, opacity: 1 },
  wrap: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  wrapScroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  stepHeader: { gap: spacing.md },
  stepHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backLink: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  stepBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepBars: { flex: 1, flexDirection: 'row', gap: 6 },
  stepBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  stepBarOn: { backgroundColor: colors.text },
  stepCount: {
    ...typography.small,
    color: colors.textSecondary,
    minWidth: 28,
    textAlign: 'right',
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xl,
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
  inputAge: { width: 120 },
  cta: { marginTop: spacing.xxl },
  secondary: { marginTop: spacing.md },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.md },
  disclaimerBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  disclaimerLead: {
    ...typography.subtitle,
    fontSize: 20,
    lineHeight: 28,
    color: colors.text,
    fontFamily: fonts.semiBold,
  },
  stepsBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  stepNum: {
    ...typography.subtitle,
    fontSize: 22,
    lineHeight: 30,
    color: colors.text,
    fontFamily: fonts.bold,
    minWidth: 28,
  },
  stepBody: {
    flex: 1,
    gap: spacing.xs,
  },
  stepText: {
    ...typography.subtitle,
    fontSize: 20,
    lineHeight: 28,
    color: colors.text,
  },
  stepCaption: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  accordionTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  accordionChevron: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
  rulesBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  rulesLine: { ...typography.body, color: colors.textSecondary },
  rulesGap: { marginTop: spacing.md },
  acceptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
  acceptText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
});
