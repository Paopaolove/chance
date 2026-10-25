/**
 * 25/10 · Lot E : instants où l’écran d’un moment change d’état sans action
 * (boutons Annuler / présence / absence / chat / désistement). L’écran se
 * re-rend à chacun d’eux, plus un battement court autour du moment.
 */
import { DEPOSIT_SILENCE_RETURN_AFTER_MS } from './depositH6';
import {
  OUTING_AUTO_COMPLETE_AFTER_MS,
  PRESENCE_MARK_FROM_BEFORE_MS,
  PRESENCE_MARK_UNTIL_AFTER_MS,
} from './outingActive';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** Battement de sécurité pendant la période sensible (H−1 h → H+6 h + 1 min). */
export const MOMENT_CLOCK_TICK_MS = 30 * 1000;

/** Bornes (ms absolues) qui changent l’affichage, dans l’ordre. */
export function momentBoundariesMs(startMs: number): number[] {
  if (!Number.isFinite(startMs)) return [];
  return [
    startMs - HOUR, // chat (table normale) ; désistement gratuit encore ouvert (H−1 inclus)
    startMs - HOUR + 1, // 25/10 soir : désistement gratuit fermé juste après H−1
    startMs - PRESENCE_MARK_FROM_BEFORE_MS, // présence H−15
    startMs, // H : plus d’annulation, absences ouvertes (H exclu → +1 ms)
    startMs + 1,
    startMs + OUTING_AUTO_COMPLETE_AFTER_MS, // H+30
    startMs + PRESENCE_MARK_UNTIL_AFTER_MS, // présence close à H+6
    startMs + DEPOSIT_SILENCE_RETURN_AFTER_MS + 1, // absences closes après H+6 (inclus)
  ];
}

/** Prochaine borne strictement après nowMs, ou null s’il n’y en a plus. */
export function nextMomentBoundaryMs(startMs: number, nowMs: number): number | null {
  for (const b of momentBoundariesMs(startMs)) if (b > nowMs) return b;
  return null;
}

/** Vrai pendant la période où un battement court est utile. */
export function isMomentClockHot(startMs: number, nowMs: number): boolean {
  if (!Number.isFinite(startMs)) return false;
  return nowMs >= startMs - HOUR && nowMs <= startMs + DEPOSIT_SILENCE_RETURN_AFTER_MS + MIN;
}

/**
 * Délai avant le prochain rafraîchissement : la prochaine borne (+ 5 ms) ou le
 * battement si plus proche en période sensible ; plafonné à 1 h (setTimeout
 * longs peu fiables). null = plus rien à rafraîchir.
 */
export function nextMomentRefreshDelayMs(startMs: number, nowMs: number): number | null {
  const b = nextMomentBoundaryMs(startMs, nowMs);
  const toBoundary = b === null ? Infinity : b - nowMs + 5;
  const tick = isMomentClockHot(startMs, nowMs) ? MOMENT_CLOCK_TICK_MS : Infinity;
  const d = Math.min(toBoundary, tick, HOUR);
  return b === null && tick === Infinity ? null : Math.max(5, d);
}
