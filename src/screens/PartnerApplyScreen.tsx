import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { useChance } from '../data/ChanceContext';
import { PartnerKind } from '../data/types';
import { RootStackParamList } from '../navigation/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { PARTNER_KIND_LABELS } from '../utils/partners';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const KINDS: PartnerKind[] = ['resto', 'bar', 'culture'];

/**
 * Profil → « Je représente un lieu » : fiche lieu.
 * Après envoi : statut « Demande envoyée » (visible dans Profil seulement).
 * Validation par l’équipe Moment (démo : menu QA).
 */
export function PartnerApplyScreen() {
  const navigation = useNavigation<Nav>();
  const { state, submitPartnerApplication } = useChance();
  const user = state.currentUser;

  const [venueName, setVenueName] = useState(user?.partnerVenueName ?? '');
  const [kind, setKind] = useState<PartnerKind>(user?.partnerKind ?? 'resto');
  const [neighborhood, setNeighborhood] = useState(
    user?.partnerNeighborhood ?? '',
  );
  const [phone, setPhone] = useState(user?.partnerPhone ?? '');
  const [phrase, setPhrase] = useState(user?.partnerPhrase ?? '');

  const canSubmit =
    venueName.trim().length > 1 &&
    neighborhood.trim().length > 1 &&
    phone.replace(/\D/g, '').length >= 9;

  const onSubmit = () => {
    const res = submitPartnerApplication({
      venueName: venueName.trim(),
      kind,
      neighborhood: neighborhood.trim(),
      phone: phone.trim(),
      phrase: phrase.trim(),
    });
    if (!res.ok) {
      const msg: Record<string, string> = {
        already_pending: 'Ta demande est déjà en cours de vérification.',
        already_partner: 'Ton lieu est déjà partenaire.',
        partner_closed:
          'Le compte partenaire de ce lieu a été fermé (2 avertissements).',
        missing_fields: 'Nom du lieu, quartier et téléphone sont requis.',
      };
      Alert.alert('Demande impossible', msg[res.reason] ?? res.reason);
      return;
    }
    Alert.alert(
      'Demande envoyée',
      'L’équipe Moment vérifie ton lieu (en général sous 48 h). Tu restes particulier en attendant — le statut est visible dans ton Profil.',
      [{ text: 'OK', onPress: () => navigation.goBack() }],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Je représente un lieu</Text>
          <Text style={styles.lead}>
            Resto, bar ou lieu culturel : publie des invitations (un geste, une
            remise ou des places offertes). 0 % de commission, pas de paiement
            en ligne.
          </Text>

          <Text style={styles.label}>Nom du lieu</Text>
          <TextInput
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={styles.input}
            value={venueName}
            onChangeText={setVenueName}
            placeholder="Ex. Le Frank"
            placeholderTextColor={colors.textMuted}
            maxLength={60}
          />

          <Text style={styles.label}>Type de lieu</Text>
          <View style={styles.chips}>
            {KINDS.map((k) => {
              const active = k === kind;
              return (
                <Pressable
                  key={k}
                  onPress={() => setKind(k)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {PARTNER_KIND_LABELS[k]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Quartier</Text>
          <TextInput
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={styles.input}
            value={neighborhood}
            onChangeText={setNeighborhood}
            placeholder="Ex. Le Marais, Oberkampf…"
            placeholderTextColor={colors.textMuted}
            maxLength={40}
          />

          <Text style={styles.label}>Téléphone du lieu</Text>
          <TextInput
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="01 23 45 67 89"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            maxLength={20}
          />
          <Text style={styles.hint}>
            Utilisé seulement par l’équipe Moment pour vérifier le lieu.
          </Text>

          <Text style={styles.label}>Une phrase sur le lieu (facultatif)</Text>
          <TextInput
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={[styles.input, styles.multiline]}
            value={phrase}
            onChangeText={setPhrase}
            placeholder="Ex. Bistrot de quartier, cuisine du marché."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={140}
          />

          <Button
            title="Envoyer la demande"
            onPress={onSubmit}
            disabled={!canSubmit}
            style={{ marginTop: spacing.xl }}
          />
          <Text style={styles.hint}>
            Pas de SIRET demandé. Si la demande est refusée, tu restes
            particulier.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  title: { ...typography.title, color: colors.text },
  lead: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.text },
  chipTextActive: { color: colors.white },
});
