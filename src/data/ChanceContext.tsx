import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { Alert, AppState as RNAppState } from 'react-native';
import {
  computeDispoExpiresAt,
  isPastLocalMidnight,
} from '../utils/dispo';
import { ALL_CATEGORIES, mockHosts, mockOutings } from './mockOutings';
import { mockReviews } from './mockReviews';
import {
  AppAction,
  AppState,
  AppToast,
  ChatMessage,
  DispoProfileUpdate,
  EntryIntent,
  Gender,
  LateReport,
  ImprevuMotive,
  ImprevuReport,
  OnboardingInput,
  VenueAlternate,
  Outing,
  OutingCategory,
  PartnerKind,
  PartnerOffer,
  PlanId,
  PlanInterval,
  Request,
  Review,
  User,
  UserRatingStats,
  VenueRatingStats,
} from './types';
import {
  creditsForSubscribe,
  canConfirmOuting as gateCanConfirmOuting,
  ConfirmGateResult,
  shouldConsumeCreditOnConfirm,
} from '../utils/subscription';
import {
  CANCEL_FREE_BEFORE_HOURS,
  DEPOSIT_EUROS as DEPOSIT_FROM_PRICING,
  describeDepositForfeitMoment,
  isCancelFreeWindow,
} from './pricing';
import {
  isParisSameDay,
  isStartsAtPast,
  parisMonthKey,
  parisYmd,
} from '../utils/parisTime';
import {
  canGuestSelfArrivePartner,
  canPartnerFlagDispute,
  canPartnerMarkGuestAbsent,
  canPartnerOrUserCreateOuting,
  isPartnerClosed,
  isPartnerCultureHost,
  isPartnerCultureListing,
  isPartnerListing,
  isPartnerRestoBarHost,
  isPartnerUser,
  nextPartnerWarningState,
  PARTNER_CULTURE_CAPACITY,
  PARTNER_KIND_LABELS,
  requestHoldsSeat,
  shouldAutoRefundPartnerSilence,
  validatePartnerOffer,
} from '../utils/partners';
import {
  isOutingAcceptingRequests,
  isUrgentOnSite,
  isVisibleOnAnnoncesFeed,
  outingOccupiesActiveSlot,
  OUTING_AUTO_COMPLETE_AFTER_MS,
  shouldAutoPromoteUrgent,
  URGENT_ON_SITE_ACCEPT_MS,
  wasPresent,
} from '../utils/outingActive';
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
  canConsumeMonthlyJoker,
  isJokerExempted,
  resolveGuestCancelDeposit,
  shouldApplyGuestNoShowPenalty,
} from '../utils/jokerExemption';
import {
  canActorBlockUser,
  canActorConfirmSlot,
  canActorMarkGuestPresent,
  canActorReportGuestNoShow,
  canActorReportHostNoShow,
  guestSanctionFromStrike,
  hostSanctionFromStrike,
} from '../utils/participationRights';
import { makeVenueKey } from '../utils/venue';
import {
  cancelScheduledNotificationIds,
  ensureAndroidChannel,
  scheduleAcceptedConfirmNotifications,
  scheduleChatUnlockNotification,
  simulateDemoNotifications,
  sendPriorityPush,
  type PriorityNotifType,
  type ScheduledNotifIds,
} from '../utils/notifications';

/**
 * Lot E — monolithe volontaire pour la démo.
 * Frontières futures (stubs, non branchés) : src/services/
 *   reservations | deposits | notifications | demoTools | supabase | stripe (TEST)
 * Ne pas migrer la logique ici tant que les ports ne sont pas délégués.
 * Voir README « Architecture » + docs/backend-prep.md.
 */

/**
 * Guest confirm hold after host accept (~10 min).
 * Deadlines are stored as ISO UTC (Date.toISOString()); display via parisTime (Europe/Paris).
 */
const CONFIRM_WINDOW_MS = 10 * 60 * 1000;

/** Restore one reserved seat (after expire / cancel accepted|confirmed). Never reopen closed/cancelled/completed. */
function withRestoredSeat(o: Outing): Outing {
  if (
    o.status === 'closed' ||
    o.status === 'cancelled' ||
    o.status === 'completed'
  ) {
    return { ...o, spotsLeft: Math.min(o.capacity, o.spotsLeft + 1) };
  }
  const spotsLeft = Math.min(o.capacity, o.spotsLeft + 1);
  return {
    ...o,
    spotsLeft,
    status: spotsLeft > 0 && o.status === 'full' ? ('open' as const) : o.status,
  };
}

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
  blockedUserIds: [],
  userReports: [],
  partnerWarningsByHost: {},
};

/** Paris neighborhoods default for a demo venue. */
const DEMO_PARTNER_DEFAULTS: Record<
  PartnerKind,
  { venueName: string; phrase: string }
> = {
  resto: {
    venueName: 'Mon bistrot (démo)',
    phrase: 'Bistrot de quartier — une table libre de temps en temps.',
  },
  bar: {
    venueName: 'Mon bar (démo)',
    phrase: 'Bar de quartier — un verre pour lancer la soirée.',
  },
  culture: {
    venueName: 'Ma salle (démo)',
    phrase: 'Salle de spectacle — places offertes les soirs de première.',
  },
};

