import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import { Alert, AppState as RNAppState } from 'react-native';
import {
  isPastLocalMidnight,
  nextLocalMidnight,
} from '../utils/dispo';
import { ALL_CATEGORIES, mockHosts, mockOutings } from './mockOutings';
import { mockReviews } from './mockReviews';
import {
  AppAction,
  AppState,
  AppToast,
  ChatMessage,
  DispoProfileUpdate,
  LateReport,
  ImprevuMotive,
  ImprevuReport,
  OnboardingInput,
  VenueAlternate,
  Outing,
  OutingCategory,
  PlanId,
  PlanInterval,
  Request,
  Review,
  User,
  UserRatingStats,
} from './types';
import {
  creditsForSubscribe,
  canConfirmOuting as gateCanConfirmOuting,
  ConfirmGateResult,
  shouldConsumeCreditOnConfirm,
} from '../utils/subscription';
import { CANCEL_FREE_BEFORE_HOURS,
  DEPOSIT_EUROS as DEPOSIT_FROM_PRICING,
  isCancelFreeWindow } from './pricing';
import {
  chatThreadKey,
  lateLabel,
  lateSystemText,
} from '../utils/chat';
import {
  imprevuMotiveLabel,
  imprevuNotifTitle,
  normalizeImprevuReason,
} from '../utils/imprevu';
import {
  ensureAndroidChannel,
  scheduleAcceptedConfirmNotifications,
  scheduleChatUnlockNotification,
  simulateDemoNotifications,
  sendPriorityPush,
  type PriorityNotifType,
} from '../utils/notifications';

const CONFIRM_WINDOW_MS = 10 * 60 * 1000;

