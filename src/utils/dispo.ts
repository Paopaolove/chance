import {
  addParisDays,
  formatParisTime,
  parisMidnightAfterYmd,
  parisWallToUtc,
  parisYmd,
  nextParisMidnight,
} from './parisTime';

/** @deprecated Prefer nextParisMidnight — kept as alias for Dispo expiry. */
export function nextLocalMidnight(from: Date = new Date()): Date {
  return nextParisMidnight(from);
}

/** True when `expiresAt` is in the past (slot end / midnight / confirm). */
export function isPastLocalMidnight(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  return Date.now() >= new Date(expiresAt).getTime();
}

/** Alias — Dispo auto-off honors `dispoExpiresAt` (slot end, not only midnight). */
export const isDispoExpired = isPastLocalMidnight;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Créneaux suggérés pour Dispo (dayparts flexibles). */
export const DISPO_SLOT_OPTIONS = [
  { id: 'maintenant', label: 'Maintenant' },
  { id: 'midi', label: 'Ce midi' },
  { id: 'apero', label: 'Cet apéro' },
  { id: 'soir', label: 'Ce soir' },
  { id: 'demain', label: 'Demain' },
] as const;

export type DispoSlotId = (typeof DISPO_SLOT_OPTIONS)[number]['id'];

export const DISPO_CUSTOM_PREFIX = 'custom:';

export function isDispoCustomSlot(slot?: string | null): boolean {
  return !!slot && slot.startsWith(DISPO_CUSTOM_PREFIX);
}

export function isDispoShortcutId(slot?: string | null): slot is DispoSlotId {
  return !!slot && DISPO_SLOT_OPTIONS.some((s) => s.id === slot);
}

/** Encode free jour+heure as `custom:YYYY-MM-DDTHH:mm` (Paris wall). */
export function encodeDispoCustomSlot(ymd: string, hhmm: string): string {
  return `${DISPO_CUSTOM_PREFIX}${ymd}T${hhmm}`;
}

export function parseDispoCustomSlot(
  slot?: string | null,
): { ymd: string; hhmm: string } | null {
  if (!slot || !slot.startsWith(DISPO_CUSTOM_PREFIX)) return null;
  const rest = slot.slice(DISPO_CUSTOM_PREFIX.length);
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(rest);
  if (!m) return null;
  return { ymd: m[1], hhmm: m[2] };
}

/** Legacy evening HH:mm or « flexible ». */
function isLegacyHhMm(slot: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(slot);
}

function parisNowHhMm(from: Date = new Date()): string {
  return formatParisTime(from.toISOString());
}

