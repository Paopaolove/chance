import { ESSENTIEL_OUTINGS_PER_MONTH } from '../data/pricing';
import { PlanId, PlanInterval, User } from '../data/types';

export type ConfirmGateReason =
  | 'ok'
  | 'no_user'
  | 'trial_expired_need_plan'
  | 'payg_no_credits'
  | 'essentiel_no_credits';

export type ConfirmGateResult = {
  ok: boolean;
  reason: ConfirmGateReason;
  /** Human-readable FR hint for UI. */
  message?: string;
};

/** Trial still active (unlimited confirmations). */
export function isTrialActive(
  user: Pick<User, 'trialEndsAt'> | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!user?.trialEndsAt) return false;
  return new Date(user.trialEndsAt).getTime() > nowMs;
}

/** Whole days left in trial (0 if expired). */
export function trialDaysRemaining(
  user: Pick<User, 'trialEndsAt'> | null | undefined,
  nowMs = Date.now(),
): number {
  if (!user?.trialEndsAt) return 0;
  const ms = new Date(user.trialEndsAt).getTime() - nowMs;
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** Large host photo when viewer is on active trial or a paid subscription. */
export function hasFullPhotoAccess(
  user: Pick<User, 'plan' | 'trialEndsAt'> | null | undefined,
): boolean {
  if (!user) return false;
  if (isTrialActive(user)) return true;
  return user.plan === 'essentiel' || user.plan === 'illimite';
}

/** @deprecated Prefer hasFullPhotoAccess(user) — kept for call sites passing plan only during trial. */
export function hasFullPhotoAccessByPlan(
  plan: PlanId | undefined | null,
): boolean {
  return plan === 'essai' || plan === 'essentiel' || plan === 'illimite';
}

/** Avatar size before accept: large if subscribed/trial, small otherwise. */
export function hostPhotoSize(
  userOrPlan:
    | Pick<User, 'plan' | 'trialEndsAt'>
    | PlanId
    | undefined
    | null,
): number {
  if (userOrPlan == null) return 36;
  if (typeof userOrPlan === 'string') {
    return hasFullPhotoAccessByPlan(userOrPlan) ? 72 : 36;
  }
  return hasFullPhotoAccess(userOrPlan) ? 72 : 36;
}

export function outingCreditsOf(user: Pick<User, 'outingCredits'>): number {
  return user.outingCredits ?? 0;
}

/**
 * Whether the guest may confirm a seat (host publishing stays free).
 * Trial → unlimited; Illimité → unlimited; Essentiel → credits; Payg → needs ≥1 credit.
 */
export function canConfirmOuting(
  user: User | null | undefined,
  nowMs = Date.now(),
): ConfirmGateResult {
  if (!user) {
    return { ok: false, reason: 'no_user', message: 'Profil manquant.' };
  }
  if (isTrialActive(user, nowMs)) {
    return { ok: true, reason: 'ok' };
  }
  if (user.plan === 'illimite') {
    return { ok: true, reason: 'ok' };
  }
  if (user.plan === 'essentiel') {
    if (outingCreditsOf(user) > 0) {
      return { ok: true, reason: 'ok' };
    }
    return {
      ok: false,
      reason: 'essentiel_no_credits',
      message:
        'Plus de sorties Essentiel ce mois-ci. Passe en Illimité ou rachète un mois.',
    };
  }
  if (user.plan === 'payg') {
    if (outingCreditsOf(user) > 0) {
      return { ok: true, reason: 'ok' };
    }
    return {
      ok: false,
      reason: 'payg_no_credits',
      message: 'Achète une sortie (6,90 €) pour confirmer ta place.',
    };
  }
  // essai expired or unknown / none
  return {
    ok: false,
    reason: 'trial_expired_need_plan',
    message:
      'Ton essai 1 mois est terminé. Choisis une formule pour confirmer une place.',
  };
}

/** Credits granted when mock-subscribing. */
export function creditsForSubscribe(
  plan: PlanId,
  _interval?: PlanInterval | null,
): number {
  if (plan === 'payg') return 1;
  if (plan === 'essentiel') return ESSENTIEL_OUTINGS_PER_MONTH;
  if (plan === 'illimite') return 0; // unlimited — ignore credits
  return 0;
}

/** Whether confirming should decrement outingCredits. */
export function shouldConsumeCreditOnConfirm(
  user: User,
  nowMs = Date.now(),
): boolean {
  if (isTrialActive(user, nowMs)) return false;
  if (user.plan === 'illimite') return false;
  return user.plan === 'essentiel' || user.plan === 'payg';
}
