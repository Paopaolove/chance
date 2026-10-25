export type Gender = 'femme' | 'homme' | 'autre';

export type AuthProvider = 'apple' | 'google' | 'email';

export type OutingCategory =
  | 'restaurant'
  | 'bar'
  | 'culture'
  | 'sport'
  | 'autre';

/** Compte partenaire (lieu) : resto / bar / salle-théâtre (culture). */
export type PartnerKind = 'resto' | 'bar' | 'culture';

/**
 * Statut du compte lieu (entrée Pro via Profil → « Je représente un lieu »).
 * - none: particulier (défaut)
 * - pending: « Demande envoyée » (visible Profil, pas dans le fil)
 * - active: validé par l’équipe Moment (démo : bouton QA)
 * - refused: refus → reste particulier
 * - closed: 2e avertissement → compte partenaire fermé (publication bloquée)
 */
export type PartnerStatus = 'none' | 'pending' | 'active' | 'refused' | 'closed';

/** Geste offert par un resto/bar partenaire (0 ou 1). « autre » = texte libre. */
export type PartnerGesture =
  | 'verre'
  | 'dessert'
  | 'cafe'
  | 'entree'
  | 'plat_du_jour'
  | 'autre';

/**
 * Offre resto/bar partenaire : 2 groupes indépendants cumulables, au moins
 * un requis. Jamais de « J’invite jusqu’à X € » côté partenaire. Culture :
 * pas d’offre (places offertes).
 */
export type PartnerOffer = {
  gesture?: PartnerGesture;
  /** Texte libre quand gesture === 'autre'. */
  gestureOther?: string;
  /** Remise en % (10, 20 ou « Autre % » libre). */
  discountPct?: number;
};

/** Litige présence partenaire (stub — pas de sanction auto). */
export type PartnerDispute = {
  openedAt: string;
  /** Ordre des signaux : arrivé puis « Pas venu », ou l’inverse. */
  trigger: 'absent_after_arrival' | 'arrival_after_absent';
  note: string;
};

/**
 * Outing lifecycle (listing-level — distinct from per-guest RequestStatus):
 * - open: accepts new join requests while spotsLeft > 0
 * - full: spotsLeft === 0 (all seats reserved via accept); no new joins
 * - closed: clôture — no new acceptances (host closeOuting, capacity full
 *   already handled via full, or urgent H+30 join window ends). Confirmed
 *   guests keep their seats. ≠ cancelled / completed / attendance.
 * - cancelled: annulation — host cancelOuting; all seats cancelled; deposits
 *   returned. ≠ closed (keeps confirmés) / completed (terminée).
 * - completed: fin de sortie « terminée » (host completeOuting OR auto after
 *   startsAt+grace). Unlocks avis for guests marked present. Does NOT imply
 *   attendance. Distinct from closeOuting / cancelOuting.
 */
export type OutingStatus = 'open' | 'full' | 'closed' | 'cancelled' | 'completed';

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
export type EntryIntent = 'feed' | 'dispo' | 'create';

