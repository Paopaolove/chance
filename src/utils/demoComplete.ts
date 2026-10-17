/**
 * Démo QA uniquement — « Simuler sortie terminée » (option A, 17/10) :
 * déclenche la clôture automatique de H+30 (by 'auto', at = startsAt + H+30),
 * quel que soit l’utilisateur courant. La règle réelle du reducer ne change pas.
 */
import type { AppAction, Outing } from '../data/types';
import { isDemoEnabled } from './devMode';
import { OUTING_AUTO_COMPLETE_AFTER_MS } from './outingActive';

export function buildDemoAutoCompleteAction(
  outing: Pick<Outing, 'id' | 'startsAt' | 'status'> | undefined,
): Extract<AppAction, { type: 'COMPLETE_OUTING' }> | null {
  // Démo seulement (__DEV__) : aucune clôture forcée en production.
  if (!isDemoEnabled()) return null;
  if (!outing) return null;
  if (outing.status === 'completed' || outing.status === 'cancelled') {
    return null;
  }
  const startMs = new Date(outing.startsAt).getTime();
  if (!Number.isFinite(startMs)) return null;
  return {
    type: 'COMPLETE_OUTING',
    payload: {
      outingId: outing.id,
      by: 'auto',
      at: new Date(startMs + OUTING_AUTO_COMPLETE_AFTER_MS).toISOString(),
    },
  };
}
