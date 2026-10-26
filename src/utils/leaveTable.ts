/**
 * « Je quitte la table » + garde joker (règles validées).
 * - Joker : seulement avant le début du moment (H) et si l’invité n’est pas présent.
 * - Départ pendant le moment, sans justification obligatoire.
 *   · motif malaise (« Je ne me sens pas à l’aise ») : caution rendue, rien
 *     compté, signalement confidentiel pour Moment (l’hôte ne voit pas le motif).
 *   · sans motif avant H+30 : caution perdue (6,90 € Moment / 13,10 € hôte).
 *   · sans motif à partir de H+30 : libre, caution rendue, rien compté.
 * - 2 malaises en 3 mois (Paris) sans élément concret : motif plus proposé,
 *   drapeau revue manuelle.
 */
import { parisYmd } from './parisTime';
import { OUTING_AUTO_COMPLETE_AFTER_MS } from './outingActive';
import {
  DEPOSIT_EUROS,
  DEPOSIT_FORFEIT_HOST_EUROS,
  formatPriceEuros,
} from '../data/pricing';

export const DEPOSIT_EUROS_LEAVE = DEPOSIT_EUROS;

/** H+30 : même borne que la fin automatique du moment (constante existante). */
const LEAVE_FREE_AFTER_MS = OUTING_AUTO_COMPLETE_AFTER_MS;
export const DISCOMFORT_REASON_LABEL = 'Je ne me sens pas à l’aise';
export const DISCOMFORT_REVIEW_THRESHOLD = 2;
export const DISCOMFORT_WINDOW_MONTHS = 3;

export type LeaveReason = 'discomfort';

function startMsOf(startsAt: string): number {
  return new Date(startsAt).getTime();
}

/** Moment commencé (à partir de H). */
export function hasMomentStarted(startsAt: string, nowMs = Date.now()): boolean {
  const s = startMsOf(startsAt);
  return Number.isFinite(s) && nowMs >= s;
}

/**
 * Désistement d’une place confirmée (table normale) : seulement avant H.
 * Dès H, partir passe par « Je quitte la table » (règles de départ) ; la
 * présence et l’absence suivent la fenêtre H→H+6. Lieu partenaire : inchangé.
 */
export function canGuestWithdrawConfirmedSeat(opts: {
  startsAt: string;
  partner: boolean;
  nowMs?: number;
}): boolean {
  if (opts.partner) return true;
  return !hasMomentStarted(opts.startsAt, opts.nowMs);
}

/**
 * Débug audit 36 · Lieu : plus de désistement une fois le soir « joué » —
 * présence ou absence posée, liste du lieu faite, contestation ouverte ou
 * absence du lieu signalée. Sinon l’invité décoché perdrait sa contestation.
 */
export function isPartnerSeatLocked(
  outing: { partnerVenueCheck?: unknown; hostNoShowReported?: boolean },
  req: {
    attendance?: 'present' | 'absent';
    noShowContest?: unknown;
    partnerSelfAbsent?: boolean;
    leftTableAt?: string;
  },
): boolean {
  return Boolean(
    req.attendance ||
      req.noShowContest ||
      req.partnerSelfAbsent ||
      req.leftTableAt ||
      outing.partnerVenueCheck ||
      outing.hostNoShowReported,
  );
}

/** Joker : refusé dès H, ou si l’invité est déjà marqué présent / arrivé. */
export function isJokerAllowedNow(opts: {
  startsAt: string;
  attendance?: 'present' | 'absent';
  guestArrivedAt?: string;
  nowMs?: number;
}): boolean {
  if (opts.attendance === 'present' || opts.guestArrivedAt) return false;
  const s = startMsOf(opts.startsAt);
  if (!Number.isFinite(s)) return false;
  return (opts.nowMs ?? Date.now()) < s;
}

