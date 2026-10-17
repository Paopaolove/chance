/**
 * Contestation d’un « Pas venu » déclaré par l’hôte contre un invité
 * (décision Paolo 17/10, délai corrigé à 24 h).
 * - Pendant 24 h : caution ni perdue ni rendue (statut interne noshow_pending).
 * - L’invité conteste avec une phrase obligatoire → contested (en attente de revue).
 * - Sans contestation au bout de 24 h → perdue (6,90 Moment / 13,10 hôte).
 * - Revue : « Pas venu confirmé » = perdue ; « contestation acceptée » = rendue.
 * - La règle H+6 ne rend jamais une caution en délai ou contestée.
 * - Statuts internes : l’hôte voit la même chose pendant le délai et la revue.
 * Hors périmètre : départ sans motif, malaise, auto-déclaration, partenaires.
 */
import type { Outing, Request } from '../data/types';
import { isPartnerListing } from './partners';
import { DEPOSIT_FORFEIT_HOST_EUROS } from '../data/pricing';

/** Délai pour contester un « Pas venu » : 24 h après la déclaration de l’hôte. */
export const NOSHOW_CONTEST_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Longueur max de la phrase de contestation. */
export const NOSHOW_CONTEST_NOTE_MAX_CHARS = 280;

type ContestRequest = Pick<Request, 'userId' | 'depositStatus' | 'noShowReportedAt'>;

/** « Pas venu » ouvert à contestation : déclaré par l’hôte, table normale. */
export function noShowOpensContest(
  outing: Pick<Outing, 'hostId'> & Partial<Outing>,
  reportedByUserId: string | undefined,
): boolean {
  return (
    !!reportedByUserId &&
    reportedByUserId === outing.hostId &&
    !isPartnerListing(outing as Outing)
  );
}

export function contestDeadlineMs(r: Pick<Request, 'noShowReportedAt'>): number {
  const t = r.noShowReportedAt ? new Date(r.noShowReportedAt).getTime() : NaN;
  return Number.isFinite(t) ? t + NOSHOW_CONTEST_WINDOW_MS : NaN;
}

/** Délai de 24 h encore ouvert (strictement avant l’échéance). */
export function isContestWindowOpen(r: ContestRequest, nowMs = Date.now()): boolean {
  if (r.depositStatus !== 'noshow_pending') return false;
  const d = contestDeadlineMs(r);
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

/** Sans contestation à 24 h : caution perdue. */
export function shouldForfeitUncontested(r: ContestRequest, nowMs = Date.now()): boolean {
  if (r.depositStatus !== 'noshow_pending') return false;
  const d = contestDeadlineMs(r);
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
  const left = contestDeadlineMs(r) - nowMs;
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