function formatYmdFr(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const probe = parisWallToUtc(ymd, 12, 0);
  if (!Number.isFinite(probe.getTime())) {
    return `${pad2(d)}/${pad2(m)}/${y}`;
  }
  return probe.toLocaleDateString('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Human label for a stored `dispoSlot`.
 * Never prefixes with « Dispo ce soir ».
 */
export function dispoSlotLabel(slot?: string, nowMs = Date.now()): string {
  if (!slot) return '';
  const found = DISPO_SLOT_OPTIONS.find((s) => s.id === slot);
  if (found) return found.label;

  const custom = parseDispoCustomSlot(slot);
  if (custom) {
    const today = parisYmd(nowMs);
    const tomorrow = today ? addParisDays(today, 1) : '';
    if (custom.ymd === today) return custom.hhmm;
    if (custom.ymd === tomorrow) return `Demain · ${custom.hhmm}`;
    return `${formatYmdFr(custom.ymd)} · ${custom.hhmm}`;
  }

  if (slot === 'flexible') return 'Flexible';
  if (isLegacyHhMm(slot)) return slot;
  return slot;
}

export type DispoCreatePrefill = {
  timeLabel: string;
  /** 0 = today (Paris), 1 = tomorrow, etc. */
  dateOffsetDays: number;
};

/** Map a dispo slot to Create-outing date/time prefill. */
export function dispoSlotCreatePrefill(
  slot?: string | null,
  now: Date = new Date(),
): DispoCreatePrefill {
  const today = parisYmd(now.getTime()) || '';
  if (!slot) return { timeLabel: '19:00', dateOffsetDays: 0 };

  if (slot === 'maintenant') {
    return { timeLabel: parisNowHhMm(now), dateOffsetDays: 0 };
  }
  if (slot === 'midi') return { timeLabel: '12:00', dateOffsetDays: 0 };
  if (slot === 'apero') return { timeLabel: '16:00', dateOffsetDays: 0 };
  if (slot === 'soir') return { timeLabel: '19:00', dateOffsetDays: 0 };
  if (slot === 'demain') return { timeLabel: '12:00', dateOffsetDays: 1 };
  if (slot === 'flexible') return { timeLabel: '19:00', dateOffsetDays: 0 };

  const custom = parseDispoCustomSlot(slot);
  if (custom && today) {
    const [y, m, d] = today.split('-').map(Number);
    const [cy, cm, cd] = custom.ymd.split('-').map(Number);
    const todayNoon = Date.UTC(y, m - 1, d, 12, 0, 0);
    const customNoon = Date.UTC(cy, cm - 1, cd, 12, 0, 0);
    const offset = Math.round((customNoon - todayNoon) / (24 * 60 * 60 * 1000));
    return {
      timeLabel: custom.hhmm,
      dateOffsetDays: Number.isFinite(offset) ? Math.max(0, offset) : 0,
    };
  }

  if (isLegacyHhMm(slot)) return { timeLabel: slot, dateOffsetDays: 0 };
  return { timeLabel: '19:00', dateOffsetDays: 0 };
}

/**
 * Authoritative Dispo expiry: earliest of
 * 1) end of chosen slot window, and
 * 2) midnight Europe/Paris of that day.
 * (Confirm flow clears dispo separately.)
 */
export function computeDispoExpiresAt(
  slot?: string | null,
  from: Date = new Date(),
): Date {
  const nowMs = from.getTime();
  const today = parisYmd(nowMs);
  if (!today) return nextParisMidnight(from);

  let dayYmd = today;
  let windowEnd: Date;

  if (slot === 'maintenant') {
    windowEnd = new Date(nowMs + 2 * 60 * 60 * 1000);
    dayYmd = today;
  } else if (slot === 'midi') {
    windowEnd = parisWallToUtc(today, 14, 0);
    dayYmd = today;
  } else if (slot === 'apero') {
    windowEnd = parisWallToUtc(today, 18, 30);
    dayYmd = today;
  } else if (slot === 'soir') {
    windowEnd = parisWallToUtc(today, 23, 0);
    dayYmd = today;
  } else if (slot === 'demain') {
    dayYmd = addParisDays(today, 1);
    // Full tomorrow → window ends at end-of-day (= midnight after tomorrow's ymd)
    windowEnd = parisMidnightAfterYmd(dayYmd);
  } else {
    const custom = parseDispoCustomSlot(slot);
    if (custom) {
      dayYmd = custom.ymd;
      const [hh, mm] = custom.hhmm.split(':').map(Number);
      // Free slot: window ~2h after chosen time, still capped by midnight
      windowEnd = new Date(
        parisWallToUtc(custom.ymd, hh || 0, mm || 0).getTime() +
          2 * 60 * 60 * 1000,
      );
    } else if (slot && isLegacyHhMm(slot)) {
      const [hh, mm] = slot.split(':').map(Number);
      dayYmd = today;
      // Evening legacy → treat like « Ce soir » end (23:00), else +2h from time
      if ((hh ?? 0) >= 18) {
        windowEnd = parisWallToUtc(today, 23, 0);
      } else {
        windowEnd = new Date(
          parisWallToUtc(today, hh || 0, mm || 0).getTime() +
            2 * 60 * 60 * 1000,
        );
      }
    } else {
      // Unknown / missing → midnight tonight
      return nextParisMidnight(from);
    }
  }

  const midnight = parisMidnightAfterYmd(dayYmd);
  const endMs = Math.min(windowEnd.getTime(), midnight.getTime());
  return new Date(endMs);
}

/** JJ/MM/AAAA from Paris Y-M-D. */
export function ymdToFrDateInput(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

/** Parse JJ/MM/AAAA → YYYY-MM-DD, or null. */
export function frDateInputToYmd(raw: string): string | null {
  const s = raw.trim();
  const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Normalize typed HH:mm / 20h30 → HH:mm, or null. */
export function normalizeDispoHhMm(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  let match = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (match) {
    const h = Number(match[1]);
    const min = Number(match[2]);
    if (h > 23 || min > 59) return null;
    return `${pad2(h)}:${pad2(min)}`;
  }
  match = /^(\d{1,2})h(\d{2})?$/.exec(s);
  if (match) {
    const h = Number(match[1]);
    const min = match[2] ? Number(match[2]) : 0;
    if (h > 23 || min > 59) return null;
    return `${pad2(h)}:${pad2(min)}`;
  }
  return null;
}
