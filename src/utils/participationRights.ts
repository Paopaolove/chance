/**
 * Lot 6 — droits : acteur, participation, état.
 * Avis seulement si présent ; sanctions une seule fois par événement ;
 * crédit / fermeture de compte selon qui agit et l’état réel.
 */

/** Guest absences: 2 → priorité baissée ; 3 → compte fermé. */
export function guestSanctionFromStrike(strike: number): {
  lowerPriority: boolean;
  banned: boolean;
} {
  return {
    lowerPriority: strike >= 2,
    banned: strike >= 3,
  };
}

/**
 * 25/10 · Barème invité sur 3 mois glissants, absences retenues seulement :
 * 1re rien d’autre que la caution, 2e priorité baissée, 3e fermeture.
 * Une absence encore contestée n’est pas retenue (pas comptée) : aucune
 * fermeture tant qu’une contestation est en attente.
 */
export const GUEST_STRIKE_WINDOW_MONTHS = 3;

export type GuestNoShowLogEntry = { requestId: string; at: string };

/** Début (exclu) de la fenêtre de 3 mois glissants qui finit à atMs. */
export function guestStrikeWindowStartMs(atMs: number): number {
  const d = new Date(atMs);
  d.setUTCMonth(d.getUTCMonth() - GUEST_STRIKE_WINDOW_MONTHS);
  return d.getTime();
}

/**
 * Absences retenues dans les 3 mois glissants avant atMs (inclus).
 * Compteur ancien sans date (état antérieur au 25/10) : compté comme récent.
 */
export function guestStrikesInWindow(
  total: number,
  log: GuestNoShowLogEntry[] | undefined,
  atMs: number,
): number {
  const entries = log ?? [];
  const from = guestStrikeWindowStartMs(atMs);
  const dated = entries.filter((e) => {
    const t = new Date(e.at).getTime();
    return Number.isFinite(t) && t > from && t <= atMs;
  }).length;
  const undated = Math.max(0, total - entries.length);
  return dated + undated;
}

/**
 * 25/10 · Lot C : priorité baissée / mention recalculées à l’instant nowMs.
 * Une absence qui sort des 3 mois glissants ne compte plus : la priorité
 * baissée se lève d’elle-même (pas de minuterie serveur, recalcul à la lecture).
 * La fermeture du compte n’est jamais levée par le temps (voir l’appelant).
 */
export function guestSanctionAt(
  total: number,
  log: GuestNoShowLogEntry[] | undefined,
  nowMs: number,
): { strikesInWindow: number; lowerPriority: boolean; banned: boolean } {
  const strikesInWindow = guestStrikesInWindow(total, log, nowMs);
  return { strikesInWindow, ...guestSanctionFromStrike(strikesInWindow) };
}

/**
 * Hôte déclaré « Pas venu » (25/10 soir, rétabli après 78284a1) : barème figé,
 * distinct du barème invité (pas de fenêtre 3 mois). Compte sur les absences
 * d’hôte **retenues** : 1 = avertissement ; 2+ = compte fermé.
 */
export function hostNoShowSanctionFromStrike(strike: number): { banned: boolean } {
  return { banned: strike >= 2 };
}

/** Publication jamais honorée (hors barème « Pas venu ») : 1 = avertissement ; 2 → compte suspendu. */
export function hostPublishSanctionFromStrike(strike: number): { banned: boolean } {
  return { banned: strike >= 2 };
}

/** Only the request owner may confirm (and thus consume their credit). */
export function canActorConfirmSlot(
  actorId: string,
  requestUserId: string,
): boolean {
  return actorId === requestUserId;
}

/**
 * Guest absence report: host of the outing, or the guest themselves
 * (auto-aveu / outil démo « Simuler mon absence »).
 */
export function canActorReportGuestNoShow(
  actorId: string,
  hostId: string,
  guestId: string,
): boolean {
  return actorId === hostId || actorId === guestId;
}

/** Host no-show report: a confirmed guest on that outing (not the host). */
export function canActorReportHostNoShow(
  actorId: string,
  hostId: string,
  actorIsConfirmedGuest: boolean,
): boolean {
  return actorId !== hostId && actorIsConfirmedGuest;
}

/** Presence mark: only the host. */
export function canActorMarkGuestPresent(
  actorId: string,
  hostId: string,
): boolean {
  return actorId === hostId;
}

/** Peer block (local) — not account close. Self forbidden. */
export function canActorBlockUser(actorId: string, targetId: string): boolean {
  return Boolean(actorId) && Boolean(targetId) && actorId !== targetId;
}

// --- self-checks (node -e / tsc) ---
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`participationRights: ${msg}`);
}
assert(guestSanctionFromStrike(1).lowerPriority === false, 'g1 prio');
assert(guestSanctionFromStrike(1).banned === false, 'g1 ban');
assert(guestSanctionFromStrike(2).lowerPriority === true, 'g2 prio');
assert(guestSanctionFromStrike(2).banned === false, 'g2 ban');
assert(guestSanctionFromStrike(3).banned === true, 'g3 ban');
assert(hostNoShowSanctionFromStrike(1).banned === false, 'h1');
assert(hostNoShowSanctionFromStrike(2).banned === true, 'h2 (25/10 soir : 2e absence hôte retenue = compte fermé)');
assert(hostPublishSanctionFromStrike(2).banned === true, 'publish 2');
assert(canActorConfirmSlot('a', 'a') && !canActorConfirmSlot('a', 'b'), 'confirm');
assert(
  canActorReportGuestNoShow('host', 'host', 'guest') &&
    canActorReportGuestNoShow('guest', 'host', 'guest') &&
    !canActorReportGuestNoShow('other', 'host', 'guest'),
  'guest noshow actor',
);
assert(
  canActorReportHostNoShow('guest', 'host', true) &&
    !canActorReportHostNoShow('host', 'host', false) &&
    !canActorReportHostNoShow('x', 'host', false),
  'host noshow actor',
);
assert(canActorMarkGuestPresent('host', 'host'), 'mark present');
assert(!canActorBlockUser('a', 'a') && canActorBlockUser('a', 'b'), 'block');
