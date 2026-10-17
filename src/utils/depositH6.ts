/**
 * Caution, tables normales (décision Paolo 17/10) — la caution sert à éviter
 * le no-show ; la note n’a aucun effet sur l’argent.
 * - Présent : inchangé (rendue à partir de H+30 ou de la clôture).
 * - Rien de renseigné et aucun « Pas venu » avant H+6 : rendue à H+6.
 * - « Pas venu » (place vide) : strictement avant H+6 ; refusé à partir de H+6.
 * Annonces partenaires : inchangées (« le lendemain », « Je suis arrivé »).
 */
import type { Outing, Request } from '../data/types';
import { isPartnerListing } from './partners';

/** Rendu d’office de la caution : 6 h après le début (H+6). */
export const DEPOSIT_SILENCE_RETURN_AFTER_MS = 6 * 60 * 60 * 1000;

type H6Outing = Pick<Outing, 'startsAt'> & Partial<Outing>;

function startMs(outing: Pick<Outing, 'startsAt'>): number {
  return new Date(outing.startsAt).getTime();
}

/** Table normale et heure ≥ H+6. Faux pour une annonce partenaire. */
export function isAtOrAfterH6(outing: H6Outing, nowMs = Date.now()): boolean {
  if (isPartnerListing(outing as Outing)) return false;
  const s = startMs(outing);
  return Number.isFinite(s) && nowMs >= s + DEPOSIT_SILENCE_RETURN_AFTER_MS;
}

/**
 * « Pas venu » encore possible côté temps (borne haute seulement ; la borne
 * basse « à partir de H » reste dans le reducer). Table normale : strictement
 * avant H+6. Partenaire : pas de borne ici (règle « soir même » inchangée).
 */
export function isNoShowWindowOpen(outing: H6Outing, nowMs = Date.now()): boolean {
  return !isAtOrAfterH6(outing, nowMs);
}

/** Caution à rendre à H+6 : confirmé, non « Pas venu », encore held, table normale non annulée. */
export function shouldReturnDepositH6(
  outing: H6Outing & Pick<Outing, 'status'> & Partial<Pick<Outing, 'hostNoShowCase'>>,
  request: Pick<Request, 'status' | 'attendance' | 'depositStatus'>,
  nowMs = Date.now(),
): boolean {
  if (outing.status === 'cancelled') return false;
  // Absence de l’hôte en délai ou en revue : cautions en attente.
  const hs = outing.hostNoShowCase?.status;
  if (hs === 'pending' || hs === 'contested') return false;
  if (!isAtOrAfterH6(outing, nowMs)) return false;
  if (request.status !== 'confirmed') return false;
  if (request.attendance === 'absent') return false;
  // Même convention que le reste du reducer : statut absent = bloquée.
  return request.depositStatus === 'held' || !request.depositStatus;
}

/** Moments ayant au moins une caution à rendre à H+6 (pour la minuterie locale). */
export function outingsDueForH6(
  outings: (H6Outing & Pick<Outing, 'id' | 'status'> & Partial<Pick<Outing, 'hostNoShowCase'>>)[],
  requests: (Pick<Request, 'outingId' | 'status' | 'attendance' | 'depositStatus'>)[],
  nowMs = Date.now(),
): string[] {
  return outings
    .filter((o) =>
      requests.some((r) => r.outingId === o.id && shouldReturnDepositH6(o, r, nowMs)),
    )
    .map((o) => o.id);
}

/** Démo : date H+6 exacte du moment (null si début invalide). */
export function h6AtIso(outing: Pick<Outing, 'startsAt'>): string | null {
  const s = startMs(outing);
  if (!Number.isFinite(s)) return null;
  return new Date(s + DEPOSIT_SILENCE_RETURN_AFTER_MS).toISOString();
}

/**
 * Ligne hôte pour une caution rendue d’un confirmé sans présence ni départ.
 * - Contestation acceptée : « X · absence non retenue » (toujours).
 * - Hôte déclaré « Pas venu » : « X · caution rendue ».
 * - Sinon, à partir de H+6 : « X · caution rendue 6 h après le début », quelle
 *   que soit la cause (silence ou joker : le joker reste invisible pour l’hôte) ;
 *   avant H+6, aucune ligne.
 * Départs (avec ou sans malaise) : null — la ligne de départ s’affiche, identique.
 */
export function hostReturnedDepositLine(
  r: Pick<Request, 'userName' | 'attendance' | 'leftTableAt' | 'depositStatus'> & {
    noShowNotRetained?: boolean;
  },
  outing: H6Outing,
  nowMs = Date.now(),
): string | null {
  if (r.attendance || r.leftTableAt || r.depositStatus !== 'returned') return null;
  // Contestation acceptée : mention seule, sans phrase ni détail.
  if (r.noShowNotRetained) return `${r.userName} · absence non retenue`;
  if (outing.hostNoShowReported) return `${r.userName} · caution rendue`;
  if (isAtOrAfterH6(outing, nowMs)) return `${r.userName} · caution rendue 6 h après le début`;
  return null;
}
