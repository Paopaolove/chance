import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from './types';

/** Shared ref — ToastBanner sits outside NavigationContainer in App.tsx. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
