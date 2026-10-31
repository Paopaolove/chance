/**
 * 31/10 · Lot 39 · Caution perdue : visible sur le moment concerné et dans son
 * historique, jamais en bandeau permanent sur le Profil.
 *
 * Désistement trop tard (moins d’1 h) : la demande passe « cancelled », donc
 * l’écran du moment ne la retrouve plus comme demande active. Ce helper la
 * retrouve pour afficher la perte à l’invité concerné seulement.
 */
import { depositForfeitShort } from '../data/pricing';
import type { Outing, Request } from '../data/types';
import { isPartnerListing } from './partners';

export function myLateCancelForfeit(
  requests: Request[],
  outingId: string,
  userId: string | null | undefined,
): Request | undefined {
  if (!userId) return undefined;
  return requests.find(
    (r) =>
      r.outingId === outingId &&
      r.userId === userId &&
      r.status === 'cancelled' &&
      r.depositStatus === 'forfeited',
  );
}

/**
 * 31/10 · Lot 40 · Note auto du fil invité ↔ hôte (ou lieu) après une absence :
 * **neutre** — l’absence + l’argent seulement. Jamais le barème (« 2e / 3e
 * absence »), la priorité baissée, le compteur « N sur 4 » ni « compte fermé » :
 * ceux-là restent privés à l’invité (toast + Profil). Table normale et lieu.
 */
export function autoNoShowNote(
  lossText: string,
  opts?: { partnerSelf?: boolean },
): string {
  return opts?.partnerSelf
    ? `Note auto · absence déclarée par l’invité — ${lossText}`
    : `Note auto · absence après confirmation — ${lossText}`;
}

/**
 * 31/10 · Lot 39b/40 · Ligne « Caution perdue » dans Moments passés (Profil,
 * soi seulement — jamais sur le profil public).
 *
 * Tout moment déjà commencé où MA caution a été perdue : absence retenue
 * (déclarée par l’hôte / le lieu ou auto-déclarée), départ anticipé sans motif,
 * désistement trop tard. Montant selon la table : lieu → 20 € entiers au lieu ;
 * table normale → 6,90 € Moment / 13,10 € hôte.
 */
export type PastDepositLoss = {
  reason: 'absence' | 'left_early' | 'late_cancel';
  /** « Absence », « Départ anticipé », « Désistement trop tard ». */
  reasonLabel: string;
  /** « 20 € entiers au lieu » ou « 6,90 € Moment / 13,10 € hôte ». */
  amountLabel: string;
};

export const PAST_DEPOSIT_LOSS_TITLE = 'Caution perdue';

const PAST_LOSS_REASON_LABELS: Record<PastDepositLoss['reason'], string> = {
  absence: 'Absence',
  left_early: 'Départ anticipé',
  late_cancel: 'Désistement trop tard',
};

export function myPastDepositLoss(
  outing: Outing,
  requests: Request[],
  userId: string | null | undefined,
  nowMs: number = Date.now(),
): PastDepositLoss | null {
  if (!userId || outing.hostId === userId) return null;
  // « Passé » : le moment a commencé (pas de ligne avant l’heure de début).
  const startMs = new Date(outing.startsAt).getTime();
  if (!Number.isFinite(startMs) || startMs > nowMs) return null;
  const req = requests.find(
    (r) =>
      r.outingId === outing.id &&
      r.userId === userId &&
      r.depositStatus === 'forfeited',
  );
  if (!req) return null;
  const reason: PastDepositLoss['reason'] =
    req.status === 'cancelled'
      ? 'late_cancel'
      : req.leftTableAt
        ? 'left_early'
        : 'absence';
  return {
    reason,
    reasonLabel: PAST_LOSS_REASON_LABELS[reason],
    amountLabel: depositForfeitShort({ partner: isPartnerListing(outing) }),
  };
}

/** Sous-titre de la ligne : « Absence — 20 € entiers au lieu. » */
export function describePastDepositLoss(loss: PastDepositLoss): string {
  return `${loss.reasonLabel} — ${loss.amountLabel}.`;
}
