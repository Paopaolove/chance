/**
 * Codes de refus → français clair pour les alertes. Un code brut
 * (snake_case) ne doit jamais apparaître à l’écran.
 */
const LABELS: Record<string, string> = {
  // « Pas venu » (reportGuestNoShow / partnerMarkNoShow)
  no_user: 'Connecte-toi pour continuer.',
  not_found: 'Ce moment n’existe plus.',
  not_confirmed: 'Cette personne n’a pas de place confirmée.',
  outing_cancelled: 'Ce moment a été annulé.',
  not_participant: 'Seul l’hôte de la table peut le faire.',
  already_present: 'Cette personne est marquée présente.',
  too_early: 'Possible seulement à partir de l’heure du moment.',
  too_late: '« Pas venu » n’est plus possible 6 h après le début. La caution a été rendue.',
  host_no_show: 'Tu as été déclaré « Pas venu » sur cette table : tu ne peux plus signaler d’absence.',
  not_allowed_now: '« Pas venu » n’est possible que le soir même, si la chaise reste vide.',
  // Démo « Simuler H+6 »
  demo_disabled: 'Menu démo indisponible.',
  outing_not_found: 'Ce moment n’existe plus.',
  invalid_start: 'Heure de début invalide.',
};

export const REFUSAL_FALLBACK = 'Action impossible pour le moment.';

export function refusalLabel(reason: string | undefined): string {
  return (reason && LABELS[reason]) || REFUSAL_FALLBACK;
}

/** Codes couverts (pour les tests). */
export const REFUSAL_CODES = Object.keys(LABELS);