export interface User {
  id: string;
  firstName: string;
  /** Real age collected at onboarding / edit (18+). Never silently defaulted. */
  age: number;
  /**
   * Plus demandé à l’entrée : undefined tant que la personne ne l’a pas
   * indiqué (Profil, ou option « Femmes uniquement »). Un genre inconnu ne
   * voit pas / ne rejoint pas les moments réservés aux femmes.
   */
  gender?: Gender;
  /** Précision libre quand gender === 'autre' (pastille « Autre » + champ). */
  genderDetail?: string;
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
  /** Optional max budget when Dispo (€) — unused on Dispo screen. */
  dispoBudgetMax?: number;
  /** Créneau Dispo (shortcut id, custom:…, or legacy HH:mm). */
  dispoSlot?: string;
  /** Quartier privilégié pour la dispo (sinon neighborhood du profil). */
  dispoNeighborhood?: string;
  /** Sujet de discussion optionnel. */
  dispoTopic?: string;
  /** Sujets à éviter (optionnel). */
  dispoExclusions?: string[];
  /** ISO — auto-off Dispo (slot end or Paris midnight of that day). */
  dispoExpiresAt?: string;
  /**
   * Plus demandé à l’entrée : undefined / '' tant que non renseigné. Demandé
   * avant le premier moment (publier / demander à rejoindre / confirmer) ou
   * dans Profil → Modifier.
   */
  phone?: string;
  authProvider: AuthProvider;
  /** Women only: prefer femmes-uniquement for listings / requests. */
  womenOnlyPreference: boolean;
  /**
   * Feuille « Avant ton premier moment » déjà vue (photo proposée une fois,
   * jamais imposée). Le téléphone, lui, reste demandé tant qu’il manque.
   */
  momentPromptSeen?: boolean;
  registered: boolean;
  email?: string;
  notificationsGranted: boolean;
  locationGranted: boolean;
  createdAt: string;
  /** Host no-shows: 1 = warning, 2+ = ban (mock). */
  hostNoShowCount?: number;
  /** Guest absence after confirm: 1 = forfeit; 2 = lower priority; 3+ = compte fermé. */
  guestNoShowCount?: number;
  /** After 2nd guest no-show — deprioritized in host queues (mock). */
  lowerPriority?: boolean;
  /** Visible profile mention after repeated guest absence (mock). */
  profileMention?: string;
  /** Publishes often / never honors: 1 = warning, 2+ = ban (mock). */
  hostPublishStrikeCount?: number;
  /**
   * Compte fermé (démo) : 2e no-show hôte / never-honor, ou 3e absence invité.
   * ≠ blockUser (blocage pair local).
   */
  banned?: boolean;
  bannedReason?: string;
  /**
   * Paris calendar month (« YYYY-MM ») when the monthly joker was consumed.
   * Empty / other month → joker available again.
   */
  jokerUsedMonthKey?: string;
  /** Revue manuelle Moment (ex. 2 malaises en 3 mois sans élément concret) — motif malaise plus proposé. */
  manualReviewRequired?: boolean;
  /**
   * Compte lieu actif (partnerStatus === 'active'). Publier depuis ce compte
   * applique les règles partenaire (resto/bar : geste/remise ; culture :
   * jusqu’à 5 invitations le même soir, 2 places chacune).
   */
  isPartner?: boolean;
  partnerKind?: PartnerKind;
  /** Nom du lieu (carte « Le Frank · Partenaire »). */
  partnerVenueName?: string;
  /** Quartier du lieu (fiche lieu). */
  partnerNeighborhood?: string;
  /** Téléphone du lieu (fiche lieu). */
  partnerPhone?: string;
  /** Phrase de présentation du lieu. */
  partnerPhrase?: string;
  /** Statut de la demande / du compte lieu. Absent = 'none'. */
  partnerStatus?: PartnerStatus;
  /** Avertissements partenaire (annulation / ne honore pas). 2 → closed. */
  partnerWarnings?: number;
  /**
   * Démo : remontée en tête du fil (futur forfait 29 €/mois = 2 remontées,
   * aucun paiement codé). Compte parmi les 2 partenaires max en tête.
   */
  partnerPinned?: boolean;
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
  /** Genre de l’hôte s’il l’a renseigné (optionnel depuis le tunnel court). */
  hostGender?: Gender;
  title: string;
  description: string;
  category: OutingCategory;
  /**
   * Free detail when category === 'autre' (ex. bowling, requis) or
   * 'sport' (« Quel sport ? », facultatif, ex. padel).
   */
  categoryDetail?: string;
  neighborhood: string;
  /** Coordonnées optionnelles (carte). Sinon dérivées du quartier (utils/parisGeo). */
  latitude?: number;
  longitude?: number;
  venueName: string;
  approxArea: string;
  /** Stored for host; never shown until request is confirmed. */
  exactAddress: string;
  startsAt: string;
  /** 25/10 · Heure de la clôture « terminée » (hôte ou auto H+30), si enregistrée. */
  completedAt?: string;
  /** Guest seats only 1 | 2 | 3 (no 4). */
  capacity: 1 | 2 | 3;
  spotsLeft: number;
  womenOnly: boolean;
  /**
   * Invitation cap per guest in EUR, covered by the host at the venue (not via the app).
   * Restaurant / bar: positive amount (chips 10–40 or free amount).
   * Culture / sport / autre: 0 = no € cap (sortie sans addition). Beyond a positive cap is outside the invitation.
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
  /**
   * Invitation urgente — host already at venue (« Je suis déjà sur place »)
   * OR auto-promoted at H−90 with no confirmed guests.
   * Joinable until startsAt+30 min, then auto-clôturée.
   * Chat unlocks immediately on confirm (bypass H−1).
   * NOT the guest no-show / lapin / imprévu flow.
   */
  urgentOnSite?: boolean;
  /**
   * Auto H−90 promotion (no confirmed guests). Pill « Maintenant » (comme le manuel).
   * Manual on-site keeps urgentOnSite without this flag → pill « Maintenant ».
   */
  urgentAutoH90?: boolean;
  /**
   * Proposition ciblée (Dispo / profil) — destinataire réel.
   * Pas une annonce publique : réservée à cet user id (Demandes).
   */
  inviteeUserId?: string;
  inviteeName?: string;
  /**
   * Annonce publiée par un compte lieu (badge « Partenaire »).
   * Zéro clic côté lieu : Rejoindre → confirmer (10 min + caution) → place
   * prise automatiquement à la confirmation si spotsLeft > 0.
   */
  isPartnerListing?: boolean;
  partnerKind?: PartnerKind;
  /** Resto/bar partenaire : geste et/ou remise (au moins un). */
  partnerOffer?: PartnerOffer;
  /** Démo : remontée en tête (copie de User.partnerPinned à la publication). */
  partnerPinned?: boolean;
  /**
   * Clôturée automatiquement car pleine (closed ≠ cancelled). Si un confirmé
   * se désiste avant l’heure, l’annonce se rouvre.
   */
  partnerAutoClosedFull?: boolean;
  /**
   * Lot 6: host no-show already counted on this outing (idempotent).
   * Same event must not increment strikes twice.
   */
  hostNoShowReported?: boolean;
  /**
   * Table normale : absence de l’hôte déclarée, contestable 24 h par l’hôte.
   * pending/contested = sanction et cautions en attente. La phrase de l’hôte
   * est dans AppState.hostNoShowContestNotes (jamais sur la sortie).
   */
  hostNoShowCase?: {
    reportedAt: string;
    status: 'pending' | 'contested' | 'retained' | 'not_retained' | 'review_expired';
    contestedAt?: string;
    resolvedAt?: string;
    /** Invité qui a déclaré l’hôte absent (18/10 : il ne contredit pas sa propre confirmation). */
    reportedBy?: string;
    /** 18/10 : présence de l’hôte confirmée d’un côté, absence déclarée de l’autre → revue directe. */
    viaPresence?: boolean;
    /** 18/10 : désaccord après le rendu des cautions (table normale) — revue pour la sanction seulement. */
    depositsKept?: boolean;
  };
  /**
   * 18/10 · Confirmation croisée : présence de l’hôte établie, par lui-même
   * ou par un invité confirmé (une seule confirmation suffit), de H−15 à H+6.
   */
  hostPresence?: { at: string; byUserId: string };
  /** Lot 6: never-honor sanction already applied on this outing. */
  hostNeverHonorReported?: boolean;
  /**
   * Partenaire : avertissement déjà compté sur cette sortie
   * (annulation spectacle / no-show hôte) — idempotent.
   */
  partnerWarningApplied?: boolean;
}

