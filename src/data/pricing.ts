import { PlanId } from './types';

export type PlanInterval = 'month' | 'year';

/** Authoritative Moment pricing (post J+30 trial). */
export const DEPOSIT_EUROS = 20;

/** Part plateforme quand la caution est perdue (annulation tardive / absence). */
export const DEPOSIT_FORFEIT_CHANCE_EUROS = 6.9;

/** Part hôte quand la caution est perdue. */
export const DEPOSIT_FORFEIT_HOST_EUROS = 13.1;

/**
 * 25/10 soir · Partenaire calé The Fork : absence retenue sur un moment
 * partenaire (lieu qui décoche, sans contestation à 24 h ou revue retenue) →
 * les 20 € entiers vont au lieu (pas le partage 6,90 / 13,10).
 */
export const DEPOSIT_FORFEIT_PARTNER_VENUE_EUROS = DEPOSIT_EUROS;

/**
 * Annulation au moins N heures avant startsAt → caution rendue (heure serveur).
 * 25/10 soir · Annulation invité : H−1 (plus 3 h). H−1 pile = encore rendue.
 */
export const CANCEL_FREE_BEFORE_HOURS = 1;

export function isCancelFreeWindow(
  startsAtIso: string,
  nowMs: number = Date.now(),
): boolean {
  const start = new Date(startsAtIso).getTime();
  if (!Number.isFinite(start)) return false;
  return start - nowMs >= CANCEL_FREE_BEFORE_HOURS * 60 * 60 * 1000;
}

export const ESSENTIEL_OUTINGS_PER_MONTH = 4;

export const PRICING = {
  trial: {
    id: 'essai' as const,
    title: 'Essai',
    label: 'Essai 1 mois ILLIMITÉ',
    detail: 'Inclus à l’inscription — moments sans limite pendant 30 jours',
  },
  payg: {
    id: 'payg' as const,
    title: 'À l’unité',
    priceEuros: 6.9,
    priceLabel: '6,90 €',
    detail: 'Paiement à chaque moment confirmé',
    label: 'À l’unité — 6,90 € / moment',
  },
  essentiel: {
    id: 'essentiel' as const,
    title: 'Essentiel',
    outingsPerMonth: ESSENTIEL_OUTINGS_PER_MONTH,
    month: { priceEuros: 12.9, priceLabel: '12,90 €/mois' },
    year: { priceEuros: 119, priceLabel: '119 €/an' },
    detail: '4 moments inclus par mois',
    labelMonth: 'Essentiel — 12,90 €/mois (4 moments)',
    labelYear: 'Essentiel — 119 €/an',
  },
  illimite: {
    id: 'illimite' as const,
    title: 'Illimité',
    month: { priceEuros: 19.9, priceLabel: '19,90 €/mois' },
    year: { priceEuros: 189, priceLabel: '189 €/an' },
    detail: 'Moments sans limite',
    labelMonth: 'Illimité — 19,90 €/mois',
    labelYear: 'Illimité — 189 €/an',
  },
  deposit: {
    euros: DEPOSIT_EUROS,
    label: `Caution ${DEPOSIT_EUROS} € à la confirmation (carte)`,
  },
} as const;

/** Flat labels for profile / onboarding reminders. */
export const pricing = {
  trial: PRICING.trial.label,
  payg: PRICING.payg.label,
  essentielMonth: PRICING.essentiel.labelMonth,
  essentielYear: PRICING.essentiel.labelYear,
  illimiteMonth: PRICING.illimite.labelMonth,
  illimiteYear: PRICING.illimite.labelYear,
  deposit: PRICING.deposit.label,
} as const;

export type SubscribeablePlanId = Exclude<PlanId, 'essai'>;

export type PlanOffer = {
  id: SubscribeablePlanId;
  title: string;
  detail: string;
  /** Single price (payg) or month/year options. */
  kind: 'payg' | 'subscription';
  priceLabel?: string;
  monthLabel?: string;
  yearLabel?: string;
};

