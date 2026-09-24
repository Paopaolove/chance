export type Gender = 'femme' | 'homme' | 'autre';

export type AuthProvider = 'apple' | 'google' | 'email';

export type OutingCategory = 'restaurant' | 'bar' | 'culture' | 'autre';

/**
 * Outing lifecycle (listing-level — distinct from per-guest RequestStatus):
 * - open: accepts new join requests while spotsLeft > 0
 * - full: spotsLeft === 0 (all seats reserved via accept); no new joins
 * - closed: host closed listing (closeOuting) — no new requests; existing
 *   confirmed guests keep their seats unless individually cancelled
 * - completed: outing ended (after startsAt / demo completeOuting)
 */
export type OutingStatus = 'open' | 'full' | 'closed' | 'completed';

/**
 * Per-guest reservation states (seat machine):
 * - pending: join request; does NOT reserve a seat
 * - accepted: host accepted → seat reserved (spotsLeft--); guest has
 *   CONFIRM_WINDOW_MS (~10 min) to confirm; deadline stored as ISO UTC
 * - confirmed: guest confirmed in time → deposit held once; credit consumed once
 * - expired: confirm window missed OR capacity race_lost → seat restored
 * - declined: host refused a pending request (no seat was held)
 * - cancelled: guest withdrew (pending/accepted/confirmed) OR host cancelOuting
 *   cancelled this seat — NOT the same as closeOuting (listing closed) or
 *   completed (outing ended). One guest cancel never cancels other confirmed seats.
 */
export type RequestStatus =
  | 'pending'
  | 'accepted'
  | 'confirmed'
  | 'expired'
  | 'declined'
  | 'cancelled';

export type PlanId = 'essai' | 'payg' | 'essentiel' | 'illimite';

export type PlanInterval = 'month' | 'year';

/** Where to land right after onboarding CTAs. */
export type EntryIntent = 'feed' | 'dispo';

export interface User {
  id: string;
  firstName: string;
  /** Demo default when not collected in onboarding. */
  age: number;
  gender: Gender;
  bio: string;
  neighborhood: string;
  plan: PlanId;
  /** Billing interval for Essentiel / Illimité (mock). */
  planInterval?: PlanInterval | null;
  /** Remaining confirmable outings (Essentiel 4/mo, Payg 1 per purchase). */
  outingCredits?: number;
  trialEndsAt: string;
  dispoSoir: boolean;
  /** Optional curated interests (suggest 3–5, not mandatory). */
  interests: string[];
  /** Free-text descriptive tags (vegan, afterwork…) in addition to curated interests. */
  customFilters: string[];
  /** Local URI from image picker; undefined = initials fallback. */
  photoUri?: string;
  dispoCategories: OutingCategory[];
  /** Free detail when Dispo includes Autre. */
  dispoCategoryDetail?: string;
  /** Optional max budget when dispo ce soir (€). */
  dispoBudgetMax?: number;
  /** Créneau ce soir (ex. « 19:30 » ou « flexible »). */
  dispoSlot?: string;
  /** Quartier privilégié pour ce soir (sinon neighborhood du profil). */
  dispoNeighborhood?: string;
  /** Sujet de discussion optionnel. */
  dispoTopic?: string;
  /** Sujets à éviter (optionnel). */
  dispoExclusions?: string[];
  /** ISO local midnight — auto-off Dispo ce soir. */
  dispoExpiresAt?: string;
  phone: string;
  authProvider: AuthProvider;
  /** Women only: prefer femmes-uniquement for listings / requests. */
  womenOnlyPreference: boolean;
  registered: boolean;
  email?: string;
  notificationsGranted: boolean;
  locationGranted: boolean;
  createdAt: string;
  /** Host no-shows: 1 = warning, 2+ = ban (mock). */
  hostNoShowCount?: number;
  /** Guest ghost after confirm: 1 = forfeit deposit, 2+ = lower priority + profile mention. */
  guestNoShowCount?: number;
  /** After 2nd guest no-show — deprioritized in host queues (mock). */
  lowerPriority?: boolean;
  /** Visible profile mention after repeated guest ghost (mock). */
  profileMention?: string;
  /** Publishes often / never honors: 1 = warning, 2+ = ban (mock). */
  hostPublishStrikeCount?: number;
  /** Banned after 2nd host no-show or never-honor (mock). */
  banned?: boolean;
  bannedReason?: string;
}

export type VenueIssueStatus =
  | 'reported'
  | 'alternate_proposed'
  | 'alternate_accepted'
  | 'refused';

export type VenueAlternate = {
  venueName: string;
  approxArea: string;
  exactAddress: string;
  budgetMaxEuros: number;
  neighborhood: string;
};