export interface Request {
  id: string;
  outingId: string;
  userId: string;
  userName: string;
  userAge: number;
  /** Genre de l’invité s’il l’a renseigné (optionnel depuis le tunnel court). */
  userGender?: Gender;
  message: string;
  /** Optional alternate date/slot suggested by the guest (kept for the host). */
  suggestedDate?: string;
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
   * Caution mock (20 €, DEPOSIT_EUROS) — ≠ frais Moment, ≠ invitation / addition.
   * - none: pas bloquée (non confirmé)
   * - held: bloquée une fois à confirmSlot (idempotent, pas de double hold)
   * - returned: rendue (cancel ≥3h, host cancelOuting / no-show, venue alternate
   *   refused, imprévu accepté…)
   * - forfeited: perdue (annulation trop tard, absence, auto_refuse imprévu invité à startsAt) — split 6,90/13,10
   * Voir docs/deposit-imprevu.md. Pas d’amendes inventées.
   */
  depositStatus?: RequestDepositStatus;
  /**
   * Presence at the outing — **Confirmé ≠ présent**.
   * - unset while only confirmed (seat + deposit held; no show-up yet)
   * - present: explicit markGuestPresent (host / check-in) → caution returned
   * - absent: reportGuestNoShow → caution forfeited (6,90/13,10)
   * Never set as a side-effect of CLOSE_OUTING, urgent H+30, or COMPLETE_OUTING.
   * Reviews / sorties honorées use present, never confirmed alone.
   */
  attendance?: 'present' | 'absent';
  /**
   * 18/10 · Qui a établi la présence : l’invité lui-même (« Je suis présent »,
   * « Je suis arrivé ») ou l’hôte. Absent (ancien état) = hôte.
   */
  presenceBy?: 'guest' | 'host';
  /** Cause d’un rendu de caution quand elle a un libellé propre (« h6 » : rendue d’office à H+6). */
  depositReturnCause?: 'h6';
  /** ISO UTC — « Pas venu » déclaré par l’hôte (départ du délai de contestation de 24 h). */
  noShowReportedAt?: string;
  /** Contestation acceptée : absence non retenue (visible par l’hôte, sans détail). */
  noShowNotRetained?: boolean;
  /**
   * 18/10 · Caution déjà rendue = acquise : « Pas venu » contre une présence déjà
   * remboursée (table normale). Revue pour la sanction seulement, l’argent ne bouge plus.
   */
  noShowDepositKept?: boolean;
  /** Contestation de l’invité (interne, jamais projetée vers l’hôte). */
  noShowContest?: {
    note: string;
    contestedAt: string;
    outcome?: 'noshow_confirmed' | 'contest_accepted' | 'review_expired';
    resolvedAt?: string;
    /** Contestation par déclaration de l’hôte absent (pas de phrase). */
    viaHostNoShow?: boolean;
    /** Partenaire : « Je suis arrivé » après « Pas venu » vaut contestation (phrase auto). */
    viaArrival?: boolean;
    /** 18/10 : désaccord, présence confirmée d’un côté et « Pas venu » de l’autre (phrase auto). */
    viaPresence?: boolean;
  };
  /** Délai de 24 h suspendu tant que l’absence de l’hôte est en attente (début de la suspension). */
  noShowContestPausedAt?: string;
  /** Durée cumulée de suspension du délai de 24 h (ms), ajoutée à l’échéance. */
  noShowContestPausedMs?: number;
  /** Absence définitive comptée : numéro de l’absence et fermeture causée (pour l’annuler si l’hôte est déclaré absent). */
  noShowStrikeApplied?: number;
  noShowCausedBan?: boolean;
  /** « Pas venu » effacé parce que l’hôte a été déclaré absent (règle B). */
  noShowVoided?: boolean;
  /** Message à l’invité quand l’absence devient définitive (jamais projeté vers l’hôte). */
  noShowFinalNotice?: { text: string; at: string };
  /** ISO UTC — « Je quitte la table » (invité, pendant le moment). */
  leftTableAt?: string;
  /** Départ avant H+30, avec ou sans motif (même indicateur côté hôte). Le motif n’est jamais stocké ici. */
  leftTableEarly?: boolean;
  /**
   * Part hôte d’un départ avant H+30 (13,10 €), identique avec ou sans motif.
   * Sans motif : issue de la caution perdue. Malaise : payée par Moment
   * (ligne interne MomentPaidHostLine, jamais visible par l’hôte). Démo, pas de paiement réel.
   */
  hostLeaveShareEuros?: number;
  /**
   * Annonce partenaire : demande créée directement « à confirmer » (10 min)
   * SANS réserver de chaise. La chaise est prise à la confirmation si
   * spotsLeft > 0 (premier confirmé gagne), sinon « Plus de place ».
   */
  partnerAutoSeat?: boolean;
  /** Confirmation refusée faute de place — caution jamais bloquée. */
  partnerNoSpot?: boolean;
  /**
   * Partenaire : invité a tapé « Je suis arrivé » (dès H−15).
   * ISO UTC. Photo façade optionnelle (stub — pas une preuve seule).
   */
  guestArrivedAt?: string;
  /** Photo façade optionnelle (stub, non bloquante). */
  arrivalPhotoUri?: string;
  /** Partenaire a tapé « Pas venu » (ISO UTC). */
  partnerMarkedAbsentAt?: string;
  /** Arrivé + « Pas venu » = litige (photo demandée plus tard, pas de sanction auto). */
  partnerDispute?: PartnerDispute;
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

/**
 * Motif d’imprévu (signal structuré, 1× / personne / sortie).
 * Pas de chat libre — motif + raison écrite + accept/refus.
 */
export type ImprevuMotive =
  | 'annuler'
  | 'gros_retard'
  | 'lieu_ferme'
  | 'autre';

/**
 * Cycle imprévu :
 * - pending: en attente de la 1re réponse d’un responderId
 * - accepted: accord → caution(s) returned + sortie annulée (pas de no-show)
 * - refused: refus explicite → caution reste held, règle des 3 h normale
 * - auto_refused: aucune réponse à startsAt → traité comme refus + absence
 *   (forfeit si reporter invité)
 */
export type ImprevuStatus =
  | 'pending'
  | 'accepted'
  | 'refused'
  | 'auto_refused';

/**
 * Signal imprévu — une fois par personne et par sortie (pas de fil libre).
 * Accepté ≠ no-show. Refus ≠ forfeit immédiat (règle 3 h). Voir docs/deposit-imprevu.md.
 */
/**
 * Statut caution d’une demande.
 * - returned_discomfort_leave : interne — départ « Je ne me sens pas à
 *   l’aise », caution rendue intégralement (Moment paie 13,10 € à l’hôte).
 *   Jamais montré tel quel à l’hôte : projeté par hostDepositStatus()
 *   (même rendu qu’un départ sans motif).
 */
export type RequestDepositStatus =
  | 'none'
  | 'held'
  | 'returned'
  | 'forfeited'
  | 'returned_discomfort_leave'
  /** « Pas venu » déclaré par l’hôte : délai de 24 h pour contester (ni perdue ni rendue). Interne. */
  | 'noshow_pending'
  /** Contestation envoyée : en attente de revue Moment. Interne (l’hôte voit noshow_pending). */
  | 'contested';

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
  /** Guest used monthly joker after refuse / auto_refuse → caution returned for good, pas d’absence (cancel/no-show ultérieurs n’annulent pas l’exemption). */
  jokerUsed?: boolean;
}

