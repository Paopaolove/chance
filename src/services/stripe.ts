/**
 * Stripe TEST — scaffold uniquement (Lot E).
 *
 * INTERDIT ici :
 * - mode live / clés pk_live_ / sk_live_
 * - charge réelle, capture caution réelle
 * - vendre le mock Alert comme un paiement Stripe
 *
 * Produit :
 * - Abonnements + caution 20 € via Stripe TEST plus tard
 * - « Carte enregistrée ≠ caution bloquée » :
 *   SetupIntent (carte on-file) ≠ Authorization/PaymentIntent de la caution
 *
 * Sans STRIPE_PUBLISHABLE_KEY_TEST : tout no-op, démo intacte.
 */

import { getBackendEnv, isStripeTestConfigured } from './config';

export type StripeTestStatus = {
  configured: boolean;
  mode: 'test' | 'unavailable';
  /** Toujours false tant que le SDK n’est pas branché. */
  canCharge: false;
};

export function getStripeTestStatus(): StripeTestStatus {
  const configured = isStripeTestConfigured();
  return {
    configured,
    mode: configured ? 'test' : 'unavailable',
    canCharge: false,
  };
}

/**
 * Enregistrement carte (futur SetupIntent) — no-op.
 * Ne bloque PAS une caution.
 */
export async function prepareSaveCardTest(): Promise<
  | { ok: true; simulated: true; message: string }
  | { ok: false; reason: string }
> {
  if (!isStripeTestConfigured()) {
    return {
      ok: false,
      reason: 'stripe_test_key_missing',
    };
  }
  const key = getBackendEnv().stripePublishableKeyTest;
  if (key?.startsWith('pk_live_')) {
    return { ok: false, reason: 'live_key_rejected' };
  }
  return {
    ok: true,
    simulated: true,
    message:
      'Scaffold only — pas de SetupIntent réel. Carte enregistrée ≠ caution bloquée.',
  };
}

/**
 * Hold caution 20 € (futur PaymentIntent TEST) — no-op explicite.
 * La démo utilise toujours ChanceContext + Alert.
 */
export async function prepareHoldDepositTest(_requestId: string): Promise<
  | { ok: true; simulated: true; amountEuros: 20; message: string }
  | { ok: false; reason: string }
> {
  if (!isStripeTestConfigured()) {
    return { ok: false, reason: 'stripe_test_key_missing' };
  }
  return {
    ok: true,
    simulated: true,
    amountEuros: 20,
    message:
      'Scaffold only — pas de hold Stripe. Mock caution = ChanceContext (depositStatus).',
  };
}

/** Garde-fou documentaire : ce module n’active jamais le live. */
export const STRIPE_LIVE_ENABLED = false as const;
