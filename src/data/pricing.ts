import { PlanId } from './types';

export type PlanInterval = 'month' | 'year';

/** Authoritative Chance pricing (post J+30 trial). */
export const DEPOSIT_EUROS = 20;

/** Part plateforme quand la caution est perdue (annulation tardive / absence). */
export const DEPOSIT_FORFEIT_CHANCE_EUROS = 6.9;

/** Part hôte quand la caution est perdue. */
export const DEPOSIT_FORFEIT_HOST_EUROS = 13.1;

/** Annulation au moins N heures avant startsAt → caution rendue (heure serveur). */
export const CANCEL_FREE_BEFORE_HOURS = 3;

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
    detail: 'Inclus à l’inscription — sorties sans limite pendant 30 jours',
  },
  payg: {
    id: 'payg' as const,
    title: 'À la sortie',
    priceEuros: 6.9,
    priceLabel: '6,90 €',
    detail: 'Paiement à chaque sortie confirmée',
    label: 'À la sortie — 6,90 € / sortie',
  },
  essentiel: {
    id: 'essentiel' as const,
    title: 'Essentiel',
    outingsPerMonth: ESSENTIEL_OUTINGS_PER_MONTH,
    month: { priceEuros: 12.9, priceLabel: '12,90 €/mois' },
    year: { priceEuros: 119, priceLabel: '119 €/an' },
    detail: '4 sorties incluses par mois',
    labelMonth: 'Essentiel — 12,90 €/mois (4 sorties)',
    labelYear: 'Essentiel — 119 €/an',
  },
  illimite: {
    id: 'illimite' as const,
    title: 'Illimité',
    month: { priceEuros: 19.9, priceLabel: '19,90 €/mois' },
    year: { priceEuros: 189, priceLabel: '189 €/an' },
    detail: 'Sorties sans limite',
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
  return `${formatPriceEuros(DEPOSIT_FORFEIT_CHANCE_EUROS)} pour Chance, ${formatPriceEuros(DEPOSIT_FORFEIT_HOST_EUROS)} pour l’hôte`;
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
} as const;

export type DepositStatusKey = keyof typeof DEPOSIT_STATUS_LABELS;

/**
 * Phrase UI pour l’issue caution (mock).
 * Forfeit → split 6,90 Chance / 13,10 hôte (pas d’autre amende).
 */
export function describeDepositOutcome(
  status: DepositStatusKey | undefined,
): string {
  switch (status) {
    case 'held':
      return `Caution ${DEPOSIT_EUROS} € bloquée à la confirmation. Rendue si tu annules au moins ${CANCEL_FREE_BEFORE_HOURS} heures avant, si l’hôte annule / ne vient pas, si un imprévu est accepté (ou joker), ou si tu refuses un lieu alternatif. Perdue si annulation trop tard ou absence.`;
    case 'returned':
      return `Caution ${DEPOSIT_EUROS} € rendue.`;
    case 'forfeited':
      return describeDepositForfeitMoment();
    case 'none':
    default:
      return 'Aucune caution bloquée.';
  }
}