/**
 * Photo d’un moment passé (après la rencontre, jamais avant).
 * Le lieu, la table, les gens (portrait permis). Max 2 par personne et par moment.
 * Publiée sur les profils (section « Moments passés ») seulement quand
 * TOUTES les autres personnes présentes ont accepté. Sinon privée
 * (visible par l’auteur seul). Pas de like, pas de commentaire, pas de fil.
 */
export type MomentPhotoConsent = 'pending' | 'accepted' | 'declined';

export interface MomentPhoto {
  id: string;
  outingId: string;
  uploaderId: string;
  uploaderName: string;
  /** URI locale (image picker) ou `placeholder:…` (démo, dessin local). */
  uri: string;
  /** ISO UTC. */
  createdAt: string;
  /** Une entrée par autre personne présente (hôte + invités présents). */
  consents: Record<string, MomentPhotoConsent>;
}

export interface AppToast {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  /** When set (+ ids), toast is tappable → openNotificationTarget. */
  type?: string;
  outingId?: string;
  requestId?: string;
}

/** Moderation report — private, ≠ public rating / stars. */
export type UserModerationReport = {
  id: string;
  reporterId: string;
  targetUserId: string;
  /** Free-text reason (demo). */
  reason: string;
  createdAt: string;
};

/**
 * Signalement confidentiel « Je ne me sens pas à l’aise » — visible par
 * Moment seulement, jamais par l’hôte. concreteEvidence = élément concret
 * retenu par Moment (démo : non renseigné).
 */
