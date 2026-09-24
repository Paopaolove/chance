import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { useChance } from '../data/ChanceContext';
import { CreateOutingScreen } from '../screens/CreateOutingScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { RequestsScreen } from '../screens/RequestsScreen';
import { colors, fonts } from '../theme';
import { MainTabParamList, RootStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  const { state, clearEntryIntent, incomingRequests, outgoingRequests } =
    useChance();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const requestsBadge = (() => {
    const pendingIncoming = incomingRequests.filter(
      (r) => r.status === 'pending',
    ).length;
    const awaitingConfirm = outgoingRequests.filter(
      (r) => r.status === 'accepted',
    ).length;
    const n = pendingIncoming + awaitingConfirm;
    return n > 0 ? n : undefined;
  })();

  useEffect(() => {
    if (state.entryIntent === 'dispo') {
      clearEntryIntent();
      // Land on Dispo ce soir editor after onboarding CTA
      navigation.navigate('DispoSoir');
    } else if (state.entryIntent === 'feed') {
      clearEntryIntent();
    }
  }, [state.entryIntent, clearEntryIntent, navigation]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 4,
          height: 88,
        },
        tabBarLabelStyle: { fontSize: 11, fontFamily: fonts.semiBold },
        tabBarIcon: ({ color, size }) => {
          const map: Record<
            keyof MainTabParamList,
            keyof typeof Ionicons.glyphMap
          > = {
            Feed: 'compass-outline',
            Create: 'add-circle-outline',
            Requests: 'chatbubbles-outline',
            Profile: 'person-outline',
          };
          return <Ionicons name={map[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{ title: 'Autour de toi' }}
      />
      <Tab.Screen
        name="Create"
        component={CreateOutingScreen}
        options={{ title: 'Publier' }}
      />
      <Tab.Screen
        name="Requests"
        component={RequestsScreen}
        options={{
          title: 'Demandes',
          tabBarBadge: requestsBadge,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            color: colors.white,
            fontSize: 11,
          },
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profil' }}
      />
    </Tab.Navigator>
  );
}
