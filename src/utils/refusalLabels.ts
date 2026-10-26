/**
 * Codes de refus → français clair pour les alertes. Un code brut
 * (snake_case) ne doit jamais apparaître à l’écran.
 * Le parcours précise le libellé quand un même code n’a pas le même sens
 * (« Pas venu » hôte, « Pas venu » lieu partenaire, « Marquer présent »).
 */
export type RefusalFlow = 'noshow' | 'partner_noshow' | 'partner_check' | 'presence' | 'host_noshow';

const LABELS: Record<string, string> = {
  // « Pas venu » (reportGuestNoShow) — table normale
  no_user: 'Connecte-toi pour continuer.',
  not_found: 'Ce moment n’existe plus.',
  not_confirmed: 'Cette personne n’a pas de place confirmée.',
  outing_cancelled: 'Ce moment a été annulé.',
  not_participant: 'Seuls l’hôte de la table ou la personne concernée peuvent signaler cette absence.',
  already_present: 'Cette personne est marquée présente.',
  too_early: 'Possible seulement à partir de l’heure du moment.',
  too_late: '« Pas venu » n’est plus possible au-delà de 6 h après le début. La caution est rendue d’office.',
  host_no_show: 'Tu as été déclaré « Pas venu » sur cette table : tu ne peux plus signaler d’absence.',
  not_allowed_now: '« Pas venu » n’est possible qu’à partir de l’heure du moment et jusqu’à 6 h après le début.',
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
  // Démo « Revue des contestations » (25/10)
  review_expired: 'Revue terminée : 7 jours sans décision, la caution a été rendue.',
  // « Annuler le moment » (hôte) — 25/10 · B2
  moment_started: 'Le moment a commencé : il ne peut plus être annulé.',
  guests_on_site: 'Un invité est déjà présent ou parti : le moment ne peut plus être annulé.',
  already_completed: 'Ce moment est terminé.',
  already_cancelled: 'Ce moment a déjà été annulé.',
  // 25/10 soir · Partenaire calé The Fork : liste du lieu (Table complète / décocher).
  partner_use_check: 'Sur une annonce lieu, l’absence passe par la liste du soir : « Table complète », ou décoche qui n’est pas là.',
  not_partner_listing: 'Cette annonce n’est pas une annonce lieu.',
  cancelled: 'Ce moment a été annulé.',
  already_done: 'La liste de ce soir est déjà validée.',
  nobody: 'Personne à pointer sur cette liste.',
  // 26/10 · Débug audit 36 : lieu — présence par la liste, plus de désistement après.
  partner_venue_list: 'Chez un lieu, la présence se valide sur la liste, 30 min après le début.',
  partner_seat_locked: 'La liste de ce soir est faite : tu ne peux plus te désister.',
  host_pending: 'L’absence de l’hôte n’est pas encore tranchée : la caution ne peut pas être perdue maintenant.',
};

const FLOW_LABELS: Record<RefusalFlow, Record<string, string>> = {
  noshow: {},
  // Lieu partenaire : de H à H+6 (gel 17/10), sans « Je suis arrivé ».
  partner_noshow: {
    not_participant: 'Seul le lieu qui publie l’annonce peut signaler cette absence.',
    not_allowed_now:
      '« Pas venu » n’est possible qu’à partir de l’heure prévue et jusqu’à 6 h après le début, si la personne n’a pas signalé son arrivée.',
  },
  // 25/10 soir · Liste du lieu (H+30 → H+6).
  partner_check: {
    not_host: 'Seul le lieu qui publie l’annonce valide la liste.',
    too_early: 'La liste s’ouvre 30 min après l’heure prévue.',
    too_late: 'La liste se valide jusqu’à 6 h après le début. Rien coché : les cautions sont rendues.',
    host_no_show: 'Ton lieu a été déclaré absent : la liste n’est plus disponible.',
  },
  // Hôte déclaré absent par un invité.
  host_noshow: {
    too_late: 'L’absence de l’hôte ne peut plus être déclarée au-delà de 6 h après le début.',
    too_early: 'L’absence de l’hôte ne peut être déclarée qu’à partir de l’heure du moment.',
    not_participant: 'Seul un invité confirmé de la table peut déclarer l’hôte absent.',
  },
  presence: {
    too_early: 'Présence possible à partir de 15 min avant l’heure du moment.',
    too_late: 'La présence se confirme jusqu’à 6 h après le début.',
    not_participant: 'Seuls l’hôte et les invités confirmés de la table peuvent confirmer une présence.',
    not_declarable: 'Cette présence ne peut pas être confirmée.',
    contest_closed: 'Ce « Pas venu » ne peut plus être contesté.',
  },
};

export const REFUSAL_FALLBACK = 'Action impossible pour le moment.';

export function refusalLabel(reason: string | undefined, flow: RefusalFlow = 'noshow'): string {
  if (!reason) return REFUSAL_FALLBACK;
  return FLOW_LABELS[flow][reason] ?? LABELS[reason] ?? REFUSAL_FALLBACK;
}

/** Codes couverts (pour les tests). */
export const REFUSAL_CODES = Object.keys(LABELS);
