import type { Outing, Request } from '../data/types';
import { isStartsAtPast } from './parisTime';

/**
 * Delay after startsAt before auto `completed` (« terminée ») for the demo.
 * Host can also completeOuting earlier once H is past.
 */
export const OUTING_AUTO_COMPLETE_AFTER_MS = 30 * 60 * 1000; // 30 min after H

/**
 * Urgent invitations (déjà sur place / H−90 style): stay visible & joinable
 * until startsAt + 30 min, then auto-clôturée. startsAt = now for on-site
 * → window is now + 30 min. Normal (non-urgent) keep hard past-start cut.
 */
export const URGENT_ON_SITE_ACCEPT_MS = 30 * 60 * 1000; // 30 min after startsAt

/** Planned outing with no confirmés → auto urgent when startsAt is within this window. */
export const AUTO_URGENT_BEFORE_MS = 90 * 60 * 1000; // H−90

export function isUrgentOnSite(outing: Outing): boolean {
  return outing.urgentOnSite === true;
}

/** Manual « déjà sur place » vs auto H−90 (pill Maintenant vs Urgent). */
export function isUrgentAutoH90(outing: Outing): boolean {
  return outing.urgentOnSite === true && outing.urgentAutoH90 === true;
}

/**
 * Planned open/full listing with zero confirmed guests, startsAt within H−90
 * (and still within the post-start +30 accept window once promoted).
 */
export function shouldAutoPromoteUrgent(
  outing: Outing,
  requests: Request[],
  nowMs = Date.now(),
): boolean {
  if (outing.urgentOnSite) return false;
  if (outing.status !== 'open' && outing.status !== 'full') return false;
  const hasConfirmed = requests.some(
    (r) => r.outingId === outing.id && r.status === 'confirmed',
  );
  if (hasConfirmed) return false;
  const startMs = new Date(outing.startsAt).getTime();
  if (!Number.isFinite(startMs)) return false;
  if (nowMs < startMs - AUTO_URGENT_BEFORE_MS) return false;
  // After promotion, joinable until startsAt+30 — don't promote past that.
  if (nowMs > startMs + URGENT_ON_SITE_ACCEPT_MS) return false;
  return true;
}

/** Still within the H+30 accept window for an urgent listing. */
export function isUrgentAcceptWindowOpen(
  outing: Outing,
  nowMs = Date.now(),
): boolean {
  if (!isUrgentOnSite(outing)) return false;
  const startMs = new Date(outing.startsAt).getTime();
  if (!Number.isFinite(startMs)) return false;
  return nowMs <= startMs + URGENT_ON_SITE_ACCEPT_MS;
}

/**
 * Whether new joins / accepts are allowed.
 * Normal: open + startsAt not past.
 * Urgent: open + within startsAt+30 min (startsAt may already be « now »).
 */
export function isOutingAcceptingRequests(
  outing: Outing,
  nowMs = Date.now(),
): boolean {
  if (outing.status === 'completed' || outing.status === 'closed') return false;
  if (outing.status !== 'open' && outing.status !== 'full') return false;
  if (isUrgentOnSite(outing)) {
    return isUrgentAcceptWindowOpen(outing, nowMs);
  }
  return !isStartsAtPast(outing.startsAt, nowMs);
}

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

/**
 * Public Annonces list: open/full and not yet started — except urgent on-site,
 * which stays visible/joinable until startsAt+30 min despite startsAt = now.
 */
export function isVisibleOnAnnoncesFeed(
  outing: Outing,
  nowMs = Date.now(),
): boolean {
  if (outing.status !== 'open' && outing.status !== 'full') return false;
  if (isUrgentOnSite(outing)) {
    return isUrgentAcceptWindowOpen(outing, nowMs);
  }
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
