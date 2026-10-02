/**
 * Compte Partenaire (lieu : resto / bar / culture) — règles produit démo.
 * Pas d’onglet dédié : mélangé dans Annonces avec un badge. Caution identique
 * (20 €). Resto/bar : geste et/ou remise (jamais « J’invite jusqu’à X € »).
 * Culture : places offertes, 2 par invitation, max 5 invitations le même soir.
 * Zéro clic côté lieu : la chaise est prise à la confirmation de l’invité.
 */

import type {
  Outing,
  PartnerGesture,
  PartnerKind,
  PartnerOffer,
  PartnerStatus,
  Request,
  User,
} from '../data/types';
import { getTravelMinutes } from '../data/travelTime';
import { isParisSameDay, parisYmd } from './parisTime';
import { outingOccupiesActiveSlot } from './outingActive';

/** Culture partenaire : max invitations le même soir (date calendaire Paris). */
export const PARTNER_CULTURE_MAX_SAME_EVENING = 5;

/** Chaque invitation culture partenaire = 2 places (capacity forcée). */
export const PARTNER_CULTURE_CAPACITY = 2 as const;

/** 2e avertissement (annulation / ne honore pas) → compte partenaire fermé. */
export const PARTNER_WARNINGS_BEFORE_CLOSE = 2;

/** Invité « Je suis arrivé » à partir de H−15. */
export const PARTNER_GUEST_ARRIVED_BEFORE_MS = 15 * 60 * 1000;

/**
 * Fil : max 2 partenaires en tête, seulement s’ils sont proches + bientôt.
 * « Proche » = trajet ≤ 25 min (modèle démo travelTime) ; « bientôt » = ≤ 6 h.
 * Démo `pinned` (futur forfait 29 €/mois = 2 remontées, sans paiement) :
 * dispense de « proche », garde « bientôt » élargi à 24 h ; compte dans les 2.
 */
export const PARTNER_FEED_NEAR_MINUTES = 25;
export const PARTNER_FEED_SOON_MS = 6 * 60 * 60 * 1000;
export const PARTNER_FEED_PINNED_SOON_MS = 24 * 60 * 60 * 1000;
export const PARTNER_FEED_PIN_MAX = 2;

/** Remises proposées en pastilles (+ « Autre % » libre). */
export const PARTNER_DISCOUNT_PRESETS = [10, 20] as const;
export const PARTNER_DISCOUNT_MIN = 1;
export const PARTNER_DISCOUNT_MAX = 90;

/** Pastilles geste (+ « Autre » libre). */
export const PARTNER_GESTURES: { id: PartnerGesture; label: string }[] = [
  { id: 'verre', label: 'Un verre' },
  { id: 'dessert', label: 'Un dessert' },
  { id: 'cafe', label: 'Un café' },
  { id: 'entree', label: 'Une entrée' },
  { id: 'plat_du_jour', label: 'Le plat du jour' },
  { id: 'autre', label: 'Autre' },
];

export const PARTNER_KIND_LABELS: Record<PartnerKind, string> = {
  resto: 'Restaurant',
  bar: 'Bar',
  culture: 'Culture (salle, théâtre…)',
};

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  none: 'Particulier',
  pending: 'Demande envoyée',
  active: 'Compte partenaire actif',
  refused: 'Demande refusée — tu restes particulier',
  closed: 'Compte partenaire fermé',
};

export function partnerStatusOf(user: User | null | undefined): PartnerStatus {
  return user?.partnerStatus ?? (user?.isPartner ? 'active' : 'none');
}

/** Compte lieu actif (peut publier en partenaire). */
export function isPartnerUser(user: User | null | undefined): boolean {
  return !!user?.isPartner && partnerStatusOf(user) === 'active';
}

/** Compte partenaire fermé (2e avertissement) : publication bloquée. */
export function isPartnerClosed(user: User | null | undefined): boolean {
  return partnerStatusOf(user) === 'closed';
}

export function isPartnerListing(outing: Outing | null | undefined): boolean {
  return outing?.isPartnerListing === true;
}

export function isPartnerCultureListing(outing: Outing | null | undefined): boolean {
  return isPartnerListing(outing) && outing!.partnerKind === 'culture';
}

export function isPartnerRestoBarListing(outing: Outing | null | undefined): boolean {
  return (
    isPartnerListing(outing) &&
    (outing!.partnerKind === 'resto' || outing!.partnerKind === 'bar')
  );
}

export function isPartnerCultureHost(user: User | null | undefined): boolean {
  return isPartnerUser(user) && user!.partnerKind === 'culture';
}

export function isPartnerRestoBarHost(user: User | null | undefined): boolean {
  return (
    isPartnerUser(user) &&
    (user!.partnerKind === 'resto' || user!.partnerKind === 'bar')
  );
}

/**
 * Seat machine : une demande « accepted » réserve une chaise SAUF en annonce
 * partenaire (partnerAutoSeat) où la chaise n’est prise qu’à la confirmation.
 */
