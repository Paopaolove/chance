/**
 * Droit de laisser un avis (Lot 6, inchangé) : moment terminé ; l’hôte note un
 * invité présent ; un invité ne note l’hôte qu’après coup et seulement si sa
 * présence est établie (attendance 'present', ou absence non retenue après
 * contestation acceptée). Confirmé ≠ présent.
 * Utilisé par canLeaveReview, addReview et le reducer ADD_REVIEW.
 */
import type { Outing, Request, Review } from '../data/types';
import { wasPresent } from './outingActive';

export function reviewEligibility(input: {
  fromUserId: string | null | undefined;
  toUserId: string;
  outing: Pick<Outing, 'id' | 'hostId' | 'status'> | undefined;
  requests: Request[];
  reviews: Pick<Review, 'outingId' | 'fromUserId' | 'toUserId'>[];
}): { ok: true } | { ok: false; reason: string } {
  const { fromUserId, toUserId, outing, requests, reviews } = input;
  if (!fromUserId) return { ok: false, reason: 'no_user' };
  if (toUserId === fromUserId) return { ok: false, reason: 'self' };
  if (!outing) return { ok: false, reason: 'outing_not_found' };
  // Contestation acceptée (L62, L79) : l’invité peut noter même si la table est
  // restée « closed » après le « Pas venu ». Autres cas inchangés.
  const acceptedContestGuest =
    outing.status === 'closed' &&
    requests.some(
      (r) =>
        r.outingId === outing.id &&
        r.userId === fromUserId &&
        r.status === 'confirmed' &&
        r.noShowNotRetained === true,
    );
  if (outing.status !== 'completed' && !acceptedContestGuest) {
    return { ok: false, reason: 'not_completed' };
  }
  // Contestation acceptée (absence non retenue) : vaut présence pour la note,
  // sans modifier l’attendance réelle.
  const present = (uid: string) =>
    requests.some(
      (r) =>
        r.outingId === outing.id &&
        r.userId === uid &&
        (wasPresent(r) || (r.status === 'confirmed' && r.noShowNotRetained === true)),
    );
  if (outing.hostId !== fromUserId && !present(fromUserId)) {
    return { ok: false, reason: 'not_participant' };
  }
  if (outing.hostId !== toUserId && !present(toUserId)) {
    return { ok: false, reason: 'target_not_participant' };
  }
  if (
    reviews.some(
      (r) => r.outingId === outing.id && r.fromUserId === fromUserId && r.toUserId === toUserId,
    )
  ) {
    return { ok: false, reason: 'already_reviewed' };
  }
  return { ok: true };
}
