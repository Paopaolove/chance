/**
 * 25/10 · Outil de revue des contestations, démo seulement (__DEV__, menu démo).
 * Liste les revues en attente et dit si une décision « perdue / rendue » peut
 * être prise maintenant. Aucune règle nouvelle : les actions existantes
 * (CONFIRM_/ACCEPT_NO_SHOW…, CONFIRM_/ACCEPT_HOST_NO_SHOW…) gardent leurs gardes.
 */
import type { Outing, Request } from '../data/types';
import { isDepositKeptReviewOpen, shouldReturnAfterReviewTimeout } from './noShowContest';
import { isHostNoShowUnresolved, shouldTimeoutHostReview } from './hostNoShowContest';

export type DemoReviewItem =
  | {
      kind: 'guest';
      requestId: string;
      outingId: string;
      outingTitle: string;
      personName: string;
      /** Caution déjà rendue : la revue ne porte que sur l’absence. */
      depositKept: boolean;
      contestedAt?: string;
    }
  | {
      kind: 'host';
      outingId: string;
      outingTitle: string;
      personName: string;
      depositsKept: boolean;
      contestedAt?: string;
    };

type ReviewState = { outings: Outing[]; requests: Request[] };

/** Contestation invité en revue (tranchable par Moment, pas via l’absence de l’hôte). */
export function isGuestReviewOpen(r: Request): boolean {
  if (!r.noShowContest || r.noShowContest.outcome) return false;
  if (r.noShowContest.viaHostNoShow) return false;
  return r.depositStatus === 'contested' || isDepositKeptReviewOpen(r);
}

/** Revues en attente (invités puis hôtes), plus ancienne contestation d’abord. */
export function pendingDemoReviews(state: ReviewState): DemoReviewItem[] {
  const items: DemoReviewItem[] = [];
  for (const r of state.requests) {
    if (!isGuestReviewOpen(r)) continue;
    const o = state.outings.find((x) => x.id === r.outingId);
    items.push({
      kind: 'guest',
      requestId: r.id,
      outingId: r.outingId,
      outingTitle: o?.title ?? r.outingId,
      personName: r.userName,
      depositKept: !!r.noShowDepositKept,
      contestedAt: r.noShowContest?.contestedAt,
    });
  }
  for (const o of state.outings) {
    if (o.hostNoShowCase?.status !== 'contested') continue;
    items.push({
      kind: 'host',
      outingId: o.id,
      outingTitle: o.title,
      personName: o.hostName,
      depositsKept: !!o.hostNoShowCase.depositsKept,
      contestedAt: o.hostNoShowCase.contestedAt,
    });
  }
  return items.sort((a, b) => (a.contestedAt ?? '').localeCompare(b.contestedAt ?? ''));
}

export type DemoReviewRefusal = 'not_found' | 'review_expired' | 'host_pending';

/**
 * Décision possible maintenant ? `retained` = absence retenue (caution perdue,
 * ou acquise si déjà rendue) ; sinon absence non retenue (caution rendue).
 */
export function demoGuestReviewRefusal(
  state: ReviewState,
  requestId: string,
  retained: boolean,
  nowMs: number,
): DemoReviewRefusal | null {
  const r = state.requests.find((x) => x.id === requestId);
  if (!r || !isGuestReviewOpen(r)) return 'not_found';
  if (shouldReturnAfterReviewTimeout(r, nowMs)) return 'review_expired';
  const o = state.outings.find((x) => x.id === r.outingId);
  if (retained && o && isHostNoShowUnresolved(o)) return 'host_pending';
  return null;
}

export function demoHostReviewRefusal(
  state: ReviewState,
  outingId: string,
  nowMs: number,
): DemoReviewRefusal | null {
  const o = state.outings.find((x) => x.id === outingId);
  if (!o || o.hostNoShowCase?.status !== 'contested') return 'not_found';
  if (shouldTimeoutHostReview(o, nowMs)) return 'review_expired';
  return null;
}
