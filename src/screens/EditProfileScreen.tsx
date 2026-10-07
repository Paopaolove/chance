import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
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
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { CustomFiltersEditor } from '../components/CustomFiltersEditor';
import { GenderPills } from '../components/GenderPills';
import { PillsWithOther } from '../components/PillsWithOther';
import { useChance } from '../data/ChanceContext';
import {
  INTEREST_SUGGESTIONS,
  SUGGESTED_INTERESTS_MAX,
  isValidFrPhone,
} from '../data/interests';
import { PARIS_NEIGHBORHOODS } from '../data/neighborhoods';
import { Gender } from '../data/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { AGE_REQUIRED_HINT, AGE_UNDERAGE_HINT, parseAdultAge } from '../utils/age';
import { pickProfilePhoto } from '../utils/pickProfilePhoto';

export function EditProfileScreen() {
  const navigation = useNavigation();
  const { state, updateProfile } = useChance();
  const user = state.currentUser;

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [ageText, setAgeText] = useState(
    user?.age != null ? String(user.age) : '',
  );
  const [neighborhood, setNeighborhood] = useState(user?.neighborhood ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [interests, setInterests] = useState<string[]>(
    user?.interests ? [...user.interests] : [],
  );
  const [customFilters, setCustomFilters] = useState<string[]>(
    user?.customFilters ? [...user.customFilters] : [],
  );
  const [photoUri, setPhotoUri] = useState<string | undefined>(user?.photoUri);
  // Plus demandés à l’entrée : tous optionnels ici.
  const [gender, setGender] = useState<Gender | undefined>(user?.gender);
  const [genderDetail, setGenderDetail] = useState(user?.genderDetail ?? '');
  const [womenOnlyPreference, setWomenOnlyPreference] = useState(
    !!user?.womenOnlyPreference,
  );
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [error, setError] = useState('');

  if (!user) {
    return (
      <View style={styles.missing}>
        <Text>Profil manquant</Text>
      </View>
    );
  }

  const toggleInterest = (interest: string) => {
    setInterests((prev) => {
      if (prev.includes(interest)) {
        setError('');
        return prev.filter((i) => i !== interest);
      }
      if (prev.length >= SUGGESTED_INTERESTS_MAX) {
        setError(
          `Max ${SUGGESTED_INTERESTS_MAX} dans la liste — crée le tien dans « Créer un centre d’intérêt ».`,
        );
        return prev;
      }
      setError('');
      return [...prev, interest];
    });
  };

  const onPickPhoto = async () => {
    const uri = await pickProfilePhoto();
    if (uri) setPhotoUri(uri);
  };

  const onSave = () => {
    if (!firstName.trim()) {
      setError('Indique ton prénom.');
      return;
    }
    const age = parseAdultAge(ageText);
    if (age == null) {
      const n = Number.parseInt(ageText.trim(), 10);
      setError(
        Number.isFinite(n) && n < 18 ? AGE_UNDERAGE_HINT : AGE_REQUIRED_HINT,
      );
      return;
    }
    if (!neighborhood.trim()) {
      setError('Indique ton quartier.');
      return;
    }
    if (phone.trim() && !isValidFrPhone(phone)) {
      setError('Numéro FR invalide (ex. 06 12 34 56 78 ou +33 6…).');
      return;
    }
    updateProfile({
      firstName: firstName.trim(),
      age,
      neighborhood: neighborhood.trim(),
      bio: bio.trim(),
      interests,
      customFilters,
      photoUri: photoUri ?? null,
      gender: gender ?? null,
      genderDetail: gender === 'autre' ? genderDetail.trim() || null : null,
      womenOnlyPreference: gender === 'femme' ? womenOnlyPreference : false,
      phone: phone.trim() || null,
    });
    Alert.alert('Profil mis à jour', 'Tes infos sont visibles sur Moment.');
    navigation.goBack();
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.photoBlock}>
        <Pressable onPress={onPickPhoto} accessibilityLabel="Changer la photo">
          <Avatar
            name={firstName || user.firstName}
            photoUri={photoUri}
            seed={user.id}
            size={112}
          />
        </Pressable>
        <Pressable onPress={onPickPhoto}>
          <Text style={styles.photoLink}>
            {photoUri ? 'Changer la photo' : 'Ajouter une photo'}
          </Text>
        </Pressable>
      </View>

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

      <Text style={styles.label}>Âge *</Text>
      <Text style={styles.fieldHint}>18 ans minimum — pas d’âge par défaut.</Text>
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

      <Text style={styles.label}>Quartier (Paris) *</Text>
      <PillsWithOther
        options={PARIS_NEIGHBORHOODS.map((q) => ({ id: q as string, label: q }))}
        selected={neighborhood}
        onSelect={setNeighborhood}
        otherActive={
          neighborhood.trim() !== '' &&
          !(PARIS_NEIGHBORHOODS as readonly string[]).includes(neighborhood)
        }
        otherValue={
          (PARIS_NEIGHBORHOODS as readonly string[]).includes(neighborhood)
            ? ''
            : neighborhood
        }
        onChangeOther={setNeighborhood}
        placeholder="ex. Batignolles"
        maxLength={40}
        accessibilityLabel="Autre quartier"
      />

      <Text style={styles.label}>Téléphone</Text>
      <Text style={styles.fieldHint}>
        Pour la sécurité et les rappels. Demandé avant ton premier moment.
      </Text>
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
        textContentType="telephoneNumber"
      />

      <Text style={styles.label}>Genre (optionnel)</Text>
      <Text style={styles.fieldHint}>
        Pas pour draguer : il sert à l’option « Femmes uniquement ».
      </Text>
      <GenderPills
        gender={gender}
        detail={genderDetail}
        onChange={(g, d) => {
          setGender(g);
          setGenderDetail(d);
          if (g !== 'femme') setWomenOnlyPreference(false);
        }}
      />
      {gender === 'femme' ? (
        <View style={styles.toggleCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Femmes uniquement</Text>
            <Text style={styles.toggleHint}>
              Activé par défaut quand tu publies un moment.
            </Text>
          </View>
          <Switch
            value={womenOnlyPreference}
            onValueChange={setWomenOnlyPreference}
            trackColor={{ true: colors.primary, false: colors.border }}
            ios_backgroundColor={colors.border}
            thumbColor={colors.white}
            accessibilityLabel="Femmes uniquement par défaut"
          />
        </View>
      ) : null}

      <Text style={styles.label}>Bio (optionnel)</Text>
      <TextInput
        selectionColor={colors.primary}
        cursorColor={colors.primary}
        style={[styles.input, styles.multiline]}
        value={bio}
        onChangeText={setBio}
        multiline
        placeholder="Qui es-tu, qu’est-ce que tu aimes faire à Paris…"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>
        Centres d’intérêt (optionnel, max {SUGGESTED_INTERESTS_MAX})
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
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                {interest}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <CustomFiltersEditor
        value={customFilters}
        onChange={setCustomFilters}
        label="Créer un centre d’intérêt"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Enregistrer" onPress={onSave} style={styles.cta} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photoBlock: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  photoLink: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  fieldHint: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: -4,
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
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleLabel: { ...typography.bodyStrong, color: colors.text },
  toggleHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  counter: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.md },
  cta: { marginTop: spacing.xxl },
});
