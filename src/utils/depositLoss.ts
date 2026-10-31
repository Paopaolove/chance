/**
 * 31/10 · Lot 39 · Caution perdue : visible sur le moment concerné et dans son
 * historique, jamais en bandeau permanent sur le Profil.
 *
 * Désistement trop tard (moins d’1 h) : la demande passe « cancelled », donc
 * l’écran du moment ne la retrouve plus comme demande active. Ce helper la
 * retrouve pour afficher la perte à l’invité concerné seulement.
 */
import type { Request } from '../data/types';

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
