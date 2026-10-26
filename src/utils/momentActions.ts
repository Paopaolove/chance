/**
 * 25/10 · Débug bloquants (audit 6448264) : visibilité des actions de fin de
 * moment sur le détail, alignée sur les gardes du reducer / des actions.
 * Table normale seulement : le partenaire restau reste une mécanique à part.
 */
import type { Outing, Request } from '../data/types';
import { isAbsenceDeclarationWindowOpen } from './depositH6';
import { hasMomentStarted } from './leaveTable';
import { canNoShowGuestDeclareHostAbsent } from './noShowContest';
import { isPartnerListing } from './partners';

type CancelOuting = Pick<Outing, 'id' | 'status' | 'startsAt'> &
  Partial<Pick<Outing, 'isPartnerListing' | 'partnerVenueCheck' | 'hostNoShowReported'>>;
type CancelRequest = Pick<Request, 'outingId' | 'status'> &
  Partial<Pick<Request, 'leftTableAt' | 'attendance'>>;

/**
 * B2 · « Annuler le moment » (hôte) : refusé dès H (L159, pas de désistement à
 * partir de H) et dès qu’un confirmé est présent ou parti (L46, départ définitif).
 * Renvoie le code de refus, ou null si l’annulation est possible.
 */
export function hostCancelRefusal(
  outing: CancelOuting,
  requests: CancelRequest[],
  nowMs = Date.now(),
): 'already_completed' | 'already_cancelled' | 'moment_started' | 'guests_on_site' | null {
  if (outing.status === 'completed') return 'already_completed';
  if (outing.status === 'cancelled') return 'already_cancelled';
  const partner = isPartnerListing(outing as Outing);
  // Partenaire restau : pas de borne à H (mécanique à part, 18/10)…
  if (!partner && hasMomentStarted(outing.startsAt, nowMs)) return 'moment_started';
  // … mais, débug audit 36, plus d’annulation une fois la liste faite ou
  // l’absence du lieu signalée (sinon cautions bloquées en attente).
  if (partner && (outing.partnerVenueCheck || outing.hostNoShowReported)) return 'guests_on_site';
  const onSite = requests.some(
    (r) =>
      r.outingId === outing.id &&
      r.status === 'confirmed' &&
      (!!r.leftTableAt || !!r.attendance),
  );
  return onSite ? 'guests_on_site' : null;
}

type AbsenceOuting = Pick<Outing, 'id' | 'hostId' | 'status' | 'startsAt'> &
  Partial<Pick<Outing, 'isPartnerListing' | 'hostNoShowCase' | 'hostNoShowReported' | 'hostPresence'>>;

function isMyConfirmedSeat(outing: AbsenceOuting, request: Request | undefined, meId: string): request is Request {
  return (
    !!request &&
    !!meId &&
    request.outingId === outing.id &&
    request.status === 'confirmed' &&
    request.userId === meId &&
    outing.hostId !== meId
  );
}

/**
 * B3 · « Déclarer l’hôte absent » : tout invité confirmé (25/10 L135), de H à
 * H+6 inclus (L77, L130), une seule déclaration par moment (gel 17/10 point 2),
 * jamais contre sa propre confirmation de présence de l’hôte (18/10).
 * Invité déjà « Pas venu » : seulement pendant ses 24 h (L83).
 */
export function canShowDeclareHostAbsent(
  outing: AbsenceOuting,
  request: Request | undefined,
  meId: string,
  nowMs = Date.now(),
): boolean {
  if (isPartnerListing(outing as Outing)) return false;
  if (outing.status === 'cancelled') return false;
  if (!isMyConfirmedSeat(outing, request, meId)) return false;
  if (request.leftTableAt) return false;
  if (outing.hostNoShowCase || outing.hostNoShowReported) return false;
  if (outing.hostPresence?.byUserId === meId) return false;
  if (!isAbsenceDeclarationWindowOpen(outing, nowMs)) return false;
  if (request.attendance === 'absent') return canNoShowGuestDeclareHostAbsent(request, nowMs);
  return true;
}

/**
 * B3 · Auto-déclaration d’absence (« Je ne suis pas venu ») : caution perdue
 * immédiatement, sans contestation (L20, L65), même fenêtre H → H+6 (L77, L130).
 * Rien d’indiqué (ni présent, ni « Pas venu »), caution encore bloquée, pas parti.
 * 25/10 soir · Trois points produit : aussi sur un moment lieu (partenaire) —
 * 20 € entiers au lieu, barème partenaire (4 absences retenues / 12 mois).
 */
export function canShowSelfDeclareAbsence(
  outing: AbsenceOuting,
  request: Request | undefined,
  meId: string,
  nowMs = Date.now(),
): boolean {
  if (outing.status === 'cancelled') return false;
  if (!isMyConfirmedSeat(outing, request, meId)) return false;
  if (request.leftTableAt || request.attendance) return false;
  if ((request.depositStatus ?? 'held') !== 'held') return false;
  if (outing.hostNoShowReported) return false;
  return isAbsenceDeclarationWindowOpen(outing, nowMs);
}