export interface ConfidentialLeaveReport {
  id: string;
  outingId: string;
  requestId: string;
  guestId: string;
  hostId: string;
  reason: 'discomfort';
  createdAt: string;
  concreteEvidence?: boolean;
  /**
   * Caution de l’invité rendue intégralement par Moment (20 €). Côté demande
   * (visible par l’hôte) la caution reste au même statut qu’un départ sans
   * motif, pour que l’hôte ne puisse pas déduire le motif.
   */
  guestDepositRefundedEuros?: number;
}

/**
 * Ligne interne « payée par Moment » (démo) : part hôte d’un départ malaise,
 * caution de l’invité rendue en entier, Moment ne touche pas ses 6,90 €.
 * Jamais exposée à l’hôte.
 */
export interface MomentPaidHostLine {
  id: string;
  outingId: string;
  requestId: string;
  hostId: string;
  amountEuros: number;
  reason: 'leave_discomfort';
  createdAt: string;
  /** Moment ne touche pas sa part (6,90 €) dans le cas malaise. */
  momentKeepsEuros: 0;
}

/** Signalement d’un membre de la table (démo, côté Moment — jamais montré à l’hôte ni au concerné). */
export interface TableReport {
  id: string;
  outingId: string;
  reporterId: string;
  targetUserId: string;
  /** Catégorie obligatoire (une parmi 8, cf. TABLE_REPORT_CATEGORIES). */
  category?:
    | 'inappropriate_advance'
    | 'racism'
    | 'sexism'
    | 'insults_aggression'
    | 'threats'
    | 'not_the_person'
    | 'solicitation'
    | 'other';
  /** Mot facultatif du signaleur. */
  note?: string;
  /** Signaleur avec 2 « abusif » en 3 mois : revue manuelle avant toute étape. */
  requiresManualReviewFirst?: boolean;
  /** Revue manuelle préalable levée (côté Moment). */
  manualReviewClearedAt?: string;
  createdAt: string;
  status: 'open' | 'contact_reporter' | 'contact_target' | 'closed';
  /** Messages simulés (aucun envoi réel). */
  messages: {
    to: 'reporter' | 'target';
    userId: string;
    body: string;
    at: string;
  }[];
  /** Issue (registre) : sans suite / avertissement / suspension / signalement abusif. */
  outcome?: 'sans_suite' | 'warning' | 'suspension' | 'abusive';
  /** Motif établi exigé pour « abusif » (jamais « rien dans le chat »). */
  abusiveReason?: 'reporter_absent' | 'reporter_admitted_false' | 'repeated_unconfirmed';
  closedAt?: string;
}

/** Suivi confidentiel Moment par membre (démo) — jamais visible par l’intéressé ni par l’hôte. */
export interface MemberModeration {
  /** Avertissements (issue « avertissement »). */
  warnings?: number;
  /** Suspendu (issue « suspension »). */
  suspended?: boolean;
  /** Revue de l’hôte : 2 départs malaise à ses tables en 3 mois. */
  hostReview?: boolean;
  /**
   * Dates des « abusif » établis contre ce membre comme signaleur (trace
   * dédiée, fenêtre 3 mois). Le 1er dans la fenêtre ajoute aussi 1 à warnings.
   */
  abusiveReportAt?: string[];
}

