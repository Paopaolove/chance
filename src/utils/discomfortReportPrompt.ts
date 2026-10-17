/**
 * Après un départ pour malaise (« Je quitte la table » avec ce motif) :
 * ligne « Tu veux signaler ? » — Oui ouvre l’écran Signaler de cette table,
 * vide (ni catégorie ni phrase transmises) ; Non ferme. Décision Paolo 17/10.
 * Le départ est déjà enregistré avant la question et reste valable quelle que
 * soit la réponse ; le signalement confidentiel de malaise n’est pas modifié.
 * Rien n’est envoyé sans la confirmation normale du formulaire.
 */
export const DISCOMFORT_REPORT_PROMPT_TEXT = 'Tu veux signaler ?';

/** Proposer seulement après un départ malaise réussi, si le signalement est ouvert (même règle que le chat). */
export function shouldOfferReportAfterLeave(
  leaveResult: { ok: true; discomfort: boolean } | { ok: false } | null | undefined,
  reportOpen: boolean,
): boolean {
  return Boolean(leaveResult && leaveResult.ok && leaveResult.discomfort === true && reportOpen);
}

export type DiscomfortReportPromptAction =
  | { kind: 'open_report'; screen: 'ReportTable'; params: { outingId: string } }
  | { kind: 'close' };

/** Oui → écran Signaler vide (seulement outingId) ; Non → ferme, rien n’est créé. */
export function discomfortReportPromptAction(
  choice: 'yes' | 'no',
  outingId: string,
): DiscomfortReportPromptAction {
  if (choice === 'yes') {
    return { kind: 'open_report', screen: 'ReportTable', params: { outingId } };
  }
  return { kind: 'close' };
}
