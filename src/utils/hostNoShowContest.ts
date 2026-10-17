/**
 * Contestation par l’hôte d’un « hôte absent » (table normale).
 * - 24 h après la déclaration pour contester, phrase obligatoire.
 * - Pendant le délai et la revue : cautions des invités en attente, sanction hôte en attente.
 * - Sans contestation ou contestation rejetée : absence retenue (sanction hôte + règle B + cautions rendues).
 * - Contestation acceptée : absence de l’hôte effacée, invités dans leur situation normale.
 * - Revue sans décision à 7 jours : cautions des invités rendues, absence de l’hôte non tranchée.
 * La phrase de l’hôte n’est jamais stockée sur la sortie (invisible des invités).
 */
import type { Outing } from '../data/types';
import { NOSHOW_CONTEST_WINDOW_MS, NOSHOW_REVIEW_MAX_MS, normalizeContestNote } from './noShowContest';

export const HOST_NOSHOW_CONTEST_WINDOW_MS = NOSHOW_CONTEST_WINDOW_MS;
export const HOST_NOSHOW_REVIEW_MAX_MS = NOSHOW_REVIEW_MAX_MS;

type CaseOuting = Pick<Outing, 'hostId' | 'hostNoShowCase'>;

const ms = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);

/** Absence de l’hôte encore en suspens (délai ou revue) : cautions et sanction en attente. */
export function isHostNoShowUnresolved(o: Pick<Outing, 'hostNoShowCase'>): boolean {
  const s = o.hostNoShowCase?.status;
  return s === 'pending' || s === 'contested';
}

export function hostContestDeadlineMs(o: CaseOuting): number {
  const t = ms(o.hostNoShowCase?.reportedAt);
  return Number.isFinite(t) ? t + HOST_NOSHOW_CONTEST_WINDOW_MS : NaN;
}

export function hostReviewDeadlineMs(o: CaseOuting): number {
  const t = ms(o.hostNoShowCase?.contestedAt);
  return Number.isFinite(t) ? t + HOST_NOSHOW_REVIEW_MAX_MS : NaN;
}

export type HostContestRefusal = 'not_host' | 'not_pending' | 'too_late' | 'note_required';

export function hostContestRefusal(
  o: CaseOuting,
  userId: string,
  note: string | undefined,
  nowMs = Date.now(),
): HostContestRefusal | null {
  if (o.hostId !== userId) return 'not_host';
  if (o.hostNoShowCase?.status !== 'pending') return 'not_pending';
  if (!(nowMs < hostContestDeadlineMs(o))) return 'too_late';
  if (!normalizeContestNote(note)) return 'note_required';
  return null;
}

const HOST_CONTEST_REFUSAL_LABELS: Record<HostContestRefusal | 'not_found' | 'no_user', string> = {
  not_host: 'Seul l’hôte déclaré absent peut contester.',
  not_pending: 'Cette absence n’est plus en attente : rien à contester.',
  too_late: 'Le délai de 24 h pour contester est écoulé.',
  note_required: 'Écris une phrase pour contester.',
  not_found: 'Ce moment n’existe plus.',
  no_user: 'Connecte-toi pour contester.',
};

export const HOST_CONTEST_REFUSAL_CODES = Object.keys(HOST_CONTEST_REFUSAL_LABELS);

export function hostContestRefusalLabel(reason: string | undefined): string {
  return (
    (reason && HOST_CONTEST_REFUSAL_LABELS[reason as keyof typeof HOST_CONTEST_REFUSAL_LABELS]) ||
    'Contestation impossible pour le moment.'
  );
}

/** Sans contestation à 24 h : absence de l’hôte retenue. */
export function shouldRetainUncontestedHostNoShow(o: CaseOuting, nowMs = Date.now()): boolean {
  return o.hostNoShowCase?.status === 'pending' && nowMs >= hostContestDeadlineMs(o);
}

/** Revue de l’hôte sans décision à 7 jours. */
export function shouldTimeoutHostReview(o: CaseOuting, nowMs = Date.now()): boolean {
  return o.hostNoShowCase?.status === 'contested' && nowMs >= hostReviewDeadlineMs(o);
}

export function outingsDueForHostContestExpiry(
  outings: (CaseOuting & Pick<Outing, 'id'>)[],
  nowMs = Date.now(),
): string[] {
  return outings.filter((o) => shouldRetainUncontestedHostNoShow(o, nowMs)).map((o) => o.id);
}

export function outingsDueForHostReviewTimeout(
  outings: (CaseOuting & Pick<Outing, 'id'>)[],
  nowMs = Date.now(),
): string[] {
  return outings.filter((o) => shouldTimeoutHostReview(o, nowMs)).map((o) => o.id);
}

export function hostContestTimeLeftLabel(o: CaseOuting, nowMs = Date.now()): string {
  const left = hostContestDeadlineMs(o) - nowMs;
  if (!Number.isFinite(left) || left <= 0) return '0 min';
  const totalMin = Math.ceil(left / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}
