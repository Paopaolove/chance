import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
import { CustomFiltersEditor } from '../components/CustomFiltersEditor';
import { useChance } from '../data/ChanceContext';
import {
  INTEREST_SUGGESTIONS,
  MAX_BIO_LENGTH,
  SUGGESTED_INTERESTS_MAX,
  SUGGESTED_INTERESTS_MIN,
  isValidFrPhone,
} from '../data/interests';
import { PARIS_NEIGHBORHOODS } from '../data/neighborhoods';
import { AuthProvider, Gender } from '../data/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { pickProfilePhoto } from '../utils/pickProfilePhoto';

const { width } = Dimensions.get('window');

const slides = [
  {
    key: '1',
    titlePrefix: 'Une place pour ',
    titleBold: 'toi',
    titleSuffix: '.',
    body: 'Un repas, un verre, une expo. Partage le moment.',
  },
  {
    key: '2',
    titlePrefix: 'Une vraie ',
    titleBold: 'rencontre',
    titleSuffix: '.',
    body:
      'Pas de fil sans fin.\nPas de swipe.\nUne vraie rencontre autour d’une table, d’un bar ou d’une sortie.',
  },
  {
    key: '3',
    titlePrefix: 'Laisse une ',
    titleBold: 'Chance',
    titleSuffix: '',
    body: 'Crée une sortie. Ou rejoins-en une. Le premier mois est ouvert.',
  },
];

const genders: { id: Gender; label: string }[] = [
  { id: 'femme', label: 'Femme' },
  { id: 'homme', label: 'Homme' },
  { id: 'autre', label: 'Autre' },
];

type Step =
  | 'slides'
  | 'account'
  | 'email'
  | 'phone'
  | 'gender'
  | 'photo'
  | 'profile'
  | 'interests'
  | 'rules'
  | 'neighborhood'
  | 'cta';