export function requestHoldsSeat(r: Request): boolean {
  if (r.status === 'confirmed') return true;
  if (r.status === 'accepted') return !r.partnerAutoSeat;
  return false;
}

// ---------- Offre resto/bar ----------

export function partnerGestureLabel(
  gesture: PartnerGesture | undefined,
  other?: string,
): string | null {
  switch (gesture) {
    case 'verre':
      return 'Un verre offert';
    case 'dessert':
      return 'Dessert offert';
    case 'cafe':
      return 'Café offert';
    case 'entree':
      return 'Entrée offerte';
    case 'plat_du_jour':
      return 'Plat du jour offert';
    case 'autre': {
      const t = other?.trim();
      return t ? `Offert : ${t}` : null;
    }
    default:
      return null;
  }
}

export function partnerDiscountLabel(pct: number | undefined): string | null {
  if (pct == null || !Number.isFinite(pct) || pct <= 0) return null;
  return `−${Math.round(pct)} %`;
}

/** Pastilles carte : « Dessert offert » et/ou « −10 % ». */
export function partnerOfferChips(offer: PartnerOffer | undefined): string[] {
  if (!offer) return [];
  const out: string[] = [];
  const g = partnerGestureLabel(offer.gesture, offer.gestureOther);
  if (g) out.push(g);
  const d = partnerDiscountLabel(offer.discountPct);
  if (d) out.push(d);
  return out;
}

/** Pastilles d’une carte partenaire (resto/bar : offre ; culture : places offertes). */
export function partnerListingChips(outing: Outing): string[] {
  if (isPartnerCultureListing(outing)) {
    return [`${outing.capacity} places offertes`];
  }
  return partnerOfferChips(outing.partnerOffer);
}

/**
 * Validation création resto/bar : au moins UN groupe (geste ou remise).
 * Autre geste → texte requis ; Autre % → entier 1–90.
 */
export function validatePartnerOffer(
  offer: PartnerOffer,
): { ok: true; offer: PartnerOffer } | { ok: false; reason: string } {
  const clean: PartnerOffer = {};
  if (offer.gesture) {
    if (offer.gesture === 'autre') {
      const t = offer.gestureOther?.trim();
      if (!t) return { ok: false, reason: 'gesture_other_empty' };
      clean.gesture = 'autre';
      clean.gestureOther = t.slice(0, 60);
    } else {
      clean.gesture = offer.gesture;
    }
  }
  if (offer.discountPct != null) {
    const n = Math.round(offer.discountPct);
    if (
      !Number.isFinite(n) ||
      n < PARTNER_DISCOUNT_MIN ||
      n > PARTNER_DISCOUNT_MAX
    ) {
      return { ok: false, reason: 'discount_invalid' };
    }
    clean.discountPct = n;
  }
  if (!clean.gesture && clean.discountPct == null) {
    return { ok: false, reason: 'offer_required' };
  }
  return { ok: true, offer: clean };
}

// ---------- Publication ----------

/** Invitations culture « vivantes » du même hôte le même soir Paris. */
export function countPartnerCultureSameEvening(
  hostId: string,
  startsAtIso: string,
  outings: Outing[],
  requests: Request[],
  nowMs = Date.now(),
): number {
  const day = parisYmd(startsAtIso);
  if (!day) return 0;
  return outings.filter((o) => {
    if (o.hostId !== hostId) return false;
    if (parisYmd(o.startsAt) !== day) return false;
    return outingOccupiesActiveSlot(o, requests, nowMs);
  }).length;
}

/**
 * Peut-on publier ?
 * - compte partenaire fermé → non
 * - culture partenaire : jusqu’à 5 invitations le même soir Paris
 * - particulier / resto|bar partenaire : 1 annonce active
 */
export function canPartnerOrUserCreateOuting(
  user: User,
  startsAtIso: string,
  outings: Outing[],
  requests: Request[],
  nowMs = Date.now(),
):
  | { ok: true }
  | {
      ok: false;
      reason: 'already_active' | 'partner_closed' | 'culture_evening_full';
    } {
  if (isPartnerClosed(user)) {
    return { ok: false, reason: 'partner_closed' };
  }
  if (isPartnerCultureHost(user)) {
    const sameEvening = countPartnerCultureSameEvening(
      user.id,
      startsAtIso,
      outings,
      requests,
      nowMs,
    );
    if (sameEvening >= PARTNER_CULTURE_MAX_SAME_EVENING) {
      return { ok: false, reason: 'culture_evening_full' };
    }
    return { ok: true };
  }
  const hasActive = outings.some(
    (o) =>
      o.hostId === user.id && outingOccupiesActiveSlot(o, requests, nowMs),
  );
  if (hasActive) return { ok: false, reason: 'already_active' };
  return { ok: true };
}

// ---------- Présence ----------

/**
 * Invité : « Je suis arrivé » dès H−15, jusqu’à la fin du soir (Paris).
 * Pas déjà présent. Si le lieu a déjà tapé « Pas venu », le bouton reste
 * dispo et ouvre un litige (pas de sanction auto).
 */
