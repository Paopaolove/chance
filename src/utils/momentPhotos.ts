import type {
  MomentPhoto,
  MomentPhotoConsent,
  Outing,
  Request,
} from '../data/types';
import { wasPresent } from './outingActive';

/** Max photos par personne et par moment. */
export const MOMENT_PHOTOS_MAX_PER_PERSON = 2;

/** URI de démo : tuile dessinée localement (pas d’image réseau). */
export const MOMENT_PHOTO_PLACEHOLDER_PREFIX = 'placeholder:';

export type MomentParticipant = { userId: string; name: string };

/**
 * Personnes qui étaient vraiment à table : l’hôte + les invités marqués
 * présents (Confirmé ≠ présent). Uniquement pour une sortie terminée —
 * jamais avant la rencontre.
 */
export function momentParticipants(
  outing: Outing,
  requests: Request[],
): MomentParticipant[] {
  if (outing.status !== 'completed') return [];
  const list: MomentParticipant[] = [
    { userId: outing.hostId, name: outing.hostName },
  ];
  for (const r of requests) {
    if (r.outingId !== outing.id || !wasPresent(r)) continue;
    if (list.some((p) => p.userId === r.userId)) continue;
    list.push({ userId: r.userId, name: r.userName });
  }
  // Une table sans invité présent n’est pas un moment partagé.
  return list.length >= 2 ? list : [];
}

export function isMomentParticipant(
  outing: Outing,
  requests: Request[],
  userId: string,
): boolean {
  return momentParticipants(outing, requests).some((p) => p.userId === userId);
}

/** Les autres personnes de la table, dont l’accord est requis. */
export function requiredConsenters(
  photo: MomentPhoto,
  outing: Outing,
  requests: Request[],
): MomentParticipant[] {
  return momentParticipants(outing, requests).filter(
    (p) => p.userId !== photo.uploaderId,
  );
}

export function consentOf(
  photo: MomentPhoto,
  userId: string,
): MomentPhotoConsent {
  return photo.consents[userId] ?? 'pending';
}

export type MomentPhotoStatus = 'published' | 'pending' | 'private';

/**
 * - published : toutes les autres personnes présentes ont dit oui.
 * - private : au moins un « Non merci » (ou accord retiré) → ne se publie pas.
 * - pending : en attente d’au moins un accord.
 */
export function momentPhotoStatus(
  photo: MomentPhoto,
  outing: Outing | undefined,
  requests: Request[],
): MomentPhotoStatus {
  if (!outing) return 'private';
  const others = requiredConsenters(photo, outing, requests);
  if (!others.length) return 'private';
  const states = others.map((p) => consentOf(photo, p.userId));
  if (states.some((s) => s === 'declined')) return 'private';
  if (states.every((s) => s === 'accepted')) return 'published';
  return 'pending';
}

export const MOMENT_PHOTO_STATUS_LABELS: Record<
  Exclude<MomentPhotoStatus, 'published'>,
  string
> = {
  pending: 'En attente d’accord',
  private: 'Privée',
};