export interface AppState {
  /** Compte créé (tunnel terminé). */
  onboardingDone: boolean;
  /** Les 3 slides ont été vues (fil visible sans compte ensuite). */
  slidesSeen: boolean;
  currentUser: User | null;
  outings: Outing[];
  requests: Request[];
  /** Consumed once after onboarding to route into Create, Feed (Annonces), or Dispo. */
  entryIntent: EntryIntent | null;
  chatMessages: ChatMessage[];
  reviews: Review[];
  /** Phrase de contestation de l’hôte, par sortie (jamais montrée aux invités). */
  hostNoShowContestNotes?: Record<string, string>;
  /** Late signals — bandeau for other party(ies) in chat/outing UI. */
  lateReports: LateReport[];
  /** Unexpected-event signals (once per person per outing). */
  imprevuReports: ImprevuReport[];
  /** Host id → no-show count (1=warning, 2+=ban). */
  hostNoShowStrikes: Record<string, number>;
  /** Guest id → ghost-after-confirm count (1=forfeit, 2+=lower priority). */
  guestNoShowStrikes: Record<string, number>;
  /**
   * 25/10 · Guest id → absences retenues datées (barème sur 3 mois glissants).
   * Facultatif : un état plus ancien n’a que le compteur.
   */
  guestNoShowLog?: Record<string, { requestId: string; at: string }[]>;
  /** Host id → publish-never-honor count (1=warning, 2+=ban). */
  hostPublishStrikes: Record<string, number>;
  /** In-app mock notification banner (e.g. late alert). */
  toast: AppToast | null;
  /** Users blocked by the current user (demo, local). ≠ rating. */
  blockedUserIds: string[];
  /** Private moderation reports (demo). One report = one record, no multi-sanctions. */
  userReports: UserModerationReport[];
  /** Host id → avertissements partenaire (annulation / ne honore pas). */
  partnerWarningsByHost: Record<string, number>;
  /** Photos de moments passés (profil seulement, jamais dans le fil). */
  momentPhotos: MomentPhoto[];
  /** Signalements confidentiels de départ (Moment seulement). */
  confidentialLeaveReports: ConfidentialLeaveReport[];
  /** Lignes internes payées par Moment (Moment seulement, jamais l’hôte). */
  momentPaidHostLines: MomentPaidHostLine[];
  /** File de signalements (côté Moment, démo). */
  tableReports: TableReport[];
  /** Suivi confidentiel par membre (côté Moment, démo). */
  memberModeration: Record<string, MemberModeration>;
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
  age?: number;
  photoUri?: string | null;
  womenOnlyPreference?: boolean;
  /** null = effacer. Passer à un genre ≠ femme coupe womenOnlyPreference. */
  gender?: Gender | null;
  genderDetail?: string | null;
  /** '' ou null = effacer. */
  phone?: string | null;
  momentPromptSeen?: boolean;
};

/**
 * Tunnel court (3 slides → compte → prénom + âge → quartier → règles).
 * Photo, téléphone, genre, intérêts ne sont plus demandés à l’entrée : ils
 * restent optionnels ici pour ne rien casser (démo / tests).
 */
export type OnboardingInput = {
  firstName: string;
  /** Required, 18–99 — no silent default. */
  age: number;
  neighborhood: string;
  authProvider: AuthProvider;
  email?: string;
  gender?: Gender;
  bio?: string;
  interests?: string[];
  /** Free-text centres d'intérêt / filtres descriptifs. */
  customFilters?: string[];
  photoUri?: string;
  phone?: string;
  womenOnlyPreference?: boolean;
  /** Défaut 'feed' (Autour de toi). */
  entryIntent?: EntryIntent;
  /** If entryIntent is dispo, mark user dispo immediately. */
  dispoSoir?: boolean;
};