export const PLAN_OFFERS: PlanOffer[] = [
  {
    id: 'payg',
    title: PRICING.payg.title,
    detail: PRICING.payg.detail,
    kind: 'payg',
    priceLabel: PRICING.payg.priceLabel,
  },
  {
    id: 'essentiel',
    title: PRICING.essentiel.title,
    detail: PRICING.essentiel.detail,
    kind: 'subscription',
    monthLabel: PRICING.essentiel.month.priceLabel,
    yearLabel: PRICING.essentiel.year.priceLabel,
  },
  {
    id: 'illimite',
    title: PRICING.illimite.title,
    detail: PRICING.illimite.detail,
    kind: 'subscription',
    monthLabel: PRICING.illimite.month.priceLabel,
    yearLabel: PRICING.illimite.year.priceLabel,
  },
];

export function formatPriceEuros(value: number): string {
  return value.toFixed(2).replace('.', ',') + ' €';
}

/** Libellé court du partage caution perdue (6,90 / 13,10). */
export function describeDepositForfeitSplit(): string {
  return `${formatPriceEuros(DEPOSIT_FORFEIT_CHANCE_EUROS)} pour Moment, ${formatPriceEuros(DEPOSIT_FORFEIT_HOST_EUROS)} pour l’hôte`;
}

/** Phrase UI au moment de la perte (Alert / bannière). */
export function describeDepositForfeitMoment(): string {
  return `Caution ${DEPOSIT_EUROS} € perdue : ${describeDepositForfeitSplit()}.`;
}

/** Libellés FR courts pour depositStatus (UI). */
export const DEPOSIT_STATUS_LABELS = {
  none: 'Pas de caution',
  held: 'Caution bloquée',
  returned: 'Caution rendue',
  forfeited: 'Caution perdue',
  /** Vue invité seulement (l’hôte voit la projection hostDepositStatus). */
  returned_discomfort_leave: 'Caution remboursée',
  /** « Pas venu » de l’hôte : 24 h pour contester (vue hôte : en attente). */
  noshow_pending: 'Caution en attente',
  /** Vue invité seulement : contestation en revue. */
  contested: 'Caution en attente de revue',
} as const;

export type DepositStatusKey = keyof typeof DEPOSIT_STATUS_LABELS;

/**
 * Phrase UI pour l’issue caution (mock).
 * Forfeit → split 6,90 Moment / 13,10 hôte (pas d’autre amende).
 */
export function describeDepositOutcome(
  status: DepositStatusKey | undefined,
): string {
  switch (status) {
    case 'held':
      return `Caution ${DEPOSIT_EUROS} € bloquée à la confirmation. Rendue si tu annules au moins ${CANCEL_FREE_BEFORE_HOURS} heure avant, si l’hôte annule / ne vient pas, si un imprévu est accepté (ou joker), ou si tu refuses un lieu alternatif. Perdue si annulation trop tard ou absence.`;
    case 'returned':
      return `Caution ${DEPOSIT_EUROS} € rendue.`;
    case 'returned_discomfort_leave':
      // Vue invité : départ malaise, caution rendue intégralement.
      return `Caution ${DEPOSIT_EUROS} € remboursée.`;
    case 'forfeited':
      return describeDepositForfeitMoment();
    case 'noshow_pending':
      return `« Pas venu » signalé par l’hôte. Caution ${DEPOSIT_EUROS} € en attente 24 h : tu peux contester avec une phrase ; sans contestation, elle est perdue (${describeDepositForfeitSplit()}).`;
    case 'contested':
      return `Contestation envoyée. Caution ${DEPOSIT_EUROS} € en attente de revue.`;
    case 'none':
    case undefined:
      return 'Aucune caution bloquée.';
    default: {
      // Exhaustivité : tout nouveau statut doit être traité ci-dessus.
      const unhandled: never = status;
      return unhandled;
    }
  }
}
