/**
 * Codes de refus → français clair pour les alertes. Un code brut
 * (snake_case) ne doit jamais apparaître à l’écran.
 * Le parcours précise le libellé quand un même code n’a pas le même sens
 * (« Pas venu » hôte, « Pas venu » lieu partenaire, « Marquer présent »).
 */
export type RefusalFlow = 'noshow' | 'partner_noshow' | 'presence' | 'host_noshow';

const LABELS: Record<string, string> = {
  // « Pas venu » (reportGuestNoShow) — table normale
  no_user: 'Connecte-toi pour continuer.',
  not_found: 'Ce moment n’existe plus.',
  not_confirmed: 'Cette personne n’a pas de place confirmée.',
  outing_cancelled: 'Ce moment a été annulé.',
  not_participant: 'Seuls l’hôte de la table ou la personne concernée peuvent signaler cette absence.',
  already_present: 'Cette personne est marquée présente.',
  too_early: 'Possible seulement à partir de l’heure du moment.',
  too_late: '« Pas venu » n’est plus possible 6 h après le début. La caution est rendue d’office.',
  host_no_show: 'Tu as été déclaré « Pas venu » sur cette table : tu ne peux plus signaler d’absence.',
  not_allowed_now: '« Pas venu » n’est possible qu’à partir de l’heure du moment et avant 6 h après le début.',
  not_retained: 'Absence non retenue après contestation : elle ne peut pas être déclarée à nouveau.',
  not_declarable: 'Cette absence ne peut pas être déclarée.',
  noshow_window_closed: 'Ton délai de 24 h est écoulé : tu ne peux plus déclarer l’hôte absent.',
  // « Marquer présent »
  not_host: 'Seul l’hôte de la table peut marquer une présence.',
  already_absent: 'Cette personne a déjà été déclarée « Pas venu ».',
  // Démo « Simuler H+6 »
  demo_disabled: 'Menu démo indisponible.',
  outing_not_found: 'Ce moment n’existe plus.',
  invalid_start: 'Heure de début invalide.',
};

const FLOW_LABELS: Record<RefusalFlow, Record<string, string>> = {
  noshow: {},
  // Lieu partenaire : règle inchangée (le jour du moment, sans « Je suis arrivé »).
  partner_noshow: {
    not_participant: 'Seul le lieu qui publie l’annonce peut signaler cette absence.',
    not_allowed_now:
      '« Pas venu » n’est possible que le jour du moment, à partir de l’heure prévue, si la personne n’a pas signalé son arrivée.',
  },
  // Hôte déclaré absent par un invité.
  host_noshow: {
    too_late: 'L’absence de l’hôte ne peut plus être déclarée 6 h après le début.',
    too_early: 'L’absence de l’hôte ne peut être déclarée qu’à partir de l’heure du moment.',
    not_participant: 'Seul un invité confirmé de la table peut déclarer l’hôte absent.',
  },
  presence: {
    too_early: 'Présence possible à partir de 15 min avant l’heure du moment.',
  },
};

export const REFUSAL_FALLBACK = 'Action impossible pour le moment.';

export function refusalLabel(reason: string | undefined, flow: RefusalFlow = 'noshow'): string {
  if (!reason) return REFUSAL_FALLBACK;
  return FLOW_LABELS[flow][reason] ?? LABELS[reason] ?? REFUSAL_FALLBACK;
}

/** Codes couverts (pour les tests). */
export const REFUSAL_CODES = Object.keys(LABELS);
