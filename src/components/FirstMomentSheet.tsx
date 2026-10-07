import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChance } from '../data/ChanceContext';
import { isValidFrPhone } from '../data/interests';
import { User } from '../data/types';
import { colors, fonts, radius, spacing, typography } from '../theme';
import { pickProfilePhoto } from '../utils/pickProfilePhoto';
import { Avatar } from './Avatar';
import { Button } from './Button';

/**
 * « Avant ton premier moment » — ce qu’on ne demande plus à l’entrée.
 *
 * - Téléphone : requis avant de publier / demander à rejoindre / confirmer
 *   (il l’était à l’entrée : sécurité et rappels). Tant qu’il manque, la
 *   feuille revient.
 * - Photo : proposée une seule fois (jamais imposée) ; `momentPromptSeen`
 *   évite de la redemander à chaque moment.
 *
 * `phoneOnly` : confirmation d’une place (compte à rebours 10 min) — on ne
 * propose pas la photo pour ne pas ralentir.
 */
export type MomentGateMode = 'full' | 'phoneOnly';

export function needsMomentInfo(
  user: User | null | undefined,
  mode: MomentGateMode = 'full',
): boolean {
  if (!user) return false;
  if (!user.phone?.trim()) return true;
  if (mode === 'full' && !user.photoUri && !user.momentPromptSeen) return true;
  return false;
}

/**
 * `requireBeforeMoment(action)` : lance l’action tout de suite si rien ne
 * manque, sinon ouvre la feuille puis enchaîne l’action une fois remplie.
 * Rendre `sheet` dans l’écran.
 */
export function useFirstMomentGate() {
  const { state } = useChance();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<MomentGateMode>('full');
  const pending = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const requireBeforeMoment = useCallback(
    (action: () => void, m: MomentGateMode = 'full') => {
      if (!needsMomentInfo(state.currentUser, m)) {
        action();
        return;
      }
      pending.current = action;
      setMode(m);
      setVisible(true);
    },
    [state.currentUser],
  );

  const onCancel = useCallback(() => {
    pending.current = null;
    setVisible(false);
  }, []);

  const onDone = useCallback(() => {
    setVisible(false);
    const action = pending.current;
    pending.current = null;
    if (!action) return;
    // Laisse la feuille se fermer avant l’action (Alert / navigation iOS).
    timer.current = setTimeout(action, 450);
  }, []);

  const sheet = (
    <FirstMomentSheet
      visible={visible}
      mode={mode}
      onCancel={onCancel}
      onDone={onDone}
    />
  );

  return { requireBeforeMoment, sheet };
}

interface SheetProps {
  visible: boolean;
  mode: MomentGateMode;
  onCancel: () => void;
  onDone: () => void;
}

export function FirstMomentSheet({ visible, mode, onCancel, onDone }: SheetProps) {
  const { state, updateProfile } = useChance();
  const user = state.currentUser;
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setPhone(user?.phone ?? '');
    setPhotoUri(user?.photoUri);
    setError('');
    // Réinitialise à chaque ouverture seulement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!user) return null;

  const needPhone = !user.phone?.trim();
  const offerPhoto = mode === 'full' && !user.photoUri;

  const onPickPhoto = async () => {
    const uri = await pickProfilePhoto();
    if (uri) setPhotoUri(uri);
  };

  const onContinue = () => {
    if (needPhone && !isValidFrPhone(phone)) {
      setError('Numéro FR invalide (ex. 06 12 34 56 78 ou +33 6…).');
      return;
    }
    setError('');
    updateProfile({
      ...(needPhone ? { phone: phone.trim() } : {}),
      ...(photoUri && photoUri !== user.photoUri ? { photoUri } : {}),
      ...(mode === 'full' ? { momentPromptSeen: true } : {}),
    });
    onDone();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.wrap}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Pressable
              onPress={onCancel}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Annuler"
            >
              <Text style={styles.close}>Annuler</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>Avant ton premier moment</Text>
          <Text style={styles.lead}>
            {needPhone
              ? 'Il nous manque juste ton numéro. Ensuite, on continue.'
              : 'Une photo, si tu veux. Ensuite, on continue.'}
          </Text>

          {needPhone ? (
            <View style={styles.block}>
              <Text style={styles.label}>Ton numéro</Text>
              <Text style={styles.fieldHint}>
                Pour la sécurité et les rappels. Format France.
              </Text>
              <TextInput
                selectionColor={colors.primary}
                cursorColor={colors.primary}
                style={styles.input}
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  if (error) setError('');
                }}
                placeholder="06 12 34 56 78"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
              />
            </View>
          ) : null}

          {offerPhoto ? (
            <View style={styles.block}>
              <Text style={styles.label}>Une photo (optionnel)</Text>
              <Pressable
                onPress={onPickPhoto}
                style={styles.photoRow}
                accessibilityRole="button"
                accessibilityLabel={
                  photoUri ? 'Changer la photo' : 'Ajouter une photo'
                }
              >
                <Avatar
                  name={user.firstName}
                  photoUri={photoUri}
                  seed={user.id}
                  size={56}
                />
                <View style={styles.photoText}>
                  <Text style={styles.photoLink}>
                    {photoUri ? 'Changer la photo' : 'Ajouter une photo'}
                  </Text>
                  <Text style={styles.fieldHint}>
                    Ça aide l’autre à te reconnaître sur place.
                  </Text>
                </View>
              </Pressable>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Continuer" onPress={onContinue} style={styles.cta} />
          <Text style={styles.footnote}>
            Tu pourras tout modifier dans Profil.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  wrap: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screen, paddingTop: spacing.lg },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.md,
  },
  close: { ...typography.bodyStrong, color: colors.text },
  title: { ...typography.title, color: colors.text, marginBottom: spacing.sm },
  lead: { ...typography.body, color: colors.textSecondary },
  block: {
    marginTop: spacing.block,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  label: { ...typography.bodyStrong, color: colors.text },
  fieldHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
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
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  photoText: { flex: 1 },
  photoLink: {
    ...typography.bodyStrong,
    color: colors.text,
    fontFamily: fonts.semiBold,
  },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.md },
  cta: { marginTop: spacing.block },
  footnote: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
