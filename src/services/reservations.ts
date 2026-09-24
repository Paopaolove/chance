/**
 * Réservations — frontière future (Lot E scaffold).
 *
 * Aujourd’hui la machine à places vit dans `ChanceContext` (accept / confirmSlot /
 * cancelRequest / closeOuting / cancelOuting / completeOuting, deadline 10 min).
 * Ce module documente l’API cible sans migrer la logique.
 *
 * TODO: extraire le reducer réservations hors Context ; persister via Supabase
 * (tables outings / requests — docs/backend-prep.md).
 */

import type { OutingStatus, RequestStatus } from '../data/types';

/** Résultat d’une mutation réservation (aligné sur le Context actuel). */
export type ReservationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'expired'
        | 'invalid'
        | 'paywall'
        | 'race_lost'
        | 'no_user'
        | 'already_active'
        | 'banned'
        | string;
    };

export type ConfirmSlotResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'expired'
        | 'invalid'
        | 'paywall'
        | 'race_lost'
        | 'not_wired_use_ChanceContext';
    };

/**
 * Port futur — implémenté aujourd’hui par ChanceContext (mock local).
 * Ne pas brancher ce stub depuis l’UI tant que le Context n’a pas délégué.
 */
export interface ReservationsService {
  /** Hôte accepte → réserve une place, fenêtre CONFIRM_WINDOW_MS. */
  acceptRequest(requestId: string): Promise<ReservationResult> | ReservationResult;
  /** Invité confirme (idempotent ; caution via DepositsService). */
  confirmSlot(requestId: string): Promise<ConfirmSlotResult> | ConfirmSlotResult;
  cancelRequest(
    requestId: string,
    by?: 'guest' | 'host',
  ):
    | Promise<ReservationResult & { depositReturned?: boolean; depositForfeited?: boolean }>
    | (ReservationResult & { depositReturned?: boolean; depositForfeited?: boolean });
  closeOuting(outingId: string): Promise<ReservationResult> | ReservationResult;
  cancelOuting(outingId: string): Promise<ReservationResult> | ReservationResult;
  completeOuting(outingId: string): Promise<ReservationResult> | ReservationResult;
}

/**
 * Stub no-op : documente la frontière. Toute logique réelle reste dans ChanceContext.
 * Appelé uniquement si un futur adaptateur backend est branché.
 */
export const reservationsStub: ReservationsService = {
  acceptRequest() {
    return { ok: false, reason: 'not_wired_use_ChanceContext' };
  },
  confirmSlot() {
    return { ok: false, reason: 'not_wired_use_ChanceContext' };
  },
  cancelRequest() {
    return { ok: false, reason: 'not_wired_use_ChanceContext' };
  },
  closeOuting() {
    return { ok: false, reason: 'not_wired_use_ChanceContext' };
  },
  cancelOuting() {
    return { ok: false, reason: 'not_wired_use_ChanceContext' };
  },
  completeOuting() {
    return { ok: false, reason: 'not_wired_use_ChanceContext' };
  },
};

/** Helpers de doc — pas utilisés par l’UI démo. */
export type ReservationStatusSnapshot = {
  outingStatus: OutingStatus;
  requestStatus: RequestStatus;
};
