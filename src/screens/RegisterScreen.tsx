import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { useChance } from '../data/ChanceContext';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Register'>;
type R = RouteProp<RootStackParamList, 'Register'>;

export function RegisterScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const { registerAccount, state } = useChance();
  const [email, setEmail] = useState(state.currentUser?.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const reason = route.params?.reason ?? 'default';
  const subtitle =
    reason === 'after_request'
      ? 'Ta demande est envoyée. Crée ton compte pour qu’on puisse te prévenir et sécuriser la caution.'
      : 'Sans compte, tu restes en mode invité sur cette démo.';

  const onSubmit = () => {
    const cleaned = email.trim().toLowerCase();
    if (!cleaned.includes('@') || cleaned.length < 5) {
      setError('Entre un e-mail valide.');
      return;
    }
    if (password.trim().length < 4) {
      setError('Mot de passe démo : au moins 4 caractères.');
      return;
    }
    registerAccount(cleaned);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.wrap}>
        <Text style={styles.title}>Crée ton compte</Text>
        <Text style={styles.hint}>{subtitle}</Text>
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
        <Button title="Enregistrer mon compte" onPress={onSubmit} style={styles.cta} />
        <Button
          title="Plus tard"
          variant="ghost"
          onPress={() => navigation.goBack()}
          style={styles.secondary}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  wrap: { flex: 1, padding: spacing.xl },
  title: { ...typography.title, color: colors.text, marginBottom: spacing.sm },
  hint: {
    ...typography.body,
    color: colors.textSecondary,
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
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.md },
  cta: { marginTop: spacing.xxl },
  secondary: { marginTop: spacing.md },
});
