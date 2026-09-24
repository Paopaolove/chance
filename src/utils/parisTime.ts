/** Display helpers — store deadlines/startsAt as ISO UTC; show Europe/Paris. */

export const PARIS_TIMEZONE = 'Europe/Paris';

/** Calendar Y-M-D (en-CA = YYYY-MM-DD) in Europe/Paris. */
export function parisYmd(isoOrMs: string | number): string {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: PARIS_TIMEZONE });
}

/** Calendar month key « YYYY-MM » in Europe/Paris (joker mensuel). */
export function parisMonthKey(isoOrMs: string | number = Date.now()): string {
  const ymd = parisYmd(isoOrMs);
  return ymd ? ymd.slice(0, 7) : '';
}

/** « 20:00 » in Europe/Paris. */
export function formatParisTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '--:--';
  return d.toLocaleTimeString('fr-FR', {
    timeZone: PARIS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** « jeu. 25 sept. · 20:00 » in Europe/Paris. */
export function formatParisDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const date = d.toLocaleDateString('fr-FR', {
    timeZone: PARIS_TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${date} · ${formatParisTime(iso)}`;
}

/** True if `iso` falls on the same Paris calendar day as `nowMs`. */
export function isParisSameDay(iso: string, nowMs = Date.now()): boolean {
  return parisYmd(iso) === parisYmd(nowMs);
}

/**
 * True if `iso` is the next Paris calendar day after `nowMs`.
 * Uses noon UTC anchors derived from Paris Y-M-D to avoid DST edges.
 */
export function isParisTomorrow(iso: string, nowMs = Date.now()): boolean {
  const today = parisYmd(nowMs);
  if (!today) return false;
  const [y, m, day] = today.split('-').map(Number);
  const nextNoonMs = Date.UTC(y, m - 1, day, 12, 0, 0) + 24 * 60 * 60 * 1000;
  return parisYmd(iso) === parisYmd(nextNoonMs);
}

/**
 * Next calendar midnight in Europe/Paris after `from`.
 * Returns a Date whose UTC instant is 00:00:00 Europe/Paris on the next Paris day.
 */
export function nextParisMidnight(from: Date = new Date()): Date {
  const today = parisYmd(from.getTime());
  if (!today) {
    const fallback = new Date(from);
    fallback.setHours(24, 0, 0, 0);
    return fallback;
  }
  // Probe from ~20:00 UTC on Paris "today" through the following morning.
  const [y, m, d] = today.split('-').map(Number);
  const probeStart = Date.UTC(y, m - 1, d, 20, 0, 0);
  for (let i = 0; i < 48; i++) {
    const t = probeStart + i * 15 * 60 * 1000;
    const ymd = parisYmd(t);
    if (!ymd || ymd <= today) continue;
    const time = new Date(t).toLocaleTimeString('en-GB', {
      timeZone: PARIS_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    if (time === '00:00:00') return new Date(t);
  }
  const fallback = new Date(from);
  fallback.setHours(24, 0, 0, 0);
  return fallback;
}
