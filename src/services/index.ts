/**
 * Services — séparation de concerns (Lot E).
 *
 * État actuel : monolith `src/data/ChanceContext.tsx` (mock + UI wiring).
 * Ce dossier = ports / stubs pour une extraction progressive :
 *   reservations | deposits | notifications | demoTools
 *   + supabase / stripe (TEST, no-op sans env)
 *
 * Ne pas importer ces stubs depuis les écrans tant que le Context n’a pas délégué —
 * sinon double source de vérité. La démo reste 100 % Context.
 */

export {
  getBackendEnv,
  isBackendConfigured,
  isSupabaseConfigured,
  isStripeTestConfigured,
  type BackendEnv,
} from './config';

export {
  reservationsStub,
  type ReservationsService,
  type ReservationResult,
  type ConfirmSlotResult,
  type ReservationStatusSnapshot,
} from './reservations';

export {
  depositsStub,
  type DepositsService,
  type DepositStatus,
  type DepositMutationResult,
} from './deposits';

export {
  notificationsStub,
  type NotificationsService,
  type NotifyPriorityInput,
} from './notifications';

export { demoToolsStub, type DemoToolsService } from './demoTools';

export {
  getSupabaseClient,
  hasSupabaseEnv,
  type SupabaseClientStub,
} from './supabase';

export {
  getStripeTestStatus,
  prepareSaveCardTest,
  prepareHoldDepositTest,
  STRIPE_LIVE_ENABLED,
  type StripeTestStatus,
} from './stripe';
