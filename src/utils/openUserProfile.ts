import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { useChance } from '../data/ChanceContext';
import { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Open a person's profile.
 * Own userId → Profil tab (private). Anyone else → HostProfile (public, no exact
 * address / phone / chat).
 */
export function navigateToUserProfile(
  navigation: Nav,
  userId: string,
  currentUserId: string | undefined,
): void {
  if (!userId) return;
  if (currentUserId && userId === currentUserId) {
    navigation.navigate('MainTabs', { screen: 'Profile' });
    return;
  }
  navigation.navigate('HostProfile', { userId });
}

/** Hook: tap photo / prénom / notes → profil (self → tab Profil). */
export function useOpenUserProfile(): (userId: string) => void {
  const navigation = useNavigation<Nav>();
  const { state } = useChance();
  const currentUserId = state.currentUser?.id;
  return useCallback(
    (userId: string) => {
      navigateToUserProfile(navigation, userId, currentUserId);
    },
    [navigation, currentUserId],
  );
}