export type AppAction =
  | { type: 'COMPLETE_ONBOARDING'; payload: User; entryIntent: EntryIntent }
  | { type: 'SEE_SLIDES' }
  | { type: 'CLEAR_ENTRY_INTENT' }
  | {
      type: 'CREATE_OUTING';
      payload: Outing;
      /** Host→invitee Dispo: seat pre-accepted; invitee confirms in Demandes. */
      targetedRequest?: Request;
    }
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
        /**
         * Forfeit reporter guest deposit — used for auto_refused at startsAt
         * (absence). Manual refuse must NOT set this (règle 3 h).
         */
        forfeitReporterDeposit?: boolean;
        /**
         * Accepted = release reporter guest only (deposit returned, no absence).
         * Never closes the outing / never cancels other confirmed seats.
         * Whole-outing cancel = host cancelOuting only.
         */
      };
    }
  | {
      type: 'USE_JOKER_ON_IMPREVU';
      payload: {
        imprevuId: string;
        requestId: string;
        monthKey: string;
        /** ISO UTC — joker refusé à partir de H (défaut : maintenant). */
        usedAt?: string;
      };
    }
  | {
      type: 'LEAVE_TABLE';
      payload: {
        requestId: string;
        leftAt: string;
        reason?: 'discomfort';
        reportId: string;
      };
    }
  | {
      type: 'SUBMIT_TABLE_REPORT';
      payload: {
        id: string;
        outingId: string;
        targetUserId: string;
        category?: TableReport['category'];
        note?: string;
        createdAt: string;
      };
    }
  | {
      /** Revue manuelle préalable : lève requiresManualReviewFirst (côté Moment). */
      type: 'CLEAR_TABLE_REPORT_MANUAL_REVIEW';
      payload: { reportId: string; at: string };
    }
  | {
      type: 'ADVANCE_TABLE_REPORT';
      payload: {
        reportId: string;
        to: TableReport['status'];
        at: string;
        outcome?: TableReport['outcome'];
        /** Exigé (et seulement) avec l’issue « abusif ». */
        abusiveReason?: TableReport['abusiveReason'];
      };
    }
  | { type: 'SET_TOAST'; payload: AppToast | null }
  | { type: 'SHIFT_OUTING_START'; payload: { outingId: string; startsAt: string } }
  /** Auto H−90 (or future): mark listing urgentOnSite + optional auto flag. */
  | {
      type: 'MARK_OUTING_URGENT';
      payload: { outingId: string; urgentAutoH90?: boolean };
    }
  /**
   * Plan « terminée » — status completed only. Unlocks avis for guests
   * already marked present. Does NOT set attendance (Confirmé ≠ présent).
   * Deposit return for present guests happens in MARK_GUEST_PRESENT.
   */
  | {
      type: 'COMPLETE_OUTING';
      payload: {
        outingId: string;
        /**
         * host (défaut) : seul l’hôte (currentUser), à partir de H.
         * auto : clôture automatique, seulement à partir de H+30.
         */
        by?: 'host' | 'auto';
        /** ISO UTC de la clôture (défaut : maintenant). */
        at?: string;
      };
    }
  /**
   * Explicit presence (host / check-in). Confirmé → present + held deposit
   * returned. Idempotent. Cannot override absent. ≠ COMPLETE_OUTING / CLOSE.
   */
  | { type: 'MARK_GUEST_PRESENT'; payload: { requestId: string; markedAt: string } }
  /** 18/10 · Invité : « Je suis présent » pour lui-même (H−15 à H+6). Après un « Pas venu » : vaut contestation. */
  | { type: 'GUEST_SELF_PRESENT'; payload: { requestId: string; at: string } }
  /** 18/10 · Présence de l’hôte confirmée par lui-même ou par un invité confirmé (H−15 à H+6). */
  | { type: 'CONFIRM_HOST_PRESENT'; payload: { outingId: string; byUserId: string; at: string } }
  /** Invité : contester un « Pas venu » de l’hôte (phrase obligatoire, avant 24 h). */
  | { type: 'CONTEST_NO_SHOW'; payload: { requestId: string; note: string; at: string } }
  /** Sans contestation à 24 h : caution perdue. Refusée avant l’échéance. */
  | { type: 'EXPIRE_NO_SHOW_CONTEST'; payload: { requestId: string; at: string } }
  /** Revue sans décision 7 jours après la contestation : caution rendue, absence non comptée. Refusée avant l’heure. */
  | { type: 'EXPIRE_NO_SHOW_REVIEW'; payload: { requestId: string; at: string } }
  | { type: 'CONTEST_HOST_NO_SHOW'; payload: { outingId: string; note: string; at: string } }
  | { type: 'EXPIRE_HOST_NO_SHOW_CONTEST'; payload: { outingId: string; at: string } }
  | { type: 'CONFIRM_HOST_NO_SHOW_AFTER_REVIEW'; payload: { outingId: string; at: string } }
  | { type: 'ACCEPT_HOST_NO_SHOW_CONTEST'; payload: { outingId: string; at: string } }
  | { type: 'EXPIRE_HOST_NO_SHOW_REVIEW'; payload: { outingId: string; at: string } }
  /** Revue : « Pas venu confirmé » → caution perdue (6,90 / 13,10). */
  | { type: 'CONFIRM_NO_SHOW_AFTER_REVIEW'; payload: { requestId: string; at: string } }
  /** Revue : « contestation acceptée » → caution rendue. */
  | { type: 'ACCEPT_NO_SHOW_CONTEST'; payload: { requestId: string; at: string } }
  /** Table normale : à partir de H+6, cautions encore bloquées (non « Pas venu ») rendues. */
  | { type: 'RETURN_DEPOSITS_H6'; payload: { outingId: string; at: string } }
  /** Profil : invités cochés par l’hôte, marqués présents en une fois (tout ou rien). */
  | {
      type: 'MARK_GUESTS_PRESENT';
      payload: { outingId: string; requestIds: string[]; markedAt: string };
    }
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
        /** ISO UTC — table normale : strictement avant H+6 (défaut : maintenant). */
        reportedAt?: string;
        /** Invité qui déclare l’hôte absent (contestation s’il est lui-même « Pas venu »). */
        reportedByUserId?: string;
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
  /**
   * 25/10 · Lot C : recalcul des sanctions invité sur les 3 mois glissants
   * (levée automatique de la priorité baissée / mention). Pas de minuterie serveur.
   */
  | { type: 'REFRESH_GUEST_SANCTIONS'; payload: { at: string } }
  | {
      type: 'REPORT_GUEST_NO_SHOW';
      payload: {
        outingId: string;
        requestId: string;
        guestId: string;
        strike: number;
        lowerPriority: boolean;
        /** 3e absence → compte fermé. */
        banned?: boolean;
        /** Instant of the report — must be ≥ H. */
        reportedAt: string;
        /** Auteur : l’hôte d’une table normale ouvre la contestation de 24 h. */
        reportedByUserId?: string;
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
    }
  /** Private moderation — ≠ public rating. One report = one record. */
  | { type: 'REPORT_USER'; payload: UserModerationReport }
  | { type: 'BLOCK_USER'; payload: { userId: string } }
  | { type: 'UNBLOCK_USER'; payload: { userId: string } }
  /** Profil → « Je représente un lieu » → fiche envoyée (status pending). */
  | {
      type: 'SUBMIT_PARTNER_APPLICATION';
      payload: {
        venueName: string;
        kind: PartnerKind;
        neighborhood: string;
        phone: string;
        phrase: string;
      };
    }
  /** Équipe Moment (démo : QA) valide ou refuse la demande lieu. */
  | {
      type: 'REVIEW_PARTNER_APPLICATION';
      payload: { decision: 'active' | 'refused' };
    }
  /** QA : « Passer en partenaire » direct (user courant, sans fiche). */
  | { type: 'DEMO_BECOME_PARTNER'; payload: { kind: PartnerKind } }
  /** QA : repasser particulier (efface le statut lieu). */
  | { type: 'DEMO_LEAVE_PARTNER' }
  /** QA : remontée en tête (forfait futur, sans paiement). */
  | { type: 'SET_PARTNER_PINNED'; payload: { pinned: boolean } }
  /**
   * Partenaire annule / ne honore pas : +1 avertissement (idempotent par
   * sortie) ; 2e → compte partenaire fermé (publication bloquée).
   * Les cautions sont rendues par CANCEL_OUTING / RETURN_DEPOSITS_FOR_OUTING.
   */
  | { type: 'APPLY_PARTNER_WARNING'; payload: { outingId: string; hostId: string } }
  /**
   * Invité partenaire « Je suis arrivé » (dès H−15) → présent + caution rendue.
   * Si le lieu avait déjà tapé « Pas venu » → litige (pas de sanction auto).
   */
  | {
      type: 'GUEST_ARRIVED_PARTNER';
      payload: {
        requestId: string;
        arrivedAt: string;
        arrivalPhotoUri?: string;
      };
    }
  /** Lieu : « Pas venu » sur un invité qui a dit « Je suis arrivé » → litige. */
  | {
      type: 'OPEN_PARTNER_DISPUTE';
      payload: { requestId: string; at: string };
    }
  /** Lieu : « Pas venu » sans arrivée → trace (le lapin passe par REPORT_GUEST_NO_SHOW). */
  | { type: 'MARK_PARTNER_ABSENT_AT'; payload: { requestId: string; at: string } }
  /** Silence des deux le lendemain → caution rendue (pas d’absence, pas de présence). */
  | { type: 'RETURN_DEPOSIT_SILENCE'; payload: { requestId: string } }
  /** Photo d’un moment terminé (auteur = participant présent). */
  | { type: 'ADD_MOMENT_PHOTO'; payload: MomentPhoto }
  /** L’auteur supprime sa photo (à tout moment). */
  | { type: 'DELETE_MOMENT_PHOTO'; payload: { photoId: string } }
  /** Accord / refus / retrait d’accord d’un participant. */
  | {
      type: 'SET_MOMENT_PHOTO_CONSENT';
      payload: {
        photoId: string;
        userId: string;
        consent: MomentPhotoConsent;
      };
    }
  /** Démo QA : moment passé seedé (sortie terminée + présents + photos). */
  | {
      type: 'SEED_PAST_MOMENT';
      payload: { outing: Outing; requests: Request[]; photos: MomentPhoto[] };
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
  /**
   * Honored (completed / attended) outings — NOT the number of reviews.
   * Shown as « X sorties » on trust stats.
   */
  outingCount: number;
};

export type VenueRatingStats = {
  /** Average of venue ratings for this venueKey, or null if none. */
  average: number | null;
  /** Number of venue ratings. */
  reviewCount: number;
};