const initialState: AppState = {
  onboardingDone: false,
  currentUser: null,
  outings: mockOutings,
  requests: [],
  entryIntent: null,
  chatMessages: [],
  reviews: mockReviews,
  lateReports: [],
  imprevuReports: [],
  hostNoShowStrikes: {},
  guestNoShowStrikes: {},
  hostPublishStrikes: {},
  toast: null,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'COMPLETE_ONBOARDING':
      return {
        ...state,
        onboardingDone: true,
        currentUser: action.payload,
        entryIntent: action.entryIntent,
      };

    case 'CLEAR_ENTRY_INTENT':
      return {
        ...state,
        entryIntent: null,
      };

    case 'CREATE_OUTING': {
      const user = state.currentUser;
      if (!user) return state;
      const hasActive = state.outings.some(
        (o) =>
          o.hostId === user.id &&
          (o.status === 'open' || o.status === 'full'),
      );
      if (hasActive) return state;
      return {
        ...state,
        outings: [action.payload, ...state.outings],
      };
    }

    case 'CLOSE_OUTING': {
      return {
        ...state,
        outings: state.outings.map((o) =>
          o.id === action.payload.outingId
            ? { ...o, status: 'closed' as const }
            : o,
        ),
        requests: state.requests.map((r) =>
          r.outingId === action.payload.outingId &&
          (r.status === 'pending' || r.status === 'accepted')
            ? { ...r, status: 'cancelled' as const }
            : r,
        ),
      };
    }

    case 'JOIN_OUTING': {
      const outing = state.outings.find((o) => o.id === action.payload.outingId);
      if (!outing || outing.status !== 'open' || outing.spotsLeft < 1) {
        return state;
      }
      if (outing.womenOnly && state.currentUser?.gender !== 'femme') {
        return state;
      }
      const already = state.requests.some(
        (r) =>
          r.outingId === action.payload.outingId &&
          r.userId === action.payload.userId &&
          (r.status === 'pending' ||
            r.status === 'accepted' ||
            r.status === 'confirmed'),
      );
      if (already) return state;
      return {
        ...state,
        requests: [action.payload, ...state.requests],
      };
    }

    case 'ACCEPT_REQUEST': {
      const req = state.requests.find((r) => r.id === action.payload.requestId);
      if (!req || req.status !== 'pending') return state;
      const outing = state.outings.find((o) => o.id === req.outingId);
      if (!outing || outing.spotsLeft < 1) return state;

      const newSpots = outing.spotsLeft - 1;
      return {
        ...state,
        // Accept this seat; cancel the requester's other pending requests.
        requests: state.requests.map((r) => {
          if (r.id === action.payload.requestId) {
            return {
              ...r,
              status: 'accepted' as const,
              acceptedAt: action.payload.acceptedAt,
              confirmDeadlineAt: action.payload.confirmDeadlineAt,
            };
          }
          if (
            r.userId === req.userId &&
            r.id !== req.id &&
            r.status === 'pending'
          ) {
            return { ...r, status: 'cancelled' as const };
          }
          return r;
        }),
        outings: state.outings.map((o) =>
          o.id === req.outingId
            ? {
                ...o,
                spotsLeft: newSpots,
                status: newSpots === 0 ? ('full' as const) : o.status,
              }
            : o,
        ),
      };
    }

    case 'DECLINE_REQUEST': {
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === action.payload.requestId
            ? { ...r, status: 'declined' as const }
            : r,
        ),
      };
    }

    case 'CONFIRM_SLOT': {
      const req = state.requests.find((r) => r.id === action.payload.requestId);
      if (!req || req.status !== 'accepted') return state;
      if (
        req.confirmDeadlineAt &&
        new Date(action.payload.confirmedAt).getTime() >
          new Date(req.confirmDeadlineAt).getTime()
      ) {
        // Too late — treat as expire
        return reducer(state, {
          type: 'EXPIRE_REQUEST',
          payload: { requestId: action.payload.requestId },
        });
      }
      const outingForRace = state.outings.find((o) => o.id === req.outingId);
      if (outingForRace) {
        const alreadyConfirmed = state.requests.filter(
          (r) =>
            r.outingId === req.outingId &&
            r.status === 'confirmed' &&
            r.id !== req.id,
        );
        // Capacity race: first confirmedAt wins; later confirms lose the seat.
        if (alreadyConfirmed.length >= outingForRace.capacity) {
          return reducer(state, {
            type: 'EXPIRE_REQUEST',
            payload: { requestId: action.payload.requestId },
          });
        }
      }
      const nextUser =
        state.currentUser &&
        (state.currentUser.id === req.userId ||
          state.outings.some(
            (o) => o.id === req.outingId && o.hostId === state.currentUser!.id,
          ))
          ? {
              ...state.currentUser,
              dispoSoir: false,
              dispoExpiresAt: undefined,
            }
          : state.currentUser;
      return {
        ...state,
        currentUser: nextUser,
        requests: state.requests.map((r) =>
          r.id === action.payload.requestId
            ? {
                ...r,
                status: 'confirmed' as const,
                confirmedAt: action.payload.confirmedAt,
                depositStatus: 'held' as const,
              }
            : r,
        ),
      };
    }

    case 'EXPIRE_REQUEST': {
      const req = state.requests.find((r) => r.id === action.payload.requestId);
      if (!req || req.status !== 'accepted') return state;
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === action.payload.requestId
            ? { ...r, status: 'expired' as const }
            : r,
        ),
        outings: state.outings.map((o) =>
          o.id === req.outingId
            ? {
                ...o,
                spotsLeft: o.spotsLeft + 1,
                status: o.status === 'full' ? ('open' as const) : o.status,
              }
            : o,
        ),
      };
    }

    case 'SET_DISPO_SOIR': {
      if (!state.currentUser) return state;
      return {
        ...state,
        currentUser: { ...state.currentUser, dispoSoir: action.payload },
      };
    }

    case 'SET_DISPO_PROFILE': {
      if (!state.currentUser) return state;
      const p = action.payload;
      const clearOrSet = <T,>(
        key: keyof typeof p,
        value: T | null | undefined,
      ): Partial<User> => {
        if (value === undefined) return {};
        if (value === null) return { [key]: undefined } as Partial<User>;
        return { [key]: value } as Partial<User>;
      };
      let next: User = {
        ...state.currentUser,
        ...(p.dispoSoir !== undefined ? { dispoSoir: p.dispoSoir } : {}),
        ...(p.dispoCategories !== undefined
          ? { dispoCategories: p.dispoCategories }
          : {}),
        ...(p.interests !== undefined ? { interests: p.interests } : {}),
        ...(p.bio !== undefined ? { bio: p.bio } : {}),
        ...(p.neighborhood !== undefined
          ? { neighborhood: p.neighborhood }
          : {}),
        ...(p.firstName !== undefined ? { firstName: p.firstName } : {}),
        ...(p.customFilters !== undefined
          ? { customFilters: p.customFilters }
          : {}),
        ...(p.photoUri !== undefined
          ? {
              photoUri: p.photoUri === null ? undefined : p.photoUri,
            }
          : {}),
        ...clearOrSet('dispoBudgetMax', p.dispoBudgetMax),
        ...clearOrSet('dispoSlot', p.dispoSlot),
        ...clearOrSet('dispoNeighborhood', p.dispoNeighborhood),
        ...clearOrSet('dispoTopic', p.dispoTopic),
        ...(p.dispoExclusions !== undefined
          ? {
              dispoExclusions:
                p.dispoExclusions === null
                  ? undefined
                  : p.dispoExclusions,
            }
          : {}),
        ...clearOrSet('dispoExpiresAt', p.dispoExpiresAt),
        ...(p.womenOnlyPreference !== undefined
          ? { womenOnlyPreference: p.womenOnlyPreference }
          : {}),
      };
      if (p.dispoSoir === true && !next.dispoExpiresAt) {
        next = {
          ...next,
          dispoExpiresAt: nextLocalMidnight().toISOString(),
        };
      }
      if (p.dispoSoir === false) {
        next = { ...next, dispoExpiresAt: undefined };
      }
      return { ...state, currentUser: next };
    }

    case 'REGISTER_ACCOUNT': {
      if (!state.currentUser) return state;
      return {
        ...state,
        currentUser: {
          ...state.currentUser,
          registered: true,
          email: action.payload.email,
        },
      };
    }

    case 'SET_PERMISSIONS': {
      if (!state.currentUser) return state;
      return {
        ...state,
        currentUser: {
          ...state.currentUser,
          ...(action.payload.notificationsGranted !== undefined
            ? { notificationsGranted: action.payload.notificationsGranted }
            : {}),
          ...(action.payload.locationGranted !== undefined
            ? { locationGranted: action.payload.locationGranted }
            : {}),
        },
      };
    }

    case 'RESET_DEMO':
      return {
        ...initialState,
        outings: mockOutings,
        requests: [],
        chatMessages: [],
        reviews: mockReviews,
        lateReports: [],
        imprevuReports: [],
        hostNoShowStrikes: {},
        guestNoShowStrikes: {},
        hostPublishStrikes: {},
        toast: null,
      };

    case 'ADD_CHAT_MESSAGE':
      return {
        ...state,
        chatMessages: [...state.chatMessages, action.payload],
      };

    case 'SEED_CHAT_MESSAGES': {
      if (!action.payload.length) return state;
      const key = action.payload[0].threadKey;
      if (state.chatMessages.some((m) => m.threadKey === key)) return state;
      return {
        ...state,
        chatMessages: [...state.chatMessages, ...action.payload],
      };
    }

    case 'REPORT_LATE': {
      const report = action.payload;
      // Keep latest per reporter+outing (+optional request)
      const filtered = state.lateReports.filter(
        (r) =>
          !(
            r.outingId === report.outingId &&
            r.reporterId === report.reporterId &&
            (r.requestId ?? '') === (report.requestId ?? '')
          ),
      );
      return {
        ...state,
        lateReports: [report, ...filtered],
      };
    }

    case 'REPORT_IMPREVU': {
      const report = action.payload;
      const already = state.imprevuReports.some(
        (r) =>
          r.outingId === report.outingId && r.reporterId === report.reporterId,
      );
      if (already) return state;
      return {
        ...state,
        imprevuReports: [report, ...state.imprevuReports],
      };
    }

    case 'RESPOND_IMPREVU': {
      const {
        imprevuId,
        decision,
        respondedAt,
        respondedByUserId,
        forfeitReporterDeposit,
        cancelOuting,
      } = action.payload;
      const report = state.imprevuReports.find((r) => r.id === imprevuId);
      if (!report || report.status !== 'pending') return state;

      const status =
        decision === 'accepted'
          ? ('accepted' as const)
          : decision === 'auto_refused'
            ? ('auto_refused' as const)
            : ('refused' as const);

      let requests = state.requests.map((r) => {
        if (r.outingId !== report.outingId) return r;
        if (cancelOuting && r.status === 'confirmed') {
          if (r.depositStatus === 'held' || !r.depositStatus) {
            return {
              ...r,
              depositStatus: 'returned' as const,
              status: 'cancelled' as const,
            };
          }
          return { ...r, status: 'cancelled' as const };
        }
        if (
          forfeitReporterDeposit &&
          r.userId === report.reporterId &&
          r.status === 'confirmed' &&
          (r.depositStatus === 'held' || !r.depositStatus)
        ) {
          return { ...r, depositStatus: 'forfeited' as const };
        }
        return r;
      });

      if (cancelOuting) {
        requests = requests.map((r) =>
          r.outingId === report.outingId &&
          (r.status === 'pending' || r.status === 'accepted')
            ? { ...r, status: 'cancelled' as const }
            : r,
        );
      }

      const outings = cancelOuting
        ? state.outings.map((o) =>
            o.id === report.outingId
              ? { ...o, status: 'closed' as const }
              : o,
          )
        : state.outings;

      return {
        ...state,
        imprevuReports: state.imprevuReports.map((r) =>
          r.id === imprevuId
            ? {
                ...r,
                status,
                respondedAt,
                respondedByUserId,
              }
            : r,
        ),
        requests,
        outings,
      };
    }

    case 'SET_TOAST':
      return {
        ...state,
        toast: action.payload,
      };

    case 'SHIFT_OUTING_START':
      return {
        ...state,
        outings: state.outings.map((o) =>
          o.id === action.payload.outingId
            ? { ...o, startsAt: action.payload.startsAt }
            : o,
        ),
      };

    case 'SET_PLAN': {
      if (!state.currentUser) return state;
      const p = action.payload;
      return {
        ...state,
        currentUser: {
          ...state.currentUser,
          plan: p.plan,
          planInterval:
            p.planInterval !== undefined
              ? p.planInterval
              : state.currentUser.planInterval,
          outingCredits:
            p.outingCredits !== undefined
              ? p.outingCredits
              : state.currentUser.outingCredits,
          trialEndsAt: p.trialEndsAt ?? state.currentUser.trialEndsAt,
        },
      };
    }

    case 'SIMULATE_TRIAL_END': {
      if (!state.currentUser) return state;
      const past = new Date();
      past.setDate(past.getDate() - 1);
      return {
        ...state,
        currentUser: {
          ...state.currentUser,
          trialEndsAt: past.toISOString(),
          // Keep plan as essai so gate treats as expired trial needing a plan
          plan: 'essai',
          planInterval: null,
          outingCredits: 0,
        },
      };
    }

    case 'CONSUME_OUTING_CREDIT': {
      if (!state.currentUser) return state;
      const credits = state.currentUser.outingCredits ?? 0;
      if (credits <= 0) return state;
      return {
        ...state,
        currentUser: {
          ...state.currentUser,
          outingCredits: credits - 1,
        },
      };
    }

    case 'COMPLETE_OUTING': {
      return {
        ...state,
        outings: state.outings.map((o) =>
          o.id === action.payload.outingId
            ? { ...o, status: 'completed' as const }
            : o,
        ),
      };
    }

    case 'ADD_REVIEW': {
      const exists = state.reviews.some(
        (r) =>
          r.outingId === action.payload.outingId &&
          r.fromUserId === action.payload.fromUserId &&
          r.toUserId === action.payload.toUserId,
      );
      if (exists) return state;
      return {
        ...state,
        reviews: [action.payload, ...state.reviews],
      };
    }

    case 'REPLY_TO_REVIEW': {
      return {
        ...state,
        reviews: state.reviews.map((r) => {
          if (r.id !== action.payload.reviewId) return r;
          if (r.reply) return r; // 1 reply max
          const reply = action.payload.reply.trim();
          if (!reply) return r;
          return { ...r, reply };
        }),
      };
    }

    case 'REQUEST_HIDE_REVIEW_TEXT': {
      const { reviewId, userId } = action.payload;
      return {
        ...state,
        reviews: state.reviews.map((r) => {
          if (r.id !== reviewId) return r;
          if (r.textHidden) return r;
          if (userId !== r.fromUserId && userId !== r.toUserId) return r;
          const consents = new Set(r.hideTextConsentUserIds ?? []);
          consents.add(userId);
          const both =
            consents.has(r.fromUserId) && consents.has(r.toUserId);
          return {
            ...r,
            hideTextConsentUserIds: Array.from(consents),
            ...(both ? { textHidden: true } : {}),
          };
        }),
      };
    }

    case 'REPORT_HOST_NO_SHOW': {
      const { outingId, hostId, strike, banned } = action.payload;
      let currentUser = state.currentUser;
      if (currentUser && currentUser.id === hostId) {
        currentUser = {
          ...currentUser,
          hostNoShowCount: strike,
          banned,
          bannedReason: banned
            ? '2e no-show hôte — compte suspendu (démo)'
            : currentUser.bannedReason,
        };
      }
      return {
        ...state,
        currentUser,
        hostNoShowStrikes: {
          ...state.hostNoShowStrikes,
          [hostId]: strike,
        },
        outings: state.outings.map((o) =>
          o.id === outingId ? { ...o, status: 'closed' as const } : o,
        ),
      };
    }

    case 'SET_USER_BAN_STATE': {
      const { userId, hostNoShowCount, banned, bannedReason } = action.payload;
      // Current user
      let currentUser = state.currentUser;
      if (currentUser && currentUser.id === userId) {
        currentUser = {
          ...currentUser,
          hostNoShowCount,
          banned,
          bannedReason,
        };
      }
      return { ...state, currentUser };
    }

    case 'RETURN_DEPOSITS_FOR_OUTING': {
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.outingId === action.payload.outingId &&
          r.status === 'confirmed' &&
          (r.depositStatus === 'held' || !r.depositStatus)
            ? { ...r, depositStatus: 'returned' as const }
            : r,
        ),
      };
    }

    case 'REPORT_VENUE_CLOSED': {
      const { outingId, alternate } = action.payload;
      return {
        ...state,
        outings: state.outings.map((o) =>
          o.id === outingId
            ? {
                ...o,
                venueIssue: {
                  status: 'alternate_proposed' as const,
                  reportedAt: new Date().toISOString(),
                  alternate,
                  refusedByUserIds: [],
                  acceptedByUserIds: [],
                },
              }
            : o,
        ),
      };
    }

    case 'RESPOND_VENUE_ALTERNATE': {
      const { outingId, userId, decision } = action.payload;
      return {
        ...state,
        outings: state.outings.map((o) => {
          if (o.id !== outingId || !o.venueIssue) return o;
          const issue = o.venueIssue;
          const accepted = new Set(issue.acceptedByUserIds ?? []);
          const refused = new Set(issue.refusedByUserIds ?? []);
          if (decision === 'accepted') {
            accepted.add(userId);
            refused.delete(userId);
          } else {
            refused.add(userId);
            accepted.delete(userId);
          }
          const status =
            decision === 'accepted'
              ? ('alternate_accepted' as const)
              : ('refused' as const);
          return {
            ...o,
            venueIssue: {
              ...issue,
              status,
              acceptedByUserIds: Array.from(accepted),
              refusedByUserIds: Array.from(refused),
            },
            // Apply alternate venue if accepted
            ...(decision === 'accepted' && issue.alternate
              ? {
                  venueName: issue.alternate.venueName,
                  approxArea: issue.alternate.approxArea,
                  exactAddress: issue.alternate.exactAddress,
                  budgetMaxEuros: issue.alternate.budgetMaxEuros,
                  neighborhood: issue.alternate.neighborhood,
                }
              : {}),
          };
        }),
        requests:
          decision === 'refused'
            ? state.requests.map((r) =>
                r.outingId === outingId &&
                r.userId === userId &&
                r.status === 'confirmed'
                  ? { ...r, depositStatus: 'returned' as const }
                  : r,
              )
            : state.requests,
      };
    }

    case 'REPORT_GUEST_NO_SHOW': {
      const { outingId, requestId, guestId, strike, lowerPriority } =
        action.payload;
      let currentUser = state.currentUser;
      if (currentUser && currentUser.id === guestId) {
        currentUser = {
          ...currentUser,
          guestNoShowCount: strike,
          lowerPriority: lowerPriority || currentUser.lowerPriority,
          profileMention: lowerPriority
            ? 'Ghost après confirmation (démo)'
            : currentUser.profileMention,
        };
      }
      return {
        ...state,
        currentUser,
        guestNoShowStrikes: {
          ...state.guestNoShowStrikes,
          [guestId]: strike,
        },
        requests: state.requests.map((r) =>
          r.id === requestId
            ? { ...r, depositStatus: 'forfeited' as const }
            : r,
        ),
        outings: state.outings.map((o) =>
          o.id === outingId ? { ...o, status: 'closed' as const } : o,
        ),
      };
    }

    case 'REPORT_HOST_NEVER_HONOR': {
      const { outingId, hostId, strike, banned } = action.payload;
      let currentUser = state.currentUser;
      if (currentUser && currentUser.id === hostId) {
        currentUser = {
          ...currentUser,
          hostPublishStrikeCount: strike,
          banned: banned || currentUser.banned,
          bannedReason: banned
            ? '2e publication jamais honorée — compte suspendu (démo)'
            : currentUser.bannedReason,
        };
      }
      return {
        ...state,
        currentUser,
        hostPublishStrikes: {
          ...state.hostPublishStrikes,
          [hostId]: strike,
        },
        outings: state.outings.map((o) =>
          o.id === outingId ? { ...o, status: 'closed' as const } : o,
        ),
      };
    }

    case 'RUN_CONFIRM_RACE_DEMO': {
      // Demo: inject two accepted seats, confirm first timestamp, expire the other.
      const { winner, loser, winnerConfirmedAt } = action.payload;
      const without = state.requests.filter(
        (r) => r.id !== winner.id && r.id !== loser.id,
      );
      return {
        ...state,
        requests: [
          {
            ...winner,
            status: 'confirmed' as const,
            confirmedAt: winnerConfirmedAt,
            depositStatus: 'held' as const,
          },
          { ...loser, status: 'expired' as const },
          ...without,
        ],
      };
    }

    default:
      return state;
  }
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Same neighborhood + similar budget (±15 €), else closest budget in quartier. */
function pickAlternateVenue(outing: Outing): VenueAlternate {
  const candidates = mockOutings.filter(
    (o) =>
      o.id !== outing.id &&
      o.neighborhood === outing.neighborhood &&
      Math.abs(o.budgetMaxEuros - outing.budgetMaxEuros) <= 15,
  );
  const pool =
    candidates.length > 0
      ? candidates
      : mockOutings.filter(
          (o) => o.id !== outing.id && o.neighborhood === outing.neighborhood,
        );
  const pick =
    pool[0] ??
    mockOutings.find((o) => o.id !== outing.id) ??
    outing;
  return {
    venueName: pick.venueName + (pick === outing ? ' (bis)' : ''),
    approxArea: pick.approxArea,
    exactAddress: pick.exactAddress,
    budgetMaxEuros: pick.budgetMaxEuros,
    neighborhood: pick.neighborhood,
  };
}

