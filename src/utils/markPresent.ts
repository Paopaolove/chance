/**
 * Profil « Marquer présent et noter » (17/10) : branché sur la vraie action de
 * présence (markGuestPresent) avec ses contrôles existants — hôte seulement,
 * à partir de H−15, jamais après « Pas venu » (absent). Les règles de caution
 * restent celles de MARK_GUEST_PRESENT (rendue à H+30 ou à la clôture).
 * L’avis ne s’ouvre que si la présence est enregistrée (ou déjà marquée).
 */
import type { Outing, Request } from '../data/types';
import { isPresenceWindowOpen } from './outingActive';
import { canActorMarkGuestPresent } from './participationRights';

export type MarkPresentPlan =
  | {
      ok: true;
      /** Demandes à marquer présentes (vide si déjà marquée). */
      requestIds: string[];
      rateTarget: { toUserId: string; toUserName: string };
    }
  | { ok: false; reason: MarkPresentReason };

export type MarkPresentReason =
  | 'no_user'
  | 'outing_not_found'
  | 'outing_cancelled'
  | 'not_host'
  | 'no_guest'
  | 'already_absent'
  | 'too_early';

export function planMarkPresentAndRate(input: {
  userId: string | null | undefined;
  outing: Outing | undefined;
  requests: Request[];
  nowMs?: number;
}): MarkPresentPlan {
  const { userId, outing, requests } = input;
  const nowMs = input.nowMs ?? Date.now();
  if (!userId) return { ok: false, reason: 'no_user' };
  if (!outing) return { ok: false, reason: 'outing_not_found' };
  if (outing.status === 'cancelled') {
    return { ok: false, reason: 'outing_cancelled' };
  }
  if (!canActorMarkGuestPresent(userId, outing.hostId)) {
    return { ok: false, reason: 'not_host' };
  }
  const confirmed = requests.filter(
    (r) => r.outingId === outing.id && r.status === 'confirmed',
  );
  const present = confirmed.find((r) => r.attendance === 'present');
  if (present) {
    // Déjà marquée : l’avis peut s’ouvrir, rien à enregistrer.
    return {
      ok: true,
      requestIds: [],
      rateTarget: { toUserId: present.userId, toUserName: present.userName },
    };
  }
  const eligible = confirmed.filter((r) => !r.attendance && !r.leftTableAt);
  if (!eligible.length) {
    return {
      ok: false,
      reason: confirmed.some((r) => r.attendance === 'absent')
        ? 'already_absent'
        : 'no_guest',
    };
  }
  if (!isPresenceWindowOpen(outing, nowMs)) {
    return { ok: false, reason: 'too_early' };
  }
  return {
    ok: true,
    requestIds: eligible.map((r) => r.id),
    rateTarget: { toUserId: eligible[0].userId, toUserName: eligible[0].userName },
  };
}

export function markPresentReasonLabel(reason: string): string {
  switch (reason) {
    case 'not_host':
      return 'Seul l’hôte peut marquer la présence.';
    case 'too_early':
      return 'La présence se marque à partir de 15 min avant le début.';
    case 'already_absent':
      return '« Pas venu » a déjà été signalé : la présence ne peut plus être marquée.';
    case 'outing_cancelled':
      return 'Ce moment a été annulé.';
    case 'no_guest':
    case 'not_confirmed':
      return 'Aucun invité confirmé à marquer présent.';
    case 'outing_not_found':
      return 'Moment introuvable.';
    default:
      return 'Présence non enregistrée.';
  }
}
