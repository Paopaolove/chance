/**
 * Profil « Marquer présent et noter » (17/10) — côté hôte ici ; côté invité
 * (18/10), le bouton déclenche « Je suis présent » (GUEST_SELF_PRESENT).
 * Marquage invité par invité (registre : pas de marquage en bloc) : l’hôte
 * voit les confirmés non partis et coche ceux qui étaient là, rien de
 * pré-coché. Seuls les cochés sont marqués présents, en une seule action
 * atomique (MARK_GUESTS_PRESENT) ; les autres restent sans présence, donc
 * toujours signalables en « Pas venu ». Contrôles existants : hôte, de H−15
 * à H+6 (18/10), jamais après « Pas venu ». Règles de caution inchangées (rendue à
 * H+30 ou à la clôture). L’avis ne s’ouvre que si une présence est
 * enregistrée (ou déjà marquée).
 */
import type { Outing, Request } from '../data/types';
import { isPresenceWindowOpen, presenceWindowRefusal } from './outingActive';
import { canActorMarkGuestPresent } from './participationRights';

export type PresenceCandidate = {
  requestId: string;
  userId: string;
  userName: string;
};

export type MarkPresentReason =
  | 'no_user'
  | 'outing_not_found'
  | 'outing_cancelled'
  | 'not_host'
  | 'no_guest'
  | 'already_absent'
  | 'too_early'
  | 'too_late'
  | 'none_selected'
  | 'invalid_selection';

type Input = {
  userId: string | null | undefined;
  outing: Outing | undefined;
  requests: Request[];
  nowMs?: number;
};

const toCandidate = (r: Request): PresenceCandidate => ({
  requestId: r.id,
  userId: r.userId,
  userName: r.userName,
});

/** Liste à cocher : confirmés sans présence et non partis (aucun pré-coché). */
export function presenceChecklist(
  input: Input,
):
  | {
      ok: true;
      candidates: PresenceCandidate[];
      alreadyPresent: PresenceCandidate[];
      windowOpen: boolean;
    }
  | { ok: false; reason: MarkPresentReason } {
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
  const candidates = confirmed
    .filter((r) => !r.attendance && !r.leftTableAt)
    .map(toCandidate);
  const alreadyPresent = confirmed
    .filter((r) => r.attendance === 'present')
    .map(toCandidate);
  if (!candidates.length && !alreadyPresent.length) {
    return {
      ok: false,
      reason: confirmed.some((r) => r.attendance === 'absent')
        ? 'already_absent'
        : 'no_guest',
    };
  }
  return {
    ok: true,
    candidates,
    alreadyPresent,
    windowOpen: isPresenceWindowOpen(outing, nowMs),
  };
}

/**
 * Valide la sélection de l’hôte (tout ou rien) : chaque id doit être un
 * candidat de la liste. Sélection vide : ok seulement si quelqu’un est déjà
 * présent (l’avis peut s’ouvrir), sinon 'none_selected'.
 */
export function validatePresenceSelection(
  input: Input & { requestIds: string[] },
):
  | {
      ok: true;
      requestIds: string[];
      rateTarget: { toUserId: string; toUserName: string };
    }
  | { ok: false; reason: MarkPresentReason } {
  const list = presenceChecklist(input);
  if (!list.ok) return list;
  const ids = [...new Set(input.requestIds)];
  const byId = new Map(list.candidates.map((c) => [c.requestId, c]));
  if (ids.some((id) => !byId.has(id))) {
    return { ok: false, reason: 'invalid_selection' };
  }
  if (!ids.length) {
    const p = list.alreadyPresent[0];
    if (!p) return { ok: false, reason: 'none_selected' };
    return { ok: true, requestIds: [], rateTarget: { toUserId: p.userId, toUserName: p.userName } };
  }
  if (!list.windowOpen) {
    return { ok: false, reason: presenceWindowRefusal(input.outing!, input.nowMs ?? Date.now()) ?? 'too_early' };
  }
  const first = byId.get(ids[0])!;
  return {
    ok: true,
    requestIds: ids,
    rateTarget: { toUserId: first.userId, toUserName: first.userName },
  };
}

export function markPresentReasonLabel(reason: string): string {
  switch (reason) {
    case 'not_host':
      return 'Seul l’hôte peut marquer la présence.';
    case 'too_early':
      return 'La présence se marque à partir de 15 min avant le début.';
    case 'too_late':
      return 'La présence se marque jusqu’à 6 h après le début.';
    case 'already_absent':
      return '« Pas venu » a déjà été signalé : la présence ne peut plus être marquée.';
    case 'outing_cancelled':
      return 'Ce moment a été annulé.';
    case 'none_selected':
      return 'Coche les invités qui étaient là.';
    case 'invalid_selection':
      return 'Sélection invalide : un invité ne peut plus être marqué présent.';
    case 'no_guest':
    case 'not_confirmed':
      return 'Aucun invité confirmé à marquer présent.';
    case 'outing_not_found':
      return 'Moment introuvable.';
    default:
      return 'Présence non enregistrée.';
  }
}
