import type { Outing, Request } from '../data/types';
import { isStartsAtPast } from './parisTime';

/**
 * Delay after startsAt before auto `completed` (« terminée ») for the demo.
 * Host can also completeOuting earlier once H is past.
 */
export const OUTING_AUTO_COMPLETE_AFTER_MS = 30 * 60 * 1000; // 30 min after H

/**
 * One active invitation slot per host:
 * - open / full published listings
 * - closed-but-still-upcoming with confirmed guests
 * - past start with confirmed guests until status becomes `completed`
 * Confirmé seats keep the slot occupied even after closeOuting.
 */
export function outingOccupiesActiveSlot(
  outing: Outing,
  requests: Request[],
  nowMs = Date.now(),
): boolean {
  if (outing.status === 'completed') return false;

  const hasConfirmed = requests.some(
    (r) => r.outingId === outing.id && r.status === 'confirmed',
  );

  if (outing.status === 'open' || outing.status === 'full') {
    return true;
  }

  // closed: occupies while there are still confirmés to honor (upcoming or past-until-terminée)
  if (outing.status === 'closed' && hasConfirmed) {
    return true;
  }

  return false;
}

/** Public Annonces list: only open/full and not yet started. */
export function isVisibleOnAnnoncesFeed(
  outing: Outing,
  nowMs = Date.now(),
): boolean {
  if (outing.status !== 'open' && outing.status !== 'full') return false;
  if (isStartsAtPast(outing.startsAt, nowMs)) return false;
  return true;
}

export function isOutingFinishedOrPastStart(
  outing: Outing,
  nowMs = Date.now(),
): boolean {
  if (outing.status === 'completed') return true;
  return isStartsAtPast(outing.startsAt, nowMs);
}

/** Guest was present — Confirmé ≠ présent. */
export function wasPresent(request: Request): boolean {
  return request.status === 'confirmed' && request.attendance === 'present';
}
