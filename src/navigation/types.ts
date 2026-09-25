import { NavigatorScreenParams } from '@react-navigation/native';

import { OutingCategory } from '../data/types';

export type CreateOutingParams = {
  fromDispo?: boolean;
  category?: OutingCategory;
  categoryDetail?: string;
  neighborhood?: string;
  budgetMaxEuros?: number;
  topic?: string;
  excludedTopics?: string;
  /** Heure libre préremplie (ex. « 19:30 » ou « 20h »). */
  timeLabel?: string;
  /** Paris calendar-day offset from today (0 = today, 1 = tomorrow). */
  dateOffsetDays?: number;
  flexibleSlot?: boolean;
  /** When proposing from a profile / Dispo card — keep THAT recipient. */
  inviteeUserId?: string;
  inviteeName?: string;
  /**
   * Invitation urgente « Je suis déjà sur place » — short create mode
   * (lieu, quartier, budget, 1 place, message). ≠ Dispo.
   */
  urgentOnSite?: boolean;
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
  HostProfile: { userId: string };
  LeaveReview: { outingId: string; toUserId: string; toUserName: string };
  VenueDetail: {
    venueKey: string;
    venueName: string;
    neighborhood?: string;
  };
};
