/**
 * Contestation d’un « Pas venu » déclaré par l’hôte contre un invité
 * (décision Paolo 17/10, délai corrigé à 24 h).
 * - Pendant 24 h : caution ni perdue ni rendue (statut interne noshow_pending).
 * - L’invité conteste avec une phrase obligatoire → contested (en attente de revue).
 * - Sans contestation au bout de 24 h → perdue (6,90 Moment / 13,10 hôte).
 * - Revue : « Pas venu confirmé » = perdue ; « contestation acceptée » = rendue.
 * - La règle H+6 ne rend jamais une caution en délai ou contestée.
 * - Statuts internes : l’hôte voit la même chose pendant le délai et la revue.
 * Partenaires : même contestation (24 h, phrase, revue 7 jours).
 * Hors périmètre : départ sans motif, malaise, auto-déclaration.
 */
import type { Outing, Request } from '../data/types';
import { DEPOSIT_FORFEIT_HOST_EUROS } from '../data/pricing';

/** Délai pour contester un « Pas venu » : 24 h après la déclaration de l’hôte. */
export const NOSHOW_CONTEST_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Longueur max de la phrase de contestation. */
export const NOSHOW_CONTEST_NOTE_MAX_CHARS = 280;

type ContestRequest = Pick<Request, 'userId' | 'depositStatus' | 'noShowReportedAt'> &
  Partial<Pick<Request, 'noShowContestPausedAt' | 'noShowContestPausedMs'>>;

/**
 * « Pas venu » ouvert à contestation : déclaré par l’hôte, table normale ou
 * partenaire (même contestation, 17/10). L’auto-déclaration n’en ouvre pas.
 */
export function noShowOpensContest(
  outing: Pick<Outing, 'hostId'> & Partial<Outing>,
  reportedByUserId: string | undefined,
): boolean {
  return !!reportedByUserId && reportedByUserId === outing.hostId;
}

/**
 * Échéance des 24 h, décalée du temps de suspension (absence de l’hôte en
 * attente). Pendant une suspension en cours, l’échéance avance avec l’horloge :
 * le temps restant est figé.
 */
export function contestDeadlineMs(
  r: Pick<Request, 'noShowReportedAt'> &
    Partial<Pick<Request, 'noShowContestPausedAt' | 'noShowContestPausedMs'>>,
  nowMs = Date.now(),
): number {
  const t = r.noShowReportedAt ? new Date(r.noShowReportedAt).getTime() : NaN;
  if (!Number.isFinite(t)) return NaN;
  const pausedAt = r.noShowContestPausedAt ? new Date(r.noShowContestPausedAt).getTime() : NaN;
  const running = Number.isFinite(pausedAt) ? Math.max(0, nowMs - pausedAt) : 0;
  return t + NOSHOW_CONTEST_WINDOW_MS + (r.noShowContestPausedMs ?? 0) + running;
}

/** Délai de 24 h suspendu (absence de l’hôte en attente). */
export function isContestPaused(r: Partial<Pick<Request, 'noShowContestPausedAt'>>): boolean {
  return !!r.noShowContestPausedAt;
}

/** Délai de 24 h encore ouvert (strictement avant l’échéance). */
export function isContestWindowOpen(r: ContestRequest, nowMs = Date.now()): boolean {
  if (r.depositStatus !== 'noshow_pending') return false;
  const d = contestDeadlineMs(r, nowMs);
  return Number.isFinite(d) && nowMs < d;
}

export function normalizeContestNote(note: string | undefined): string {
  return (note ?? '').trim().slice(0, NOSHOW_CONTEST_NOTE_MAX_CHARS);
}

export type ContestRefusal = 'not_guest' | 'not_pending' | 'too_late' | 'note_required';

export function contestRefusal(
  r: ContestRequest,
  userId: string,
  note: string | undefined,
  nowMs = Date.now(),
): ContestRefusal | null {
  if (r.userId !== userId) return 'not_guest';
  if (r.depositStatus !== 'noshow_pending') return 'not_pending';
  // Gel 17/10 (point 3) : la contestation reste possible pendant la suspension des 24 h.
  if (!isContestWindowOpen(r, nowMs)) return 'too_late';
  if (!normalizeContestNote(note)) return 'note_required';
  return null;
}

/** Refus de contestation → français clair (jamais de code brut à l’écran). */
const CONTEST_REFUSAL_LABELS: Record<ContestRefusal | 'not_found' | 'no_user', string> = {
  not_guest: 'Seule la personne signalée « Pas venu » peut contester.',
  not_pending: 'Cette caution n’est plus en attente : rien à contester.',
  too_late: 'Le délai de 24 h pour contester est écoulé.',
  note_required: 'Écris une phrase pour contester.',
  not_found: 'Cette participation n’existe plus.',
  no_user: 'Connecte-toi pour contester.',
};

