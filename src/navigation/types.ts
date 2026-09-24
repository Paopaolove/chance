import { NavigatorScreenParams } from '@react-navigation/native';

import { OutingCategory } from '../data/types';

export type CreateOutingParams = {
  fromDispo?: boolean;
  category?: OutingCategory;
  neighborhood?: string;
  budgetMaxEuros?: number;
  topic?: string;
  excludedTopics?: string;
  /** Heure libre préremplie (ex. « 19:30 » ou « 20h »). */
  timeLabel?: string;
  flexibleSlot?: boolean;
};

export type MainTabParamList = {
  Feed: undefined;
  Create: CreateOutingParams | undefined;
  Requests: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  OutingDetail: { outingId: string };
  ConfirmSlot: { requestId: string };
  ChatPlaceholder: { outingId: string; requestId?: string };
  Imprevu: { outingId: string; requestId?: string };
  Paywall: { returnToConfirmRequestId?: string } | undefined;
  DispoSoir: undefined;
  EditProfile: undefined;
  Register: { reason?: 'after_request' | 'default' } | undefined;
  Reviews: { userId: string; userName: string };
  LeaveReview: { outingId: string; toUserId: string; toUserName: string };
};
