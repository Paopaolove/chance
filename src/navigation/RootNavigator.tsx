import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { useChance } from '../data/ChanceContext';
import { ChatPlaceholderScreen } from '../screens/ChatPlaceholderScreen';
import { ConfirmSlotScreen } from '../screens/ConfirmSlotScreen';
import { DispoSoirScreen } from '../screens/DispoSoirScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { OutingDetailScreen } from '../screens/OutingDetailScreen';
import { PaywallScreen } from '../screens/PaywallScreen';
import { LeaveReviewScreen } from '../screens/LeaveReviewScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ReviewsScreen } from '../screens/ReviewsScreen';
import { colors } from '../theme';
import { MainTabs } from './MainTabs';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { state } = useChance();

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.primaryDark,
          headerTitleStyle: { fontWeight: '600', color: colors.text },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {!state.onboardingDone || !state.currentUser ? (
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
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="OutingDetail"
              component={OutingDetailScreen}
              options={{ title: 'Sortie' }}
            />
            <Stack.Screen
              name="ConfirmSlot"
              component={ConfirmSlotScreen}
              options={{ title: 'Confirmation' }}
            />
            <Stack.Screen
              name="ChatPlaceholder"
              component={ChatPlaceholderScreen}
              options={{ title: 'Chat' }}
            />
            <Stack.Screen
              name="Paywall"
              component={PaywallScreen}
              options={{ title: 'Abonnements' }}
            />
            <Stack.Screen
              name="DispoSoir"
              component={DispoSoirScreen}
              options={{ title: 'Dispo ce soir' }}
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
              name="LeaveReview"
              component={LeaveReviewScreen}
              options={{ title: 'Noter la sortie' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
