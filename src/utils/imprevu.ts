/** Imprévu helpers — taxonomie caution : docs/deposit-imprevu.md */
import { ImprevuMotive } from '../data/types';

export const IMPREVU_MOTIVES: { id: ImprevuMotive; label: string }[] = [
  { id: 'annuler', label: 'Je dois annuler' },
  { id: 'gros_retard', label: 'Gros retard' },
  { id: 'lieu_ferme', label: 'Lieu fermé ou inaccessible' },
  { id: 'autre', label: 'Autre' },
];

export const IMPREVU_REASON_PLACEHOLDER =
  'Explique en une phrase (ex. RER bloqué à Gare du Nord).';

/** Soft bound: ~3 short lines. */
export const IMPREVU_REASON_MAX_CHARS = 280;

export function imprevuMotiveLabel(motive: ImprevuMotive): string {
  return IMPREVU_MOTIVES.find((m) => m.id === motive)?.label ?? motive;
}

/** Non-empty trimmed reason, 1–3 lines, within max length. */
export function normalizeImprevuReason(raw: string): string | null {
  const trimmed = raw.replace(/\r\n/g, '\n').trim();
  if (!trimmed) return null;
  if (trimmed.length > IMPREVU_REASON_MAX_CHARS) return null;
  const lines = trimmed.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 1 || lines.length > 3) return null;
  return trimmed;
}

export function imprevuNotifTitle(firstName: string): string {
  return `${firstName} signale un imprévu.`;
}
