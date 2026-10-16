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