export type VenueIssue = {
  status: VenueIssueStatus;
  reportedAt: string;
  alternate?: VenueAlternate;
  /** Guests who refused the alternate (deposit returned). */
  refusedByUserIds?: string[];
  /** Guests who accepted the alternate. */
  acceptedByUserIds?: string[];
};

export interface Outing {
  id: string;
  hostId: string;
  hostName: string;
  hostAge: number;
  hostGender: Gender;
  title: string;
  description: string;
  category: OutingCategory;
  /** Free detail when category === 'autre' (ex. bowling). */
  categoryDetail?: string;
  neighborhood: string;
  venueName: string;
  approxArea: string;
  /** Stored for host; never shown until request is confirmed. */
  exactAddress: string;
  startsAt: string;
  /** Core seats 1–3; 4 kept for legacy mocks. */
  capacity: 1 | 2 | 3 | 4;
  spotsLeft: number;
  womenOnly: boolean;
  /**
   * Invitation cap per guest in EUR, covered by the host at the venue (not via the app).
   * 0 = free outing (Gratuit). Beyond the cap is outside the invitation.
   * Not a split bill, not peer transfer, not an unlimited free meal.
   */
  budgetMaxEuros: number;
  /** What the invite covers (ex. plat + boisson). Optional. */
  inviteIncludes?: string;
  /** What stays outside the invite (ex. dessert, 2e verre). Optional. */
  inviteExtras?: string;
  /** Culture: host already bought tickets. Optional. */
  ticketsAlreadyBought?: boolean;
  status: OutingStatus;
  createdAt: string;
  /** Optional conversation topic. */
  topic?: string;
  /** Topics the host prefers to avoid. */
  excludedTopics?: string[];
  /** Host is flexible on the exact time slot. */
  flexibleSlot?: boolean;
  /** Restaurant closed edge-case (mock). */
  venueIssue?: VenueIssue;
}

export interface Request {
  id: string;
  outingId: string;
  userId: string;
  userName: string;
  userAge: number;
  userGender: Gender;
  message: string;
  status: RequestStatus;
  /** ISO UTC. */
  createdAt: string;
  /** ISO UTC — when host accepted (seat reserved). */
  acceptedAt?: string;
  /**
   * ISO UTC deadline for confirmSlot (acceptedAt + CONFIRM_WINDOW_MS).
   * Store UTC; display in Europe/Paris via parisTime helpers.
   */
  confirmDeadlineAt?: string;
  /** ISO UTC — when guest confirmed (deposit held, credit consumed). */
  confirmedAt?: string;
  /**
   * Caution mock: held once at confirm; never double-held on idempotent re-confirm.
   * Returned on free cancel (≥ CANCEL_FREE_BEFORE_HOURS), host cancelOuting,
   * host no-show / venue refuse; forfeited on late guest cancel / ghost.
   */
  depositStatus?: 'none' | 'held' | 'returned' | 'forfeited';
}


export type LatePresetMinutes = 5 | 10 | 15 | 20;

export type ChatMessageKind = 'user' | 'system';

export interface ChatMessage {
  id: string;
  /** Thread key: outingId or outingId:requestId */
  threadKey: string;
  outingId: string;
  requestId?: string;
  kind: ChatMessageKind;
  senderId?: string;
  senderName?: string;
  text: string;
  createdAt: string;
}

/** Late signal — bandeau shown to other party(ies), not the reporter. */
export interface LateReport {
  id: string;
  outingId: string;
  requestId?: string;
  reporterId: string;
  reporterName: string;
  /** Exact delay in minutes (preset chip or custom input). */
  minutes: number;
  /** True when the « 20+ min » chip was used (not exact custom input). */
  orMore?: boolean;
  createdAt: string;
}

export type ImprevuMotive =
  | 'annuler'
  | 'gros_retard'
  | 'lieu_ferme'
  | 'autre';

export type ImprevuStatus =
  | 'pending'
  | 'accepted'
  | 'refused'
  | 'auto_refused';

/** One unexpected-event signal per person per outing (no free chat). */
export interface ImprevuReport {
  id: string;
  outingId: string;
  /** Confirmed request when the reporter is a guest. */
  requestId?: string;
  reporterId: string;
  reporterName: string;
  /** Who may accept/refuse (host and/or confirmed guests). First response wins. */
  responderIds: string[];
  motive: ImprevuMotive;
  /** Required written reason (1–3 lines). */
  reason: string;
  status: ImprevuStatus;
  createdAt: string;
  respondedAt?: string;
  respondedByUserId?: string;
}

