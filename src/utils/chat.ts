/** Chat unlocks 1 hour before outing start. */
export const CHAT_UNLOCK_BEFORE_MS = 60 * 60 * 1000;

/** Quick-pick chips; any positive integer is also allowed via custom input. */
export type LatePresetMinutes = 5 | 10 | 15 | 20;

export const LATE_PRESETS: LatePresetMinutes[] = [5, 10, 15, 20];

/** Reasonable bounds for a late signal (minutes). */
export const LATE_MIN_MINUTES = 1;
export const LATE_MAX_MINUTES = 180;

/** Chip « 20 » means « 20 minutes ou plus » (vs exact custom input). */
export const LATE_PRESET_OR_MORE: LatePresetMinutes = 20;

export function clampLateMinutes(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const n = Math.round(raw);
  if (n < LATE_MIN_MINUTES || n > LATE_MAX_MINUTES) return null;
  return n;
}

export function getChatOpensAt(startsAt: string): Date {
  return new Date(new Date(startsAt).getTime() - CHAT_UNLOCK_BEFORE_MS);
}

export type ChatUnlockOpts = {
  /**
   * Urgent « déjà sur place »: chat opens as soon as the seat is confirmed
   * (bypass H−1). Normal outings keep the H−1 gate.
   */
  urgentOnSite?: boolean;
};

export function isChatUnlocked(
  startsAt: string,
  nowMs = Date.now(),
  opts?: ChatUnlockOpts,
): boolean {
  if (opts?.urgentOnSite) return true;
  return nowMs >= getChatOpensAt(startsAt).getTime();
}

/**
 * French countdown until chat opens.
 * Under 1 h → « Chat dans {mm} min »; otherwise hours (+ minutes).
 * Urgent on-site → already open.
 */
export function formatUntilChatOpens(
  startsAt: string,
  nowMs = Date.now(),
  opts?: ChatUnlockOpts,
): string {
  if (opts?.urgentOnSite) return 'Chat ouvert';
  const left = Math.max(0, getChatOpensAt(startsAt).getTime() - nowMs);
  if (left <= 0) return 'Chat ouvert';
  const totalMin = Math.ceil(left / 60_000);
  if (totalMin < 60) {
    return `Chat dans ${totalMin} min`;
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (m === 0) return `Chat dans ${h} h`;
  return `Chat dans ${h} h ${m} min`;
}

export type LateLabelOpts = { orMore?: boolean };

/** Chip label: preset 20 → « 20+ min », others « N min ». */
export function lateChipLabel(minutes: number): string {
  if (minutes === LATE_PRESET_OR_MORE) return '20+ min';
  return `${minutes} min`;
}

/** Bandeau / toast short label. */
export function lateLabel(minutes: number, opts?: LateLabelOpts): string {
  if (opts?.orMore) return '20+ min';
  return `${minutes} min`;
}

/** System message in chat thread. */
export function lateSystemText(
  who: string,
  minutes: number,
  opts?: LateLabelOpts,
): string {
  if (opts?.orMore) {
    return `${who} signale un retard de 20 minutes ou plus.`;
  }
  const unit = minutes === 1 ? 'minute' : 'minutes';
  return `${who} signale un retard de ${minutes} ${unit}.`;
}

export function chatThreadKey(outingId: string, requestId?: string): string {
  return requestId ? `${outingId}:${requestId}` : outingId;
}
