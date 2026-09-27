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

/** Host no-shows: 1 = avertissement ; 2 → compte fermé. */
export function hostSanctionFromStrike(strike: number): { banned: boolean } {
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
assert(hostSanctionFromStrike(1).banned === false, 'h1');
assert(hostSanctionFromStrike(2).banned === true, 'h2');
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