/** Bouton « Je quitte la table » : invité confirmé, moment commencé, pas encore parti / absent. */
export function canGuestLeaveTable(opts: {
  startsAt: string;
  outingStatus: string;
  requestStatus: string;
  attendance?: 'present' | 'absent';
  leftAt?: string;
  nowMs?: number;
}): boolean {
  if (opts.requestStatus !== 'confirmed') return false;
  if (opts.leftAt) return false;
  if (opts.attendance === 'absent') return false;
  if (opts.outingStatus === 'cancelled' || opts.outingStatus === 'completed') {
    return false;
  }
  return hasMomentStarted(opts.startsAt, opts.nowMs);
}

export type LeaveOutcome = {
  deposit: 'returned' | 'forfeited';
  /** Compte contre l’invité (départ anticipé sans motif). */
  countsAgainstGuest: boolean;
  confidentialReport: boolean;
};

export function resolveLeaveTable(opts: {
  startsAt: string;
  leftAtMs: number;
  reason?: LeaveReason;
  /** Motif malaise encore proposé à cet invité. */
  discomfortAllowed: boolean;
}): LeaveOutcome {
  if (opts.reason === 'discomfort' && opts.discomfortAllowed) {
    return { deposit: 'returned', countsAgainstGuest: false, confidentialReport: true };
  }
  return isLeaveBeforeH30(opts.startsAt, opts.leftAtMs)
    ? { deposit: 'forfeited', countsAgainstGuest: true, confidentialReport: false }
    : { deposit: 'returned', countsAgainstGuest: false, confidentialReport: false };
}

/**
 * Y-M-D Paris il y a `months` mois calendaires, jour compris.
 * Débordement de fin de mois vers l’avant (31/05 − 3 mois → 03/03, pas 28/02),
 * pour ne jamais élargir la fenêtre au-delà de 3 mois.
 */
export function parisYmdMonthsAgo(nowMs: number, months: number): string {
  const ymd = parisYmd(nowMs);
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 - months, d, 12, 0, 0));
  return t.toISOString().slice(0, 10);
}

/** Départ avant H+30 (même indicateur côté hôte, quel que soit le motif). */
export function isLeaveBeforeH30(startsAt: string, leftAtMs: number): boolean {
  const s = startMsOf(startsAt);
  return Number.isFinite(s) && leftAtMs < s + LEAVE_FREE_AFTER_MS;
}

/**
 * Caution d’un invité marqué présent : rendue seulement à partir de H+30
 * (ou à la fin du moment) ; avant, elle reste retenue jusqu’à H+30 ou au départ.
 */
export function presenceReturnsDepositNow(opts: {
  startsAt: string;
  outingStatus: string;
  atMs: number;
}): boolean {
  if (opts.outingStatus === 'completed') return true;
  const s = startMsOf(opts.startsAt);
  return Number.isFinite(s) && opts.atMs >= s + LEAVE_FREE_AFTER_MS;
}

export type DiscomfortReportLite = {
  guestId: string;
  createdAt: string;
  concreteEvidence?: boolean;
};

/** Malaises sans élément concret de cet invité sur les 3 derniers mois (Paris). */
export function countRecentDiscomfort(
  reports: DiscomfortReportLite[],
  guestId: string,
  nowMs = Date.now(),
): number {
  const from = parisYmdMonthsAgo(nowMs, DISCOMFORT_WINDOW_MONTHS);
  return reports.filter(
    (r) =>
      r.guestId === guestId &&
      r.concreteEvidence !== true &&
      parisYmd(r.createdAt) >= from,
  ).length;
}

/** Motif malaise encore proposé ? (non si revue manuelle ou ≥ 2 en 3 mois). */
export function isDiscomfortReasonOffered(
  reports: DiscomfortReportLite[],
  guestId: string,
  manualReview: boolean | undefined,
  nowMs = Date.now(),
): boolean {
  if (manualReview) return false;
  return countRecentDiscomfort(reports, guestId, nowMs) < DISCOMFORT_REVIEW_THRESHOLD;
}

