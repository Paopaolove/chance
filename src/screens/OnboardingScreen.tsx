import { Ionicons } from '@expo/vector-icons';
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
import { PillsWithOther } from '../components/PillsWithOther';
import { useChance } from '../data/ChanceContext';
import {
  INTEREST_SUGGESTIONS,
  SUGGESTED_INTERESTS_MAX,
  SUGGESTED_INTERESTS_MIN,
  isValidFrPhone,
} from '../data/interests';
import { PARIS_NEIGHBORHOODS } from '../data/neighborhoods';
import { AuthProvider, EntryIntent, Gender } from '../data/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { AGE_REQUIRED_HINT, AGE_UNDERAGE_HINT, parseAdultAge } from '../utils/age';
import { pickProfilePhoto } from '../utils/pickProfilePhoto';

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
  | 'age'
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
  const [ageText, setAgeText] = useState('');
  const [womenOnlyPreference, setWomenOnlyPreference] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [firstName, setFirstName] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [customFilters, setCustomFilters] = useState<string[]>([]);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [absencesExpanded, setAbsencesExpanded] = useState(false);
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
    setStep('age');
  };

  const continueAge = () => {
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
    setError('');
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
    setError('');
    setStep('interests');
  };

  const skipBio = () => {
    if (!firstName.trim()) {
      setError('Indique ton prénom.');
      return;
    }
    setBio('');
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
      setError('Coche la case pour confirmer que tu as compris.');
      return;
    }
    setError('');
    setStep('neighborhood');
  };

  const continueNeighborhood = () => {
    if (!neighborhood.trim()) {
      setError('Indique ton quartier.');
      return;
    }
    setError('');
    setStep('cta');
  };

  const finish = (intent: EntryIntent) => {
    if (!authProvider || !gender) return;
    const age = parseAdultAge(ageText);
    if (age == null) return;
    completeOnboarding({
      firstName: firstName.trim(),
      age,
      gender,
      neighborhood: neighborhood.trim(),
      bio: bio.trim(),
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
          <Text style={styles.brand}>Moment</Text>
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
        <View style={styles.wrap}>
          <Text style={styles.brand}>Moment</Text>
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
          <Text style={styles.brand}>Moment</Text>
          <Text style={styles.title}>Ton numéro</Text>
          <Text style={styles.hint}>
            Obligatoire pour la sécurité et les rappels. Format France.
          </Text>
          <Text style={styles.label}>Téléphone *</Text>
          <TextInput
            selectionColor={colors.primary}
            cursorColor={colors.primary}
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
          <Text style={styles.brand}>Moment</Text>
          <Text style={styles.title}>Genre</Text>
          <Text style={styles.hint}>
            Pas pour draguer. Le filtre sert à se sentir à l’aise.{'\n'}
            Si tu es une femme, tu peux limiter la sortie aux femmes.
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
                trackColor={{ true: colors.primary, false: colors.border }}
            ios_backgroundColor={colors.border}
                thumbColor={colors.white}
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


  if (step === 'age') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.wrap}>
          <Text style={styles.brand}>Moment</Text>
          <Text style={styles.title}>Ton âge</Text>
          <Text style={styles.hint}>
            Obligatoire — Moment est réservé aux adultes (18 ans et plus). Pas
            d’âge par défaut.
          </Text>
          <Text style={styles.label}>Âge *</Text>
          <TextInput
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={styles.input}
            value={ageText}
            onChangeText={setAgeText}
            placeholder="Ex. 29"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={2}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Continuer" onPress={continueAge} style={styles.cta} />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'photo') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.wrap}>
          <Text style={styles.brand}>Moment</Text>
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
          <Button
            title={photoUri ? 'Changer la photo' : 'Choisir une photo'}
            variant={photoUri ? 'secondary' : 'primary'}
            onPress={onPickPhoto}
            style={styles.cta}
          />
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
          <Text style={styles.brand}>Moment</Text>
          <Text style={styles.title}>Prénom & bio</Text>
          <Text style={styles.hint}>
            Prénom obligatoire. Bio optionnelle — tu pourras la modifier plus
            tard.
          </Text>
          <Text style={styles.label}>Prénom *</Text>
          <TextInput
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Alex"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.label}>Bio (optionnel)</Text>
          <TextInput
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={[styles.input, styles.multiline]}
            value={bio}
            onChangeText={setBio}
            placeholder="Qui es-tu, qu’est-ce que tu aimes faire à Paris…"
            placeholderTextColor={colors.textMuted}
            multiline
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            title="Continuer"
            onPress={continueProfile}
            style={styles.cta}
          />
          <Button
            title="Passer"
            variant="ghost"
            onPress={skipBio}
            style={styles.secondary}
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
          <Text style={styles.brand}>Moment</Text>
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
          <Text style={styles.brand}>Moment</Text>
          <Text style={styles.title}>Comment ça marche</Text>
          <View style={styles.disclaimerBox}>
            <Text style={styles.disclaimerLead}>
              Moment n’est pas une appli pour draguer.
            </Text>
            <Text style={styles.disclaimerLead}>
              On ne swipe pas. On ne cherche pas quelqu’un.
            </Text>
            <Text style={styles.disclaimerLead}>
              On partage une table, un verre ou une sortie.
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
                Un imprévu, tu peux le signaler une fois par sortie, avec une
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

  if (step === 'neighborhood') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.wrapScroll}>
          <Text style={styles.brand}>Moment</Text>
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

  if (step === 'cta') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.wrap}>
          <Text style={styles.brand}>Moment</Text>
          <Text style={styles.title}>Prêt ?</Text>
          <Text style={styles.hint}>
            Invite à ta table, parcours les invitations autour de toi, ou
            indique que tu es dispo.
          </Text>
          <Button
            title="J’invite"
            onPress={() => finish('create')}
            style={styles.cta}
          />
          <Button
            title="Voir les invitations"
            variant="ghost"
            onPress={() => finish('feed')}
            style={styles.secondaryOutline}
          />
          <Pressable
            onPress={() => finish('dispo')}
            style={styles.textLinkWrap}
            accessibilityRole="link"
            accessibilityLabel="Pas de resto en tête ? Indiquer que je suis dispo"
          >
            <Text style={styles.textLink}>
              Pas de resto en tête ? Indiquer que je suis dispo
            </Text>
          </Pressable>
        </View>
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
    borderWidth: 1,
    borderColor: colors.chipBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  chipOn: { backgroundColor: colors.chipActive, borderColor: colors.chipActive },
  chipText: {
    ...typography.caption,
    color: colors.chipText,
    fontFamily: fonts.semiBold,
  },
  chipTextOn: { color: colors.white },
  cta: { marginTop: spacing.xxl },
  secondary: { marginTop: spacing.md },
  secondaryOutline: {
    marginTop: spacing.md,
    borderColor: colors.border,
  },
  textLinkWrap: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  textLink: {
    ...typography.body,
    color: colors.text,
    textAlign: 'center',
    textDecorationLine: 'underline',
    fontFamily: fonts.medium,
  },
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
    backgroundColor: colors.surface,
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
