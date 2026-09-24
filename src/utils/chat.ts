/** Chat unlocks 1 hour before outing start. */
export const CHAT_UNLOCK_BEFORE_MS = 60 * 60 * 1000;

/** Quick-pick chips; any positive integer is also allowed via custom input. */
export type LatePresetMinutes = 5 | 10 | 15 | 20;

export const LATE_PRESETS: LatePresetMinutes[] = [5, 10, 15, 20];

/** Reasonable bounds for a late signal (minutes). */
export const LATE_MIN_MINUTES = 1;
export const LATE_MAX_MINUTES = 180;

export function clampLateMinutes(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const n = Math.round(raw);
  if (n < LATE_MIN_MINUTES || n > LATE_MAX_MINUTES) return null;
  return n;
}

export function getChatOpensAt(startsAt: string): Date {
  return new Date(new Date(startsAt).getTime() - CHAT_UNLOCK_BEFORE_MS);
}

export function isChatUnlocked(startsAt: string, nowMs = Date.now()): boolean {
  return nowMs >= getChatOpensAt(startsAt).getTime();
}

/** Human countdown until chat opens (French). */
export function formatUntilChatOpens(
  startsAt: string,
  nowMs = Date.now(),
): string {
  const left = Math.max(0, getChatOpensAt(startsAt).getTime() - nowMs);
  if (left <= 0) return 'maintenant';
  const totalMin = Math.ceil(left / 60_000);
  if (totalMin < 60) {
    return `${totalMin} min`;
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function lateLabel(minutes: number): string {
  return `${minutes} min`;
}

export function lateSystemText(who: string, minutes: number): string {
  const unit = minutes === 1 ? 'minute' : 'minutes';
  return `${who} signale un retard de ${minutes} ${unit}.`;
}

export function chatThreadKey(outingId: string, requestId?: string): string {
  return requestId ? `${outingId}:${requestId}` : outingId;
}
