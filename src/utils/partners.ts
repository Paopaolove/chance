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
import { parisYmd } from './parisTime';
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

// ---------- Présence (25/10 soir · Partenaire calé The Fork) ----------

/** Fenêtre de déclaration d’absence : 6 h après le début (même borne que depositH6). */
const PARTNER_ABSENCE_DECLARATION_MS = 6 * 60 * 60 * 1000;

/** Liste du lieu : notification et action à partir de H+30. */
export const PARTNER_VENUE_CHECK_AFTER_MS = 30 * 60 * 1000;

/** Message à l’invité décoché. */
export const PARTNER_VENUE_ABSENT_TEXT = 'Le lieu t’a marqué absent';

/** Barème partenaire : 4 absences retenues sur 12 mois glissants → compte fermé. */
export const PARTNER_NOSHOW_WINDOW_MONTHS = 12;
export const PARTNER_NOSHOW_BAN_AT = 4;

/**
 * Invité : « Je suis arrivé » dès H−15, jusqu’à H+6. 25/10 soir : simple
 * signal pour le lieu — ne rend pas l’argent, ne vaut pas présence. Plus
 * possible une fois la liste du lieu faite (décoché → contestation).
 */
export function canGuestSelfArrivePartner(
  outing: Outing,
  request: Request,
  actorId: string,
  nowMs = Date.now(),
): boolean {
  if (!isPartnerListing(outing)) return false;
  if (outing.status === 'cancelled') return false;
  if (outing.partnerVenueCheck) return false;
  if (request.userId !== actorId) return false;
  if (request.status !== 'confirmed') return false;
  if (request.guestArrivedAt) return false;
  if (request.attendance) return false;
  if (request.leftTableAt) return false;
  const startMs = new Date(outing.startsAt).getTime();
  if (!Number.isFinite(startMs)) return false;
  if (nowMs < startMs - PARTNER_GUEST_ARRIVED_BEFORE_MS) return false;
  return nowMs < startMs + PARTNER_ABSENCE_DECLARATION_MS;
}

/**
 * Invités sur la liste du lieu : confirmés, caution encore bloquée, ni
 * présence ni absence déjà renseignée, pas partis de la table.
 */
export function partnerVenueCheckRequests<R extends Request>(
  outing: Pick<Outing, 'id'>,
  requests: R[],
): R[] {
  return requests.filter(
    (r) =>
      r.outingId === outing.id &&
      r.status === 'confirmed' &&
      !r.attendance &&
      !r.leftTableAt &&
      !r.noShowVoided &&
      !r.noShowNotRetained &&
      (r.depositStatus === 'held' || !r.depositStatus),
  );
}

/** Prénoms confirmés de la liste (sans « (démo) »), pour la notification H+30. */
export function partnerVenueCheckFirstNames(
  outing: Pick<Outing, 'id'>,
  requests: Request[],
): string[] {
  return partnerVenueCheckRequests(outing, requests).map(
    (r) => r.userName.replace(/\s*\(démo\)\s*$/, '').trim().split(/\s+/)[0] ?? r.userName,
  );
}

/** Corps de la notification H+30 au lieu : la liste des prénoms confirmés. */
export function partnerVenueCheckNotifBody(names: string[]): string {
  const list = names.length ? names.join(', ') : 'personne';
  return `Confirmés : ${list}. « Table complète », ou décoche qui n’est pas là.`;
}

export type PartnerVenueCheckRefusal =
  | 'not_partner_listing'
  | 'not_host'
  | 'cancelled'
  | 'already_done'
  | 'too_early'
  | 'too_late'
  | 'host_no_show'
  | 'nobody';

/**
 * Lieu : la liste (Table complète / décocher) est la seule action du soir.
 * Une fois, de H+30 à H+6 inclus. Après H+6 : silence, cautions rendues.
 */
export function partnerVenueCheckRefusal(
  outing: Outing,
  requests: Request[],
  actorId: string,
  nowMs = Date.now(),
): PartnerVenueCheckRefusal | null {
  if (!isPartnerListing(outing)) return 'not_partner_listing';
  if (actorId !== outing.hostId) return 'not_host';
  if (outing.status === 'cancelled') return 'cancelled';
  if (outing.partnerVenueCheck) return 'already_done';
  // Lieu déclaré absent par un invité : cautions en attente, pas de liste.
  if (outing.hostNoShowReported) return 'host_no_show';
  const startMs = new Date(outing.startsAt).getTime();
  if (!Number.isFinite(startMs)) return 'too_early';
  if (nowMs < startMs + PARTNER_VENUE_CHECK_AFTER_MS) return 'too_early';
  if (nowMs > startMs + PARTNER_ABSENCE_DECLARATION_MS) return 'too_late';
  if (!partnerVenueCheckRequests(outing, requests).length) return 'nobody';
  return null;
}

export function canPartnerVenueCheck(
  outing: Outing,
  requests: Request[],
  actorId: string,
  nowMs = Date.now(),
): boolean {
  return partnerVenueCheckRefusal(outing, requests, actorId, nowMs) === null;
}

/** Début (exclu) de la fenêtre de 12 mois glissants qui finit à atMs. */
export function partnerNoShowWindowStartMs(atMs: number): number {
  const d = new Date(atMs);
  d.setUTCMonth(d.getUTCMonth() - PARTNER_NOSHOW_WINDOW_MONTHS);
  return d.getTime();
}

/** Absences partenaires retenues dans les 12 mois glissants avant atMs (inclus). */
export function partnerNoShowsInWindow(
  log: { requestId: string; at: string }[] | undefined,
  atMs: number,
): number {
  const from = partnerNoShowWindowStartMs(atMs);
  return (log ?? []).filter((e) => {
    const t = new Date(e.at).getTime();
    return Number.isFinite(t) && t > from && t <= atMs;
  }).length;
}

/** 4 absences retenues sur 12 mois (moments partenaires) → compte fermé. */
export function partnerNoShowSanction(countInWindow: number): { banned: boolean } {
  return { banned: countInWindow >= PARTNER_NOSHOW_BAN_AT };
}

/**
 * 25/10 soir · même horloge que la table : silence des deux à H+6 → caution
 * rendue, sans absence (avant : « le lendemain »). On ne pénalise pas le silence
 * du lieu. Le minuteur passe par `shouldReturnDepositH6` / RETURN_DEPOSITS_H6 (depositH6).
 */
export function shouldAutoRefundPartnerSilence(
  outing: Outing,
  request: Request,
  nowMs = Date.now(),
): boolean {
  if (!isPartnerListing(outing)) return false;
  // Lieu déclaré absent, en délai ou en revue : cautions en attente.
  const hs = outing.hostNoShowCase?.status;
  if (hs === 'pending' || hs === 'contested') return false;
  if (request.status !== 'confirmed') return false;
  if (request.attendance || request.partnerDispute) return false;
  if (request.depositStatus !== 'held') return false;
  if (outing.status === 'cancelled') return false;
  // Même borne que `isAtOrAfterH6` (depositH6) : à partir de H+6 inclus.
  const startMs = new Date(outing.startsAt).getTime();
  return Number.isFinite(startMs) && nowMs >= startMs + PARTNER_ABSENCE_DECLARATION_MS;
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