/** Part hôte d’un départ (13,10 € avant H+30, sinon 0) — même valeur avec ou sans motif. */
export function hostLeaveShareEuros(startsAt: string, leftAtMs: number): number {
  return isLeaveBeforeH30(startsAt, leftAtMs) ? DEPOSIT_FORFEIT_HOST_EUROS : 0;
}

/**
 * Tout ce que l’hôte voit d’un départ (détail, historique, gains).
 * Ne dépend QUE de champs identiques avec ou sans malaise.
 */
export function hostLeaveView(r: {
  userName: string;
  leftTableAt?: string;
  hostLeaveShareEuros?: number;
}): { label: string; earningsEuros: number; earningsLabel: string } | null {
  if (!r.leftTableAt) return null;
  const earningsEuros = r.hostLeaveShareEuros ?? 0;
  return {
    label: `${r.userName} a quitté la table`,
    earningsEuros,
    earningsLabel: earningsEuros > 0 ? `${formatPriceEuros(earningsEuros)} pour toi` : '',
  };
}

/** Statut caution tel que l’hôte le voit (avant projection). */
export type HostVisibleDepositStatus =
  | 'none'
  | 'held'
  | 'returned'
  | 'forfeited'
  /** « Pas venu » en attente (délai de 24 h ou revue) : l’hôte ne voit pas la contestation. */
  | 'noshow_pending';

/**
 * Projection hôte du statut caution : le départ malaise (interne
 * `returned_discomfort_leave`) s’affiche exactement comme un départ sans
 * motif au même instant — « perdue » avant H+30, « rendue » après.
 */
export function hostDepositStatus(r: {
  depositStatus?: string;
  leftTableEarly?: boolean;
}): HostVisibleDepositStatus | undefined {
  switch (r.depositStatus) {
    case 'returned_discomfort_leave':
      return r.leftTableEarly ? 'forfeited' : 'returned';
    // Délai de 24 h et contestation : même rendu pour l’hôte.
    case 'noshow_pending':
    case 'contested':
      return 'noshow_pending';
    case 'none':
    case 'held':
    case 'returned':
    case 'forfeited':
    case undefined:
      return r.depositStatus;
    default:
      return undefined;
  }
}

/**
 * Demande telle que l’hôte la voit : statut caution projeté, aucun champ
 * qui distingue un départ malaise d’un départ sans motif.
 */
export function projectRequestForHost<
  T extends {
    depositStatus?: string;
    leftTableEarly?: boolean;
    noShowContest?: unknown;
    noShowFinalNotice?: unknown;
    noShowStrikeApplied?: unknown;
    noShowCausedBan?: unknown;
    depositReturnCause?: unknown;
  },
>(
  r: T,
): Omit<T, 'depositStatus' | 'noShowContest' | 'noShowFinalNotice' | 'noShowStrikeApplied' | 'noShowCausedBan' | 'depositReturnCause'> & {
  depositStatus?: HostVisibleDepositStatus;
} {
  // La contestation (phrase, date, issue) n’est jamais transmise à l’hôte.
  const {
    noShowContest: _contest,
    noShowFinalNotice: _notice,
    noShowStrikeApplied: _strike,
    noShowCausedBan: _ban,
    depositReturnCause: _cause,
    ...rest
  } = r as T & {
    depositReturnCause?: unknown;
    noShowFinalNotice?: unknown;
    noShowStrikeApplied?: unknown;
    noShowCausedBan?: unknown;
  };
  // Sanctions internes (numéro d’absence, fermeture) et cause du rendu (joker ou
  // silence) : jamais transmises à l’hôte.
  return { ...rest, depositStatus: hostDepositStatus(r) } as Omit<
    T,
    'depositStatus' | 'noShowContest' | 'noShowFinalNotice' | 'noShowStrikeApplied' | 'noShowCausedBan' | 'depositReturnCause'
  > & { depositStatus?: HostVisibleDepositStatus };
}

/** Caution rendue (y compris départ malaise) — vue invité. */
export function isDepositReturnedForGuest(status: string | undefined): boolean {
  return status === 'returned' || status === 'returned_discomfort_leave';
}
