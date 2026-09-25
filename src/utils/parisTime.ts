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

/**
 * Convert a Europe/Paris wall-clock calendar day + time to a UTC Date.
 * Iteratively corrects timezone offset (handles DST).
 */
export function parisWallToUtc(
  ymd: string,
  hour: number,
  minute: number,
): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  let utcMs = Date.UTC(y, m - 1, d, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: PARIS_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(utcMs));
    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? NaN);
    const py = get('year');
    const pm = get('month');
    const pd = get('day');
    const ph = get('hour');
    const pmin = get('minute');
    if (![py, pm, pd, ph, pmin].every(Number.isFinite)) break;
    const want = Date.UTC(y, m - 1, d, hour, minute);
    const got = Date.UTC(py, pm - 1, pd, ph, pmin);
    const delta = want - got;
    if (delta === 0) break;
    utcMs += delta;
  }
  return new Date(utcMs);
}

/** Paris midnight at the *start* of the calendar day after `ymd` (end of that day). */
export function parisMidnightAfterYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return nextParisMidnight();
  const nextNoonMs = Date.UTC(y, m - 1, d, 12, 0, 0) + 24 * 60 * 60 * 1000;
  const nextYmd = parisYmd(nextNoonMs);
  if (!nextYmd) return nextParisMidnight();
  return parisWallToUtc(nextYmd, 0, 0);
}

/** Add N Paris calendar days to a Y-M-D (noon UTC anchor). */
export function addParisDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const noonMs = Date.UTC(y, m - 1, d, 12, 0, 0) + days * 24 * 60 * 60 * 1000;
  return parisYmd(noonMs) || ymd;
}
