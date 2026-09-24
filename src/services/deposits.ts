/**
 * Cautions — frontière future (Lot E scaffold).
 *
 * Mock actuel : `depositStatus` dans ChanceContext + `DEPOSIT_EUROS` (pricing.ts).
 * Taxonomie : docs/deposit-imprevu.md.
 *
 * Règle produit à rappeler partout :
 *   « carte enregistrée ≠ caution bloquée »
 * En Stripe TEST, SetupIntent (carte on-file) ≠ PaymentIntent/capture de la caution.
 *
 * TODO: brancher Stripe TEST (hold / release / forfeit) sans mode live.
 * Ne pas inventer amendes hors 20 € — voir « non tranché » dans deposit-imprevu.md.
 */

export type DepositStatus = 'none' | 'held' | 'returned' | 'forfeited';

export type DepositMutationResult =
  | { ok: true; status: DepositStatus }
  | { ok: false; reason: string };

/**
 * Port futur caution. Aujourd’hui : Alert + état local dans ChanceContext.
 */
export interface DepositsService {
  /** Bloque 20 € à la confirmation (idempotent). */
  hold(requestId: string): Promise<DepositMutationResult> | DepositMutationResult;
  /** Rend la caution (cancel ≥3 h, hôte annule, imprévu accepté…). */
  release(requestId: string): Promise<DepositMutationResult> | DepositMutationResult;
  /** Perd la caution (cancel <3 h, ghost…). */
  forfeit(requestId: string): Promise<DepositMutationResult> | DepositMutationResult;
  getStatus(requestId: string): Promise<DepositStatus> | DepositStatus;
}

/**
 * Stub no-op — pas de Stripe, pas de charge. La démo continue via Context.
 */
export const depositsStub: DepositsService = {
  hold() {
    return { ok: false, reason: 'not_wired_use_ChanceContext' };
  },
  release() {
    return { ok: false, reason: 'not_wired_use_ChanceContext' };
  },
  forfeit() {
    return { ok: false, reason: 'not_wired_use_ChanceContext' };
  },
  getStatus() {
    return 'none';
  },
};