/** Profil → Modifier, feuille « premier moment », option femmes. */
export type ProfileUpdate = {
  bio?: string;
  interests?: string[];
  customFilters?: string[];
  neighborhood?: string;
  firstName?: string;
  age?: number;
  photoUri?: string | null;
  /** Demandés plus tard (plus à l’entrée). */
  gender?: Gender | null;
  genderDetail?: string | null;
  phone?: string | null;
  womenOnlyPreference?: boolean;
  momentPromptSeen?: boolean;
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
      // Partenaire culture : jusqu'à 5 le même soir ; sinon 1 active.
      const gate = canPartnerOrUserCreateOuting(
        user,
        action.payload.startsAt,
        state.outings,
        state.requests,
      );
      if (!gate.ok) return state;
      const targeted = action.targetedRequest;
      // Keep destinataire id — never rewrite targetedRequest.userId to currentUser.
      if (
        targeted &&
        (targeted.outingId !== action.payload.id ||
          !action.payload.inviteeUserId ||
          targeted.userId !== action.payload.inviteeUserId)
      ) {
        return {
          ...state,
          outings: [action.payload, ...state.outings],
        };
      }
      return {
        ...state,
        outings: [action.payload, ...state.outings],
        requests: targeted
          ? [targeted, ...state.requests]
          : state.requests,
      };
    }

    case 'CLOSE_OUTING': {
      // Host closes listing only: confirmed guests keep their seats.
      // Pending/accepted cancelled; accepted seats restored (spotsLeft).
      const outingId = action.payload.outingId;
      const target = state.outings.find((o) => o.id === outingId);
      if (
        !target ||
        target.status === 'completed' ||
        target.status === 'closed' ||
        target.status === 'cancelled'
      ) {
        return state;
      }
      // Partner auto-seat holds (accepted sans chaise) ne rendent rien.
      const acceptedCount = state.requests.filter(
        (r) =>
          r.outingId === outingId &&
          r.status === 'accepted' &&
          requestHoldsSeat(r),
      ).length;
      return {
        ...state,
        outings: state.outings.map((o) => {
          if (o.id !== outingId) return o;
          let spotsLeft = o.spotsLeft;
          for (let i = 0; i < acceptedCount; i++) {
            spotsLeft = Math.min(o.capacity, spotsLeft + 1);
          }
          return { ...o, status: 'closed' as const, spotsLeft };
        }),
        requests: state.requests.map((r) =>
          r.outingId === outingId &&
          (r.status === 'pending' || r.status === 'accepted')
            ? { ...r, status: 'cancelled' as const }
            : r,
        ),
      };
    }

    case 'CANCEL_OUTING': {
      // Host cancels the whole outing (incl. confirmed). Distinct from CLOSE_OUTING.
      // Outing status → cancelled (≠ closed clôture / completed terminée).
      // Deposits: host-initiated → always returned (guests not at fault).
      // Guest free-cancel window is CANCEL_FREE_BEFORE_HOURS (≥3h) via isCancelFreeWindow
      // on CANCEL_REQUEST; host cancel never forfeits guest deposits.
      const { outingId } = action.payload;
      const target = state.outings.find((o) => o.id === outingId);
      if (
        !target ||
        target.status === 'completed' ||
        target.status === 'cancelled'
      ) {
        return state;
      }
      return {
        ...state,
        outings: state.outings.map((o) =>
          o.id === outingId ? { ...o, status: 'cancelled' as const } : o,
        ),
        requests: state.requests.map((r) => {
          if (r.outingId !== outingId) return r;
          if (r.status === 'confirmed') {
            return {
              ...r,
              status: 'cancelled' as const,
              depositStatus:
                r.depositStatus === 'held' || !r.depositStatus
                  ? ('returned' as const)
                  : r.depositStatus,
            };
          }
          if (r.status === 'pending' || r.status === 'accepted') {
            return { ...r, status: 'cancelled' as const };
          }
          return r;
        }),
      };
    }

    case 'CANCEL_REQUEST': {
      // Guest withdraws one seat OR host cancels one accepted hold.
      // Never closes the outing / never cancels other confirmed guests.
      const { requestId, cancelledAt, by } = action.payload;
      const req = state.requests.find((r) => r.id === requestId);
      if (!req) return state;
      if (
        req.status !== 'pending' &&
        req.status !== 'accepted' &&
        req.status !== 'confirmed'
      ) {
        return state;
      }
      const outing = state.outings.find((o) => o.id === req.outingId);
      // Partner auto-seat: accepted ne tient pas de chaise (prise à la confirm).
      const heldSeat = requestHoldsSeat(req);
      let depositStatus = req.depositStatus;
      if (req.status === 'confirmed') {
        const free = Boolean(
          outing &&
            isCancelFreeWindow(
              outing.startsAt,
              new Date(cancelledAt).getTime(),
            ),
        );
        const jokerExempted = isJokerExempted(state.imprevuReports, {
          outingId: req.outingId,
          reporterId: req.userId,
          requestId: req.id,
        });
        // Guest late cancel after joker must NOT re-forfeit (lot 2).
        depositStatus = resolveGuestCancelDeposit({
          by,
          freeWindow: free,
          jokerExempted,
          currentDeposit: req.depositStatus,
        });
      }
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: 'cancelled' as const,
                ...(req.status === 'confirmed' ? { depositStatus } : {}),
              }
            : r,
        ),
        outings: heldSeat
          ? state.outings.map((o) => {
              if (o.id !== req.outingId) return o;
              const restored = withRestoredSeat(o);
              // Partenaire clôturé « plein » : un désistement avant l’heure rouvre.
              if (
                o.partnerAutoClosedFull &&
                o.status === 'closed' &&
                restored.spotsLeft > 0 &&
                !isStartsAtPast(o.startsAt, new Date(cancelledAt).getTime())
              ) {
                return {
                  ...restored,
                  status: 'open' as const,
                  partnerAutoClosedFull: false,
                };
              }
              return restored;
            })
          : state.outings,
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
      // Annonce partenaire : zéro clic côté lieu (pas d’« Accepter »).
      if (isPartnerListing(outing)) return state;
      if (outing.status === 'completed' || outing.status === 'cancelled') {
        return state;
      }
      if (!isOutingAcceptingRequests(outing)) return state;

      const newSpots = outing.spotsLeft - 1;
      // Same Paris calendar day only — accepting mardi must not cancel samedi.
      const acceptedDay = parisYmd(outing.startsAt);
      return {
        ...state,
        // Accept this seat; cancel requester's other pending on the *same* day only.
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
            const other = state.outings.find((o) => o.id === r.outingId);
            if (
              other &&
              acceptedDay &&
              parisYmd(other.startsAt) === acceptedDay
            ) {
              return { ...r, status: 'cancelled' as const };
            }
            return r;
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
      // Idempotent: already confirmed → no double deposit / no double credit
      if (req && req.status === 'confirmed') return state;
      if (!req || req.status !== 'accepted') return state;
      {
        const outingGate = state.outings.find((o) => o.id === req.outingId);
        if (outingGate) {
          if (
            outingGate.status === 'completed' ||
            outingGate.status === 'cancelled'
          ) {
            return state;
          }
          // Urgent: startsAt is « now » — allow confirm while listing still open/full
          // (accepted seats are cancelled on closeOuting). Normal: block once started.
          if (
            !isUrgentOnSite(outingGate) &&
            isStartsAtPast(
              outingGate.startsAt,
              new Date(action.payload.confirmedAt).getTime(),
            )
          ) {
            return state;
          }
          if (
            isUrgentOnSite(outingGate) &&
            outingGate.status !== 'open' &&
            outingGate.status !== 'full'
          ) {
            return state;
          }
        }
      }
      if (
        req.confirmDeadlineAt &&
        new Date(action.payload.confirmedAt).getTime() >
          new Date(req.confirmDeadlineAt).getTime()
      ) {
        // Too late — expire, free seat
        return reducer(state, {
          type: 'EXPIRE_REQUEST',
          payload: { requestId: action.payload.requestId },
        });
      }
      // --- Annonce partenaire : chaise prise à la confirmation (atomique). ---
      const partnerOuting = state.outings.find((o) => o.id === req.outingId);
      if (partnerOuting && req.partnerAutoSeat && isPartnerListing(partnerOuting)) {
        const hasSeat =
          partnerOuting.status === 'open' && partnerOuting.spotsLeft > 0;
        if (!hasSeat) {
          // Plus de place : refus, caution jamais bloquée (ou rendue aussitôt).
          return {
            ...state,
            requests: state.requests.map((r) =>
              r.id === req.id
                ? {
                    ...r,
                    status: 'expired' as const,
                    partnerNoSpot: true,
                    depositStatus:
                      r.depositStatus === 'held'
                        ? ('returned' as const)
                        : ('none' as const),
                  }
                : r,
            ),
          };
        }
        const newSpots = partnerOuting.spotsLeft - 1;
        const nowFull = newSpots <= 0;
        let partnerUser = state.currentUser;
        if (partnerUser && partnerUser.id === req.userId) {
          partnerUser = {
            ...partnerUser,
            dispoSoir: false,
            dispoExpiresAt: undefined,
            ...(action.payload.consumeCredit &&
            (partnerUser.outingCredits ?? 0) > 0
              ? { outingCredits: (partnerUser.outingCredits ?? 0) - 1 }
              : {}),
          };
        }
        return {
          ...state,
          currentUser: partnerUser,
          requests: state.requests.map((r) => {
            if (r.id === req.id) {
              return {
                ...r,
                status: 'confirmed' as const,
                confirmedAt: action.payload.confirmedAt,
                depositStatus: 'held' as const,
              };
            }
            // Plein : les autres « à confirmer » voient « Plus de place ».
            if (
              nowFull &&
              r.outingId === req.outingId &&
              r.status === 'accepted' &&
              r.partnerAutoSeat
            ) {
              return {
                ...r,
                status: 'expired' as const,
                partnerNoSpot: true,
                depositStatus: 'none' as const,
              };
            }
            return r;
          }),
          outings: state.outings.map((o) =>
            o.id === req.outingId
              ? {
                  ...o,
                  spotsLeft: Math.max(0, newSpots),
                  // Plein → clôturée (closed, pas cancelled).
                  ...(nowFull
                    ? { status: 'closed' as const, partnerAutoClosedFull: true }
                    : {}),
                }
              : o,
          ),
        };
      }
      const outingForRace = state.outings.find((o) => o.id === req.outingId);
      if (outingForRace) {
        const alreadyConfirmed = state.requests.filter(
          (r) =>
            r.outingId === req.outingId &&
            r.status === 'confirmed' &&
            r.id !== req.id,
        );
        // Capacity race: other confirms already filled capacity → race_lost
        if (alreadyConfirmed.length >= outingForRace.capacity) {
          return reducer(state, {
            type: 'EXPIRE_REQUEST',
            payload: { requestId: action.payload.requestId },
          });
        }
      }
      let nextUser = state.currentUser;
      if (
        nextUser &&
        (nextUser.id === req.userId ||
          state.outings.some(
            (o) => o.id === req.outingId && o.hostId === nextUser!.id,
          ))
      ) {
        nextUser = {
          ...nextUser,
          dispoSoir: false,
          dispoExpiresAt: undefined,
        };
      }
      // Consume credit once on accepted→confirmed only (idempotent path returned above).
      // Lot 6: only the request owner’s credits — never the host’s.
      if (
        action.payload.consumeCredit &&
        nextUser &&
        nextUser.id === req.userId &&
        (nextUser.outingCredits ?? 0) > 0
      ) {
        nextUser = {
          ...nextUser,
          outingCredits: (nextUser.outingCredits ?? 0) - 1,
        };
      }
      return {
        ...state,
        currentUser: nextUser,
        requests: state.requests.map((r) =>
          r.id === action.payload.requestId
            ? {
                ...r,
                status: 'confirmed' as const,
                confirmedAt: action.payload.confirmedAt,
                // Hold deposit once (already held stays held)
                depositStatus:
                  r.depositStatus === 'held' ? r.depositStatus : ('held' as const),
              }
            : r,
        ),
      };
    }

    case 'EXPIRE_REQUEST': {
      // Confirm window missed or race_lost — free the reserved seat.
      const req = state.requests.find((r) => r.id === action.payload.requestId);
      if (!req || req.status !== 'accepted') return state;
      const restore = requestHoldsSeat(req);
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === action.payload.requestId
            ? { ...r, status: 'expired' as const }
            : r,
        ),
        outings: restore
          ? state.outings.map((o) =>
              o.id === req.outingId ? withRestoredSeat(o) : o,
            )
          : state.outings,
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
        ...(p.age !== undefined ? { age: p.age } : {}),
        ...(p.customFilters !== undefined
          ? { customFilters: p.customFilters }
          : {}),
        ...(p.photoUri !== undefined
          ? {
              photoUri: p.photoUri === null ? undefined : p.photoUri,
            }
          : {}),
        ...clearOrSet('dispoBudgetMax', p.dispoBudgetMax),
        ...clearOrSet('dispoCategoryDetail', p.dispoCategoryDetail),
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
        ...clearOrSet('gender', p.gender),
        ...clearOrSet('genderDetail', p.genderDetail),
        ...(p.phone !== undefined
          ? { phone: p.phone?.trim() ? p.phone.trim() : undefined }
          : {}),
        ...(p.momentPromptSeen !== undefined
          ? { momentPromptSeen: p.momentPromptSeen }
          : {}),
      };
      // « Femmes uniquement » n’a de sens que pour un profil femme.
      if (next.gender !== 'femme' && next.womenOnlyPreference) {
        next = { ...next, womenOnlyPreference: false };
      }
      if (next.gender !== 'autre' && next.genderDetail) {
        next = { ...next, genderDetail: undefined };
      }
      if (p.dispoSoir === true && !next.dispoExpiresAt) {
        next = {
          ...next,
          dispoExpiresAt: computeDispoExpiresAt(
            next.dispoSlot ?? 'soir',
          ).toISOString(),
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
        blockedUserIds: [],
        userReports: [],
        partnerWarningsByHost: {},
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
      } = action.payload;
      const report = state.imprevuReports.find((r) => r.id === imprevuId);
      if (!report || report.status !== 'pending') return state;

      const status =
        decision === 'accepted'
          ? ('accepted' as const)
          : decision === 'auto_refused'
            ? ('auto_refused' as const)
            : ('refused' as const);

      const outing = state.outings.find((o) => o.id === report.outingId);
      const reporterIsHost = !!outing && report.reporterId === outing.hostId;

      let requests = state.requests;
      let outings = state.outings;

      if (decision === 'accepted') {
        // Guest imprévu accepté = cette participation only (caution rendue, pas
        // d'absence). Autres confirmés gardent leur place. ≠ cancelOuting hôte.
        if (!reporterIsHost) {
          const targetId =
            report.requestId &&
            state.requests.some(
              (r) =>
                r.id === report.requestId &&
                r.userId === report.reporterId &&
                r.outingId === report.outingId,
            )
              ? report.requestId
              : state.requests.find(
                  (r) =>
                    r.outingId === report.outingId &&
                    r.userId === report.reporterId &&
                    (r.status === 'confirmed' ||
                      r.status === 'accepted' ||
                      r.status === 'pending'),
                )?.id;
          if (targetId) {
            const req = state.requests.find((r) => r.id === targetId)!;
            const heldSeat =
              req.status === 'accepted' || req.status === 'confirmed';
            requests = state.requests.map((r) => {
              if (r.id !== targetId) return r;
              if (r.status === 'confirmed') {
                return {
                  ...r,
                  status: 'cancelled' as const,
                  depositStatus:
                    r.depositStatus === 'held' || !r.depositStatus
                      ? ('returned' as const)
                      : r.depositStatus,
                };
              }
              return { ...r, status: 'cancelled' as const };
            });
            if (heldSeat) {
              outings = state.outings.map((o) =>
                o.id === report.outingId ? withRestoredSeat(o) : o,
              );
            }
          }
        }
        // Host reporter: acceptation ≠ annuler le groupe — hôte utilise cancelOuting.
      } else {
        requests = state.requests.map((r) => {
          if (r.outingId !== report.outingId) return r;
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
      }

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


    case 'USE_JOKER_ON_IMPREVU': {
      const { imprevuId, requestId, monthKey } = action.payload;
      const report = state.imprevuReports.find((r) => r.id === imprevuId);
      if (!report) return state;
      if (report.status !== 'refused' && report.status !== 'auto_refused') {
        return state;
      }
      if (report.jokerUsed) return state;
      let currentUser = state.currentUser;
      // Atomic monthly quota (lot 2): refuse if already consumed this Paris month
      // even when two dispatches race past the callback guard.
      if (currentUser && currentUser.id === report.reporterId) {
        if (!canConsumeMonthlyJoker(currentUser.jokerUsedMonthKey, monthKey)) {
          return state;
        }
        currentUser = { ...currentUser, jokerUsedMonthKey: monthKey };
      }
      return {
        ...state,
        currentUser,
        imprevuReports: state.imprevuReports.map((r) =>
          r.id === imprevuId ? { ...r, jokerUsed: true } : r,
        ),
        requests: state.requests.map((r) =>
          r.id === requestId
            ? { ...r, depositStatus: 'returned' as const }
            : r,
        ),
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

    case 'MARK_OUTING_URGENT': {
      const { outingId, urgentAutoH90 } = action.payload;
      return {
        ...state,
        outings: state.outings.map((o) => {
          if (o.id !== outingId) return o;
          if (o.urgentOnSite) return o;
          return {
            ...o,
            urgentOnSite: true,
            ...(urgentAutoH90 ? { urgentAutoH90: true } : {}),
          };
        }),
      };
    }

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

    case 'COMPLETE_OUTING': {
      // Plan « terminée ». Confirmé ≠ présent :
      // never auto-mark attendance (that is MARK_GUEST_PRESENT).
      // Pending/accepted must not stay actionable — cancel + restore accepted seats
      // (same cleanup as CLOSE_OUTING; confirmed guests keep their row).
      const { outingId } = action.payload;
      const target = state.outings.find((o) => o.id === outingId);
      if (
        !target ||
        target.status === 'completed' ||
        target.status === 'cancelled'
      ) {
        return state;
      }
      const acceptedCount = state.requests.filter(
        (r) =>
          r.outingId === outingId &&
          r.status === 'accepted' &&
          requestHoldsSeat(r),
      ).length;
      return {
        ...state,
        outings: state.outings.map((o) => {
          if (o.id !== outingId) return o;
          let spotsLeft = o.spotsLeft;
          for (let i = 0; i < acceptedCount; i++) {
            spotsLeft = Math.min(o.capacity, spotsLeft + 1);
          }
          return { ...o, status: 'completed' as const, spotsLeft };
        }),
        requests: state.requests.map((r) =>
          r.outingId === outingId &&
          (r.status === 'pending' || r.status === 'accepted')
            ? { ...r, status: 'cancelled' as const }
            : r,
        ),
      };
    }

    case 'MARK_GUEST_PRESENT': {
      // Explicit presence (host / check-in). ≠ COMPLETE_OUTING / CLOSE_OUTING.
      const { requestId } = action.payload;
      return {
        ...state,
        requests: state.requests.map((r) => {
          if (r.id !== requestId || r.status !== 'confirmed') return r;
          if (r.attendance === 'absent' || r.attendance === 'present') {
            return r; // idempotent; cannot override absent
          }
          return {
            ...r,
            attendance: 'present' as const,
            depositStatus:
              r.depositStatus === 'held' || !r.depositStatus
                ? ('returned' as const)
                : r.depositStatus,
          };
        }),
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
      const outing = state.outings.find((o) => o.id === outingId);
      // Lot 6: same outing / event → no double strike.
      if (outing?.hostNoShowReported) return state;
      let currentUser = state.currentUser;
      if (currentUser && currentUser.id === hostId) {
        currentUser = {
          ...currentUser,
          hostNoShowCount: strike,
          banned: banned || currentUser.banned,
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
          o.id === outingId
            ? {
                ...o,
                status: 'closed' as const,
                hostNoShowReported: true,
              }
            : o,
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
      // Lot 3: refus par un invité = cette participation only (sorti + caution
      // rendue, pas d'absence / forfeit). Les autres confirmés peuvent encore
      // répondre. ≠ annuler toute la sortie.
      const { outingId, userId, decision } = action.payload;
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing?.venueIssue) return state;
      const issue = outing.venueIssue;
      const alreadyAccepted = (issue.acceptedByUserIds ?? []).includes(userId);
      const alreadyRefused = (issue.refusedByUserIds ?? []).includes(userId);
      if (alreadyAccepted || alreadyRefused) return state;

      const accepted = new Set(issue.acceptedByUserIds ?? []);
      const refused = new Set(issue.refusedByUserIds ?? []);
      if (decision === 'accepted') {
        accepted.add(userId);
        refused.delete(userId);
      } else {
        refused.add(userId);
        accepted.delete(userId);
      }

      let requests = state.requests;
      let seatRestored = false;
      if (decision === 'refused') {
        requests = state.requests.map((r) => {
          if (
            r.outingId !== outingId ||
            r.userId !== userId ||
            r.status !== 'confirmed'
          ) {
            return r;
          }
          seatRestored = true;
          return {
            ...r,
            status: 'cancelled' as const,
            depositStatus:
              r.depositStatus === 'held' || !r.depositStatus
                ? ('returned' as const)
                : r.depositStatus,
          };
        });
      }

      const stillPending = requests.some(
        (r) =>
          r.outingId === outingId &&
          r.status === 'confirmed' &&
          !accepted.has(r.userId) &&
          !refused.has(r.userId),
      );
      const status = stillPending
        ? ('alternate_proposed' as const)
        : accepted.size > 0
          ? ('alternate_accepted' as const)
          : ('refused' as const);

      return {
        ...state,
        requests,
        outings: state.outings.map((o) => {
          if (o.id !== outingId || !o.venueIssue) return o;
          let next: Outing = {
            ...o,
            venueIssue: {
              ...issue,
              status,
              acceptedByUserIds: Array.from(accepted),
              refusedByUserIds: Array.from(refused),
            },
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
          if (seatRestored) next = withRestoredSeat(next);
          return next;
        }),
      };
    }

    case 'REPORT_GUEST_NO_SHOW': {
      const { outingId, requestId, guestId, strike, lowerPriority, banned } =
        action.payload;
      const existing = state.requests.find((r) => r.id === requestId);
      // Lot 6: same absence event → no double strike / forfeit.
      if (existing?.attendance === 'absent') return state;
      // Lot 2: joker exemption — no re-forfeit, no absence strike on this case.
      const jokerExempted = isJokerExempted(state.imprevuReports, {
        outingId,
        reporterId: guestId,
        requestId,
      });
      if (!shouldApplyGuestNoShowPenalty(jokerExempted)) {
        return {
          ...state,
          requests: state.requests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  // Keep seat outcome soft; never forfeit a joker return.
                  depositStatus:
                    r.depositStatus === 'returned' || r.depositStatus === 'held'
                      ? ('returned' as const)
                      : r.depositStatus === 'forfeited'
                        ? ('returned' as const)
                        : r.depositStatus,
                }
              : r,
          ),
        };
      }
      let currentUser = state.currentUser;
      if (currentUser && currentUser.id === guestId) {
        currentUser = {
          ...currentUser,
          guestNoShowCount: strike,
          lowerPriority: lowerPriority || currentUser.lowerPriority,
          profileMention: lowerPriority
            ? banned
              ? '3e absence — compte fermé (démo)'
              : 'Absence après confirmation (démo)'
            : currentUser.profileMention,
          banned: banned || currentUser.banned,
          bannedReason: banned
            ? '3e absence après confirmation — compte fermé (démo)'
            : currentUser.bannedReason,
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
            ? {
                ...r,
                attendance: 'absent' as const,
                depositStatus: 'forfeited' as const,
              }
            : r,
        ),
        outings: state.outings.map((o) =>
          o.id === outingId ? { ...o, status: 'closed' as const } : o,
        ),
      };
    }

    case 'REPORT_HOST_NEVER_HONOR': {
      const { outingId, hostId, strike, banned } = action.payload;
      const outing = state.outings.find((o) => o.id === outingId);
      // Lot 6: same outing → no double never-honor strike.
      if (outing?.hostNeverHonorReported) return state;
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
          o.id === outingId
            ? {
                ...o,
                status: 'closed' as const,
                hostNeverHonorReported: true,
              }
            : o,
        ),
      };
    }

    case 'RUN_CONFIRM_RACE_DEMO': {
      // Demo: 2 users last seat — winner confirms, loser expires (race_lost).
      const { outingId, winner, loser, winnerConfirmedAt } = action.payload;
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
        outings: state.outings.map((o) =>
          o.id === outingId
            ? {
                ...o,
                // Winner keeps the seat; loser never held a lasting reservation
                spotsLeft: 0,
                status: 'full' as const,
              }
            : o,
        ),
      };
    }

    case 'REPORT_USER': {
      const report = action.payload;
      // One reporter→target pair: replace prior report, no multi-sanctions.
      const filtered = state.userReports.filter(
        (r) =>
          !(
            r.reporterId === report.reporterId &&
            r.targetUserId === report.targetUserId
          ),
      );
      return {
        ...state,
        userReports: [report, ...filtered],
      };
    }

    case 'BLOCK_USER': {
      const id = action.payload.userId;
      if (state.blockedUserIds.includes(id)) return state;
      return {
        ...state,
        blockedUserIds: [...state.blockedUserIds, id],
      };
    }

    case 'UNBLOCK_USER': {
      return {
        ...state,
        blockedUserIds: state.blockedUserIds.filter(
          (id) => id !== action.payload.userId,
        ),
      };
    }

    case 'SUBMIT_PARTNER_APPLICATION': {
      const u = state.currentUser;
      if (!u) return state;
      const st = u.partnerStatus ?? 'none';
      if (st === 'pending' || st === 'active' || st === 'closed') return state;
      const p = action.payload;
      return {
        ...state,
        currentUser: {
          ...u,
          isPartner: false,
          partnerStatus: 'pending',
          partnerKind: p.kind,
          partnerVenueName: p.venueName.trim(),
          partnerNeighborhood: p.neighborhood.trim(),
          partnerPhone: p.phone.trim(),
          partnerPhrase: p.phrase.trim(),
        },
      };
    }

    case 'REVIEW_PARTNER_APPLICATION': {
      const u = state.currentUser;
      if (!u || u.partnerStatus !== 'pending') return state;
      if (action.payload.decision === 'active') {
        return {
          ...state,
          currentUser: {
            ...u,
            isPartner: true,
            partnerStatus: 'active',
            partnerWarnings: u.partnerWarnings ?? 0,
          },
        };
      }
      // Refus = reste particulier.
      return {
        ...state,
        currentUser: { ...u, isPartner: false, partnerStatus: 'refused' },
      };
    }

    case 'DEMO_BECOME_PARTNER': {
      const u = state.currentUser;
      if (!u) return state;
      const kind = action.payload.kind;
      const d = DEMO_PARTNER_DEFAULTS[kind];
      const sameKind = u.partnerKind === kind && !!u.partnerVenueName?.trim();
      return {
        ...state,
        currentUser: {
          ...u,
          isPartner: true,
          partnerStatus: 'active',
          partnerKind: kind,
          partnerVenueName: sameKind ? u.partnerVenueName : d.venueName,
          partnerNeighborhood: u.partnerNeighborhood || u.neighborhood,
          partnerPhone: u.partnerPhone || u.phone,
          partnerPhrase: sameKind && u.partnerPhrase ? u.partnerPhrase : d.phrase,
          partnerWarnings: 0,
        },
      };
    }

    case 'DEMO_LEAVE_PARTNER': {
      const u = state.currentUser;
      if (!u) return state;
      return {
        ...state,
        currentUser: {
          ...u,
          isPartner: false,
          partnerStatus: 'none',
          partnerWarnings: 0,
          partnerPinned: false,
        },
      };
    }

    case 'SET_PARTNER_PINNED': {
      const u = state.currentUser;
      if (!u) return state;
      const pinned = action.payload.pinned;
      return {
        ...state,
        currentUser: { ...u, partnerPinned: pinned },
        // Annonces partenaires en cours suivent le flag (démo).
        outings: state.outings.map((o) =>
          o.hostId === u.id && o.isPartnerListing
            ? { ...o, partnerPinned: pinned }
            : o,
        ),
      };
    }

    case 'APPLY_PARTNER_WARNING': {
      const { outingId, hostId } = action.payload;
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing || !isPartnerListing(outing)) return state;
      if (outing.partnerWarningApplied) return state;
      const prev =
        state.currentUser?.id === hostId
          ? (state.currentUser.partnerWarnings ?? 0)
          : (state.partnerWarningsByHost[hostId] ?? 0);
      const next = nextPartnerWarningState(prev);
      let currentUser = state.currentUser;
      if (currentUser && currentUser.id === hostId) {
        currentUser = {
          ...currentUser,
          partnerWarnings: next.partnerWarnings,
          ...(next.closed
            ? { partnerStatus: 'closed' as const, isPartner: false }
            : {}),
        };
      }
      return {
        ...state,
        currentUser,
        partnerWarningsByHost: {
          ...state.partnerWarningsByHost,
          [hostId]: next.partnerWarnings,
        },
        outings: state.outings.map((o) =>
          o.id === outingId ? { ...o, partnerWarningApplied: true } : o,
        ),
      };
    }

    case 'GUEST_ARRIVED_PARTNER': {
      const { requestId, arrivedAt, arrivalPhotoUri } = action.payload;
      return {
        ...state,
        requests: state.requests.map((r) => {
          if (r.id !== requestId || r.status !== 'confirmed') return r;
          if (r.guestArrivedAt || r.attendance === 'present') return r;
          const photo = arrivalPhotoUri ? { arrivalPhotoUri } : {};
          if (r.attendance === 'absent') {
            // « Pas venu » déjà tapé puis « Je suis arrivé » → litige, pas de sanction auto.
            return {
              ...r,
              guestArrivedAt: arrivedAt,
              ...photo,
              partnerDispute: r.partnerDispute ?? {
                openedAt: arrivedAt,
                trigger: 'arrival_after_absent' as const,
                note: 'Litige : le lieu a signalé « Pas venu », l’invité dit être arrivé. Photo demandée plus tard (stub).',
              },
            };
          }
          // Arrivé + pas de « Pas venu » → présent, caution rendue.
          return {
            ...r,
            attendance: 'present' as const,
            guestArrivedAt: arrivedAt,
            ...photo,
            depositStatus:
              r.depositStatus === 'held' || !r.depositStatus
                ? ('returned' as const)
                : r.depositStatus,
          };
        }),
      };
    }

    case 'OPEN_PARTNER_DISPUTE': {
      const { requestId, at } = action.payload;
      return {
        ...state,
        requests: state.requests.map((r) => {
          if (r.id !== requestId || r.status !== 'confirmed') return r;
          if (r.partnerDispute || !r.guestArrivedAt) return r;
          return {
            ...r,
            partnerMarkedAbsentAt: at,
            partnerDispute: {
              openedAt: at,
              trigger: 'absent_after_arrival' as const,
              note: 'Litige : l’invité dit être arrivé, le lieu signale « Pas venu ». Photo demandée plus tard (stub).',
            },
          };
        }),
      };
    }

    case 'MARK_PARTNER_ABSENT_AT': {
      const { requestId, at } = action.payload;
      return {
        ...state,
        requests: state.requests.map((r) =>
          r.id === requestId ? { ...r, partnerMarkedAbsentAt: at } : r,
        ),
      };
    }

    case 'RETURN_DEPOSIT_SILENCE': {
      const { requestId } = action.payload;
      return {
        ...state,
        requests: state.requests.map((r) => {
          if (r.id !== requestId || r.status !== 'confirmed') return r;
          if (r.attendance || r.partnerDispute) return r;
          if (r.depositStatus !== 'held') return r;
          // Silence des deux : caution rendue, ni absence ni présence.
          return { ...r, depositStatus: 'returned' as const };
        }),
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
  // Lieux partenaires exclus : leur offre ne se transfère pas à une autre sortie.
  const pool0 = mockOutings.filter((o) => !isPartnerListing(o));
  const candidates = pool0.filter(
    (o) =>
      o.id !== outing.id &&
      o.neighborhood === outing.neighborhood &&
      Math.abs(o.budgetMaxEuros - outing.budgetMaxEuros) <= 15,
  );
  const pool =
    candidates.length > 0
      ? candidates
      : pool0.filter(
          (o) => o.id !== outing.id && o.neighborhood === outing.neighborhood,
        );
  const pick =
    pool[0] ??
    pool0.find((o) => o.id !== outing.id) ??
    outing;
  return {
    venueName: pick.venueName + (pick === outing ? ' (bis)' : ''),
    approxArea: pick.approxArea,
    exactAddress: pick.exactAddress,
    budgetMaxEuros: pick.budgetMaxEuros,
    neighborhood: pick.neighborhood,
  };
}

type CreateOutingFailReason =
  | 'no_user'
  | 'already_active'
  | 'banned'
  | 'starts_in_past'
  | 'partner_closed'
  | 'culture_evening_full'
  | 'partner_offer_required'
  | 'partner_offer_invalid';

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
    capacity: 1 | 2 | 3;
    womenOnly: boolean;
    budgetMaxEuros: number;
    categoryDetail?: string;
    topic?: string;
    excludedTopics?: string[];
    flexibleSlot?: boolean;
    inviteIncludes?: string;
    inviteExtras?: string;
    ticketsAlreadyBought?: boolean;
    /** Urgent « déjà sur place » — startsAt = now, capacity forced to 1. */
    urgentOnSite?: boolean;
    /**
     * Proposition ciblée Dispo/profil — persist THIS recipient id
     * (never replace with currentUser). Invitee sees it in Demandes.
     */
    inviteeUserId?: string;
    inviteeName?: string;
    /** Compte lieu resto/bar : geste et/ou remise (au moins un). */
    partnerOffer?: PartnerOffer;
  }) =>
    | { ok: true; outingId: string }
    | {
        ok: false;
        reason: CreateOutingFailReason;
      };
  /**
   * Host closes listing (no new requests). Confirmed guests stay.
   * Pending/accepted cancelled + seats restored. ≠ cancelOuting / completeOuting.
   */
  closeOuting: (outingId: string) => void;
  /**
   * Host cancels the whole outing including confirmed guests; deposits returned.
   * ≠ closeOuting (keeps confirmed) / completeOuting (ends after start).
   */
  cancelOuting: (
    outingId: string,
  ) => { ok: true } | { ok: false; reason: string };
  /**
   * Guest withdraws own pending/accepted/confirmed request (or host drops one
   * accepted/confirmed seat). Does NOT cancel other confirmed guests / outing.
   */
  cancelRequest: (
    requestId: string,
    by?: 'guest' | 'host',
  ) =>
    | { ok: true; depositReturned?: boolean; depositForfeited?: boolean }
    | { ok: false; reason: string };
  joinOuting: (
    outingId: string,
    message?: string,
    suggestedDate?: string,
  ) => { ok: true; requestId: string } | { ok: false; reason: string };
  acceptRequest: (
    requestId: string,
  ) =>
    | { ok: true }
    | {
        ok: false;
        reason: 'not_found' | 'invalid' | 'outing_started' | 'outing_finished';
      };
  /** Host declines a pending request (no seat was reserved). */
  declineRequest: (requestId: string) => void;
  /**
   * Confirm seat. Idempotent: already-confirmed → { ok: true } (no double
   * deposit / credit). After deadline → expire + expired. Capacity race → race_lost.
   */
  confirmSlot: (
    requestId: string,
  ) =>
    | { ok: true }
    | {
        ok: false;
        reason:
          | 'expired'
          | 'invalid'
          | 'paywall'
          | 'race_lost'
          | 'no_spot'
          | 'outing_started'
          | 'outing_finished';
      };
  expireRequestIfNeeded: (requestId: string) => void;
  setDispoSoir: (value: boolean) => void;
  setDispoProfile: (update: DispoProfileUpdate) => void;
  updateProfile: (update: ProfileUpdate) => void;
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
  /**
   * Explicit presence (host / check-in). Confirmé ≠ présent.
   * Sets attendance present + returns held deposit. Idempotent.
   */
  markGuestPresent: (
    requestId: string,
  ) => { ok: true } | { ok: false; reason: string };
  /**
   * Demo QA only — marks confirmed guests present without the host-only gate
   * (prod markGuestPresent stays host-only / lot 6).
   * Host: all confirmed on outing. Guest: own confirmed request only.
   * Returns a LeaveReview target when someone was (or already is) present.
   */
  demoMarkConfirmedPresent: (outingId: string) =>
    | {
        ok: true;
        markedIds: string[];
        rateTarget: {
          outingId: string;
          toUserId: string;
          toUserName: string;
        } | null;
      }
    | { ok: false; reason: string };
  /** Completed outings where user took part but nobody present → nothing to rate (démo recovery). */
  getCompletedOutingsMissingPresent: () => {
    outing: Outing;
    rateTarget: { toUserId: string; toUserName: string };
  }[];
  addReview: (input: {
    outingId: string;
    toUserId: string;
    rating: 1 | 2 | 3 | 4 | 5;
    comment?: string;
    venueRating: 1 | 2 | 3 | 4 | 5;
    venueComment?: string;
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
  /** Whether current user may leave a review for toUserId on outingId. */
  canLeaveReview: (
    outingId: string,
    toUserId: string,
  ) => { ok: true } | { ok: false; reason: string };
  /**
   * Private signalement — ≠ public rating. One report = one record
   * (no invented multi-sanctions).
   */
  reportUser: (
    targetUserId: string,
    reason: string,
  ) => { ok: true } | { ok: false; reason: string };
  /** Block a user locally (demo). Does not change ratings. */
  blockUser: (
    targetUserId: string,
  ) => { ok: true } | { ok: false; reason: string };
  unblockUser: (targetUserId: string) => void;
  isBlocked: (userId: string) => boolean;
  /** Venue-only reviews for fiche lieu (never person rating/comment). */
  getVenueReviews: (venueKey: string) => Review[];
  getVenueRatingStats: (venueKey: string) => VenueRatingStats;
  /** Completed (or demo-completed) outings the user can still rate. */
  getOutingsToRate: () => {
    outing: Outing;
    toUserId: string;
    toUserName: string;
    requestId?: string;
  }[];
  /**
   * Avis déjà envoyé par le currentUser pour ce couple sortie + personne
   * (fromUserId + toUserId). Non modifiable.
   */
  getMyReviewFor: (
    outingId: string,
    toUserId: string,
  ) => Review | undefined;
  /** Sorties terminées déjà notées par le currentUser (UI après Noter). */
  getMyRatedOutingPairs: () => {
    outing: Outing;
    toUserId: string;
    toUserName: string;
    review: Review;
  }[];
  getDisplayName: (userId: string) => string;
  showToast: (
    title: string,
    body: string,
    meta?: { type?: string; outingId?: string; requestId?: string },
  ) => void;
  /** Profil → « Je représente un lieu » : fiche → statut « Demande envoyée ». */
  submitPartnerApplication: (input: {
    venueName: string;
    kind: PartnerKind;
    neighborhood: string;
    phone: string;
    phrase: string;
  }) => { ok: true } | { ok: false; reason: string };
  /** Démo QA (équipe Moment) : valider / refuser la demande lieu. */
  reviewPartnerApplication: (
    decision: 'active' | 'refused',
  ) => { ok: true } | { ok: false; reason: string };
  /** Démo QA : « Passer en partenaire » (user courant, statut actif direct). */
  demoBecomePartner: (kind: PartnerKind) => void;
  /** Démo QA : repasser particulier. */
  demoLeavePartner: () => void;
  /** Démo QA : remontée en tête (futur forfait, sans paiement). */
  setPartnerPinned: (pinned: boolean) => void;
  /**
   * Invité partenaire : « Je suis arrivé » dès H−15 (photo façade optionnelle,
   * stub non bloquant). → présent + caution rendue (ou litige si « Pas venu »).
   */
  guestArrivedPartner: (
    requestId: string,
    opts?: { arrivalPhotoUri?: string },
  ) =>
    | { ok: true; dispute: boolean }
    | { ok: false; reason: string };
  /**
   * Lieu : « Pas venu » (chaise vide, soir même). Sans « Je suis arrivé » →
   * lapin (6,90 / 13,10). Après « Je suis arrivé » → litige, pas de sanction.
   */
  partnerMarkNoShow: (
    requestId: string,
  ) =>
    | { ok: true; outcome: 'lapin' | 'dispute' }
    | { ok: false; reason: string };
  /** Démo QA : N invités confirment sur une annonce partenaire (1er confirmé gagne). */
  simulatePartnerGuestConfirms: (
    outingId: string,
    count: number,
  ) =>
    | { ok: true; confirmed: number; noSpot: number }
    | { ok: false; reason: string };
  /** Démo QA : « lendemain » — silence des deux → cautions rendues. */
  simulatePartnerNextDay: (
    outingId: string,
  ) => { ok: true; refunded: number } | { ok: false; reason: string };
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
  /**
   * Joker mensuel (1× / mois calendaire Europe/Paris).
   * Disponible si jokerUsedMonthKey ≠ mois Paris courant.
   */
  hasJokerAvailable: () => boolean;
  /**
   * Après refus / auto_refus d’un imprévu (reporter = invité) :
   * caution returned, pas d’absence, hôte 0 €, joker consommé ce mois Paris.
   */
  useJokerOnImprevu: (
    imprevuId: string,
  ) =>
    | { ok: true }
    | {
        ok: false;
        reason:
          | 'no_user'
          | 'not_found'
          | 'not_reporter'
          | 'wrong_status'
          | 'already_used'
          | 'no_joker'
          | 'no_request'
          | 'not_guest';
      };
  /**
   * Guest absence after confirm (acteur = hôte ou invité).
   * 1 → forfeit ; 2 → priorité ; 3 → compte fermé. Idempotent per request.
   * Joker-exempted: no forfeit / no strike.
   */
  reportGuestNoShow: (
    requestId: string,
  ) =>
    | {
        ok: true;
        strike: number;
        lowerPriority: boolean;
        banned?: boolean;
        jokerExempted?: boolean;
      }
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

  /** Local push / in-app reminder handles — cancel when request/outing dies. */
  type ScheduledHandles = ScheduledNotifIds & {
    outingId?: string;
    reminderTimer?: ReturnType<typeof setTimeout>;
    chatTimer?: ReturnType<typeof setTimeout>;
  };
  const scheduledByRequestRef = useRef<Map<string, ScheduledHandles>>(new Map());

  const clearRequestSchedules = useCallback(
    (
      requestId: string,
      opts?: { keepChat?: boolean },
    ) => {
      const entry = scheduledByRequestRef.current.get(requestId);
      if (!entry) return;
      const dropPush: Array<string | undefined> = [
        entry.accepted,
        entry.reminder3min,
      ];
      if (!opts?.keepChat) dropPush.push(entry.chatUnlock);
      void cancelScheduledNotificationIds(dropPush);
      if (entry.reminderTimer) clearTimeout(entry.reminderTimer);
      if (!opts?.keepChat && entry.chatTimer) clearTimeout(entry.chatTimer);
      if (opts?.keepChat) {
        scheduledByRequestRef.current.set(requestId, {
          outingId: entry.outingId,
          chatUnlock: entry.chatUnlock,
          chatTimer: entry.chatTimer,
        });
      } else {
        scheduledByRequestRef.current.delete(requestId);
      }
    },
    [],
  );

  const clearOutingSchedules = useCallback(
    (outingId: string) => {
      for (const [requestId, entry] of [
        ...scheduledByRequestRef.current.entries(),
      ]) {
        if (entry.outingId === outingId) {
          clearRequestSchedules(requestId);
        }
      }
    },
    [clearRequestSchedules],
  );

  const completeOnboarding = useCallback((input: OnboardingInput) => {
      const now = new Date();
      const trial = new Date(now);
      trial.setMonth(trial.getMonth() + 1);
      const entryIntent: EntryIntent = input.entryIntent ?? 'feed';
      const dispoSoir = !!input.dispoSoir;
      // Tunnel court : genre, téléphone, photo, intérêts peuvent manquer —
      // demandés plus tard (Profil, premier moment, option femmes).
      const phone = input.phone?.trim() || undefined;
      const user: User = {
        id: uid('user'),
        firstName: input.firstName.trim() || 'Toi',
        age: input.age,
        gender: input.gender,
        bio: (input.bio ?? '').trim(),
        neighborhood: input.neighborhood.trim(),
        plan: 'essai',
        planInterval: null,
        outingCredits: 0,
        trialEndsAt: trial.toISOString(),
        dispoSoir,
        interests: input.interests ?? [],
        customFilters: input.customFilters ?? [],
        photoUri: input.photoUri,
        dispoCategories: dispoSoir ? [...ALL_CATEGORIES] : [],
        dispoSlot: dispoSoir ? 'soir' : undefined,
        dispoNeighborhood: dispoSoir
          ? input.neighborhood.trim()
          : undefined,
        dispoBudgetMax: undefined,
        dispoExpiresAt: dispoSoir
          ? computeDispoExpiresAt('soir', now).toISOString()
          : undefined,
        phone,
        authProvider: input.authProvider,
        womenOnlyPreference:
          input.gender === 'femme' ? !!input.womenOnlyPreference : false,
        registered: true,
        email: input.email?.trim() || undefined,
        notificationsGranted: false,
        locationGranted: false,
        createdAt: now.toISOString(),
      };
      dispatch({
        type: 'COMPLETE_ONBOARDING',
        payload: user,
        entryIntent,
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
    const now = Date.now();
    return state.outings.find(
      (o) =>
        o.hostId === user.id &&
        outingOccupiesActiveSlot(o, state.requests, now),
    );
  }, [state.currentUser, state.outings, state.requests]);

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
      capacity: 1 | 2 | 3;
      womenOnly: boolean;
      budgetMaxEuros: number;
      categoryDetail?: string;
      topic?: string;
      excludedTopics?: string[];
      flexibleSlot?: boolean;
      inviteIncludes?: string;
      inviteExtras?: string;
      ticketsAlreadyBought?: boolean;
      urgentOnSite?: boolean;
      /** Destinataire réel — never swapped for currentUser. */
      inviteeUserId?: string;
      inviteeName?: string;
      partnerOffer?: PartnerOffer;
    }):
      | { ok: true; outingId: string }
      | { ok: false; reason: CreateOutingFailReason } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      if (user.banned) return { ok: false, reason: 'banned' };
      if (isPartnerClosed(user)) return { ok: false, reason: 'partner_closed' };
      const partnerListing = isPartnerUser(user);
      // Compte lieu : pas d’urgent « déjà sur place », pas de proposition ciblée.
      const urgent = !partnerListing && input.urgentOnSite === true;
      let partnerOffer: PartnerOffer | undefined;
      if (isPartnerRestoBarHost(user)) {
        const v = validatePartnerOffer(input.partnerOffer ?? {});
        if (!v.ok) {
          return {
            ok: false,
            reason:
              v.reason === 'offer_required'
                ? 'partner_offer_required'
                : 'partner_offer_invalid',
          };
        }
        partnerOffer = v.offer;
      }
      // Urgent is by definition now — skip past-date block. Normal creates still blocked.
      if (!urgent && isStartsAtPast(input.startsAt)) {
        return { ok: false, reason: 'starts_in_past' };
      }
      const now = Date.now();
      const startsAtProbe = urgent ? new Date().toISOString() : input.startsAt;
      const createGate = canPartnerOrUserCreateOuting(
        user,
        startsAtProbe,
        state.outings,
        state.requests,
        now,
      );
      if (!createGate.ok) {
        return { ok: false, reason: createGate.reason };
      }
      if (input.womenOnly && user.gender !== 'femme') {
        // Silently force off — UI should prevent this
      }
      const topic = input.topic?.trim();
      const categoryDetail = input.categoryDetail?.trim();
      const inviteIncludes = input.inviteIncludes?.trim();
      const inviteExtras = input.inviteExtras?.trim();
      const excluded = (input.excludedTopics ?? [])
        .map((t) => t.trim())
        .filter(Boolean);
      // Culture partenaire : capacité forcée à 2. Urgent reste 1.
      let capacity: 1 | 2 | 3 = urgent ? 1 : input.capacity;
      if (!urgent && isPartnerCultureHost(user)) {
        capacity = PARTNER_CULTURE_CAPACITY;
      }
      // Partenaire : jamais de plafond « J’invite jusqu’à X € ».
      const budgetMaxEuros = partnerListing ? 0 : input.budgetMaxEuros;
      const category: OutingCategory = partnerListing
        ? user.partnerKind === 'culture'
          ? 'culture'
          : user.partnerKind === 'bar'
            ? 'bar'
            : 'restaurant'
        : input.category;
      const startsAt = urgent ? new Date().toISOString() : input.startsAt;
      // Targeted Dispo proposition: keep THAT recipient (never currentUser).
      const rawInviteeId = partnerListing ? undefined : input.inviteeUserId?.trim();
      const inviteeUserId =
        rawInviteeId && rawInviteeId !== user.id ? rawInviteeId : undefined;
      const inviteeProfile = inviteeUserId
        ? mockHosts.find((h) => h.id === inviteeUserId)
        : undefined;
      const inviteeName = inviteeUserId
        ? input.inviteeName?.trim() ||
          inviteeProfile?.firstName ||
          'Invité'
        : undefined;
      // Pre-reserve one seat for the destinataire (accepted → confirm in Demandes).
      const spotsLeft = inviteeUserId ? capacity - 1 : capacity;
      const partnerKind = user.partnerKind;
      const venueName =
        (partnerListing && user.partnerVenueName?.trim()) ||
        input.venueName.trim();
      const outing: Outing = {
        id: uid('outing'),
        hostId: user.id,
        // Carte partenaire : « Le Frank · Partenaire » (nom du lieu).
        hostName: partnerListing ? venueName : user.firstName,
        hostAge: user.age,
        hostGender: user.gender,
        title: input.title.trim(),
        description: input.description.trim(),
        category,
        neighborhood: input.neighborhood.trim(),
        venueName,
        approxArea: input.approxArea.trim(),
        exactAddress: input.exactAddress.trim(),
        startsAt,
        capacity,
        spotsLeft,
        womenOnly: input.womenOnly && user.gender === 'femme',
        budgetMaxEuros,
        status: spotsLeft < 1 ? 'full' : 'open',
        createdAt: new Date().toISOString(),
        ...(urgent ? { urgentOnSite: true } : {}),
        ...((category === 'autre' || category === 'sport') && categoryDetail
          ? { categoryDetail }
          : {}),
        ...(topic ? { topic } : {}),
        ...(excluded.length ? { excludedTopics: excluded } : {}),
        ...(!urgent && input.flexibleSlot ? { flexibleSlot: true } : {}),
        ...(inviteIncludes ? { inviteIncludes } : {}),
        ...(inviteExtras ? { inviteExtras } : {}),
        ...(input.ticketsAlreadyBought || isPartnerCultureHost(user)
          ? { ticketsAlreadyBought: true }
          : {}),
        ...(inviteeUserId
          ? { inviteeUserId, inviteeName: inviteeName! }
          : {}),
        ...(partnerListing
          ? {
              isPartnerListing: true as const,
              ...(partnerKind ? { partnerKind } : {}),
              ...(partnerOffer ? { partnerOffer } : {}),
              ...(user.partnerPinned ? { partnerPinned: true } : {}),
            }
          : {}),
      };
      let targetedRequest: Request | undefined;
      if (inviteeUserId && inviteeName) {
        const acceptedAt = new Date();
        const confirmDeadlineAt = new Date(
          acceptedAt.getTime() + CONFIRM_WINDOW_MS,
        );
        targetedRequest = {
          id: uid('req'),
          outingId: outing.id,
          userId: inviteeUserId,
          userName: inviteeName,
          userAge: inviteeProfile?.age ?? 28,
          userGender: inviteeProfile?.gender ?? 'femme',
          message: 'Proposition ciblée depuis Dispo',
          status: 'accepted',
          createdAt: acceptedAt.toISOString(),
          acceptedAt: acceptedAt.toISOString(),
          confirmDeadlineAt: confirmDeadlineAt.toISOString(),
        };
      }
      dispatch({
        type: 'CREATE_OUTING',
        payload: outing,
        ...(targetedRequest ? { targetedRequest } : {}),
      });
      // Juliette auto-request moved to hidden Démo menu (5 taps on logo).
      return { ok: true, outingId: outing.id };
    },
    [state.currentUser, state.outings, state.requests],
  );

  const closeOuting = useCallback((outingId: string) => {
    clearOutingSchedules(outingId);
    dispatch({ type: 'CLOSE_OUTING', payload: { outingId } });
  }, [clearOutingSchedules]);

  const cancelOuting = useCallback(
    (outingId: string): { ok: true } | { ok: false; reason: string } => {
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing) return { ok: false, reason: 'not_found' };
      if (outing.status === 'completed') {
        return { ok: false, reason: 'already_completed' };
      }
      if (outing.status === 'cancelled') {
        return { ok: false, reason: 'already_cancelled' };
      }
      clearOutingSchedules(outingId);
      // Partenaire annule avec des confirmés : cautions rendues + 1 avertissement.
      const partnerHadConfirmed =
        isPartnerListing(outing) &&
        state.requests.some(
          (r) => r.outingId === outingId && r.status === 'confirmed',
        );
      dispatch({
        type: 'CANCEL_OUTING',
        payload: { outingId, cancelledAt: new Date().toISOString() },
      });
      if (partnerHadConfirmed) {
        dispatch({
          type: 'APPLY_PARTNER_WARNING',
          payload: { outingId, hostId: outing.hostId },
        });
      }
      const toast: AppToast = {
        id: uid('toast'),
        title: 'Annulation',
        body: partnerHadConfirmed
          ? `« ${outing.title} » a été annulée par le lieu. Cautions rendues.`
          : `« ${outing.title} » a été annulée.`,
        createdAt: new Date().toISOString(),
        type: 'cancellation',
        outingId,
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
      return { ok: true };
    },
    [state.outings, state.requests, clearOutingSchedules],
  );

  const cancelRequest = useCallback(
    (
      requestId: string,
      by: 'guest' | 'host' = 'guest',
    ):
      | { ok: true; depositReturned?: boolean; depositForfeited?: boolean }
      | { ok: false; reason: string } => {
      const req = state.requests.find((r) => r.id === requestId);
      if (!req) return { ok: false, reason: 'not_found' };
      if (
        req.status !== 'pending' &&
        req.status !== 'accepted' &&
        req.status !== 'confirmed'
      ) {
        return { ok: false, reason: 'invalid_status' };
      }
      const outing = state.outings.find((o) => o.id === req.outingId);
      const cancelledAt = new Date().toISOString();
      let depositReturned: boolean | undefined;
      let depositForfeited: boolean | undefined;
      if (req.status === 'confirmed' && outing) {
        const jokerExempted = isJokerExempted(state.imprevuReports, {
          outingId: req.outingId,
          reporterId: req.userId,
          requestId: req.id,
        });
        const next = resolveGuestCancelDeposit({
          by,
          freeWindow: isCancelFreeWindow(outing.startsAt),
          jokerExempted,
          currentDeposit: req.depositStatus,
        });
        if (next === 'returned') depositReturned = true;
        if (next === 'forfeited') depositForfeited = true;
      }
      clearRequestSchedules(requestId);
      dispatch({
        type: 'CANCEL_REQUEST',
        payload: { requestId, cancelledAt, by },
      });
      return { ok: true, depositReturned, depositForfeited };
    },
    [state.requests, state.outings, state.imprevuReports, clearRequestSchedules],
  );

  const joinOuting = useCallback(
    (
      outingId: string,
      message = '',
      suggestedDate?: string,
    ): { ok: true; requestId: string } | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing) return { ok: false, reason: 'not_found' };
      if (outing.hostId === user.id) return { ok: false, reason: 'own_outing' };
      if (outing.inviteeUserId && outing.inviteeUserId !== user.id) {
        return { ok: false, reason: 'targeted_other' };
      }
      if (outing.status === 'completed' || outing.status === 'cancelled') {
        return { ok: false, reason: 'outing_finished' };
      }
      if (!isOutingAcceptingRequests(outing) || outing.status !== 'open') {
        return { ok: false, reason: 'outing_started' };
      }
      if (outing.spotsLeft < 1) {
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
      if (isPartnerListing(outing)) {
        // Zéro clic côté lieu : Rejoindre → « à confirmer » 10 min, SANS chaise.
        // La chaise est prise à la confirmation si spotsLeft > 0.
        const now = new Date();
        const partnerRequest: Request = {
          id: requestId,
          outingId,
          userId: user.id,
          userName: user.firstName,
          userAge: user.age,
          userGender: user.gender,
          message: message.trim(),
          status: 'accepted',
          createdAt: now.toISOString(),
          acceptedAt: now.toISOString(),
          confirmDeadlineAt: new Date(
            now.getTime() + CONFIRM_WINDOW_MS,
          ).toISOString(),
          partnerAutoSeat: true,
        };
        dispatch({ type: 'JOIN_OUTING', payload: partnerRequest });
        return { ok: true, requestId };
      }
      const request: Request = {
        id: requestId,
        outingId,
        userId: user.id,
        userName: user.firstName,
        userAge: user.age,
        userGender: user.gender,
        message: message.trim(),
        ...(suggestedDate?.trim()
          ? { suggestedDate: suggestedDate.trim() }
          : {}),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'JOIN_OUTING', payload: request });
      return { ok: true, requestId };
    },
    [state.currentUser, state.outings, state.requests],
  );

  const acceptRequest = useCallback(
    (
      requestId: string,
    ):
      | { ok: true }
      | {
          ok: false;
          reason: 'not_found' | 'invalid' | 'outing_started' | 'outing_finished';
        } => {
      const now = new Date();
      const deadline = new Date(now.getTime() + CONFIRM_WINDOW_MS);
      const req = state.requests.find((r) => r.id === requestId);
      if (!req || req.status !== 'pending') {
        return { ok: false, reason: 'invalid' };
      }
      const outing = state.outings.find((o) => o.id === req.outingId);
      if (!outing) return { ok: false, reason: 'not_found' };
      if (outing.status === 'completed' || outing.status === 'cancelled') {
        return { ok: false, reason: 'outing_finished' };
      }
      if (!isOutingAcceptingRequests(outing, now.getTime())) {
        return { ok: false, reason: 'outing_started' };
      }
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
            outingId: outing.id,
          });
          const handles: ScheduledHandles = {
            outingId: outing.id,
            accepted: scheduled.accepted,
            reminder3min: scheduled.reminder3min,
          };
          // In-app toast for « accepté + fenêtre 10 min »
          const toast: AppToast = {
            id: uid('toast'),
            title: 'Tu es accepté !',
            body: `${outing.hostName} t’a accepté pour « ${outing.title} ». Confirme ta place dans 10 min.`,
            createdAt: new Date().toISOString(),
            type: 'accepted',
            requestId,
            outingId: outing.id,
          };
          dispatch({ type: 'SET_TOAST', payload: toast });
          if (!scheduled.pushOk) {
            Alert.alert(toast.title, toast.body);
            // Fallback rappel ~3 min left — cleared if confirm/expire/cancel
            const deadlineMs = deadline.getTime();
            const reminderIn = (deadlineMs - 3 * 60 * 1000 - Date.now()) / 1000;
            if (reminderIn > 2) {
              handles.reminderTimer = setTimeout(() => {
                const live = scheduledByRequestRef.current.get(requestId);
                if (!live?.reminderTimer) return; // already cleared
                const t: AppToast = {
                  id: uid('toast'),
                  title: 'Plus que 3 min',
                  body: `Confirme ta place pour « ${outing.title} » avant la fin du délai.`,
                  createdAt: new Date().toISOString(),
                  type: 'confirm_reminder',
                  requestId,
                  outingId: outing.id,
                };
                dispatch({ type: 'SET_TOAST', payload: t });
                Alert.alert(t.title, t.body);
              }, reminderIn * 1000);
            }
          }
          scheduledByRequestRef.current.set(requestId, handles);
        })();
      }
      return { ok: true };
    },
    [state.requests, state.outings],
  );

  const declineRequest = useCallback((requestId: string) => {
    clearRequestSchedules(requestId);
    dispatch({ type: 'DECLINE_REQUEST', payload: { requestId } });
  }, [clearRequestSchedules]);

  const expireRequestIfNeeded = useCallback(
    (requestId: string) => {
      const req = state.requests.find((r) => r.id === requestId);
      if (!req || req.status !== 'accepted' || !req.confirmDeadlineAt) return;
      if (Date.now() > new Date(req.confirmDeadlineAt).getTime()) {
        clearRequestSchedules(requestId);
        dispatch({ type: 'EXPIRE_REQUEST', payload: { requestId } });
      }
    },
    [state.requests, clearRequestSchedules],
  );

  const confirmSlot = useCallback(
    (
      requestId: string,
    ):
      | { ok: true }
      | {
          ok: false;
          reason:
            | 'expired'
            | 'invalid'
            | 'paywall'
            | 'race_lost'
            | 'no_spot'
            | 'outing_started'
            | 'outing_finished';
        } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'invalid' };
      if (user.banned) return { ok: false, reason: 'invalid' };
      const req = state.requests.find((r) => r.id === requestId);
      // Idempotent double-tap: already confirmed → ok (no deposit/credit again)
      if (req && req.status === 'confirmed') {
        return { ok: true };
      }
      // Lot 6: only the guest who owns the request may confirm / consume credit.
      if (req && !canActorConfirmSlot(user.id, req.userId)) {
        return { ok: false, reason: 'invalid' };
      }
      const gate = gateCanConfirmOuting(user);
      if (!gate.ok) {
        return { ok: false, reason: 'paywall' };
      }
      if (!req || req.status !== 'accepted') {
        return { ok: false, reason: 'invalid' };
      }
      const outingGate = state.outings.find((o) => o.id === req.outingId);
      if (
        outingGate?.status === 'completed' ||
        outingGate?.status === 'cancelled'
      ) {
        return { ok: false, reason: 'outing_finished' };
      }
      if (outingGate) {
        if (isUrgentOnSite(outingGate)) {
          // Urgent: allow confirm while open/full (accepted cancelled on close).
          if (outingGate.status !== 'open' && outingGate.status !== 'full') {
            return { ok: false, reason: 'outing_started' };
          }
        } else if (isStartsAtPast(outingGate.startsAt)) {
          return { ok: false, reason: 'outing_started' };
        }
      }
      if (
        req.confirmDeadlineAt &&
        Date.now() > new Date(req.confirmDeadlineAt).getTime()
      ) {
        dispatch({ type: 'EXPIRE_REQUEST', payload: { requestId } });
        return { ok: false, reason: 'expired' };
      }
      const outingRace = state.outings.find((o) => o.id === req.outingId);
      if (outingRace && req.partnerAutoSeat && isPartnerListing(outingRace)) {
        // Partenaire : plus de chaise → refus, caution non bloquée (reducer atomique).
        if (outingRace.status !== 'open' || outingRace.spotsLeft < 1) {
          clearRequestSchedules(requestId);
          dispatch({
            type: 'CONFIRM_SLOT',
            payload: { requestId, confirmedAt: new Date().toISOString() },
          });
          return { ok: false, reason: 'no_spot' };
        }
      } else if (outingRace) {
        const confirmedCount = state.requests.filter(
          (r) => r.outingId === req.outingId && r.status === 'confirmed',
        ).length;
        if (confirmedCount >= outingRace.capacity) {
          dispatch({ type: 'EXPIRE_REQUEST', payload: { requestId } });
          return { ok: false, reason: 'race_lost' };
        }
      }
      // Credit consumed inside CONFIRM_SLOT reducer on accepted→confirmed only
      const consumeCredit = shouldConsumeCreditOnConfirm(user);
      // Drop accept + 3 min reminder — seat is confirmed.
      clearRequestSchedules(requestId, { keepChat: true });
      dispatch({
        type: 'CONFIRM_SLOT',
        payload: {
          requestId,
          confirmedAt: new Date().toISOString(),
          consumeCredit,
        },
      });
      const outingForChat = state.outings.find((o) => o.id === req.outingId);
      if (outingForChat) {
        void ensureAndroidChannel();
        // Urgent ET annonce partenaire : chat ouvert dès la confirmation.
        const urgentChat =
          isUrgentOnSite(outingForChat) || isPartnerListing(outingForChat);
        const toast: AppToast = {
          id: uid('toast'),
          title: 'Place confirmée',
          body: urgentChat
            ? `« ${outingForChat.title} » est confirmée. Le chat est ouvert.`
            : `« ${outingForChat.title} » est confirmée. Chat à H−1.`,
          createdAt: new Date().toISOString(),
          type: 'confirmed',
          requestId,
          outingId: outingForChat.id,
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
          if (urgentChat) {
            // Urgent: chat already unlocked — no H−1 schedule.
            clearRequestSchedules(requestId);
            return;
          }
          const chatId = await scheduleChatUnlockNotification({
            outingTitle: outingForChat.title,
            startsAt: outingForChat.startsAt,
            outingId: outingForChat.id,
            requestId,
          });
          const handles: ScheduledHandles = {
            outingId: outingForChat.id,
            chatUnlock: chatId ?? undefined,
          };
          if (!chatId) {
            // Fallback H−1 in-app when push scheduling fails
            const opensIn =
              (new Date(outingForChat.startsAt).getTime() -
                60 * 60 * 1000 -
                Date.now()) /
              1000;
            if (opensIn > 2 && opensIn < 48 * 3600) {
              handles.chatTimer = setTimeout(() => {
                const live = scheduledByRequestRef.current.get(requestId);
                if (!live?.chatTimer) return;
                const t: AppToast = {
                  id: uid('toast'),
                  title: 'Chat ouvert',
                  body: `Le chat pour « ${outingForChat.title} » est déverrouillé (H−1).`,
                  createdAt: new Date().toISOString(),
                  type: 'chat_unlock',
                  outingId: outingForChat.id,
                  requestId,
                };
                dispatch({ type: 'SET_TOAST', payload: t });
                Alert.alert(t.title, t.body);
              }, opensIn * 1000);
            }
          }
          scheduledByRequestRef.current.set(requestId, handles);
        })();
      }
      return { ok: true };
    },
    [state.requests, state.currentUser, state.outings, clearRequestSchedules],
  );

  const setDispoSoir = useCallback((value: boolean) => {
    if (value) {
      const slot = state.currentUser?.dispoSlot ?? 'soir';
      dispatch({
        type: 'SET_DISPO_PROFILE',
        payload: {
          dispoSoir: true,
          dispoSlot: slot,
          dispoExpiresAt: computeDispoExpiresAt(slot).toISOString(),
        },
      });
    } else {
      dispatch({
        type: 'SET_DISPO_PROFILE',
        payload: { dispoSoir: false, dispoExpiresAt: null },
      });
    }
  }, [state.currentUser?.dispoSlot]);

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
          const slot =
            next.dispoSlot ??
            state.currentUser?.dispoSlot ??
            'soir';
          next.dispoExpiresAt = computeDispoExpiresAt(
            typeof slot === 'string' ? slot : 'soir',
          ).toISOString();
        }
      }
      if (next.dispoSoir === false) {
        next.dispoExpiresAt = null;
      }
      dispatch({ type: 'SET_DISPO_PROFILE', payload: next });
    },
    [state.currentUser?.dispoCategories, state.currentUser?.dispoSlot],
  );

  /** Auto-off Dispo when dispoExpiresAt is past (slot end / midnight). */
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
    (update: ProfileUpdate) => {
      dispatch({ type: 'SET_DISPO_PROFILE', payload: update });
    },
    [],
  );

  const peopleDispo = useMemo(() => {
    const byId = new Map<string, User>();
    const me = state.currentUser;
    const blocked = new Set(state.blockedUserIds);
    for (const host of mockHosts) {
      if (!host.dispoSoir) continue;
      if (isPastLocalMidnight(host.dispoExpiresAt)) continue;
      if (me && host.id === me.id) continue; // no propose-to-self
      if (blocked.has(host.id)) continue;
      byId.set(host.id, host);
    }
    // Never list self in Dispo feed (no propose-to-self).
    return Array.from(byId.values());
  }, [state.currentUser, state.blockedUserIds]);

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
        type: 'new_request',
        outingId,
        requestId: request.id,
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
          text: 'Le chat est ouvert — 1 h avant la sortie. Bonne sortie !',
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
        type: 'late',
        outingId,
        requestId,
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      void (async () => {
        void ensureAndroidChannel();
        const push = await sendPriorityPush({
          type: 'late',
          title: toast.title,
          body: toast.body,
          data: {
            outingId,
            ...(requestId ? { requestId } : {}),
          },
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
      if (
        outing.status === 'closed' ||
        outing.status === 'cancelled' ||
        outing.status === 'completed'
      ) {
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
          },
        });
        const toast: AppToast = {
          id: uid('toast'),
          title: 'Imprévu accepté',
          body:
            'Caution rendue — participation annulée (pas une absence). Les autres places confirmées restent.',
          createdAt: nowIso,
          type: 'cancellation',
          outingId: report.outingId,
          requestId: report.requestId,
        };
        dispatch({ type: 'SET_TOAST', payload: toast });
        void (async () => {
          void ensureAndroidChannel();
          const push = await sendPriorityPush({
            type: 'cancellation',
            title: toast.title,
            body: toast.body,
            data: {
              outingId: report.outingId,
              ...(report.requestId ? { requestId: report.requestId } : {}),
            },
          });
          if (!push.pushOk) Alert.alert(toast.title, toast.body);
        })();
        return {
          ok: true as const,
          depositReturned: true,
          depositForfeited: false,
        };
      }

      // Manual refuse → normal 3h rule: deposit stays held (no immediate forfeit).
      // Forfeit on absence is via auto_refused at startsAt or later cancel/ghost.
      dispatch({
        type: 'RESPOND_IMPREVU',
        payload: {
          imprevuId,
          decision: 'refused',
          respondedAt: nowIso,
          respondedByUserId: user.id,
          forfeitReporterDeposit: false,
        },
      });
      const toast: AppToast = {
        id: uid('toast'),
        title: 'Imprévu refusé',
        body: `Caution encore bloquée. Annule au moins ${CANCEL_FREE_BEFORE_HOURS} heures avant pour la récupérer ; trop tard ou absence → perdue (6,90 € Moment / 13,10 € hôte). Tu peux utiliser ton joker si tu en as un.`,
        createdAt: nowIso,
        type: 'imprevu',
        outingId: report.outingId,
        requestId: report.requestId,
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      return {
        ok: true as const,
        depositReturned: false,
        depositForfeited: false,
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
        type: 'imprevu',
        outingId,
        requestId: linkedRequestId,
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      void (async () => {
        void ensureAndroidChannel();
        const push = await sendPriorityPush({
          type: 'imprevu',
          title: toast.title,
          body: toast.body,
          data: {
            outingId,
            ...(linkedRequestId ? { requestId: linkedRequestId } : {}),
          },
        });
        if (!push.pushOk) Alert.alert(toast.title, toast.body);
      })();
      return { ok: true as const };
    },
    [state.outings, state.requests, state.currentUser, state.imprevuReports],
  );

  /** No response by startsAt → auto_refused (= refus + absence). Guest reporter → forfeit. */
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

  /**
   * Global 10 min confirm window — expire accepted seats even if Demandes /
   * ConfirmSlot are unmounted (UI intervals alone are not enough).
   */
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const req of state.requests) {
        if (req.status !== 'accepted' || !req.confirmDeadlineAt) continue;
        if (now > new Date(req.confirmDeadlineAt).getTime()) {
          clearRequestSchedules(req.id);
          dispatch({ type: 'EXPIRE_REQUEST', payload: { requestId: req.id } });
        }
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [state.requests, clearRequestSchedules]);

  /**
   * Lot 7 — faux pending/accepted: purge when outing is dead or the seat is
   * no longer confirmable / joinable. Restores accepted seats via EXPIRE_REQUEST;
   * pending → cancelled.
   */
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const req of state.requests) {
        if (req.status !== 'pending' && req.status !== 'accepted') continue;
        const outing = state.outings.find((o) => o.id === req.outingId);
        const outingDead =
          !outing ||
          outing.status === 'completed' ||
          outing.status === 'cancelled' ||
          outing.status === 'closed';

        if (req.status === 'pending') {
          if (
            outingDead ||
            (outing != null && !isOutingAcceptingRequests(outing, now))
          ) {
            clearRequestSchedules(req.id);
            dispatch({
              type: 'CANCEL_REQUEST',
              payload: {
                requestId: req.id,
                cancelledAt: new Date(now).toISOString(),
                by: 'host',
              },
            });
          }
          continue;
        }

        // accepted
        const unconfirmable =
          outingDead ||
          (outing != null &&
            (isUrgentOnSite(outing)
              ? outing.status !== 'open' && outing.status !== 'full'
              : isStartsAtPast(outing.startsAt, now)));
        if (unconfirmable) {
          clearRequestSchedules(req.id);
          dispatch({ type: 'EXPIRE_REQUEST', payload: { requestId: req.id } });
        }
      }
    };
    tick();
    const id = setInterval(tick, 5_000);
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [state.requests, state.outings, clearRequestSchedules]);

  /**
   * Lot 7 — drop dead local pushes / in-app reminder timers when request or
   * outing leaves an actionable state (also covers reducer-only paths like
   * auto CLOSE/COMPLETE that bypass closeOuting/cancelOuting callbacks).
   */
  useEffect(() => {
    for (const [requestId, entry] of [
      ...scheduledByRequestRef.current.entries(),
    ]) {
      const req = state.requests.find((r) => r.id === requestId);
      const outing = state.outings.find(
        (o) => o.id === (entry.outingId ?? req?.outingId),
      );
      const outingDead =
        !!outing &&
        (outing.status === 'cancelled' ||
          outing.status === 'completed' ||
          outing.status === 'closed');
      if (!req || outingDead) {
        clearRequestSchedules(requestId);
        continue;
      }
      if (req.status === 'accepted') continue; // keep confirm reminder
      if (req.status === 'confirmed') {
        // Keep chat unlock only; drop accept/reminder if any lingered.
        if (entry.accepted || entry.reminder3min || entry.reminderTimer) {
          clearRequestSchedules(requestId, { keepChat: true });
        }
        continue;
      }
      // expired / declined / cancelled / pending — nothing to fire
      clearRequestSchedules(requestId);
    }
  }, [state.requests, state.outings, clearRequestSchedules]);

  /**
   * Auto H−90: planned open/full with zero confirmés and startsAt within 90 min
   * → urgentOnSite + urgentAutoH90 (pill « Urgent », top of feed, chat on confirm,
   * joinable until startsAt+30). Skip if any confirmed guest already.
   */
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const outing of state.outings) {
        if (!shouldAutoPromoteUrgent(outing, state.requests, now)) continue;
        dispatch({
          type: 'MARK_OUTING_URGENT',
          payload: { outingId: outing.id, urgentAutoH90: true },
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
  }, [state.outings, state.requests]);

  /**
   * Urgent: auto-close listing at startsAt + 30 min (stop accepting).
   * Clôture only (CLOSE_OUTING) — never marks confirmés present.
   * Confirmed guests keep seats; 1-active slot rules unchanged.
   */
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const outing of state.outings) {
        if (!isUrgentOnSite(outing)) continue;
        if (outing.status !== 'open' && outing.status !== 'full') continue;
        const startMs = new Date(outing.startsAt).getTime();
        if (!Number.isFinite(startMs)) continue;
        if (now <= startMs + URGENT_ON_SITE_ACCEPT_MS) continue;
        dispatch({ type: 'CLOSE_OUTING', payload: { outingId: outing.id } });
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
  }, [state.outings]);

  /**
   * Culture partenaire à l’heure : clôture (closed, jamais cancelled).
   * 2 confirmés → déjà clôturée à la confirm ; 1 confirmé → il garde sa place ;
   * 0 confirmé → l’invitation tombe (closed sans invité, plus dans le fil).
   */
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const outing of state.outings) {
        if (!isPartnerCultureListing(outing)) continue;
        if (outing.status !== 'open' && outing.status !== 'full') continue;
        const startMs = new Date(outing.startsAt).getTime();
        if (!Number.isFinite(startMs) || now < startMs) continue;
        dispatch({ type: 'CLOSE_OUTING', payload: { outingId: outing.id } });
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
  }, [state.outings]);

  /**
   * Partenaire — lendemain (Paris) : silence des deux → caution rendue.
   * On ne pénalise pas le silence du lieu ; pas de présence auto non plus.
   */
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const req of state.requests) {
        const outing = state.outings.find((o) => o.id === req.outingId);
        if (!outing) continue;
        if (!shouldAutoRefundPartnerSilence(outing, req, now)) continue;
        dispatch({ type: 'RETURN_DEPOSIT_SILENCE', payload: { requestId: req.id } });
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [state.outings, state.requests]);

  /**
   * Auto plan « terminée » : H + OUTING_AUTO_COMPLETE_AFTER_MS (30 min démo).
   * Urgent join window ends at H+30 via CLOSE_OUTING above (clôture only).
   * terminée is distinct: status → completed, never marks attendance present.
   * Host may also completeOuting once startsAt is past.
   */
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const outing of state.outings) {
        if (outing.status === 'completed' || outing.status === 'cancelled') {
          continue;
        }
        const startMs = new Date(outing.startsAt).getTime();
        if (!Number.isFinite(startMs)) continue;
        // After H+30 inclusive (same boundary as urgent accept window).
        if (now <= startMs + OUTING_AUTO_COMPLETE_AFTER_MS) continue;
        // Only auto-complete outings that had a real plan (open/full/closed).
        if (
          outing.status !== 'open' &&
          outing.status !== 'full' &&
          outing.status !== 'closed'
        ) {
          continue;
        }
        dispatch({ type: 'COMPLETE_OUTING', payload: { outingId: outing.id } });
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
  }, [state.outings]);

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
    const outing = state.outings.find((o) => o.id === outingId);
    if (
      !outing ||
      outing.status === 'completed' ||
      outing.status === 'cancelled'
    ) {
      return;
    }
    // terminée only — does not mark confirmés present (use markGuestPresent).
    dispatch({ type: 'COMPLETE_OUTING', payload: { outingId } });
    const title = outing.title;
    const toast: AppToast = {
      id: uid('toast'),
      title: 'Noter la sortie',
      body: `Comment s’est passée « ${title} » ? Laisse une note.`,
      createdAt: new Date().toISOString(),
      type: 'rate_after',
      outingId,
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

  const countHonoredOutings = useCallback(
    (userId: string): number => {
      const ids = new Set<string>();
      for (const o of state.outings) {
        if (o.status !== 'completed') continue;
        if (o.hostId === userId) {
          ids.add(o.id);
          continue;
        }
        const attended = state.requests.some(
          (r) => r.outingId === o.id && r.userId === userId && wasPresent(r),
        );
        if (attended) ids.add(o.id);
      }
      // Historical mock reviews imply past honored outings not in live state.
      for (const rev of state.reviews) {
        if (rev.toUserId === userId || rev.fromUserId === userId) {
          ids.add(rev.outingId);
        }
      }
      return ids.size;
    },
    [state.outings, state.requests, state.reviews],
  );

  const getRatingStats = useCallback(
    (userId: string): UserRatingStats => {
      const received = state.reviews.filter((r) => r.toUserId === userId);
      const outingCount = countHonoredOutings(userId);
      if (!received.length) return { average: null, outingCount };
      const sum = received.reduce((acc, r) => acc + r.rating, 0);
      return {
        average: sum / received.length,
        outingCount,
      };
    },
    [state.reviews, countHonoredOutings],
  );


  const canLeaveReview = useCallback(
    (
      outingId: string,
      toUserId: string,
    ): { ok: true } | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      if (toUserId === user.id) return { ok: false, reason: 'self' };
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing) return { ok: false, reason: 'outing_not_found' };
      if (outing.status !== 'completed') {
        return { ok: false, reason: 'not_completed' };
      }
      const isHost = outing.hostId === user.id;
      // Confirmé ≠ présent : avis only when attendance is present.
      const myPresent = state.requests.some(
        (r) =>
          r.outingId === outing.id &&
          r.userId === user.id &&
          wasPresent(r),
      );
      if (!isHost && !myPresent) {
        return { ok: false, reason: 'not_participant' };
      }
      const targetIsHost = outing.hostId === toUserId;
      const targetPresent = state.requests.some(
        (r) =>
          r.outingId === outing.id &&
          r.userId === toUserId &&
          wasPresent(r),
      );
      if (!targetIsHost && !targetPresent) {
        return { ok: false, reason: 'target_not_participant' };
      }
      const dup = state.reviews.some(
        (r) =>
          r.outingId === outingId &&
          r.fromUserId === user.id &&
          r.toUserId === toUserId,
      );
      if (dup) return { ok: false, reason: 'already_reviewed' };
      return { ok: true };
    },
    [state.currentUser, state.outings, state.requests, state.reviews],
  );

  const reportUser = useCallback(
    (
      targetUserId: string,
      reason: string,
    ): { ok: true } | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      if (targetUserId === user.id) return { ok: false, reason: 'self' };
      const trimmed = reason.trim();
      if (!trimmed) return { ok: false, reason: 'empty_reason' };
      const report = {
        id: uid('urep'),
        reporterId: user.id,
        targetUserId,
        reason: trimmed,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'REPORT_USER', payload: report });
      return { ok: true };
    },
    [state.currentUser],
  );

  const blockUser = useCallback(
    (
      targetUserId: string,
    ): { ok: true } | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      // Lot 6: peer block local ≠ fermeture de compte (banned via sanctions).
      if (!canActorBlockUser(user.id, targetUserId)) {
        return { ok: false, reason: 'self' };
      }
      dispatch({ type: 'BLOCK_USER', payload: { userId: targetUserId } });
      return { ok: true };
    },
    [state.currentUser],
  );

  const unblockUser = useCallback((targetUserId: string) => {
    dispatch({ type: 'UNBLOCK_USER', payload: { userId: targetUserId } });
  }, []);

  const isBlocked = useCallback(
    (userId: string) => state.blockedUserIds.includes(userId),
    [state.blockedUserIds],
  );

  const getVenueReviews = useCallback(
    (venueKey: string) =>
      state.reviews
        .filter((r) => r.venueKey === venueKey && r.venueRating != null)
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [state.reviews],
  );

  const getVenueRatingStats = useCallback(
    (venueKey: string): VenueRatingStats => {
      const list = state.reviews.filter(
        (r) => r.venueKey === venueKey && r.venueRating != null,
      );
      if (!list.length) return { average: null, reviewCount: 0 };
      const sum = list.reduce((acc, r) => acc + (r.venueRating ?? 0), 0);
      return {
        average: sum / list.length,
        reviewCount: list.length,
      };
    },
    [state.reviews],
  );

  const markGuestPresent = useCallback(
    (
      requestId: string,
    ): { ok: true } | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      const req = state.requests.find((r) => r.id === requestId);
      if (!req || req.status !== 'confirmed') {
        return { ok: false, reason: 'not_confirmed' };
      }
      const outing = state.outings.find((o) => o.id === req.outingId);
      if (!outing || outing.status === 'cancelled') {
        return { ok: false, reason: 'outing_cancelled' };
      }
      // Lot 6: only the host marks presence.
      if (!canActorMarkGuestPresent(user.id, outing.hostId)) {
        return { ok: false, reason: 'not_host' };
      }
      if (req.attendance === 'absent') {
        return { ok: false, reason: 'already_absent' };
      }
      if (req.attendance === 'present') {
        return { ok: true }; // idempotent
      }
      dispatch({ type: 'MARK_GUEST_PRESENT', payload: { requestId } });
      return { ok: true };
    },
    [state.currentUser, state.requests, state.outings],
  );

  /**
   * Demo QA: force presence so getOutingsToRate / LeaveReview unlock.
   * Does not weaken prod markGuestPresent (host-only).
   */
  const demoMarkConfirmedPresent = useCallback(
    (outingId: string) => {
      const user = state.currentUser;
      if (!user) return { ok: false as const, reason: 'no_user' };
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing) return { ok: false as const, reason: 'outing_not_found' };
      if (outing.status === 'cancelled') {
        return { ok: false as const, reason: 'outing_cancelled' };
      }
      const confirmed = state.requests.filter(
        (r) => r.outingId === outingId && r.status === 'confirmed',
      );
      if (!confirmed.length) {
        return { ok: false as const, reason: 'no_confirmed' };
      }
      const isHost = outing.hostId === user.id;
      const mine = confirmed.find((r) => r.userId === user.id);
      if (!isHost && !mine) {
        return { ok: false as const, reason: 'not_participant' };
      }
      const toMark = isHost
        ? confirmed.filter(
            (r) => r.attendance !== 'present' && r.attendance !== 'absent',
          )
        : mine &&
            mine.attendance !== 'present' &&
            mine.attendance !== 'absent'
          ? [mine]
          : [];
      const markedIds: string[] = [];
      for (const r of toMark) {
        dispatch({ type: 'MARK_GUEST_PRESENT', payload: { requestId: r.id } });
        markedIds.push(r.id);
      }
      let rateTarget: {
        outingId: string;
        toUserId: string;
        toUserName: string;
      } | null = null;
      if (isHost) {
        const guest =
          confirmed.find((r) => r.attendance === 'present') ??
          toMark[0] ??
          confirmed.find((r) => r.attendance !== 'absent');
        if (guest) {
          rateTarget = {
            outingId,
            toUserId: guest.userId,
            toUserName: guest.userName,
          };
        }
      } else {
        rateTarget = {
          outingId,
          toUserId: outing.hostId,
          toUserName: outing.hostName,
        };
      }
      return { ok: true as const, markedIds, rateTarget };
    },
    [state.currentUser, state.outings, state.requests],
  );

  const getCompletedOutingsMissingPresent = useCallback(() => {
    const user = state.currentUser;
    if (!user) return [];
    const items: {
      outing: Outing;
      rateTarget: { toUserId: string; toUserName: string };
    }[] = [];
    for (const outing of state.outings) {
      if (outing.status !== 'completed') continue;
      const confirmed = state.requests.filter(
        (r) => r.outingId === outing.id && r.status === 'confirmed',
      );
      if (!confirmed.length) continue;
      const isHost = outing.hostId === user.id;
      const mine = confirmed.find((r) => r.userId === user.id);
      if (!isHost && !mine) continue;
      if (isHost) {
        const anyPresent = confirmed.some((r) => r.attendance === 'present');
        if (anyPresent) continue;
        const guest = confirmed[0];
        items.push({
          outing,
          rateTarget: { toUserId: guest.userId, toUserName: guest.userName },
        });
      } else if (mine && mine.attendance !== 'present') {
        items.push({
          outing,
          rateTarget: {
            toUserId: outing.hostId,
            toUserName: outing.hostName,
          },
        });
      }
    }
    return items;
  }, [state.currentUser, state.outings, state.requests]);

  const addReview = useCallback(
    (input: {
      outingId: string;
      toUserId: string;
      rating: 1 | 2 | 3 | 4 | 5;
      comment?: string;
      venueRating: 1 | 2 | 3 | 4 | 5;
      venueComment?: string;
      wantToSeeAgain?: boolean;
      lowStarReason?: Review['lowStarReason'];
    }): { ok: true; reviewId: string } | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      if (input.rating < 1 || input.rating > 5) {
        return { ok: false, reason: 'invalid_rating' };
      }
      if (input.venueRating < 1 || input.venueRating > 5) {
        return { ok: false, reason: 'invalid_venue_rating' };
      }
      if (input.toUserId === user.id) return { ok: false, reason: 'self' };
      const outing = state.outings.find((o) => o.id === input.outingId);
      if (!outing) return { ok: false, reason: 'outing_not_found' };
      if (outing.status !== 'completed') {
        return { ok: false, reason: 'not_completed' };
      }
      // Lot 6: align with canLeaveReview — avis seulement si présent
      // (Confirmé ≠ présent). Hôte note les invités présents ; invité présent
      // note l’hôte.
      const isHost = outing.hostId === user.id;
      const myPresent = state.requests.some(
        (r) =>
          r.outingId === outing.id &&
          r.userId === user.id &&
          wasPresent(r),
      );
      if (!isHost && !myPresent) {
        return { ok: false, reason: 'not_participant' };
      }
      const targetIsHost = outing.hostId === input.toUserId;
      const targetPresent = state.requests.some(
        (r) =>
          r.outingId === outing.id &&
          r.userId === input.toUserId &&
          wasPresent(r),
      );
      if (!targetIsHost && !targetPresent) {
        return { ok: false, reason: 'target_not_participant' };
      }
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
      const venueComment = input.venueComment?.trim();
      const venueKey = makeVenueKey(outing.venueName, outing.neighborhood);
      const review: Review = {
        id: uid('rev'),
        outingId: input.outingId,
        fromUserId: user.id,
        toUserId: input.toUserId,
        rating: input.rating,
        venueRating: input.venueRating,
        venueKey,
        venueName: outing.venueName,
        ...(comment ? { comment } : {}),
        ...(venueComment ? { venueComment } : {}),
        ...(input.wantToSeeAgain !== undefined
          ? { wantToSeeAgain: input.wantToSeeAgain }
          : {}),
        ...(input.lowStarReason ? { lowStarReason: input.lowStarReason } : {}),
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_REVIEW', payload: review });
      return { ok: true, reviewId: review.id };
    },
    [state.currentUser, state.reviews, state.outings, state.requests],
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

  const showToast = useCallback(
    (
      title: string,
      body: string,
      meta?: { type?: string; outingId?: string; requestId?: string },
    ) => {
      const toast: AppToast = {
        id: uid('toast'),
        title,
        body,
        createdAt: new Date().toISOString(),
        type: meta?.type,
        outingId: meta?.outingId,
        requestId: meta?.requestId,
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
    },
    [],
  );

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
          type: input.type,
          outingId: input.data?.outingId,
          requestId: input.data?.requestId,
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
          (r) => r.outingId === outing.id && wasPresent(r),
        );
        for (const g of guests) {
          // Filtre couple fromUserId + toUserId : déjà noté → hors liste.
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
            wasPresent(r),
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

  const getMyReviewFor = useCallback(
    (outingId: string, toUserId: string): Review | undefined => {
      const user = state.currentUser;
      if (!user) return undefined;
      return state.reviews.find(
        (r) =>
          r.outingId === outingId &&
          r.fromUserId === user.id &&
          r.toUserId === toUserId,
      );
    },
    [state.currentUser, state.reviews],
  );

  const getMyRatedOutingPairs = useCallback(() => {
    const user = state.currentUser;
    if (!user) return [];
    const items: {
      outing: Outing;
      toUserId: string;
      toUserName: string;
      review: Review;
    }[] = [];
    for (const rev of state.reviews) {
      if (rev.fromUserId !== user.id) continue;
      const outing = state.outings.find((o) => o.id === rev.outingId);
      if (!outing || outing.status !== 'completed') continue;
      let toUserName: string;
      if (outing.hostId === rev.toUserId) {
        toUserName = outing.hostName;
      } else {
        const guest = state.requests.find(
          (r) => r.outingId === outing.id && r.userId === rev.toUserId,
        );
        toUserName = guest?.userName ?? 'Quelqu’un';
      }
      items.push({
        outing,
        toUserId: rev.toUserId,
        toUserName,
        review: rev,
      });
    }
    items.sort(
      (a, b) =>
        new Date(b.review.createdAt).getTime() -
        new Date(a.review.createdAt).getTime(),
    );
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
    const now = Date.now();
    return state.outings.filter((o) => {
      if (!isVisibleOnAnnoncesFeed(o, now)) return false;
      // Targeted Dispo invite: not a public Annonces listing — destinataire
      // sees it in Demandes (outgoing) when currentUser === inviteeUserId.
      if (o.inviteeUserId) return false;
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
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing) return { ok: false, reason: 'not_found' };
      if (outing.status === 'cancelled') {
        return { ok: false, reason: 'outing_cancelled' };
      }
      // Lot 6: same event idempotent.
      if (outing.hostNoShowReported) {
        const prev = state.hostNoShowStrikes[outing.hostId] ?? 0;
        return {
          ok: true,
          strike: prev,
          banned: hostSanctionFromStrike(prev).banned,
        };
      }
      const hostId = outing.hostId;
      const actorIsConfirmedGuest = state.requests.some(
        (r) =>
          r.outingId === outingId &&
          r.userId === user.id &&
          r.status === 'confirmed',
      );
      if (!canActorReportHostNoShow(user.id, hostId, actorIsConfirmedGuest)) {
        return { ok: false, reason: 'not_participant' };
      }
      if (isPartnerListing(outing)) {
        // Lieu ne honore pas : cautions rendues + 1 avertissement partenaire
        // (2e → compte partenaire fermé). Pas de strike « hôte particulier ».
        const prevW = state.partnerWarningsByHost[hostId] ?? 0;
        const nextW = nextPartnerWarningState(prevW);
        dispatch({
          type: 'APPLY_PARTNER_WARNING',
          payload: { outingId, hostId },
        });
        dispatch({
          type: 'RETURN_DEPOSITS_FOR_OUTING',
          payload: { outingId, reason: 'partner_no_show' },
        });
        dispatch({
          type: 'REPORT_HOST_NO_SHOW',
          payload: {
            outingId,
            hostId,
            strike: state.hostNoShowStrikes[hostId] ?? 0,
            banned: false,
          },
        });
        const toast: AppToast = {
          id: uid('toast'),
          title: nextW.closed ? 'Compte partenaire fermé' : 'Avertissement lieu',
          body: nextW.closed
            ? '2e avertissement — le lieu ne peut plus publier. Cautions rendues.'
            : 'Le lieu n’a pas honoré — 1 avertissement. Cautions rendues.',
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: 'SET_TOAST', payload: toast });
        return { ok: true, strike: nextW.partnerWarnings, banned: nextW.closed };
      }
      const prev = state.hostNoShowStrikes[hostId] ?? 0;
      const strike = prev + 1;
      const { banned } = hostSanctionFromStrike(strike);
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
    [
      state.currentUser,
      state.outings,
      state.hostNoShowStrikes,
      state.requests,
      state.partnerWarningsByHost,
    ],
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
        type: 'new_venue',
        outingId,
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
      if (outing.venueIssue.status !== 'alternate_proposed') {
        return { ok: false, reason: 'already_resolved' };
      }
      const acceptedIds = outing.venueIssue.acceptedByUserIds ?? [];
      const refusedIds = outing.venueIssue.refusedByUserIds ?? [];
      if (acceptedIds.includes(user.id) || refusedIds.includes(user.id)) {
        return { ok: false, reason: 'already_responded' };
      }
      const myConfirmed = state.requests.some(
        (r) =>
          r.outingId === outingId &&
          r.userId === user.id &&
          r.status === 'confirmed',
      );
      if (!myConfirmed) return { ok: false, reason: 'not_confirmed' };
      dispatch({
        type: 'RESPOND_VENUE_ALTERNATE',
        payload: { outingId, userId: user.id, decision },
      });
      if (decision === 'refused') {
        const toast: AppToast = {
          id: uid('toast'),
          title: 'Lieu refusé',
          body:
            'Tu sors de la sortie — caution rendue (pas d’absence). Les autres peuvent encore répondre.',
          createdAt: new Date().toISOString(),
          type: 'cancellation',
          outingId,
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
          type: 'new_venue',
          outingId,
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
    [state.currentUser, state.outings, state.requests],
  );



  /**
   * Sync lock for monthly joker claim (lot 2). Complements reducer atomicity so
   * a double-tap cannot pass the callback guard twice before re-render.
   */
  const jokerMonthLockRef = useRef<string | null>(null);

  const hasJokerAvailable = useCallback((): boolean => {
    const user = state.currentUser;
    if (!user) return false;
    const month = parisMonthKey();
    if (!month) return false;
    if (jokerMonthLockRef.current === month) return false;
    return user.jokerUsedMonthKey !== month;
  }, [state.currentUser]);

  const useJokerOnImprevu = useCallback(
    (
      imprevuId: string,
    ):
      | { ok: true }
      | {
          ok: false;
          reason:
            | 'no_user'
            | 'not_found'
            | 'not_reporter'
            | 'wrong_status'
            | 'already_used'
            | 'no_joker'
            | 'no_request'
            | 'not_guest';
        } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      const report = state.imprevuReports.find((r) => r.id === imprevuId);
      if (!report) return { ok: false, reason: 'not_found' };
      if (report.reporterId !== user.id) {
        return { ok: false, reason: 'not_reporter' };
      }
      if (report.status !== 'refused' && report.status !== 'auto_refused') {
        return { ok: false, reason: 'wrong_status' };
      }
      if (report.jokerUsed) return { ok: false, reason: 'already_used' };
      const month = parisMonthKey();
      if (
        !month ||
        user.jokerUsedMonthKey === month ||
        jokerMonthLockRef.current === month
      ) {
        return { ok: false, reason: 'no_joker' };
      }
      const outing = state.outings.find((o) => o.id === report.outingId);
      if (!outing || outing.hostId === user.id) {
        return { ok: false, reason: 'not_guest' };
      }
      const requestId =
        report.requestId ??
        state.requests.find(
          (r) =>
            r.outingId === report.outingId &&
            r.userId === user.id &&
            (r.status === 'confirmed' ||
              r.status === 'cancelled' ||
              r.depositStatus === 'held' ||
              r.depositStatus === 'forfeited'),
        )?.id;
      if (!requestId) return { ok: false, reason: 'no_request' };

      // Claim month synchronously before dispatch (atomic vs double-tap).
      jokerMonthLockRef.current = month;
      dispatch({
        type: 'USE_JOKER_ON_IMPREVU',
        payload: { imprevuId, requestId, monthKey: month },
      });
      const toast: AppToast = {
        id: uid('toast'),
        title: 'Joker utilisé',
        body: 'Caution rendue — ce n’est pas une absence. L’hôte ne touche rien. Joker consommé pour ce mois.',
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      return { ok: true };
    },
    [state.currentUser, state.imprevuReports, state.outings, state.requests],
  );

  const reportGuestNoShow = useCallback(
    (
      requestId: string,
    ):
      | {
          ok: true;
          strike: number;
          lowerPriority: boolean;
          banned?: boolean;
          jokerExempted?: boolean;
        }
      | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      const req = state.requests.find((r) => r.id === requestId);
      if (!req || req.status !== 'confirmed') {
        return { ok: false, reason: 'not_confirmed' };
      }
      const outing = state.outings.find((o) => o.id === req.outingId);
      if (!outing) return { ok: false, reason: 'not_found' };
      if (outing.status === 'cancelled') {
        return { ok: false, reason: 'outing_cancelled' };
      }
      const outingId = req.outingId;
      const guestId = req.userId;
      // Lot 6: acteur = hôte ou l’invité (auto-aveu / démo).
      if (!canActorReportGuestNoShow(user.id, outing.hostId, guestId)) {
        return { ok: false, reason: 'not_participant' };
      }
      if (req.attendance === 'present') {
        return { ok: false, reason: 'already_present' };
      }
      // Lot 6: same absence event — no double strike.
      if (req.attendance === 'absent') {
        const prev = state.guestNoShowStrikes[guestId] ?? 0;
        const s = guestSanctionFromStrike(prev);
        return {
          ok: true,
          strike: prev,
          lowerPriority: s.lowerPriority,
          banned: s.banned,
        };
      }
      const jokerExempted = isJokerExempted(state.imprevuReports, {
        outingId,
        reporterId: guestId,
        requestId,
      });
      if (!shouldApplyGuestNoShowPenalty(jokerExempted)) {
        // Keep deposit returned; do not count an absence on a joker case.
        dispatch({
          type: 'REPORT_GUEST_NO_SHOW',
          payload: {
            outingId,
            requestId,
            guestId,
            strike: state.guestNoShowStrikes[guestId] ?? 0,
            lowerPriority: false,
            banned: false,
          },
        });
        const toast: AppToast = {
          id: uid('toast'),
          title: 'Joker — caution protégée',
          body: 'Ce cas a déjà utilisé le joker : caution rendue pour de bon, pas d’absence comptée.',
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: 'SET_TOAST', payload: toast });
        const prev = state.guestNoShowStrikes[guestId] ?? 0;
        return {
          ok: true,
          strike: prev,
          lowerPriority: false,
          banned: false,
          jokerExempted: true,
        };
      }
      const prev = state.guestNoShowStrikes[guestId] ?? 0;
      const strike = prev + 1;
      const { lowerPriority, banned } = guestSanctionFromStrike(strike);
      dispatch({
        type: 'REPORT_GUEST_NO_SHOW',
        payload: {
          outingId,
          requestId,
          guestId,
          strike,
          lowerPriority,
          banned,
        },
      });
      const note: ChatMessage = {
        id: uid('msg'),
        threadKey: chatThreadKey(outingId, requestId),
        outingId,
        requestId,
        kind: 'system',
        text: banned
          ? 'Note auto · 3e absence invité — compte fermé. Caution perdue (6,90 € Moment / 13,10 € hôte).'
          : lowerPriority
            ? 'Note auto · 2e absence invité — priorité baissée + mention profil. Caution perdue (6,90 € Moment / 13,10 € hôte).'
            : 'Note auto · absence après confirmation — caution perdue (6,90 € Moment / 13,10 € hôte).',
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_CHAT_MESSAGE', payload: note });
      const toast: AppToast = {
        id: uid('toast'),
        title: banned
          ? 'Compte fermé'
          : lowerPriority
            ? 'Priorité baissée'
            : 'Caution perdue',
        body: banned
          ? '3e absence — compte fermé. Caution perdue : 6,90 € Moment / 13,10 € hôte.'
          : lowerPriority
            ? '2e no-show invité — priorité baissée + mention sur le profil.'
            : 'Absence après confirmation — caution perdue : 6,90 € pour Moment, 13,10 € pour l’hôte.',
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      return { ok: true, strike, lowerPriority, banned };
    },
    [
      state.currentUser,
      state.requests,
      state.outings,
      state.guestNoShowStrikes,
      state.imprevuReports,
    ],
  );

  const reportHostNeverHonor = useCallback(
    (
      outingId: string,
    ):
      | { ok: true; strike: number; banned: boolean }
      | { ok: false; reason: string } => {
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing) return { ok: false, reason: 'not_found' };
      // Lot 6: same outing never-honor once.
      if (outing.hostNeverHonorReported) {
        const prev = state.hostPublishStrikes[outing.hostId] ?? 0;
        return {
          ok: true,
          strike: prev,
          banned: hostSanctionFromStrike(prev).banned,
        };
      }
      const hostId = outing.hostId;
      const prev = state.hostPublishStrikes[hostId] ?? 0;
      const strike = prev + 1;
      const { banned } = hostSanctionFromStrike(strike);
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
        type: 'confirmed',
        outingId,
        requestId: winner.id,
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

  const submitPartnerApplication = useCallback(
    (input: {
      venueName: string;
      kind: PartnerKind;
      neighborhood: string;
      phone: string;
      phrase: string;
    }): { ok: true } | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      const st = user.partnerStatus ?? 'none';
      if (st === 'pending') return { ok: false, reason: 'already_pending' };
      if (st === 'active') return { ok: false, reason: 'already_partner' };
      if (st === 'closed') return { ok: false, reason: 'partner_closed' };
      if (
        !input.venueName.trim() ||
        !input.neighborhood.trim() ||
        !input.phone.trim()
      ) {
        return { ok: false, reason: 'missing_fields' };
      }
      dispatch({ type: 'SUBMIT_PARTNER_APPLICATION', payload: input });
      return { ok: true };
    },
    [state.currentUser],
  );

  const reviewPartnerApplication = useCallback(
    (
      decision: 'active' | 'refused',
    ): { ok: true } | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      if (user.partnerStatus !== 'pending') {
        return { ok: false, reason: 'no_pending_application' };
      }
      dispatch({ type: 'REVIEW_PARTNER_APPLICATION', payload: { decision } });
      const toast: AppToast = {
        id: uid('toast'),
        title: decision === 'active' ? 'Lieu validé' : 'Demande lieu refusée',
        body:
          decision === 'active'
            ? `${user.partnerVenueName ?? 'Ton lieu'} est partenaire Moment. Tu peux publier depuis Créer.`
            : 'L’équipe Moment n’a pas validé la demande — tu restes particulier.',
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      return { ok: true };
    },
    [state.currentUser],
  );

  const demoBecomePartner = useCallback((kind: PartnerKind) => {
    dispatch({ type: 'DEMO_BECOME_PARTNER', payload: { kind } });
  }, []);

  const demoLeavePartner = useCallback(() => {
    dispatch({ type: 'DEMO_LEAVE_PARTNER' });
  }, []);

  const setPartnerPinned = useCallback((pinned: boolean) => {
    dispatch({ type: 'SET_PARTNER_PINNED', payload: { pinned } });
  }, []);

  const guestArrivedPartner = useCallback(
    (
      requestId: string,
      opts?: { arrivalPhotoUri?: string },
    ): { ok: true; dispute: boolean } | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      const req = state.requests.find((r) => r.id === requestId);
      if (!req) return { ok: false, reason: 'not_found' };
      const outing = state.outings.find((o) => o.id === req.outingId);
      if (!outing) return { ok: false, reason: 'not_found' };
      if (!canGuestSelfArrivePartner(outing, req, user.id)) {
        return { ok: false, reason: 'not_yet' };
      }
      const dispute = req.attendance === 'absent';
      dispatch({
        type: 'GUEST_ARRIVED_PARTNER',
        payload: {
          requestId,
          arrivedAt: new Date().toISOString(),
          ...(opts?.arrivalPhotoUri
            ? { arrivalPhotoUri: opts.arrivalPhotoUri }
            : {}),
        },
      });
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: uid('msg'),
          threadKey: chatThreadKey(outing.id, requestId),
          outingId: outing.id,
          requestId,
          kind: 'system',
          text: dispute
            ? `${req.userName} dit être arrivé après un « Pas venu » du lieu — litige ouvert, pas de sanction automatique.`
            : `${req.userName} est arrivé. Caution rendue.`,
          createdAt: new Date().toISOString(),
        },
      });
      return { ok: true, dispute };
    },
    [state.currentUser, state.requests, state.outings],
  );

  const partnerMarkNoShow = useCallback(
    (
      requestId: string,
    ):
      | { ok: true; outcome: 'lapin' | 'dispute' }
      | { ok: false; reason: string } => {
      const user = state.currentUser;
      if (!user) return { ok: false, reason: 'no_user' };
      const req = state.requests.find((r) => r.id === requestId);
      if (!req) return { ok: false, reason: 'not_found' };
      const outing = state.outings.find((o) => o.id === req.outingId);
      if (!outing) return { ok: false, reason: 'not_found' };
      const at = new Date().toISOString();
      if (canPartnerFlagDispute(outing, req, user.id)) {
        dispatch({ type: 'OPEN_PARTNER_DISPUTE', payload: { requestId, at } });
        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          payload: {
            id: uid('msg'),
            threadKey: chatThreadKey(outing.id, requestId),
            outingId: outing.id,
            requestId,
            kind: 'system',
            text: 'Litige : arrivé selon l’invité, « Pas venu » selon le lieu. Photo demandée plus tard (démo) — aucune sanction automatique.',
            createdAt: at,
          },
        });
        return { ok: true, outcome: 'dispute' };
      }
      if (!canPartnerMarkGuestAbsent(outing, req, user.id)) {
        return { ok: false, reason: 'not_allowed_now' };
      }
      dispatch({ type: 'MARK_PARTNER_ABSENT_AT', payload: { requestId, at } });
      // « Pas venu » sans « Je suis arrivé » → lapin (6,90 Moment / 13,10 lieu).
      const res = reportGuestNoShow(requestId);
      if (!res.ok) return { ok: false, reason: res.reason };
      return { ok: true, outcome: 'lapin' };
    },
    [state.currentUser, state.requests, state.outings, reportGuestNoShow],
  );

  const simulatePartnerGuestConfirms = useCallback(
    (
      outingId: string,
      count: number,
    ):
      | { ok: true; confirmed: number; noSpot: number }
      | { ok: false; reason: string } => {
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing || !isPartnerListing(outing)) {
        return { ok: false, reason: 'not_partner_listing' };
      }
      if (outing.status !== 'open') return { ok: false, reason: 'not_open' };
      const names: [string, number, 'femme' | 'homme'][] = [
        ['Camille', 29, 'femme'],
        ['Hugo', 33, 'homme'],
        ['Inès', 26, 'femme'],
        ['Malik', 31, 'homme'],
      ];
      const now = Date.now();
      let seats = outing.spotsLeft;
      let confirmed = 0;
      let noSpot = 0;
      for (let i = 0; i < Math.max(1, Math.min(4, count)); i++) {
        const [n, age, g] = names[i];
        const id = uid('req');
        dispatch({
          type: 'JOIN_OUTING',
          payload: {
            id,
            outingId,
            userId: `demo-partner-guest-${i + 1}-${now}`,
            userName: `${n} (démo)`,
            userAge: age,
            userGender: g,
            message: '',
            status: 'accepted',
            createdAt: new Date(now - 60_000).toISOString(),
            acceptedAt: new Date(now - 60_000).toISOString(),
            confirmDeadlineAt: new Date(now + CONFIRM_WINDOW_MS).toISOString(),
            partnerAutoSeat: true,
          },
        });
        // Confirm dans l’ordre (timestamps croissants) : le reducer attribue
        // les chaises atomiquement — les suivants reçoivent « Plus de place ».
        dispatch({
          type: 'CONFIRM_SLOT',
          payload: {
            requestId: id,
            confirmedAt: new Date(now + i).toISOString(),
          },
        });
        if (seats > 0) {
          seats -= 1;
          confirmed += 1;
        } else {
          noSpot += 1;
        }
      }
      const toast: AppToast = {
        id: uid('toast'),
        title: 'Confirmations partenaire',
        body:
          noSpot > 0
            ? `${confirmed} chaise(s) prise(s) — ${noSpot} « Plus de place » (caution non bloquée).`
            : `${confirmed} invité(s) confirmé(s) — place prise automatiquement.`,
        createdAt: new Date().toISOString(),
        outingId,
      };
      dispatch({ type: 'SET_TOAST', payload: toast });
      return { ok: true, confirmed, noSpot };
    },
    [state.outings],
  );

  const simulatePartnerNextDay = useCallback(
    (
      outingId: string,
    ): { ok: true; refunded: number } | { ok: false; reason: string } => {
      const outing = state.outings.find((o) => o.id === outingId);
      if (!outing || !isPartnerListing(outing)) {
        return { ok: false, reason: 'not_partner_listing' };
      }
      const targets = state.requests.filter(
        (r) =>
          r.outingId === outingId &&
          r.status === 'confirmed' &&
          !r.attendance &&
          !r.partnerDispute &&
          r.depositStatus === 'held',
      );
      for (const r of targets) {
        dispatch({ type: 'RETURN_DEPOSIT_SILENCE', payload: { requestId: r.id } });
      }
      return { ok: true, refunded: targets.length };
    },
    [state.outings, state.requests],
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
      cancelOuting,
      cancelRequest,
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
      markGuestPresent,
      demoMarkConfirmedPresent,
      getCompletedOutingsMissingPresent,
      addReview,
      replyToReview,
      requestHideReviewText,
      simulateOtherHideConsent,
      getReviewsForUser,
      getRatingStats,
      canLeaveReview,
      reportUser,
      blockUser,
      unblockUser,
      isBlocked,
      getVenueReviews,
      getVenueRatingStats,
      getOutingsToRate,
      getMyReviewFor,
      getMyRatedOutingPairs,
      getDisplayName,
      showToast,
      notifyPriority,
      reportHostNoShow,
      reportVenueClosed,
      respondVenueAlternate,
      hasJokerAvailable,
      useJokerOnImprevu,
      reportGuestNoShow,
      reportHostNeverHonor,
      simulateConfirmRace,
      simulateLocalNotifications,
      submitPartnerApplication,
      reviewPartnerApplication,
      demoBecomePartner,
      demoLeavePartner,
      setPartnerPinned,
      guestArrivedPartner,
      partnerMarkNoShow,
      simulatePartnerGuestConfirms,
      simulatePartnerNextDay,
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
      cancelOuting,
      cancelRequest,
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
      markGuestPresent,
      demoMarkConfirmedPresent,
      getCompletedOutingsMissingPresent,
      addReview,
      replyToReview,
      requestHideReviewText,
      simulateOtherHideConsent,
      getReviewsForUser,
      getRatingStats,
      canLeaveReview,
      reportUser,
      blockUser,
      unblockUser,
      isBlocked,
      getVenueReviews,
      getVenueRatingStats,
      getOutingsToRate,
      getMyReviewFor,
      getMyRatedOutingPairs,
      getDisplayName,
      showToast,
      notifyPriority,
      reportHostNoShow,
      reportVenueClosed,
      respondVenueAlternate,
      hasJokerAvailable,
      useJokerOnImprevu,
      reportGuestNoShow,
      reportHostNeverHonor,
      simulateConfirmRace,
      simulateLocalNotifications,
      submitPartnerApplication,
      reviewPartnerApplication,
      demoBecomePartner,
      demoLeavePartner,
      setPartnerPinned,
      guestArrivedPartner,
      partnerMarkNoShow,
      simulatePartnerGuestConfirms,
      simulatePartnerNextDay,
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
export {
  DEPOSIT_STATUS_LABELS,
  describeDepositOutcome,
} from './pricing';
