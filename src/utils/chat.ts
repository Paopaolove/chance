/** Chat unlocks 1 hour before outing start. */
export const CHAT_UNLOCK_BEFORE_MS = 60 * 60 * 1000;

export type LatePresetMinutes = 5 | 10 | 15 | 20;

export const LATE_PRESETS: LatePresetMinutes[] = [5, 10, 15, 20];

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

export function lateLabel(minutes: LatePresetMinutes): string {
  return minutes >= 20 ? '20+ min' : `${minutes} min`;
}

export function lateSystemText(
  who: string,
  minutes: LatePresetMinutes,
): string {
  if (minutes >= 20) {
    return `${who} signale un retard de 20 minutes ou plus.`;
  }
  return `${who} signale un retard de ${minutes} minutes.`;
}

export function chatThreadKey(outingId: string, requestId?: string): string {
  return requestId ? `${outingId}:${requestId}` : outingId;
}