export const CONTEST_REFUSAL_CODES = Object.keys(CONTEST_REFUSAL_LABELS);

export function contestRefusalLabel(reason: string | undefined): string {
  return (
    (reason && CONTEST_REFUSAL_LABELS[reason as keyof typeof CONTEST_REFUSAL_LABELS]) ||
    'Contestation impossible pour le moment.'
  );
}

/** Délai maximum de revue d’une contestation : 7 jours après l’entrée en revue. */
export const NOSHOW_REVIEW_MAX_MS = 7 * 24 * 60 * 60 * 1000;

export function reviewDeadlineMs(r: Pick<Request, 'noShowContest'>): number {
  const t = r.noShowContest?.contestedAt ? new Date(r.noShowContest.contestedAt).getTime() : NaN;
  return Number.isFinite(t) ? t + NOSHOW_REVIEW_MAX_MS : NaN;
}

/** Revue sans décision à 7 jours : caution rendue (absence non retenue). */
export function shouldReturnAfterReviewTimeout(
  r: Pick<Request, 'depositStatus' | 'noShowContest'>,
  nowMs = Date.now(),
): boolean {
  if (r.depositStatus !== 'contested' || !r.noShowContest || r.noShowContest.outcome) return false;
  // Contestation par « hôte absent » : tranchée par la décision sur l’hôte, pas de revue propre.
  if (r.noShowContest.viaHostNoShow) return false;
  const d = reviewDeadlineMs(r);
  return Number.isFinite(d) && nowMs >= d;
}

export function requestsDueForReviewTimeout(
  requests: (Pick<Request, 'id' | 'depositStatus' | 'noShowContest'>)[],
  nowMs = Date.now(),
): string[] {
  return requests.filter((r) => shouldReturnAfterReviewTimeout(r, nowMs)).map((r) => r.id);
}

/** Message à l’invité quand l’absence devient définitive. */
export const NOSHOW_FINAL_NOTICE_TEXT = 'Ton absence est retenue. La caution est perdue.';

/** « Pas venu » déclaré par l’hôte (table normale, délai de contestation). */
export function isHostDeclaredNoShow(
  r: Pick<Request, 'attendance' | 'noShowReportedAt'>,
): boolean {
  return r.attendance === 'absent' && !!r.noShowReportedAt;
}

/**
 * Invité « Pas venu » qui déclare l’hôte absent : seulement pendant ses 24 h,
 * caution encore en attente ou en revue (jamais si définitive).
 */
export function canNoShowGuestDeclareHostAbsent(
  r: ContestRequest & Pick<Request, 'attendance'>,
  nowMs = Date.now(),
): boolean {
  if (!isHostDeclaredNoShow(r)) return false;
  if (r.depositStatus !== 'noshow_pending' && r.depositStatus !== 'contested') return false;
  const d = contestDeadlineMs(r, nowMs);
  return Number.isFinite(d) && nowMs < d;
}

/** Sans contestation à 24 h : caution perdue. */
export function shouldForfeitUncontested(r: ContestRequest, nowMs = Date.now()): boolean {
  if (r.depositStatus !== 'noshow_pending') return false;
  // Absence de l’hôte en attente : délai suspendu, aucune expiration.
  if (isContestPaused(r)) return false;
  const d = contestDeadlineMs(r, nowMs);
  return Number.isFinite(d) && nowMs >= d;
}

/** Pour la minuterie locale : demandes dont le délai a expiré. */
export function requestsDueForContestExpiry(
  requests: (ContestRequest & Pick<Request, 'id'>)[],
  nowMs = Date.now(),
): string[] {
  return requests.filter((r) => shouldForfeitUncontested(r, nowMs)).map((r) => r.id);
}

/** Temps restant, ex. « 23 h 05 » ou « 12 min ». */
export function contestTimeLeftLabel(r: ContestRequest, nowMs = Date.now()): string {
  const left = contestDeadlineMs(r, nowMs) - nowMs;
  if (!Number.isFinite(left) || left <= 0) return '0 min';
  const totalMin = Math.ceil(left / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

/**
 * Part hôte d’un « Pas venu » : 13,10 € seulement si la caution est
 * finalement perdue (jamais pendant l’attente, jamais si l’absence n’est pas retenue).
 */
export function hostNoShowShareEuros(
  r: Pick<Request, 'attendance' | 'depositStatus'> & { noShowNotRetained?: boolean },
): number {
  return r.attendance === 'absent' && r.depositStatus === 'forfeited' && !r.noShowNotRetained
    ? DEPOSIT_FORFEIT_HOST_EUROS
    : 0;
}