export function OnboardingScreen() {
  const { completeOnboarding } = useChance();
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>('slides');
  const [authProvider, setAuthProvider] = useState<AuthProvider | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [womenOnlyPreference, setWomenOnlyPreference] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [firstName, setFirstName] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [customFilters, setCustomFilters] = useState<string[]>([]);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [neighborhood, setNeighborhood] = useState('');
  const [error, setError] = useState('');
  const listRef = useRef<FlatList>(null);

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
    setStep('phone');
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
    setStep('phone');
  };

  const continuePhone = () => {
    if (!isValidFrPhone(phone)) {
      setError('Numéro FR invalide (ex. 06 12 34 56 78 ou +33 6…).');
      return;
    }
    setError('');
    setStep('gender');
  };

  const continueGender = () => {
    if (!gender) {
      setError('Choisis ton genre.');
      return;
    }
    setError('');
    if (gender !== 'femme') {
      setWomenOnlyPreference(false);
    }
    setStep('photo');
  };

  const onPickPhoto = async () => {
    const uri = await pickProfilePhoto();
    if (uri) setPhotoUri(uri);
  };

  const continueProfile = () => {
    if (!firstName.trim()) {
      setError('Indique ton prénom.');
      return;
    }
    if (!bio.trim()) {
      setError('Écris une courte bio.');
      return;
    }
    if (bio.trim().length > MAX_BIO_LENGTH) {
      setError(`Bio : max ${MAX_BIO_LENGTH} caractères.`);
      return;
    }
    setError('');
    setStep('interests');
  };

  const toggleInterest = (interest: string) => {
    setInterests((prev) => {
      if (prev.includes(interest)) {
        setError('');
        return prev.filter((i) => i !== interest);
      }
      if (prev.length >= SUGGESTED_INTERESTS_MAX) {
        setError(
          `Tu peux en choisir jusqu’à ${SUGGESTED_INTERESTS_MAX} dans la liste — ou crée le tien juste en dessous.`,
        );
        return prev;
      }
      setError('');
      return [...prev, interest];
    });
  };

  const continueRules = () => {
    if (!acceptedRules) {
      setError('Accepte les règles et l’essai pour continuer.');
      return;
    }
    setError('');
    setStep('neighborhood');
  };

  const continueNeighborhood = () => {
    if (!neighborhood) {
      setError('Choisis ton quartier à Paris.');
      return;
    }
    setError('');
    setStep('cta');
  };

  const finish = (intent: 'feed' | 'dispo') => {
    if (!authProvider || !gender) return;
    completeOnboarding({
      firstName: firstName.trim(),
      gender,
      neighborhood,
      bio: bio.trim().slice(0, MAX_BIO_LENGTH),
      interests,
      customFilters,
      photoUri,
      phone: phone.trim(),
      authProvider,
      email: email.trim().toLowerCase() || undefined,
      womenOnlyPreference: gender === 'femme' ? womenOnlyPreference : false,
      entryIntent: intent,
      dispoSoir: intent === 'dispo',
    });
  };

  if (step === 'account') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.wrap}>
          <Text style={styles.brand}>Chance</Text>
          <Text style={styles.title}>Crée ton compte</Text>
          <Text style={styles.hint}>
            Connexion démo — Apple / Google / e-mail (aucune donnée envoyée).
          </Text>
          <Button
            title="Continuer avec Apple"
            onPress={() => chooseAuth('apple')}
            style={styles.cta}
          />
          <Button
            title="Continuer avec Google"
            variant="secondary"
            onPress={() => chooseAuth('google')}
            style={styles.secondary}
          />
          <Button
            title="Continuer avec e-mail"
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
        <View style={styles.wrap}>
          <Text style={styles.brand}>Chance</Text>
          <Text style={styles.title}>E-mail</Text>
          <Text style={styles.hint}>Démo locale : rien n’est envoyé.</Text>
          <Text style={styles.label}>E-mail</Text>
          <TextInput
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
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Continuer" onPress={continueEmail} style={styles.cta} />
          <Button
            title="Retour"
            variant="ghost"
            onPress={() => {
              setError('');
              setStep('account');
            }}
            style={styles.secondary}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'phone') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.wrap}>
          <Text style={styles.brand}>Chance</Text>
          <Text style={styles.title}>Ton numéro</Text>
          <Text style={styles.hint}>
            Obligatoire pour la sécurité et les rappels. Format France.
          </Text>
          <Text style={styles.label}>Téléphone *</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="06 12 34 56 78"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Continuer" onPress={continuePhone} style={styles.cta} />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'gender') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.wrap}>
          <Text style={styles.brand}>Chance</Text>
          <Text style={styles.title}>Genre</Text>
          <Text style={styles.hint}>
            Sert à la sécurité, pas au matching dating. Si tu es une femme,
            option Femmes uniquement.
          </Text>
          <View style={styles.row}>
            {genders.map((g) => (
              <Button
                key={g.id}
                title={g.label}
                variant={gender === g.id ? 'primary' : 'ghost'}
                onPress={() => {
                  setGender(g.id);
                  if (g.id !== 'femme') setWomenOnlyPreference(false);
                }}
                style={styles.chipBtn}
              />
            ))}
          </View>
          {gender === 'femme' ? (
            <View style={styles.toggleCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Femmes uniquement</Text>
                <Text style={styles.toggleHint}>
                  S’applique à tes annonces et / ou demandes.
                </Text>
              </View>
              <Switch
                value={womenOnlyPreference}
                onValueChange={setWomenOnlyPreference}
                trackColor={{ true: colors.primarySoft, false: colors.border }}
                thumbColor={
                  womenOnlyPreference ? colors.primary : colors.surface
                }
              />
            </View>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            title="Continuer"
            onPress={continueGender}
            style={styles.cta}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'photo') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.wrap}>
          <Text style={styles.brand}>Chance</Text>
          <Text style={styles.title}>Une photo</Text>
          <Text style={styles.hint}>
            Optionnelle — tu pourras l’ajouter plus tard.
          </Text>
          <Pressable onPress={onPickPhoto} style={styles.photoBox}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoImg} />
            ) : (
              <Text style={styles.photoPlaceholder}>Ajouter une photo</Text>
            )}
          </Pressable>
          <Button title="Choisir une photo" onPress={onPickPhoto} style={styles.cta} />
          <Button
            title={photoUri ? 'Continuer' : 'Passer'}
            variant={photoUri ? 'primary' : 'ghost'}
            onPress={() => setStep('profile')}
            style={styles.secondary}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'profile') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.wrapScroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.brand}>Chance</Text>
          <Text style={styles.title}>Prénom & bio</Text>
          <Text style={styles.hint}>
            Une courte présentation (~{MAX_BIO_LENGTH} caractères max).
          </Text>
          <Text style={styles.label}>Prénom *</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Alex"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.label}>Bio *</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={bio}
            onChangeText={(t) => setBio(t.slice(0, MAX_BIO_LENGTH))}
            placeholder="Qui es-tu, qu’est-ce que tu aimes faire à Paris…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={MAX_BIO_LENGTH}
          />
          <Text style={styles.counter}>
            {bio.trim().length}/{MAX_BIO_LENGTH}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            title="Continuer"
            onPress={continueProfile}
            style={styles.cta}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'interests') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.wrapScroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.brand}>Chance</Text>
          <Text style={styles.title}>Centres d’intérêt</Text>
          <Text style={styles.hint}>
            Optionnel — suggéré {SUGGESTED_INTERESTS_MIN} à{' '}
            {SUGGESTED_INTERESTS_MAX}. Tu peux passer.
          </Text>
          <View style={styles.chips}>
            {INTEREST_SUGGESTIONS.map((interest) => {
              const selected = interests.includes(interest);
              return (
                <Pressable
                  key={interest}
                  onPress={() => toggleInterest(interest)}
                  style={[styles.chip, selected && styles.chipOn]}
                >
                  <Text
                    style={[styles.chipText, selected && styles.chipTextOn]}
                  >
                    {interest}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.counter}>
            {interests.length}/{SUGGESTED_INTERESTS_MAX}
          </Text>
          <CustomFiltersEditor
            value={customFilters}
            onChange={setCustomFilters}
            label="Créer un centre d’intérêt"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            title="Continuer"
            onPress={() => {
              setError('');
              setStep('rules');
            }}
            style={styles.cta}
          />
          <Button
            title="Passer"
            variant="ghost"
            onPress={() => {
              setInterests([]);
              setCustomFilters([]);
              setError('');
              setStep('rules');
            }}
            style={styles.secondary}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'rules') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.wrapScroll}>
          <Text style={styles.brand}>Chance</Text>
          <Text style={styles.title}>Règles & essai</Text>
          <Text style={styles.hint}>
            Chance, c’est partager un repas, un verre ou une sortie culturelle
            à Paris — pas une app de dating. Pas de swipe, pas de chat libre
            dès l’acceptation. Le chat s’ouvre 1 h avant. Caution 20 € à la
            confirmation (démo).
          </Text>
          <View style={styles.rulesBox}>
            <Text style={styles.rulesLine}>• Paris intramuros uniquement</Text>
            <Text style={styles.rulesLine}>
              • 1-to-1 ou 2–3 places (groupes secondaires)
            </Text>
            <Text style={styles.rulesLine}>
              • Une annonce active à la fois · hôte ne paie pas pour publier
            </Text>
            <Text style={styles.rulesLine}>
              • Essai 1 mois illimité, puis 6,90 €/sortie · Essentiel 12,90 €/mois (119 €/an) · Illimité 19,90 €/mois (189 €/an)
            </Text>
          </View>
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
              J’accepte les règles et l’essai 1 mois illimité.
            </Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Continuer" onPress={continueRules} style={styles.cta} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'neighborhood') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.wrapScroll}>
          <Text style={styles.brand}>Chance</Text>
          <Text style={styles.title}>Ton quartier</Text>
          <Text style={styles.hint}>
            Paris intramuros — pas de GPS continu. Choisis ton quartier.
          </Text>
          <View style={styles.chips}>
            {PARIS_NEIGHBORHOODS.map((q) => {
              const selected = neighborhood === q;
              return (
                <Pressable
                  key={q}
                  onPress={() => setNeighborhood(q)}
                  style={[styles.chip, selected && styles.chipOn]}
                >
                  <Text
                    style={[styles.chipText, selected && styles.chipTextOn]}
                  >
                    {q}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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

  if (step === 'cta') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.wrap}>
          <Text style={styles.brand}>Chance</Text>
          <Text style={styles.title}>Prêt·e ?</Text>
          <Text style={styles.hint}>
            Dispo ce soir pour une sortie improvisée, ou parcours les
            annonces autour de toi.
          </Text>
          <Button
            title="Dispo ce soir"
            onPress={() => finish('dispo')}
            style={styles.cta}
          />
          <Button
            title="Voir les annonces"
            variant="secondary"
            onPress={() => finish('feed')}
            style={styles.secondary}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.brand}>Chance</Text>
      </View>
      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Text style={styles.slideTitle}>
              <Text style={styles.slideTitlePlain}>{item.titlePrefix}</Text>
              <Text style={styles.slideTitleBold}>{item.titleBold}</Text>
              {item.titleSuffix ? (
                <Text style={styles.slideTitlePlain}>{item.titleSuffix}</Text>
              ) : null}
            </Text>
            <Text style={styles.slideBody}>{item.body}</Text>
          </View>
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
          title={index === slides.length - 1 ? 'Continuer' : 'Suivant'}
          onPress={goNextSlide}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  brand: {
    ...typography.subtitle,
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  slide: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    justifyContent: 'center',
  },
  slideTitle: {
    ...typography.hero,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  slideTitlePlain: {
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
  slideTitleBold: {
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  slideBody: {
    ...typography.body,
    color: colors.textSecondary,
    maxWidth: 320,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 20 },
  wrap: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  wrapScroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginTop: spacing.xl,
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
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  counter: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chipBtn: { paddingHorizontal: spacing.md, minHeight: 44 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.chip,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
  },
  chipTextOn: { color: colors.white },
  cta: { marginTop: spacing.xxl },
  secondary: { marginTop: spacing.md },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.md },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleLabel: { ...typography.bodyStrong, color: colors.text },
  toggleHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  photoBox: {
    alignSelf: 'center',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: spacing.lg,
  },
  photoImg: { width: 140, height: 140 },
  photoPlaceholder: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
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
  acceptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
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