interface ChanceContextValue {
  state: AppState;
  completeOnboarding: (input: OnboardingInput) => void;
  clearEntryIntent: () => void;
  registerAccount: (email: string) => void;
  setPermissions: (input: {
    notificationsGranted?: boolean;
    locationGranted?: boolean;
  }) => void;
  resetDemo: () => void;
  createOuting: (input: {
    title: string;
    description: string;
    category: OutingCategory;
    neighborhood: string;
    venueName: string;
    approxArea: string;
    exactAddress: string;
    startsAt: string;
    capacity: 1 | 2 | 3 | 4;
    womenOnly: boolean;
    budgetMaxEuros: number;
    topic?: string;
    excludedTopics?: string[];
    flexibleSlot?: boolean;
  }) =>
    | { ok: true; outingId: string }
    | { ok: false; reason: 'no_user' | 'already_active' | 'banned' };
  closeOuting: (outingId: string) => void;
  joinOuting: (
    outingId: string,
    message?: string,
  ) => { ok: true; requestId: string } | { ok: false; reason: string };
  acceptRequest: (requestId: string) => void;
  declineRequest: (requestId: string) => void;
  confirmSlot: (
    requestId: string,
  ) =>
    | { ok: true }
    | { ok: false; reason: 'expired' | 'invalid' | 'paywall' | 'race_lost' };
  expireRequestIfNeeded: (requestId: string) => void;
  setDispoSoir: (value: boolean) => void;
  setDispoProfile: (update: DispoProfileUpdate) => void;
  updateProfile: (update: {
    bio?: string;
    interests?: string[];
    customFilters?: string[];
    neighborhood?: string;
    firstName?: string;
    photoUri?: string | null;
  }) => void;
  setPlan: (
    plan: PlanId,
    opts?: {
      planInterval?: PlanInterval | null;
      outingCredits?: number;
      trialEndsAt?: string;
    },
  ) => void;
  /** Mock subscribe: sets plan, interval, credits (no Stripe). */
  subscribe: (
    plan: Exclude<PlanId, 'essai'>,
    interval?: PlanInterval | null,
  ) => void;
  /** Demo: expire trial (J+30) so paywall gates confirms. */
  simulateTrialEnd: () => void;
  canConfirmOuting: () => ConfirmGateResult;
  peopleDispo: User[];
  seedIncomingRequest: (outingId: string) => void;
  simulateHostAccept: (requestId: string) => void;
  getActiveOutingForUser: () => Outing | undefined;
  getOutingById: (id: string) => Outing | undefined;
  getRequestById: (id: string) => Request | undefined;
  canSeeWomenOnly: (outing: Outing) => boolean;
  visibleOutings: Outing[];
  incomingRequests: Request[];
  outgoingRequests: Request[];
  getChatMessages: (outingId: string, requestId?: string) => ChatMessage[];
  ensureChatSeeded: (outingId: string, requestId?: string) => void;
  sendChatMessage: (
    outingId: string,
    text: string,
    requestId?: string,
  ) => void;
  reportLate: (
    outingId: string,
    minutes: number,
    requestId?: string,
    opts?: { orMore?: boolean },
  ) => void;
  /** Late reports from someone other than the current user (for bandeau). */
  getLateReportsForOthers: (
    outingId: string,
    requestId?: string,
  ) => LateReport[];
  /** Demo QA: pretend the other party reported late so bandeau is visible. */
  simulateOtherLate: (
    outingId: string,
    minutes?: number,
    requestId?: string,
  ) => void;
  /** Signal an unexpected event (once per person per outing). Available once confirmed, including before H−1. */
  reportImprevu: (
    outingId: string,
    motive: ImprevuMotive,
    reason: string,
    requestId?: string,
  ) =>
    | { ok: true; imprevuId: string }
    | {
        ok: false;
        reason:
          | 'no_user'
          | 'not_confirmed'
          | 'already_reported'
          | 'invalid_reason'
          | 'outing_closed'
          | 'no_responder';
      };
  /** Other party accepts or refuses a pending imprévu. */
  respondImprevu: (
    imprevuId: string,
    decision: 'accepted' | 'refused',
  ) =>
    | { ok: true; depositReturned: boolean; depositForfeited: boolean }
    | { ok: false; reason: string };
  getImprevuForOuting: (outingId: string) => ImprevuReport[];
  /** Pending imprévu aimed at the current user for this outing. */
  getPendingImprevuForMe: (outingId: string) => ImprevuReport | undefined;
  /** Current user's report on this outing (any status). */
  getMyImprevu: (outingId: string) => ImprevuReport | undefined;
  /** Demo QA: other party signals an imprévu so toast + card are visible. */
  simulateOtherImprevu: (
    outingId: string,
    motive?: ImprevuMotive,
    reason?: string,
    requestId?: string,
  ) => { ok: true } | { ok: false; reason: string };
  clearToast: () => void;
  /** Demo QA: set outing start to now + minutesAhead (e.g. 50 → chat unlocked). */
  simulateOutingInMinutes: (
    outingId: string,
    minutesAhead?: number,
  ) => void;
  completeOuting: (outingId: string) => void;
  addReview: (input: {
    outingId: string;
    toUserId: string;
    rating: 1 | 2 | 3 | 4 | 5;
    comment?: string;
    wantToSeeAgain?: boolean;
    lowStarReason?: Review['lowStarReason'];
  }) => { ok: true; reviewId: string } | { ok: false; reason: string };
  replyToReview: (
    reviewId: string,
    reply: string,
  ) => { ok: true } | { ok: false; reason: string };
  /** Mutual consent: each party must call; text hides when both agreed. */
  requestHideReviewText: (
    reviewId: string,
  ) =>
    | { ok: true; hidden: boolean; waitingForOther: boolean }
    | { ok: false; reason: string };
  /** Demo QA: record the other party's hide consent. */
  simulateOtherHideConsent: (
    reviewId: string,
  ) => { ok: true; hidden: boolean } | { ok: false; reason: string };
  getReviewsForUser: (userId: string) => Review[];
  getRatingStats: (userId: string) => UserRatingStats;
  /** Completed (or demo-completed) outings the user can still rate. */
  getOutingsToRate: () => {
    outing: Outing;
    toUserId: string;
    toUserName: string;
    requestId?: string;
  }[];
  getDisplayName: (userId: string) => string;
  showToast: (title: string, body: string) => void;
  reportHostNoShow: (
    outingId: string,
  ) =>
    | { ok: true; strike: number; banned: boolean }
    | { ok: false; reason: string };
  reportVenueClosed: (
    outingId: string,
  ) =>
    | { ok: true; alternate: VenueAlternate }
    | { ok: false; reason: string };
  respondVenueAlternate: (
    outingId: string,
    decision: 'accepted' | 'refused',
  ) => { ok: true } | { ok: false; reason: string };
  /** Confirmed guest ghosts: forfeit deposit; 2nd → lower priority + profile mention. */
  reportGuestNoShow: (
    requestId: string,
  ) =>
    | { ok: true; strike: number; lowerPriority: boolean }
    | { ok: false; reason: string };
  /** Host publishes often and never honors: 1 warning, 2nd ban. */
  reportHostNeverHonor: (
    outingId: string,
  ) =>
    | { ok: true; strike: number; banned: boolean }
    | { ok: false; reason: string };
  /**
   * Demo QA: over-accept a 2nd seat on a capacity-1 outing then confirm both —
   * first timestamp wins, second gets race_lost.
   */
  simulateConfirmRace: (
    outingId: string,
  ) =>
    | {
        ok: true;
        winnerRequestId: string;
        loserRequestId: string;
      }
    | { ok: false; reason: string };
  /** Demo: fire all priority notifications quickly (push + in-app fallback). */
  simulateLocalNotifications: (
    outingTitle?: string,
  ) => Promise<
    | { ok: true; pushOk: boolean }
    | { ok: false; reason: string }
  >;
  /**
   * Priority notif: in-app toast always; try push; Alert if push impossible.
   * Optional delaySeconds schedules the toast/Alert (and push) later.
   */
  notifyPriority: (input: {
    type: PriorityNotifType;
    title: string;
    body: string;
    delaySeconds?: number;
    data?: Record<string, string>;
  }) => Promise<void>;
}

const ChanceContext = createContext<ChanceContextValue | null>(null);

