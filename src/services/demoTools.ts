/**
 * Outils démo / QA — frontière future (Lot E scaffold).
 *
 * Aujourd’hui : méthodes `simulate*` dans ChanceContext + DemoMenuModal
 * (accept hôte, trial end, course confirm, notifs locales, imprévu, etc.).
 *
 * Isoler ici plus tard pour que le Context « produit » ne porte plus le QA.
 * Ne pas exposer ces outils comme des APIs backend.
 */

export type DemoToolsService = {
  /** Simule l’acceptation hôte sur une demande pending. */
  simulateHostAccept(requestId: string): void;
  /** Expire l’essai (paywall). */
  simulateTrialEnd(): void;
  /** Décale startsAt pour tester chat H−1. */
  simulateOutingInMinutes(outingId: string, minutesAhead?: number): void;
  /** Course de confirmation capacité 1. */
  simulateConfirmRace(outingId: string):
    | { ok: true; winnerRequestId: string; loserRequestId: string }
    | { ok: false; reason: string };
  /** Envoie le set de notifs priorité (démo). */
  simulateLocalNotifications(outingTitle?: string): Promise<
    { ok: true; pushOk: boolean } | { ok: false; reason: string }
  >;
  resetDemo(): void;
};

/**
 * Stub : refuse — la démo reste branchée sur ChanceContext.
 */
export const demoToolsStub: DemoToolsService = {
  simulateHostAccept() {
    /* not wired */
  },
  simulateTrialEnd() {
    /* not wired */
  },
  simulateOutingInMinutes() {
    /* not wired */
  },
  simulateConfirmRace() {
    return { ok: false, reason: 'not_wired_use_ChanceContext' };
  },
  async simulateLocalNotifications() {
    return { ok: false, reason: 'not_wired_use_ChanceContext' };
  },
  resetDemo() {
    /* not wired */
  },
};
