import {
  DefaultTheme,
  NavigationContainer,
  Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { useChance } from '../data/ChanceContext';
import { ChatPlaceholderScreen } from '../screens/ChatPlaceholderScreen';
import { ImprevuScreen } from '../screens/ImprevuScreen';
import { ConfirmSlotScreen } from '../screens/ConfirmSlotScreen';
import { DispoSoirScreen } from '../screens/DispoSoirScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { AccountScreen, OnboardingScreen } from '../screens/OnboardingScreen';
import { OutingDetailScreen } from '../screens/OutingDetailScreen';
import { PaywallScreen } from '../screens/PaywallScreen';
import { PartnerApplyScreen } from '../screens/PartnerApplyScreen';
import { LeaveReviewScreen } from '../screens/LeaveReviewScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { HostProfileScreen } from '../screens/HostProfileScreen';
import { ReviewsScreen } from '../screens/ReviewsScreen';
import { VenueDetailScreen } from '../screens/VenueDetailScreen';
import { colors } from '../theme';
import { NotificationTapHandler } from '../components/NotificationTapHandler';
import { MainTabs } from './MainTabs';
import { navigationRef } from './navigationRef';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Remplace le bleu iOS par défaut : thème neutre, orange réservé aux accents. */
const chanceNavTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
};


export function RootNavigator() {
  const { state } = useChance();

  return (
    <NavigationContainer ref={navigationRef} theme={chanceNavTheme}>
      <NotificationTapHandler />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600', color: colors.text },
          headerBackTitle: 'Retour',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {!state.slidesSeen && !state.currentUser ? (
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="MainTabs"
              component={MainTabs}
              options={{ headerShown: false, headerBackTitle: 'Retour', title: 'Retour' }}
            />
            <Stack.Screen
              name="Account"
              component={AccountScreen}
              options={{ headerShown: false, presentation: 'fullScreenModal' }}
            />
            <Stack.Screen
              name="OutingDetail"
              component={OutingDetailScreen}
              options={{ title: 'Moment' }}
            />
            <Stack.Screen
              name="ConfirmSlot"
              component={ConfirmSlotScreen}
              options={{ headerShown: false, title: 'Confirmation' }}
            />
            <Stack.Screen
              name="ChatPlaceholder"
              component={ChatPlaceholderScreen}
              options={{ title: 'Chat' }}
            />
            <Stack.Screen
              name="Imprevu"
              component={ImprevuScreen}
              options={{ title: 'Imprévu' }}
            />
            <Stack.Screen
              name="Paywall"
              component={PaywallScreen}
              options={{ title: 'Abonnements' }}
            />
            <Stack.Screen
              name="DispoSoir"
              component={DispoSoirScreen}
              options={{
                title: 'Dispo',
                headerBackTitle: 'Retour',
                headerTintColor: colors.text,
              }}
            />
            <Stack.Screen
              name="EditProfile"
              component={EditProfileScreen}
              options={{ title: 'Modifier le profil' }}
            />
            <Stack.Screen
              name="Register"
              component={RegisterScreen}
              options={{ title: 'Créer un compte', presentation: 'modal' }}
            />
            <Stack.Screen
              name="Reviews"
              component={ReviewsScreen}
              options={{ title: 'Avis' }}
            />
            <Stack.Screen
              name="HostProfile"
              component={HostProfileScreen}
              options={{ title: 'Profil' }}
            />
            <Stack.Screen
              name="LeaveReview"
              component={LeaveReviewScreen}
              options={{ title: 'Comment c’était ?' }}
            />
            <Stack.Screen
              name="PartnerApply"
              component={PartnerApplyScreen}
              options={{ title: 'Je représente un lieu' }}
            />
            <Stack.Screen
              name="VenueDetail"
              component={VenueDetailScreen}
              options={{ title: 'Avis du lieu' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