export interface AppToast {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface AppState {
  onboardingDone: boolean;
  currentUser: User | null;
  outings: Outing[];
  requests: Request[];
  /** Consumed once after onboarding to route into Feed or Dispo. */
  entryIntent: EntryIntent | null;
  chatMessages: ChatMessage[];
  reviews: Review[];
  /** Late signals — bandeau for other party(ies) in chat/outing UI. */
  lateReports: LateReport[];
  /** Unexpected-event signals (once per person per outing). */
  imprevuReports: ImprevuReport[];
  /** Host id → no-show count (1=warning, 2+=ban). */
  hostNoShowStrikes: Record<string, number>;
  /** Guest id → ghost-after-confirm count (1=forfeit, 2+=lower priority). */
  guestNoShowStrikes: Record<string, number>;
  /** Host id → publish-never-honor count (1=warning, 2+=ban). */
  hostPublishStrikes: Record<string, number>;
  /** In-app mock notification banner (e.g. late alert). */
  toast: AppToast | null;
}

export type DispoProfileUpdate = {
  dispoSoir?: boolean;
  dispoCategories?: OutingCategory[];
  dispoCategoryDetail?: string | null;
  dispoBudgetMax?: number | null;
  dispoSlot?: string | null;
  dispoNeighborhood?: string | null;
  dispoTopic?: string | null;
  dispoExclusions?: string[] | null;
  dispoExpiresAt?: string | null;
  interests?: string[];
  customFilters?: string[];
  bio?: string;
  neighborhood?: string;
  firstName?: string;
  photoUri?: string | null;
  womenOnlyPreference?: boolean;
};

export type OnboardingInput = {
  firstName: string;
  gender: Gender;
  neighborhood: string;
  bio: string;
  interests: string[];
  /** Free-text centres d'intérêt / filtres descriptifs. */
  customFilters?: string[];
  photoUri?: string;
  phone: string;
  authProvider: AuthProvider;
  email?: string;
  womenOnlyPreference: boolean;
  entryIntent: EntryIntent;
  /** If entryIntent is dispo, mark user dispo immediately. */
  dispoSoir?: boolean;
};

export type AppAction =
  | { type: 'COMPLETE_ONBOARDING'; payload: User; entryIntent: EntryIntent }
  | { type: 'CLEAR_ENTRY_INTENT' }
  | { type: 'CREATE_OUTING'; payload: Outing }
  /**
   * Host closes listing: no new requests; pending/accepted cancelled (seats
   * restored); confirmed guests KEEP their seats. Distinct from CANCEL_OUTING.
   */
  | { type: 'CLOSE_OUTING'; payload: { outingId: string } }
  /**
   * Host cancels the whole outing (including confirmed guests). Cancels all
   * active requests; restores deposits per product (≥3h free window / host-
   * initiated). Distinct from CLOSE_OUTING and COMPLETE_OUTING.
   */
  | { type: 'CANCEL_OUTING'; payload: { outingId: string; cancelledAt: string } }
  /**
   * Guest withdraws own pending/accepted/confirmed request, OR host cancels
   * one accepted seat. Does NOT cancel the outing for other confirmed guests.
   * Accepted/confirmed → restore seat. Confirmed deposit: returned if free
   * cancel window, else forfeited (guest-initiated).
   */
  | { type: 'CANCEL_REQUEST'; payload: { requestId: string; cancelledAt: string; by: 'guest' | 'host' } }
  | { type: 'JOIN_OUTING'; payload: Request }
  | { type: 'ACCEPT_REQUEST'; payload: { requestId: string; acceptedAt: string; confirmDeadlineAt: string } }
  | { type: 'DECLINE_REQUEST'; payload: { requestId: string } }
  /**
   * Confirm seat. Idempotent: already-confirmed → no-op (no double deposit /
   * no double credit). consumeCredit only on accepted→confirmed transition.
   */
  | { type: 'CONFIRM_SLOT'; payload: { requestId: string; confirmedAt: string; consumeCredit?: boolean } }
  | { type: 'EXPIRE_REQUEST'; payload: { requestId: string } }
  | { type: 'SET_DISPO_SOIR'; payload: boolean }
  | { type: 'SET_DISPO_PROFILE'; payload: DispoProfileUpdate }
  | {
      type: 'SET_PLAN';
      payload: {
        plan: PlanId;
        planInterval?: PlanInterval | null;
        outingCredits?: number;
        trialEndsAt?: string;
      };
    }
  | { type: 'SIMULATE_TRIAL_END' }
  | { type: 'CONSUME_OUTING_CREDIT' }
  | { type: 'REGISTER_ACCOUNT'; payload: { email: string } }
  | { type: 'RESET_DEMO' }
  | { type: 'SET_PERMISSIONS'; payload: { notificationsGranted?: boolean; locationGranted?: boolean } }
  | { type: 'ADD_CHAT_MESSAGE'; payload: ChatMessage }
  | { type: 'SEED_CHAT_MESSAGES'; payload: ChatMessage[] }
  | { type: 'REPORT_LATE'; payload: LateReport }
  | { type: 'REPORT_IMPREVU'; payload: ImprevuReport }
  | {
      type: 'RESPOND_IMPREVU';
      payload: {
        imprevuId: string;
        decision: 'accepted' | 'refused' | 'auto_refused';
        respondedAt: string;
        respondedByUserId?: string;
        /** When refused/auto and <3h: forfeit reporter guest deposit. */
        forfeitReporterDeposit?: boolean;
        /** When accepted: return deposits + close outing. */
        cancelOuting?: boolean;
      };
    }
  | { type: 'SET_TOAST'; payload: AppToast | null }
  | { type: 'SHIFT_OUTING_START'; payload: { outingId: string; startsAt: string } }
  /** End outing after startsAt / demo — status completed (reviews unlock). */
  | { type: 'COMPLETE_OUTING'; payload: { outingId: string } }
  | { type: 'ADD_REVIEW'; payload: Review }
  | { type: 'REPLY_TO_REVIEW'; payload: { reviewId: string; reply: string } }
  | {
      type: 'REQUEST_HIDE_REVIEW_TEXT';
      payload: { reviewId: string; userId: string };
    }
  | {
      type: 'REPORT_HOST_NO_SHOW';
      payload: {
        outingId: string;
        hostId: string;
        strike: number;
        banned: boolean;
      };
    }
  | {
      type: 'SET_USER_BAN_STATE';
      payload: {
        userId: string;
        hostNoShowCount: number;
        banned: boolean;
        bannedReason?: string;
      };
    }
  | {
      type: 'RETURN_DEPOSITS_FOR_OUTING';
      payload: { outingId: string; reason: string };
    }
  | {
      type: 'REPORT_VENUE_CLOSED';
      payload: { outingId: string; alternate: VenueAlternate };
    }
  | {
      type: 'RESPOND_VENUE_ALTERNATE';
      payload: {
        outingId: string;
        userId: string;
        decision: 'accepted' | 'refused';
      };
    }
  | {
      type: 'REPORT_GUEST_NO_SHOW';
      payload: {
        outingId: string;
        requestId: string;
        guestId: string;
        strike: number;
        lowerPriority: boolean;
      };
    }
  | {
      type: 'REPORT_HOST_NEVER_HONOR';
      payload: {
        outingId: string;
        hostId: string;
        strike: number;
        banned: boolean;
      };
    }
  | {
      type: 'RUN_CONFIRM_RACE_DEMO';
      payload: {
        outingId: string;
        winner: Request;
        loser: Request;
        winnerConfirmedAt: string;
      };
    };

/** Motif obligatoire si note personne 1 ou 2 (respect / rencontre). */
export type LowStarReasonKind =
  | 'comportement_genant'
  | 'absent_retard'
  | 'autre';

export interface Review {
  id: string;
  outingId: string;
  fromUserId: string;
  toUserId: string;
  /** 1–5 stars RENCONTRE (respect / personne); profile-facing; not editable after post. */
  rating: 1 | 2 | 3 | 4 | 5;
  /** Optional person-only comment; never about the venue. Not editable after post. */
  comment?: string;
  /** 1–5 stars for the venue / lieu only. Never shown on profile. */
  venueRating?: 1 | 2 | 3 | 4 | 5;
  /** Optional venue-only comment; never about the person. */
  venueComment?: string;
  /** Stable key for aggregation, e.g. normalized `${venueName}|${neighborhood}`. */
  venueKey: string;
  /** Display name of the venue (from the outing). */
  venueName?: string;
  /** At most one reply from the reviewed user (to the person comment). */
  reply?: string;
  createdAt: string;
  /** User ids who agreed to hide text (need both from + to). */
  hideTextConsentUserIds?: string[];
  /** Text (person comment + reply) hidden by mutual agreement; note + count remain. */
  textHidden?: boolean;
  /**
   * Private: envie de revoir. Never shown on profile, cards, or ReviewsScreen.
   */
  wantToSeeAgain?: boolean;
  /**
   * Private: required when rating is 1 or 2. Never shown publicly.
   * No « pas de feeling » motive — use 3–4 + wantToSeeAgain:false instead.
   */
  lowStarReason?: {
    kind: LowStarReasonKind;
    /** 1 line free text when kind === 'autre'. */
    detail?: string;
  };
}

export type UserRatingStats = {
  /** Average of received person ratings, or null if none. */
  average: number | null;
  /** Number of reviews received (= sorties notées). */
  outingCount: number;
};

export type VenueRatingStats = {
  /** Average of venue ratings for this venueKey, or null if none. */
  average: number | null;
  /** Number of venue ratings. */
  reviewCount: number;
};
