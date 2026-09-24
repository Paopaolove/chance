export function formatOutingWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();

  const time = d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (sameDay) return `Ce soir · ${time}`;
  if (isTomorrow) return `Demain · ${time}`;

  const date = d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return `${date} · ${time}`;
}

export function formatCountdown(deadlineIso: string, nowMs = Date.now()): string {
  const left = Math.max(0, new Date(deadlineIso).getTime() - nowMs);
  const totalSec = Math.floor(left / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function planLabel(plan: string): string {
  switch (plan) {
    case 'essai':
      return 'Essai 1 mois illimité';
    case 'payg':
      return 'À la sortie (6,90 €)';
    case 'essentiel':
      return 'Essentiel (4 sorties / mois)';
    case 'illimite':
      return 'Illimité';
    default:
      return plan;
  }
}

/** Format average with French decimal comma, e.g. 4.6 → « 4,6 ». */
export function formatRatingAverage(average: number): string {
  return average.toFixed(1).replace('.', ',');
}

/** Exact empty-reviews / new-user French copy. */
export function newUserChanceCopy(firstName: string): string {
  return `${firstName} vient d’arriver. Donne-lui sa Chance.`;
}

/** Profile / card line: « 4,6 · 12 sorties » or new-user copy. */
export function formatRatingLine(
  firstName: string,
  average: number | null,
  outingCount: number,
): string {
  if (outingCount <= 0 || average == null) {
    return newUserChanceCopy(firstName);
  }
  const sorties = outingCount === 1 ? '1 sortie' : `${outingCount} sorties`;
  return `${formatRatingAverage(average)} · ${sorties}`;
}