export function canGuestSelfArrivePartner(
  outing: Outing,
  request: Request,
  actorId: string,
  nowMs = Date.now(),
): boolean {
  if (!isPartnerListing(outing)) return false;
  if (outing.status === 'cancelled') return false;
  if (request.userId !== actorId) return false;
  if (request.status !== 'confirmed') return false;
  if (request.guestArrivedAt) return false;
  if (request.attendance === 'present') return false;
  const startMs = new Date(outing.startsAt).getTime();
  if (!Number.isFinite(startMs)) return false;
  if (nowMs < startMs - PARTNER_GUEST_ARRIVED_BEFORE_MS) return false;
  return isParisSameDay(outing.startsAt, nowMs);
}

/**
 * Lieu : « Pas venu » seulement si chaise vide, le soir même (après l’heure).
 * Si l’invité a tapé « Je suis arrivé » → litige (voir canPartnerFlagDispute).
 */
export function canPartnerMarkGuestAbsent(
  outing: Outing,
  request: Request,
  actorId: string,
  nowMs = Date.now(),
): boolean {
  if (!isPartnerListing(outing)) return false;
  if (outing.status === 'cancelled') return false;
  if (actorId !== outing.hostId) return false;
  if (request.status !== 'confirmed') return false;
  if (request.attendance || request.partnerDispute) return false;
  if (request.guestArrivedAt) return false;
  if (!isParisSameDay(outing.startsAt, nowMs)) return false;
  const startMs = new Date(outing.startsAt).getTime();
  if (!Number.isFinite(startMs)) return false;
  return nowMs >= startMs;
}

/** Lieu : invité « arrivé » mais chaise vide → litige (soir même). */
export function canPartnerFlagDispute(
  outing: Outing,
  request: Request,
  actorId: string,
  nowMs = Date.now(),
): boolean {
  if (!isPartnerListing(outing)) return false;
  if (outing.status === 'cancelled') return false;
  if (actorId !== outing.hostId) return false;
  if (request.status !== 'confirmed') return false;
  if (!request.guestArrivedAt || request.partnerDispute) return false;
  if (!isParisSameDay(outing.startsAt, nowMs)) return false;
  const startMs = new Date(outing.startsAt).getTime();
  return Number.isFinite(startMs) && nowMs >= startMs;
}

/**
 * Lendemain (Paris) : silence des deux → caution rendue, sans absence.
 * On ne pénalise pas le silence du lieu.
 */
export function shouldAutoRefundPartnerSilence(
  outing: Outing,
  request: Request,
  nowMs = Date.now(),
): boolean {
  if (!isPartnerListing(outing)) return false;
  if (request.status !== 'confirmed') return false;
  if (request.attendance || request.partnerDispute) return false;
  if (request.depositStatus !== 'held') return false;
  const outingDay = parisYmd(outing.startsAt);
  const today = parisYmd(nowMs);
  if (!outingDay || !today) return false;
  return outingDay < today;
}

// ---------- Fil ----------

/**
 * Max 2 partenaires en tête : proches + bientôt (pas de priorité systématique).
 * Démo pinned : compte parmi les 2, dispense de « proche ».
 */
export function pinPartnerOutingsNearSoon<
  T extends Outing & { travelMinutes?: number },
>(list: T[], viewerNeighborhood: string | undefined, nowMs = Date.now()): T[] {
  const scored = list
    .filter((o) => isPartnerListing(o))
    .map((o) => {
      const travel =
        o.travelMinutes ??
        (viewerNeighborhood
          ? getTravelMinutes(viewerNeighborhood, o.neighborhood)
          : 99);
      const startMs = new Date(o.startsAt).getTime();
      const ahead = startMs - nowMs;
      const pinned = o.partnerPinned === true;
      const soon =
        Number.isFinite(startMs) &&
        ahead >= -30 * 60 * 1000 &&
        ahead <= (pinned ? PARTNER_FEED_PINNED_SOON_MS : PARTNER_FEED_SOON_MS);
      const near = travel <= PARTNER_FEED_NEAR_MINUTES;
      return { o, travel, startMs, pinned, top: soon && (near || pinned) };
    })
    .filter((x) => x.top)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.startMs !== b.startMs) return a.startMs - b.startMs;
      return a.travel - b.travel;
    })
    .slice(0, PARTNER_FEED_PIN_MAX);

  if (!scored.length) return list;
  const topIds = new Set(scored.map((x) => x.o.id));
  return [...scored.map((x) => x.o), ...list.filter((o) => !topIds.has(o.id))];
}

/** +1 avertissement ; à 2 → compte partenaire fermé. */
export function nextPartnerWarningState(current: number): {
  partnerWarnings: number;
  closed: boolean;
} {
  const next = current + 1;
  return {
    partnerWarnings: next,
    closed: next >= PARTNER_WARNINGS_BEFORE_CLOSE,
  };
}
