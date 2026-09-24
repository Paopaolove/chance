export type Gender = 'femme' | 'homme' | 'autre';

export type AuthProvider = 'apple' | 'google' | 'email';

export type OutingCategory = 'restaurant' | 'bar' | 'culture' | 'autre';

export type OutingStatus = 'open' | 'full' | 'closed' | 'completed';

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
}

export interface Outing {
  id: string;
  hostId: string;
  hostName: string;
  hostAge: number;
  hostGender: Gender;
  title: string;
  description: string;
  category: OutingCategory;
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
  budgetMaxEuros: number;
  status: OutingStatus;
  createdAt: string;
  /** Optional conversation topic. */
  topic?: string;
  /** Topics the host prefers to avoid. */
  excludedTopics?: string[];
  /** Host is flexible on the exact time slot. */
  flexibleSlot?: boolean;
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
  createdAt: string;
  acceptedAt?: string;
  confirmDeadlineAt?: string;
  confirmedAt?: string;
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
  /** In-app mock notification banner (e.g. late alert). */
  toast: AppToast | null;
}

export type DispoProfileUpdate = {
  dispoSoir?: boolean;
  dispoCategories?: OutingCategory[];
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
  | { type: 'CLOSE_OUTING'; payload: { outingId: string } }
  | { type: 'JOIN_OUTING'; payload: Request }
  | { type: 'ACCEPT_REQUEST'; payload: { requestId: string; acceptedAt: string; confirmDeadlineAt: string } }
  | { type: 'DECLINE_REQUEST'; payload: { requestId: string } }
  | { type: 'CONFIRM_SLOT'; payload: { requestId: string; confirmedAt: string } }
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
  | { type: 'SET_TOAST'; payload: AppToast | null }
  | { type: 'SHIFT_OUTING_START'; payload: { outingId: string; startsAt: string } }
  | { type: 'COMPLETE_OUTING'; payload: { outingId: string } }
  | { type: 'ADD_REVIEW'; payload: Review }
  | { type: 'REPLY_TO_REVIEW'; payload: { reviewId: string; reply: string } }
  | { type: 'HIDE_REVIEW_TEXT'; payload: { reviewId: string } };

export interface Review {
  id: string;
  outingId: string;
  fromUserId: string;
  toUserId: string;
  /** 1–5 stars; not editable after post. */
  rating: 1 | 2 | 3 | 4 | 5;
  /** Optional; not editable after post. */
  comment?: string;
  /** At most one reply from the reviewed user. */
  reply?: string;
  createdAt: string;
  /** Text (comment + reply) hidden by mutual agreement; note + count remain. */
  textHidden?: boolean;
}

export type UserRatingStats = {
  /** Average of received ratings, or null if none. */
  average: number | null;
  /** Number of reviews received (= sorties notées). */
  outingCount: number;
};
