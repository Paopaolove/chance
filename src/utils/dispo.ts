/** Local calendar midnight after `from` (Europe/Paris box clock). */
export function nextLocalMidnight(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setHours(24, 0, 0, 0);
  return d;
}

export function isPastLocalMidnight(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  return Date.now() >= new Date(expiresAt).getTime();
}

/** Créneaux suggérés pour Dispo ce soir. */
export const DISPO_SLOT_OPTIONS = [
  { id: '18:00', label: '18:00' },
  { id: '19:00', label: '19:00' },
  { id: '19:30', label: '19:30' },
  { id: '20:00', label: '20:00' },
  { id: '21:00', label: '21:00' },
  { id: 'flexible', label: 'Flexible' },
] as const;

export type DispoSlotId = (typeof DISPO_SLOT_OPTIONS)[number]['id'];

export function dispoSlotLabel(slot?: string): string {
  if (!slot) return '';
  const found = DISPO_SLOT_OPTIONS.find((s) => s.id === slot);
  return found?.label ?? slot;
}
