/**
 * 18/10 · Confirmation croisée de la présence.
 * - L’invité dit « Je suis présent » pour lui et peut confirmer l’hôte ;
 *   l’hôte se dit présent et confirme chaque invité. Une seule confirmation
 *   suffit (présence établie), de H−15 à H+6.
 * - À la fin du moment, notification de l’app (pas de SMS) à chaque personne
 *   dont la présence n’est pas établie et qui n’a rien indiqué.
 */
import type { Outing, Request } from '../data/types';

export const PRESENCE_CHECK_TITLE = 'Moment terminé';
export const PRESENCE_CHECK_BODY = 'Alors, comment ça s’est passé ? Es-tu bien présent ?';

/** Présence de l’hôte établie (par lui-même ou par un invité). */
export function isHostPresent(outing: Pick<Outing, 'hostPresence'>): boolean {
  return !!outing.hostPresence;
}

/**
 * Personnes à relancer à la fin du moment : celles qui n’ont rien indiqué
 * (ni présence, ni « Pas venu », ni confirmation de l’autre côté).
 * - Hôte : ne s’est pas dit présent, n’a marqué aucun invité présent ou absent
 *   et n’a pas déclaré sa propre absence.
 * - Invité confirmé : ne s’est pas dit présent, n’a pas confirmé l’hôte, n’a pas
 *   déclaré l’hôte absent, n’a pas contesté et n’a pas quitté la table.
 */
export function presenceCheckUserIds(
  outing: Pick<Outing, 'id' | 'hostId' | 'status' | 'hostPresence' | 'hostNoShowCase'> &
    Partial<Pick<Outing, 'partnerVenueCheck'>>,
  requests: (Pick<
    Request,
    'outingId' | 'userId' | 'status' | 'attendance' | 'presenceBy' | 'leftTableAt' | 'noShowContest'
  > &
    Partial<Pick<Request, 'partnerSelfAbsent'>>)[],
): string[] {
  if (outing.status === 'cancelled') return [];
  const confirmed = requests.filter((r) => r.outingId === outing.id && r.status === 'confirmed');
  const ids: string[] = [];
  const hostIndicated =
    outing.hostPresence?.byUserId === outing.hostId ||
    outing.hostNoShowCase?.reportedBy === outing.hostId ||
    // Lieu : la liste de H+30 vaut indication.
    !!outing.partnerVenueCheck ||
    confirmed.some(
      (r) =>
        (r.attendance === 'present' && r.presenceBy !== 'guest') ||
        // « Pas venu » déclaré par l’hôte.
        r.attendance === 'absent',
    );
  if (!hostIndicated) ids.push(outing.hostId);
  for (const r of confirmed) {
    const indicated =
      (r.attendance === 'present' && r.presenceBy === 'guest') ||
      // Débug audit 36 : l’invité qui s’est déclaré absent (lieu) a déjà indiqué.
      !!r.partnerSelfAbsent ||
      !!r.leftTableAt ||
      !!r.noShowContest ||
      outing.hostPresence?.byUserId === r.userId ||
      outing.hostNoShowCase?.reportedBy === r.userId;
    if (!indicated) ids.push(r.userId);
  }
  return ids;
}
