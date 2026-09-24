import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { CustomFiltersEditor } from '../components/CustomFiltersEditor';
import { useChance } from '../data/ChanceContext';
import {
  INTEREST_SUGGESTIONS,
  SUGGESTED_INTERESTS_MAX,
} from '../data/interests';
import { PARIS_NEIGHBORHOODS } from '../data/neighborhoods';
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
    updateProfile({
      firstName: firstName.trim(),
      age,
      neighborhood: neighborhood.trim(),
      bio: bio.trim(),
      interests,
      customFilters,
      photoUri: photoUri ?? null,
    });
    Alert.alert('Profil mis à jour', 'Tes infos sont visibles sur Chance.');
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
        style={styles.input}
        value={firstName}
        onChangeText={setFirstName}
        placeholder="Alex"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Âge *</Text>
      <Text style={styles.fieldHint}>18 ans minimum — pas d’âge par défaut.</Text>
      <TextInput
        style={styles.input}
        value={ageText}
        onChangeText={setAgeText}
        placeholder="Ex. 29"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        maxLength={2}
      />

      <Text style={styles.label}>Quartier (Paris) *</Text>
      <View style={styles.chips}>
        {PARIS_NEIGHBORHOODS.map((q) => {
          const selected = neighborhood === q;
          return (
            <Pressable
              key={q}
              onPress={() => setNeighborhood(q)}
              style={[styles.chip, selected && styles.chipOn]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                {q}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.label}>Autre quartier</Text>
      <TextInput
        style={styles.input}
        value={
          (PARIS_NEIGHBORHOODS as readonly string[]).includes(neighborhood)
            ? ''
            : neighborhood
        }
        onChangeText={setNeighborhood}
        placeholder="Écris ton quartier…"
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
      />

      <Text style={styles.label}>Bio (optionnel)</Text>
      <TextInput
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
    color: colors.primary,
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
  counter: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.md },
  cta: { marginTop: spacing.xxl },
});