export function ChanceProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const completeOnboarding = useCallback((input: OnboardingInput) => {
      const now = new Date();
      const trial = new Date(now);
      trial.setMonth(trial.getMonth() + 1);
      const user: User = {
        id: uid('user'),
        firstName: input.firstName.trim() || 'Toi',
        age: 28,
        gender: input.gender,
        bio: input.bio.trim(),
        neighborhood: input.neighborhood.trim(),
        plan: 'essai',
        planInterval: null,
        outingCredits: 0,
        trialEndsAt: trial.toISOString(),
        dispoSoir: !!input.dispoSoir,
        interests: input.interests,
        customFilters: input.customFilters ?? [],
        photoUri: input.photoUri,
        dispoCategories: input.dispoSoir ? ['restaurant', 'bar', 'culture', 'autre'] : [],
        dispoSlot: input.dispoSoir ? '19:30' : undefined,
        dispoNeighborhood: input.dispoSoir
          ? input.neighborhood.trim()
          : undefined,
        dispoBudgetMax: input.dispoSoir ? 25 : undefined,
        dispoExpiresAt: input.dispoSoir
          ? nextLocalMidnight(now).toISOString()
          : undefined,
        phone: input.phone.trim(),
        authProvider: input.authProvider,
        womenOnlyPreference:
          input.gender === 'femme' ? input.womenOnlyPreference : false,
        registered: true,
        email: input.email?.trim() || undefined,
        notificationsGranted: false,
        locationGranted: false,
        createdAt: now.toISOString(),
      };
      dispatch({
        type: 'COMPLETE_ONBOARDING',
        payload: user,
        entryIntent: input.entryIntent,
      });
    }, []);

  const clearEntryIntent = useCallback(() => {
    dispatch({ type: 'CLEAR_ENTRY_INTENT' });
  }, []);

  const setPermissions = useCallback(
    (input: { notificationsGranted?: boolean; locationGranted?: boolean }) => {
      dispatch({ type: 'SET_PERMISSIONS', payload: input });
    },
    [],
  );

  const registerAccount = useCallback((email: string) => {
    const cleaned = email.trim().toLowerCase();
    if (!cleaned) return;
    dispatch({ type: 'REGISTER_ACCOUNT', payload: { email: cleaned } });
  }, []);

  const resetDemo = useCallback(() => {
    dispatch({ type: 'RESET_DEMO' });
  }, []);

  const getActiveOutingForUser = useCallback(() => {
    const user = state.currentUser;
    if (!user) return undefined;
    return state.outings.find(
      (o) =>
        o.hostId === user.id && (o.status === 'open' || o.status === 'full'),
    );
  }, [state.currentUser, state.outings]);

  const createOuting = useCallback(
    (input: {
      title: string;
      description: string;
      category: OutingCategory;
      neighborhood: string;
      venueName: string;
      approxArea: string;
      exactAddress: string;
      startsAt: string;
      capacity: 1 | 2 | 3 | 4;
      womenOnly: boolean;
      budgetMaxEuros: number;
      topic?: string;
      excludedTopics?: string[];
      flexibleSlot?: boolean;
    }):
      | { ok: true; outingId: string }
      | { ok: false; reason: 'no_user' | 'already_active' | 'banned' } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      if (user.banned) return { ok: false, reason: 'banned' };
      const hasActive = state.outings.some(
        (o) =>
          o.hostId === user.id &&
          (o.status === 'open' || o.status === 'full'),
      );
      if (hasActive) return { ok: false, reason: 'already_active' };
      if (input.womenOnly && user.gender !== 'femme') {
        // Silently force off — UI should prevent this
      }
      const topic = input.topic?.trim();
      const excluded = (input.excludedTopics ?? [])
        .map((t) => t.trim())
        .filter(Boolean);
      const outing: Outing = {
        id: uid('outing'),
        hostId: user.id,
        hostName: user.firstName,
        hostAge: user.age,
        hostGender: user.gender,
        title: input.title.trim(),
        description: input.description.trim(),
        category: input.category,
        neighborhood: input.neighborhood.trim(),
        venueName: input.venueName.trim(),
        approxArea: input.approxArea.trim(),
        exactAddress: input.exactAddress.trim(),
        startsAt: input.startsAt,
        capacity: input.capacity,
        spotsLeft: input.capacity,
        womenOnly: input.womenOnly && user.gender === 'femme',
        budgetMaxEuros: input.budgetMaxEuros,
        status: 'open',
        createdAt: new Date().toISOString(),
        ...(topic ? { topic } : {}),
        ...(excluded.length ? { excludedTopics: excluded } : {}),
        ...(input.flexibleSlot ? { flexibleSlot: true } : {}),
      };
      dispatch({ type: 'CREATE_OUTING', payload: outing });
      // Juliette auto-request moved to hidden Démo menu (5 taps on logo).
      return { ok: true, outingId: outing.id };
    },
    [state.currentUser, state.outings],
  );

  const closeOuting = useCallback((outingId: string) => {
    dispatch({ type: 'CLOSE_OUTING', payload: { outingId } });
  }, []);

  const joinOuting = useCallback(
    (
      outingId: string,
      message = '',
    ): { ok: true; requestId: string } | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing) return { ok: false, reason: 'not_found' };
      if (outing.hostId === user.id) return { ok: false, reason: 'own_outing' };
      if (outing.status !== 'open' || outing.spotsLeft < 1) {
        return { ok: false, reason: 'full' };
      }
      if (outing.womenOnly && user.gender !== 'femme') {
        return { ok: false, reason: 'women_only' };
      }
      const already = state.requests.some(
        (r) =>
          r.outingId === outingId &&
          r.userId === user.id &&
          (r.status === 'pending' ||
            r.status === 'accepted' ||
            r.status === 'confirmed'),
      );
      if (already) return { ok: false, reason: 'already_requested' };

      const requestId = uid('req');
      const request: Request = {
        id: requestId,
        outingId,
        userId: user.id,
        userName: user.firstName,
        userAge: user.age,
        userGender: user.gender,
        message: message.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'JOIN_OUTING', payload: request });
      return { ok: true, requestId };
    },
    [state.currentUser, state.outings, state.requests],
  );

  const acceptRequest = useCallback(
    (requestId: string) => {
      const now = new Date();
      const deadline = new Date(now.getTime() + CONFIRM_WINDOW_MS);
      const req = state.requests.find((r) => r.id === requestId);
      const outing = req
        ? state.outings.find((o) => o.id === req.outingId)
        : undefined;
      dispatch({
        type: 'ACCEPT_REQUEST',
        payload: {
          requestId,
          acceptedAt: now.toISOString(),
          confirmDeadlineAt: deadline.toISOString(),
        },
      });
      if (req && outing) {
        void ensureAndroidChannel();
        void (async () => {
          const scheduled = await scheduleAcceptedConfirmNotifications({
            outingTitle: outing.title,
            hostName: outing.hostName,
            confirmDeadlineAt: deadline.toISOString(),
            requestId,
          });
          // In-app toast for « accepté + fenêtre 10 min »
          const toast: AppToast = {
            id: uid('toast'),
            title: 'Tu es accepté·e !',
            body: `${outing.hostName} t’a accepté·e pour « ${outing.title} ». Confirme ta place dans 10 min.`,
            createdAt: new Date().toISOString(),
          };
          dispatch({ type: 'SET_TOAST', payload: toast });
          if (!scheduled.pushOk) {
            Alert.alert(toast.title, toast.body);
            // Fallback rappel ~3 min left
            const deadlineMs = deadline.getTime();
            const reminderIn = (deadlineMs - 3 * 60 * 1000 - Date.now()) / 1000;
            if (reminderIn > 2) {
              setTimeout(() => {
                const t: AppToast = {
                  id: uid('toast'),
                  title: 'Plus que 3 min',
                  body: `Confirme ta place pour « ${outing.title} » avant la fin du délai.`,
                  createdAt: new Date().toISOString(),
                };
                dispatch({ type: 'SET_TOAST', payload: t });
                Alert.alert(t.title, t.body);
              }, reminderIn * 1000);
            }
          }
        })();
      }
    },
    [state.requests, state.outings],
  );

  const declineRequest = useCallback((requestId: string) => {
    dispatch({ type: 'DECLINE_REQUEST', payload: { requestId } });
  }, []);

  const expireRequestIfNeeded = useCallback(
    (requestId: string) => {
      const req = state.requests.find((r) => r.id === requestId);
      if (!req || req.status !== 'accepted' || !req.confirmDeadlineAt) return;
      if (Date.now() > new Date(req.confirmDeadlineAt).getTime()) {
        dispatch({ type: 'EXPIRE_REQUEST', payload: { requestId } });
      }
    },
    [state.requests],
  );

  const confirmSlot = useCallback(
    (
      requestId: string,
    ):
      | { ok: true }
      | {
          ok: false;
          reason: 'expired' | 'invalid' | 'paywall' | 'race_lost';
        } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'invalid' };
      const gate = gateCanConfirmOuting(user);
      if (!gate.ok) {
        return { ok: false, reason: 'paywall' };
      }
      const req = state.requests.find((r) => r.id === requestId);
      if (!req || req.status !== 'accepted') {
        return { ok: false, reason: 'invalid' };
      }
      if (
        req.confirmDeadlineAt &&
        Date.now() > new Date(req.confirmDeadlineAt).getTime()
      ) {
        dispatch({ type: 'EXPIRE_REQUEST', payload: { requestId } });
        return { ok: false, reason: 'expired' };
      }
      const outingRace = state.outings.find((o) => o.id === req.outingId);
      if (outingRace) {
        const confirmedCount = state.requests.filter(
          (r) => r.outingId === req.outingId && r.status === 'confirmed',
        ).length;
        if (confirmedCount >= outingRace.capacity) {
          dispatch({ type: 'EXPIRE_REQUEST', payload: { requestId } });
          return { ok: false, reason: 'race_lost' };
        }
      }
      if (shouldConsumeCreditOnConfirm(user)) {
        dispatch({ type: 'CONSUME_OUTING_CREDIT' });
      }
      dispatch({
        type: 'CONFIRM_SLOT',
        payload: { requestId, confirmedAt: new Date().toISOString() },
      });
      const outingForChat = state.outings.find((o) => o.id === req.outingId);
      if (outingForChat) {
        void ensureAndroidChannel();
        const toast: AppToast = {
          id: uid('toast'),
          title: 'Place confirmée',
          body: `« ${outingForChat.title} » est confirmée. Chat à H−1.`,
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: 'SET_TOAST', payload: toast });
        void (async () => {
          const push = await sendPriorityPush({
            type: 'confirmed',
            title: toast.title,
            body: toast.body,
            data: { requestId, outingId: outingForChat.id },
          });
          if (!push.pushOk) {
            Alert.alert(toast.title, toast.body);
          }
          const chatId = await scheduleChatUnlockNotification({
            outingTitle: outingForChat.title,
            startsAt: outingForChat.startsAt,
            outingId: outingForChat.id,
          });
          if (!chatId) {
            // Fallback H−1 in-app when push scheduling fails
            const opensIn =
              (new Date(outingForChat.startsAt).getTime() -
                60 * 60 * 1000 -
                Date.now()) /
              1000;
            if (opensIn > 2 && opensIn < 48 * 3600) {
              setTimeout(() => {
                const t: AppToast = {
                  id: uid('toast'),
                  title: 'Chat ouvert',
                  body: `Le chat pour « ${outingForChat.title} » est déverrouillé (H−1).`,
                  createdAt: new Date().toISOString(),
                };
                dispatch({ type: 'SET_TOAST', payload: t });
                Alert.alert(t.title, t.body);
              }, opensIn * 1000);
            }
          }
        })();
      }
      return { ok: true };
    },
    [state.requests, state.currentUser, state.outings],
  );

  const setDispoSoir = useCallback((value: boolean) => {
    if (value) {
      dispatch({
        type: 'SET_DISPO_PROFILE',
        payload: {
          dispoSoir: true,
          dispoExpiresAt: nextLocalMidnight().toISOString(),
        },
      });
    } else {
      dispatch({
        type: 'SET_DISPO_PROFILE',
        payload: { dispoSoir: false, dispoExpiresAt: null },
      });
    }
  }, []);

  const setDispoProfile = useCallback(
    (update: DispoProfileUpdate) => {
      const next: DispoProfileUpdate = { ...update };
      if (next.dispoSoir === true) {
        const cats =
          next.dispoCategories ??
          state.currentUser?.dispoCategories ??
          [];
        if (!cats.length) {
          next.dispoCategories = [...ALL_CATEGORIES];
        }
        if (next.dispoExpiresAt === undefined) {
          next.dispoExpiresAt = nextLocalMidnight().toISOString();
        }
      }
      if (next.dispoSoir === false) {
        next.dispoExpiresAt = null;
      }
      dispatch({ type: 'SET_DISPO_PROFILE', payload: next });
    },
    [state.currentUser?.dispoCategories],
  );

  /** Auto-off Dispo ce soir at local midnight. */
  useEffect(() => {
    const tick = () => {
      const me = state.currentUser;
      if (!me?.dispoSoir) return;
      if (isPastLocalMidnight(me.dispoExpiresAt)) {
        dispatch({
          type: 'SET_DISPO_PROFILE',
          payload: { dispoSoir: false, dispoExpiresAt: null },
        });
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [state.currentUser?.dispoSoir, state.currentUser?.dispoExpiresAt]);

  const updateProfile = useCallback(
    (update: {
      bio?: string;
      interests?: string[];
      customFilters?: string[];
      neighborhood?: string;
      firstName?: string;
      photoUri?: string | null;
    }) => {
      dispatch({ type: 'SET_DISPO_PROFILE', payload: update });
    },
    [],
  );

  const peopleDispo = useMemo(() => {
    const byId = new Map<string, User>();
    for (const host of mockHosts) {
      if (!host.dispoSoir) continue;
      if (isPastLocalMidnight(host.dispoExpiresAt)) continue;
      byId.set(host.id, host);
    }
    const me = state.currentUser;
    if (me?.dispoSoir && !isPastLocalMidnight(me.dispoExpiresAt)) {
      byId.set(me.id, me);
    }
    return Array.from(byId.values());
  }, [state.currentUser]);

  const setPlan = useCallback(
    (
      plan: PlanId,
      opts?: {
        planInterval?: PlanInterval | null;
        outingCredits?: number;
        trialEndsAt?: string;
      },
    ) => {
      dispatch({
        type: 'SET_PLAN',
        payload: {
          plan,
          planInterval: opts?.planInterval,
          outingCredits: opts?.outingCredits,
          trialEndsAt: opts?.trialEndsAt,
        },
      });
    },
    [],
  );

  const subscribe = useCallback(
    (plan: Exclude<PlanId, 'essai'>, interval?: PlanInterval | null) => {
      const credits = creditsForSubscribe(plan, interval);
      dispatch({
        type: 'SET_PLAN',
        payload: {
          plan,
          planInterval: plan === 'payg' ? null : interval ?? 'month',
          outingCredits: credits,
        },
      });
    },
    [],
  );

  const simulateTrialEnd = useCallback(() => {
    dispatch({ type: 'SIMULATE_TRIAL_END' });
  }, []);

  const canConfirmOutingFn = useCallback((): ConfirmGateResult => {
    return gateCanConfirmOuting(state.currentUser);
  }, [state.currentUser]);

  const seedIncomingRequest = useCallback(
    (outingId: string) => {
      const outing = state.outings.find((o) => o.id === outingId);
      const user = state.currentUser;
      if (!outing || !user || outing.hostId !== user.id) return;
      const exists = state.requests.some(
        (r) =>
          r.outingId === outingId &&
          r.userId === 'demo-guest-1' &&
          (r.status === 'pending' ||
            r.status === 'accepted' ||
            r.status === 'confirmed'),
      );
      if (exists) return;
      const request: Request = {
        id: uid('req'),
        outingId,
        userId: 'demo-guest-1',
        userName: 'Juliette',
        userAge: 27,
        userGender: 'femme',
        message: 'Super idée, je suis dispo ! (demande démo)',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'JOIN_OUTING', payload: request });
      const toast: AppToast = {
        id: uid('toast'),
        title: 'Nouvelle demande',
        body: `${request.userName} veut rejoindre « ${outing.title} ».`,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      void (async () => {
        void ensureAndroidChannel();
        const push = await sendPriorityPush({
          type: 'new_request',
          title: toast.title,
          body: toast.body,
          data: { outingId, requestId: request.id },
        });
        if (!push.pushOk) Alert.alert(toast.title, toast.body);
      })();
    },
    [state.outings, state.currentUser, state.requests],
  );

  const simulateHostAccept = useCallback(
    (requestId: string) => {
      acceptRequest(requestId);
    },
    [acceptRequest],
  );

  const getChatMessages = useCallback(
    (outingId: string, requestId?: string) => {
      const key = chatThreadKey(outingId, requestId);
      return state.chatMessages.filter((m) => m.threadKey === key);
    },
    [state.chatMessages],
  );

  const ensureChatSeeded = useCallback(
    (outingId: string, requestId?: string) => {
      const key = chatThreadKey(outingId, requestId);
      if (state.chatMessages.some((m) => m.threadKey === key)) return;
      const outing = state.outings.find((o) => o.id === outingId);
      const req = requestId
        ? state.requests.find((r) => r.id === requestId)
        : undefined;
      const now = new Date().toISOString();
      const seed: ChatMessage[] = [
        {
          id: uid('msg'),
          threadKey: key,
          outingId,
          requestId,
          kind: 'system',
          text: 'Le chat est ouvert — 1 h avant la sortie. Bonne rencontre !',
          createdAt: now,
        },
      ];
      if (outing && req?.status === 'confirmed') {
        seed.push({
          id: uid('msg'),
          threadKey: key,
          outingId,
          requestId,
          kind: 'system',
          text: `Point de rendez-vous : ${outing.exactAddress}`,
          createdAt: now,
        });
      }
      const otherName =
        outing && state.currentUser?.id === outing.hostId
          ? req?.userName ?? 'Invité'
          : outing?.hostName ?? 'Hôte';
      seed.push({
        id: uid('msg'),
        threadKey: key,
        outingId,
        requestId,
        kind: 'user',
        senderId: 'other',
        senderName: otherName,
        text: 'Salut ! On se retrouve bien à l’heure ?',
        createdAt: now,
      });
      dispatch({ type: 'SEED_CHAT_MESSAGES', payload: seed });
    },
    [state.chatMessages, state.outings, state.requests, state.currentUser],
  );

  const sendChatMessage = useCallback(
    (outingId: string, text: string, requestId?: string) => {
      const user = state.currentUser;
      if (!user) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      const msg: ChatMessage = {
        id: uid('msg'),
        threadKey: chatThreadKey(outingId, requestId),
        outingId,
        requestId,
        kind: 'user',
        senderId: user.id,
        senderName: user.firstName,
        text: trimmed,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_CHAT_MESSAGE', payload: msg });
    },
    [state.currentUser],
  );

  const reportLate = useCallback(
    (
      outingId: string,
      minutes: number,
      requestId?: string,
      opts?: { orMore?: boolean },
    ) => {
      const user = state.currentUser;
      if (!user) return;
      const who = user.firstName;
      const now = new Date().toISOString();
      const orMore = !!opts?.orMore;
      const report: LateReport = {
        id: uid('late'),
        outingId,
        requestId,
        reporterId: user.id,
        reporterName: who,
        minutes,
        orMore: orMore || undefined,
        createdAt: now,
      };
      dispatch({ type: 'REPORT_LATE', payload: report });
      const sys: ChatMessage = {
        id: uid('msg'),
        threadKey: chatThreadKey(outingId, requestId),
        outingId,
        requestId,
        kind: 'system',
        text: lateSystemText(who, minutes, { orMore }),
        createdAt: now,
      };
      dispatch({ type: 'ADD_CHAT_MESSAGE', payload: sys });
      // No toast for the reporter — bandeau is for the other party(ies).
    },
    [state.currentUser],
  );

  const getLateReportsForOthers = useCallback(
    (outingId: string, requestId?: string) => {
      const me = state.currentUser?.id;
      return state.lateReports.filter((r) => {
        if (r.outingId !== outingId) return false;
        if (me && r.reporterId === me) return false;
        if (requestId && r.requestId && r.requestId !== requestId) return false;
        return true;
      });
    },
    [state.lateReports, state.currentUser],
  );

  const simulateOtherLate = useCallback(
    (
      outingId: string,
      minutes: number = 10,
      requestId?: string,
    ) => {
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing) return;
      const me = state.currentUser;
      // Pick a plausible "other" name
      let otherId = outing.hostId;
      let otherName = outing.hostName;
      if (me && outing.hostId === me.id) {
        const guest = state.requests.find(
          (r) =>
            r.outingId === outingId &&
            r.status === 'confirmed' &&
            (!requestId || r.id === requestId),
        );
        otherId = guest?.userId ?? 'demo-guest-1';
        otherName = guest?.userName ?? 'Juliette';
      }
      const now = new Date().toISOString();
      const report: LateReport = {
        id: uid('late'),
        outingId,
        requestId,
        reporterId: otherId,
        reporterName: otherName,
        minutes,
        createdAt: now,
      };
      dispatch({ type: 'REPORT_LATE', payload: report });
      const sys: ChatMessage = {
        id: uid('msg'),
        threadKey: chatThreadKey(outingId, requestId),
        outingId,
        requestId,
        kind: 'system',
        text: lateSystemText(otherName, minutes),
        createdAt: now,
      };
      dispatch({ type: 'ADD_CHAT_MESSAGE', payload: sys });
      const toast: AppToast = {
        id: uid('toast'),
        title: 'Retard',
        body: `${otherName} a un retard (${lateLabel(minutes)}).`,
        createdAt: now,
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      void (async () => {
        void ensureAndroidChannel();
        const push = await sendPriorityPush({
          type: 'late',
          title: toast.title,
          body: toast.body,
          data: { outingId },
        });
        if (!push.pushOk) Alert.alert(toast.title, toast.body);
      })();
    },
    [state.outings, state.requests, state.currentUser],
  );


  const reportImprevu = useCallback(
    (
      outingId: string,
      motive: ImprevuMotive,
      reason: string,
      requestId?: string,
    ) => {
      const user = state.currentUser;
      if (!user) return { ok: false as const, reason: 'no_user' as const };
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing) {
        return { ok: false as const, reason: 'outing_closed' as const };
      }
      if (outing.status === 'closed' || outing.status === 'completed') {
        return { ok: false as const, reason: 'outing_closed' as const };
      }
      const normalized = normalizeImprevuReason(reason);
      if (!normalized) {
        return { ok: false as const, reason: 'invalid_reason' as const };
      }
      if (
        state.imprevuReports.some(
          (r) => r.outingId === outingId && r.reporterId === user.id,
        )
      ) {
        return { ok: false as const, reason: 'already_reported' as const };
      }

      const isHost = outing.hostId === user.id;
      const confirmedReqs = state.requests.filter(
        (r) => r.outingId === outingId && r.status === 'confirmed',
      );
      if (!isHost) {
        const mine = confirmedReqs.find((r) => r.userId === user.id);
        if (!mine) {
          return { ok: false as const, reason: 'not_confirmed' as const };
        }
      } else if (confirmedReqs.length === 0) {
        return { ok: false as const, reason: 'not_confirmed' as const };
      }

      const responderIds = isHost
        ? confirmedReqs.map((r) => r.userId)
        : [outing.hostId];
      if (!responderIds.length) {
        return { ok: false as const, reason: 'no_responder' as const };
      }

      const linkedRequestId = isHost
        ? requestId ?? confirmedReqs[0]?.id
        : confirmedReqs.find((r) => r.userId === user.id)?.id ?? requestId;

      const now = new Date().toISOString();
      const report: ImprevuReport = {
        id: uid('imprevu'),
        outingId,
        requestId: linkedRequestId,
        reporterId: user.id,
        reporterName: user.firstName,
        responderIds,
        motive,
        reason: normalized,
        status: 'pending',
        createdAt: now,
      };
      dispatch({ type: 'REPORT_IMPREVU', payload: report });
      return { ok: true as const, imprevuId: report.id };
    },
    [state.currentUser, state.outings, state.requests, state.imprevuReports],
  );

  const respondImprevu = useCallback(
    (imprevuId: string, decision: 'accepted' | 'refused') => {
      const user = state.currentUser;
      if (!user) return { ok: false as const, reason: 'no_user' };
      const report = state.imprevuReports.find((r) => r.id === imprevuId);
      if (!report || report.status !== 'pending') {
        return { ok: false as const, reason: 'not_pending' };
      }
      if (!report.responderIds.includes(user.id)) {
        return { ok: false as const, reason: 'not_responder' };
      }
      const outing = state.outings.find((o) => o.id === report.outingId);
      if (!outing) return { ok: false as const, reason: 'missing_outing' };

      const nowIso = new Date().toISOString();
      if (decision === 'accepted') {
        dispatch({
          type: 'RESPOND_IMPREVU',
          payload: {
            imprevuId,
            decision: 'accepted',
            respondedAt: nowIso,
            respondedByUserId: user.id,
            cancelOuting: true,
          },
        });
        const toast: AppToast = {
          id: uid('toast'),
          title: 'Annulation',
          body: 'Imprévu accepté. Caution rendue — la sortie est annulée.',
          createdAt: nowIso,
        };
        dispatch({ type: 'SET_TOAST', payload: toast });
        void (async () => {
          void ensureAndroidChannel();
          const push = await sendPriorityPush({
            type: 'cancellation',
            title: toast.title,
            body: toast.body,
            data: { outingId: report.outingId },
          });
          if (!push.pushOk) Alert.alert(toast.title, toast.body);
        })();
        return {
          ok: true as const,
          depositReturned: true,
          depositForfeited: false,
        };
      }

      const forfeit =
        report.reporterId !== outing.hostId &&
        !isCancelFreeWindow(outing.startsAt);
      dispatch({
        type: 'RESPOND_IMPREVU',
        payload: {
          imprevuId,
          decision: 'refused',
          respondedAt: nowIso,
          respondedByUserId: user.id,
          forfeitReporterDeposit: forfeit,
        },
      });
      const toast: AppToast = {
        id: uid('toast'),
        title: 'Imprévu refusé',
        body: forfeit
          ? `Refus à moins de ${CANCEL_FREE_BEFORE_HOURS} h — caution perdue si absence.`
          : `Règle ${CANCEL_FREE_BEFORE_HOURS} h : caution encore bloquée tant que la sortie tient.`,
        createdAt: nowIso,
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      return {
        ok: true as const,
        depositReturned: false,
        depositForfeited: forfeit,
      };
    },
    [state.currentUser, state.imprevuReports, state.outings],
  );

  const getImprevuForOuting = useCallback(
    (outingId: string) =>
      state.imprevuReports.filter((r) => r.outingId === outingId),
    [state.imprevuReports],
  );

  const getPendingImprevuForMe = useCallback(
    (outingId: string) => {
      const me = state.currentUser?.id;
      if (!me) return undefined;
      return state.imprevuReports.find(
        (r) =>
          r.outingId === outingId &&
          r.status === 'pending' &&
          r.responderIds.includes(me),
      );
    },
    [state.imprevuReports, state.currentUser],
  );

  const getMyImprevu = useCallback(
    (outingId: string) => {
      const me = state.currentUser?.id;
      if (!me) return undefined;
      return state.imprevuReports.find(
        (r) => r.outingId === outingId && r.reporterId === me,
      );
    },
    [state.imprevuReports, state.currentUser],
  );

  const simulateOtherImprevu = useCallback(
    (
      outingId: string,
      motive: ImprevuMotive = 'gros_retard',
      reason: string = 'RER bloqué à Gare du Nord (démo).',
      requestId?: string,
    ) => {
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing) return { ok: false as const, reason: 'missing_outing' };
      const me = state.currentUser;
      if (!me) return { ok: false as const, reason: 'no_user' };

      let otherId = outing.hostId;
      let otherName = outing.hostName;
      let linkedRequestId = requestId;
      const responderIds = [me.id];

      if (outing.hostId === me.id) {
        const guest = state.requests.find(
          (r) =>
            r.outingId === outingId &&
            r.status === 'confirmed' &&
            (!requestId || r.id === requestId),
        );
        if (!guest) {
          return { ok: false as const, reason: 'no_confirmed_guest' };
        }
        otherId = guest.userId;
        otherName = guest.userName;
        linkedRequestId = guest.id;
      } else {
        const mine = state.requests.find(
          (r) =>
            r.outingId === outingId &&
            r.userId === me.id &&
            r.status === 'confirmed',
        );
        linkedRequestId = mine?.id ?? requestId;
      }

      if (
        state.imprevuReports.some(
          (r) => r.outingId === outingId && r.reporterId === otherId,
        )
      ) {
        return { ok: false as const, reason: 'already_reported' };
      }

      const normalized = normalizeImprevuReason(reason) ?? reason.trim();
      const now = new Date().toISOString();
      const report: ImprevuReport = {
        id: uid('imprevu'),
        outingId,
        requestId: linkedRequestId,
        reporterId: otherId,
        reporterName: otherName,
        responderIds,
        motive,
        reason: normalized,
        status: 'pending',
        createdAt: now,
      };
      dispatch({ type: 'REPORT_IMPREVU', payload: report });
      const toast: AppToast = {
        id: uid('toast'),
        title: imprevuNotifTitle(otherName),
        body: `${imprevuMotiveLabel(motive)} · ${normalized}`,
        createdAt: now,
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      return { ok: true as const };
    },
    [state.outings, state.requests, state.currentUser, state.imprevuReports],
  );

  /** No response by startsAt → treat as refuse (3h rule). Host must not stay blocked. */
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const report of state.imprevuReports) {
        if (report.status !== 'pending') continue;
        const outing = state.outings.find((o) => o.id === report.outingId);
        if (!outing) continue;
        const startMs = new Date(outing.startsAt).getTime();
        if (!Number.isFinite(startMs) || startMs > now) continue;
        const forfeit =
          report.reporterId !== outing.hostId &&
          !isCancelFreeWindow(outing.startsAt, startMs);
        dispatch({
          type: 'RESPOND_IMPREVU',
          payload: {
            imprevuId: report.id,
            decision: 'auto_refused',
            respondedAt: new Date().toISOString(),
            forfeitReporterDeposit: forfeit,
          },
        });
      }
    };
    tick();
    const id = setInterval(tick, 15_000);
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [state.imprevuReports, state.outings]);

  const clearToast = useCallback(() => {
    dispatch({ type: 'SET_TOAST', payload: null });
  }, []);

  const simulateOutingInMinutes = useCallback(
    (outingId: string, minutesAhead = 50) => {
      const startsAt = new Date(
        Date.now() + minutesAhead * 60 * 1000,
      ).toISOString();
      dispatch({
        type: 'SHIFT_OUTING_START',
        payload: { outingId, startsAt },
      });
      const outing = state.outings.find((o) => o.id === outingId);
      if (outing) {
        void ensureAndroidChannel();
        void scheduleChatUnlockNotification({
          outingTitle: outing.title,
          startsAt,
          outingId,
        });
      }
    },
    [state.outings],
  );


  const completeOuting = useCallback((outingId: string) => {
    dispatch({ type: 'COMPLETE_OUTING', payload: { outingId } });
    const outing = state.outings.find((o) => o.id === outingId);
    const title = outing?.title ?? 'ta sortie';
    const toast: AppToast = {
      id: uid('toast'),
      title: 'Noter la sortie',
      body: `Comment s’est passée « ${title} » ? Laisse une note.`,
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'SET_TOAST', payload: toast });
    void (async () => {
      void ensureAndroidChannel();
      const push = await sendPriorityPush({
        type: 'rate_after',
        title: toast.title,
        body: toast.body,
        data: { outingId },
      });
      if (!push.pushOk) Alert.alert(toast.title, toast.body);
    })();
  }, [state.outings]);

  const getDisplayName = useCallback(
    (userId: string) => {
      if (state.currentUser?.id === userId) return state.currentUser.firstName;
      const host = mockHosts.find((h) => h.id === userId);
      if (host) return host.firstName;
      if (userId === 'demo-guest-1') return 'Juliette';
      const fromReq = state.requests.find((r) => r.userId === userId);
      if (fromReq) return fromReq.userName;
      const fromOuting = state.outings.find((o) => o.hostId === userId);
      if (fromOuting) return fromOuting.hostName;
      return 'Quelqu’un';
    },
    [state.currentUser, state.requests, state.outings],
  );

  const getReviewsForUser = useCallback(
    (userId: string) =>
      state.reviews
        .filter((r) => r.toUserId === userId)
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [state.reviews],
  );

  const getRatingStats = useCallback(
    (userId: string): UserRatingStats => {
      const received = state.reviews.filter((r) => r.toUserId === userId);
      if (!received.length) return { average: null, outingCount: 0 };
      const sum = received.reduce((acc, r) => acc + r.rating, 0);
      return {
        average: sum / received.length,
        outingCount: received.length,
      };
    },
    [state.reviews],
  );

  const addReview = useCallback(
    (input: {
      outingId: string;
      toUserId: string;
      rating: 1 | 2 | 3 | 4 | 5;
      comment?: string;
      wantToSeeAgain?: boolean;
      lowStarReason?: Review['lowStarReason'];
    }): { ok: true; reviewId: string } | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      if (input.rating < 1 || input.rating > 5) {
        return { ok: false, reason: 'invalid_rating' };
      }
      if (input.toUserId === user.id) return { ok: false, reason: 'self' };
      const dup = state.reviews.some(
        (r) =>
          r.outingId === input.outingId &&
          r.fromUserId === user.id &&
          r.toUserId === input.toUserId,
      );
      if (dup) return { ok: false, reason: 'already_reviewed' };
      if (
        (input.rating === 1 || input.rating === 2) &&
        !input.lowStarReason
      ) {
        return { ok: false, reason: 'low_star_reason_required' };
      }
      const comment = input.comment?.trim();
      const review: Review = {
        id: uid('rev'),
        outingId: input.outingId,
        fromUserId: user.id,
        toUserId: input.toUserId,
        rating: input.rating,
        ...(comment ? { comment } : {}),
        ...(input.wantToSeeAgain !== undefined
          ? { wantToSeeAgain: input.wantToSeeAgain }
          : {}),
        ...(input.lowStarReason ? { lowStarReason: input.lowStarReason } : {}),
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_REVIEW', payload: review });
      return { ok: true, reviewId: review.id };
    },
    [state.currentUser, state.reviews],
  );

  const replyToReview = useCallback(
    (
      reviewId: string,
      reply: string,
    ): { ok: true } | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      const review = state.reviews.find((r) => r.id === reviewId);
      if (!review) return { ok: false, reason: 'not_found' };
      if (review.toUserId !== user.id) return { ok: false, reason: 'not_owner' };
      if (review.reply) return { ok: false, reason: 'already_replied' };
      if (review.textHidden) return { ok: false, reason: 'text_hidden' };
      const trimmed = reply.trim();
      if (!trimmed) return { ok: false, reason: 'empty' };
      dispatch({
        type: 'REPLY_TO_REVIEW',
        payload: { reviewId, reply: trimmed },
      });
      return { ok: true };
    },
    [state.currentUser, state.reviews],
  );

  const requestHideReviewText = useCallback(
    (
      reviewId: string,
    ):
      | { ok: true; hidden: boolean; waitingForOther: boolean }
      | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      const review = state.reviews.find((r) => r.id === reviewId);
      if (!review) return { ok: false, reason: 'not_found' };
      if (review.textHidden) return { ok: false, reason: 'already_hidden' };
      if (user.id !== review.fromUserId && user.id !== review.toUserId) {
        return { ok: false, reason: 'not_party' };
      }
      if (!review.comment && !review.reply) {
        return { ok: false, reason: 'no_text' };
      }
      const already = (review.hideTextConsentUserIds ?? []).includes(user.id);
      if (already) {
        const both =
          (review.hideTextConsentUserIds ?? []).includes(review.fromUserId) &&
          (review.hideTextConsentUserIds ?? []).includes(review.toUserId);
        return {
          ok: true,
          hidden: !!review.textHidden || both,
          waitingForOther: !both,
        };
      }
      dispatch({
        type: 'REQUEST_HIDE_REVIEW_TEXT',
        payload: { reviewId, userId: user.id },
      });
      const next = new Set(review.hideTextConsentUserIds ?? []);
      next.add(user.id);
      const both = next.has(review.fromUserId) && next.has(review.toUserId);
      return { ok: true, hidden: both, waitingForOther: !both };
    },
    [state.currentUser, state.reviews],
  );


  const simulateOtherHideConsent = useCallback(
    (
      reviewId: string,
    ): { ok: true; hidden: boolean } | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      const review = state.reviews.find((r) => r.id === reviewId);
      if (!review) return { ok: false, reason: 'not_found' };
      if (review.textHidden) return { ok: true, hidden: true };
      const otherId =
        user.id === review.fromUserId
          ? review.toUserId
          : user.id === review.toUserId
            ? review.fromUserId
            : null;
      if (!otherId) return { ok: false, reason: 'not_party' };
      dispatch({
        type: 'REQUEST_HIDE_REVIEW_TEXT',
        payload: { reviewId, userId: otherId },
      });
      const next = new Set(review.hideTextConsentUserIds ?? []);
      next.add(otherId);
      // also count current user if already consented
      if ((review.hideTextConsentUserIds ?? []).includes(user.id)) {
        next.add(user.id);
      }
      const both = next.has(review.fromUserId) && next.has(review.toUserId);
      return { ok: true, hidden: both };
    },
    [state.currentUser, state.reviews],
  );

  const showToast = useCallback((title: string, body: string) => {
    const toast: AppToast = {
      id: uid('toast'),
      title,
      body,
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'SET_TOAST', payload: toast });
  }, []);

  /**
   * Priority in-app toast always. Try local push; if push impossible, Alert
   * (immediate) or schedule toast+Alert after delaySeconds.
   */
  const notifyPriority = useCallback(
    async (input: {
      type: PriorityNotifType;
      title: string;
      body: string;
      delaySeconds?: number;
      data?: Record<string, string>;
    }) => {
      const delay = Math.max(0, input.delaySeconds ?? 0);
      const fireInApp = () => {
        const toast: AppToast = {
          id: uid('toast'),
          title: input.title,
          body: input.body,
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: 'SET_TOAST', payload: toast });
      };

      void ensureAndroidChannel();
      const push = await sendPriorityPush({
        type: input.type,
        title: input.title,
        body: input.body,
        delaySeconds: delay > 0 ? delay : 0,
        data: input.data,
      });

      if (delay <= 0) {
        fireInApp();
        if (!push.pushOk) {
          Alert.alert(input.title, input.body);
        }
        return;
      }

      // Delayed: push may handle it; if not, schedule in-app + Alert.
      if (!push.pushOk) {
        setTimeout(() => {
          fireInApp();
          Alert.alert(input.title, input.body);
        }, delay * 1000);
      }
    },
    [],
  );

  const getOutingsToRate = useCallback(() => {
    const user = state.currentUser;
    if (!user) return [];
    const items: {
      outing: Outing;
      toUserId: string;
      toUserName: string;
      requestId?: string;
    }[] = [];
    const completed = state.outings.filter((o) => o.status === 'completed');
    for (const outing of completed) {
      if (outing.hostId === user.id) {
        const guests = state.requests.filter(
          (r) => r.outingId === outing.id && r.status === 'confirmed',
        );
        for (const g of guests) {
          const already = state.reviews.some(
            (rev) =>
              rev.outingId === outing.id &&
              rev.fromUserId === user.id &&
              rev.toUserId === g.userId,
          );
          if (!already) {
            items.push({
              outing,
              toUserId: g.userId,
              toUserName: g.userName,
              requestId: g.id,
            });
          }
        }
      } else {
        const myConfirmed = state.requests.find(
          (r) =>
            r.outingId === outing.id &&
            r.userId === user.id &&
            r.status === 'confirmed',
        );
        if (!myConfirmed) continue;
        const already = state.reviews.some(
          (rev) =>
            rev.outingId === outing.id &&
            rev.fromUserId === user.id &&
            rev.toUserId === outing.hostId,
        );
        if (!already) {
          items.push({
            outing,
            toUserId: outing.hostId,
            toUserName: outing.hostName,
            requestId: myConfirmed.id,
          });
        }
      }
    }
    return items;
  }, [state.currentUser, state.outings, state.requests, state.reviews]);


  const getOutingById = useCallback(
    (id: string) => state.outings.find((o) => o.id === id),
    [state.outings],
  );

  const getRequestById = useCallback(
    (id: string) => state.requests.find((r) => r.id === id),
    [state.requests],
  );

  const canSeeWomenOnly = useCallback(
    (outing: Outing) => {
      if (!outing.womenOnly) return true;
      return state.currentUser?.gender === 'femme';
    },
    [state.currentUser],
  );

  const visibleOutings = useMemo(() => {
    return state.outings.filter((o) => {
      if (o.status !== 'open' && o.status !== 'full') return false;
      if (o.womenOnly && state.currentUser?.gender !== 'femme') return false;
      return true;
    });
  }, [state.outings, state.currentUser]);

  const incomingRequests = useMemo(() => {
    const user = state.currentUser;
    if (!user) return [];
    const myOutingIds = new Set(
      state.outings.filter((o) => o.hostId === user.id).map((o) => o.id),
    );
    return state.requests.filter((r) => myOutingIds.has(r.outingId));
  }, [state.currentUser, state.outings, state.requests]);

  const outgoingRequests = useMemo(() => {
    const user = state.currentUser;
    if (!user) return [];
    return state.requests.filter((r) => r.userId === user.id);
  }, [state.currentUser, state.requests]);


  const reportHostNoShow = useCallback(
    (
      outingId: string,
    ):
      | { ok: true; strike: number; banned: boolean }
      | { ok: false; reason: string } => {
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing) return { ok: false, reason: 'not_found' };
      const hostId = outing.hostId;
      const prev = state.hostNoShowStrikes[hostId] ?? 0;
      const strike = prev + 1;
      const banned = strike >= 2;
      dispatch({
        type: 'REPORT_HOST_NO_SHOW',
        payload: { outingId, hostId, strike, banned },
      });
      dispatch({
        type: 'RETURN_DEPOSITS_FOR_OUTING',
        payload: { outingId, reason: 'host_no_show' },
      });
      // Auto note in chat threads for confirmed guests.
      const confirmedReqs = state.requests.filter(
        (r) => r.outingId === outingId && r.status === 'confirmed',
      );
      const noteBody = banned
        ? 'Note auto · 2e no-show hôte — compte suspendu. Cautions remboursées.'
        : 'Note auto · no-show hôte — avertissement. Cautions des invités remboursées.';
      const targets =
        confirmedReqs.length > 0
          ? confirmedReqs
          : [{ id: undefined as string | undefined }];
      for (const r of targets) {
        const note: ChatMessage = {
          id: uid('msg'),
          threadKey: chatThreadKey(outingId, r.id),
          outingId,
          requestId: r.id,
          kind: 'system',
          text: noteBody,
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: 'ADD_CHAT_MESSAGE', payload: note });
      }
      const toast: AppToast = {
        id: uid('toast'),
        title: banned ? 'Hôte banni (démo)' : 'Avertissement hôte',
        body: banned
          ? '2e no-show — compte suspendu. Cautions des invités remboursées.'
          : '1er no-show — avertissement. Cautions des invités remboursées.',
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      return { ok: true, strike, banned };
    },
    [state.outings, state.hostNoShowStrikes, state.requests],
  );

  const reportVenueClosed = useCallback(
    (
      outingId: string,
    ):
      | { ok: true; alternate: VenueAlternate }
      | { ok: false; reason: string } => {
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing) return { ok: false, reason: 'not_found' };
      if (outing.venueIssue) return { ok: false, reason: 'already_reported' };
      const alternate = pickAlternateVenue(outing);
      dispatch({
        type: 'REPORT_VENUE_CLOSED',
        payload: { outingId, alternate },
      });
      const toast: AppToast = {
        id: uid('toast'),
        title: 'Nouveau lieu',
        body: `Restaurant fermé — proposition : ${alternate.venueName} · ${alternate.neighborhood} · ≤ ${alternate.budgetMaxEuros} €`,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      void (async () => {
        void ensureAndroidChannel();
        const push = await sendPriorityPush({
          type: 'new_venue',
          title: toast.title,
          body: toast.body,
          data: { outingId },
        });
        if (!push.pushOk) Alert.alert(toast.title, toast.body);
      })();
      return { ok: true, alternate };
    },
    [state.outings],
  );

  const respondVenueAlternate = useCallback(
    (
      outingId: string,
      decision: 'accepted' | 'refused',
    ): { ok: true } | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing?.venueIssue) return { ok: false, reason: 'no_issue' };
      dispatch({
        type: 'RESPOND_VENUE_ALTERNATE',
        payload: { outingId, userId: user.id, decision },
      });
      if (decision === 'refused') {
        const toast: AppToast = {
          id: uid('toast'),
          title: 'Annulation',
          body: 'Tu refuses le lieu alternatif — sortie annulée, caution remboursée (mock).',
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: 'SET_TOAST', payload: toast });
        void (async () => {
          void ensureAndroidChannel();
          const push = await sendPriorityPush({
            type: 'cancellation',
            title: toast.title,
            body: toast.body,
            data: { outingId },
          });
          if (!push.pushOk) Alert.alert(toast.title, toast.body);
        })();
      } else {
        const toast: AppToast = {
          id: uid('toast'),
          title: 'Nouveau lieu',
          body: outing.venueIssue.alternate
            ? `${outing.venueIssue.alternate.venueName} · caution conservée`
            : 'Lieu mis à jour',
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: 'SET_TOAST', payload: toast });
        void (async () => {
          void ensureAndroidChannel();
          const push = await sendPriorityPush({
            type: 'new_venue',
            title: toast.title,
            body: toast.body,
            data: { outingId },
          });
          if (!push.pushOk) Alert.alert(toast.title, toast.body);
        })();
      }
      return { ok: true };
    },
    [state.currentUser, state.outings],
  );


  const reportGuestNoShow = useCallback(
    (
      requestId: string,
    ):
      | { ok: true; strike: number; lowerPriority: boolean }
      | { ok: false; reason: string } => {
      const req = state.requests.find((r) => r.id === requestId);
      if (!req || req.status !== 'confirmed') {
        return { ok: false, reason: 'not_confirmed' };
      }
      const outingId = req.outingId;
      const guestId = req.userId;
      const prev = state.guestNoShowStrikes[guestId] ?? 0;
      const strike = prev + 1;
      const lowerPriority = strike >= 2;
      dispatch({
        type: 'REPORT_GUEST_NO_SHOW',
        payload: {
          outingId,
          requestId,
          guestId,
          strike,
          lowerPriority,
        },
      });
      const note: ChatMessage = {
        id: uid('msg'),
        threadKey: chatThreadKey(outingId, requestId),
        outingId,
        requestId,
        kind: 'system',
        text: lowerPriority
          ? 'Note auto · 2e ghost invité — priorité baissée + mention profil. Caution perdue.'
          : 'Note auto · ghost après confirmation — caution perdue (mock).',
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_CHAT_MESSAGE', payload: note });
      const toast: AppToast = {
        id: uid('toast'),
        title: lowerPriority ? 'Priorité baissée' : 'Caution perdue',
        body: lowerPriority
          ? '2e no-show invité — priorité baissée + mention sur le profil.'
          : 'Ghost après confirmation — caution non remboursée (mock).',
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      return { ok: true, strike, lowerPriority };
    },
    [state.requests, state.guestNoShowStrikes],
  );

  const reportHostNeverHonor = useCallback(
    (
      outingId: string,
    ):
      | { ok: true; strike: number; banned: boolean }
      | { ok: false; reason: string } => {
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing) return { ok: false, reason: 'not_found' };
      const hostId = outing.hostId;
      const prev = state.hostPublishStrikes[hostId] ?? 0;
      const strike = prev + 1;
      const banned = strike >= 2;
      dispatch({
        type: 'REPORT_HOST_NEVER_HONOR',
        payload: { outingId, hostId, strike, banned },
      });
      dispatch({
        type: 'RETURN_DEPOSITS_FOR_OUTING',
        payload: { outingId, reason: 'host_never_honor' },
      });
      const note: ChatMessage = {
        id: uid('msg'),
        threadKey: chatThreadKey(outingId),
        outingId,
        kind: 'system',
        text: banned
          ? 'Note auto · 2e publication jamais honorée — compte suspendu. Cautions remboursées.'
          : 'Note auto · publication jamais honorée — avertissement. Cautions remboursées.',
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_CHAT_MESSAGE', payload: note });
      const toast: AppToast = {
        id: uid('toast'),
        title: banned ? 'Compte suspendu' : 'Avertissement publication',
        body: banned
          ? '2e fois — ban. Cautions des invités remboursées.'
          : '1er avertissement (publie sans honorer). Cautions remboursées.',
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      return { ok: true, strike, banned };
    },
    [state.outings, state.hostPublishStrikes],
  );

  const simulateConfirmRace = useCallback(
    (
      outingId: string,
    ):
      | {
          ok: true;
          winnerRequestId: string;
          loserRequestId: string;
        }
      | { ok: false; reason: string } => {
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing) return { ok: false, reason: 'not_found' };
      const now = Date.now();
      const deadline = new Date(now + CONFIRM_WINDOW_MS).toISOString();
      const winner: Request = {
        id: uid('req'),
        outingId,
        userId: 'demo-race-a',
        userName: 'Alice (démo)',
        userAge: 28,
        userGender: 'femme',
        message: 'Course A',
        status: 'accepted',
        createdAt: new Date(now - 90_000).toISOString(),
        acceptedAt: new Date(now - 60_000).toISOString(),
        confirmDeadlineAt: deadline,
      };
      const loser: Request = {
        id: uid('req'),
        outingId,
        userId: 'demo-race-b',
        userName: 'Bruno (démo)',
        userAge: 31,
        userGender: 'homme',
        message: 'Course B',
        status: 'accepted',
        createdAt: new Date(now - 80_000).toISOString(),
        acceptedAt: new Date(now - 50_000).toISOString(),
        confirmDeadlineAt: deadline,
      };
      dispatch({
        type: 'RUN_CONFIRM_RACE_DEMO',
        payload: {
          outingId,
          winner,
          loser,
          winnerConfirmedAt: new Date(now - 2000).toISOString(),
        },
      });
      const toast: AppToast = {
        id: uid('toast'),
        title: 'Course confirmation',
        body: `1er timestamp gagne (${winner.userName}) — ${loser.userName} perd la place.`,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      return {
        ok: true,
        winnerRequestId: winner.id,
        loserRequestId: loser.id,
      };
    },
    [state.outings],
  );

  const simulateLocalNotifications = useCallback(
    async (outingTitle?: string) => {
      void ensureAndroidChannel();
      return simulateDemoNotifications(
        outingTitle ? { outingTitle } : undefined,
      );
    },
    [],
  );

  const value = useMemo<ChanceContextValue>(
    () => ({
      state,
      completeOnboarding,
      clearEntryIntent,
      registerAccount,
      setPermissions,
      resetDemo,
      createOuting,
      closeOuting,
      joinOuting,
      acceptRequest,
      declineRequest,
      confirmSlot,
      expireRequestIfNeeded,
      setDispoSoir,
      setDispoProfile,
      updateProfile,
      setPlan,
      subscribe,
      simulateTrialEnd,
      canConfirmOuting: canConfirmOutingFn,
      peopleDispo,
      seedIncomingRequest,
      simulateHostAccept,
      getActiveOutingForUser,
      getOutingById,
      getRequestById,
      canSeeWomenOnly,
      visibleOutings,
      incomingRequests,
      outgoingRequests,
      getChatMessages,
      ensureChatSeeded,
      sendChatMessage,
      reportLate,
      getLateReportsForOthers,
      simulateOtherLate,
      reportImprevu,
      respondImprevu,
      getImprevuForOuting,
      getPendingImprevuForMe,
      getMyImprevu,
      simulateOtherImprevu,
      clearToast,
      simulateOutingInMinutes,
      completeOuting,
      addReview,
      replyToReview,
      requestHideReviewText,
      simulateOtherHideConsent,
      getReviewsForUser,
      getRatingStats,
      getOutingsToRate,
      getDisplayName,
      showToast,
      notifyPriority,
      reportHostNoShow,
      reportVenueClosed,
      respondVenueAlternate,
      reportGuestNoShow,
      reportHostNeverHonor,
      simulateConfirmRace,
      simulateLocalNotifications,
    }),
    [
      state,
      completeOnboarding,
      clearEntryIntent,
      registerAccount,
      setPermissions,
      resetDemo,
      createOuting,
      closeOuting,
      joinOuting,
      acceptRequest,
      declineRequest,
      confirmSlot,
      expireRequestIfNeeded,
      setDispoSoir,
      setDispoProfile,
      updateProfile,
      setPlan,
      subscribe,
      simulateTrialEnd,
      canConfirmOutingFn,
      peopleDispo,
      seedIncomingRequest,
      simulateHostAccept,
      getActiveOutingForUser,
      getOutingById,
      getRequestById,
      canSeeWomenOnly,
      visibleOutings,
      incomingRequests,
      outgoingRequests,
      getChatMessages,
      ensureChatSeeded,
      sendChatMessage,
      reportLate,
      getLateReportsForOthers,
      simulateOtherLate,
      reportImprevu,
      respondImprevu,
      getImprevuForOuting,
      getPendingImprevuForMe,
      getMyImprevu,
      simulateOtherImprevu,
      clearToast,
      simulateOutingInMinutes,
      completeOuting,
      addReview,
      replyToReview,
      requestHideReviewText,
      simulateOtherHideConsent,
      getReviewsForUser,
      getRatingStats,
      getOutingsToRate,
      getDisplayName,
      showToast,
      notifyPriority,
      reportHostNoShow,
      reportVenueClosed,
      respondVenueAlternate,
      reportGuestNoShow,
      reportHostNeverHonor,
      simulateConfirmRace,
      simulateLocalNotifications,
    ],
  );

  return (
    <ChanceContext.Provider value={value}>{children}</ChanceContext.Provider>
  );
}

export function useChance(): ChanceContextValue {
  const ctx = useContext(ChanceContext);
  if (!ctx) {
    throw new Error('useChance must be used within ChanceProvider');
  }
  return ctx;
}

export { CONFIRM_WINDOW_MS };

export const DEPOSIT_EUROS = DEPOSIT_FROM_PRICING;
export { CANCEL_FREE_BEFORE_HOURS, isCancelFreeWindow };
