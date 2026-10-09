import { useCallback } from 'react';
import { useChance } from '../data/ChanceContext';
import { navigationRef } from './navigationRef';

/**
 * Fil avant le compte : on regarde sans inscription, le compte se demande
 * seulement pour rejoindre ou proposer.
 *
 * `resume` ne doit faire que de la navigation (jamais appeler une action du
 * contexte capturée avant la création du compte : la closure serait périmée).
 */
let pendingResume: (() => void) | null = null;

export function takePendingResume(): (() => void) | null {
  const r = pendingResume;
  pendingResume = null;
  return r;
}

export function clearPendingResume() {
  pendingResume = null;
}

export function openAccountFlow(resume?: () => void) {
  pendingResume = resume ?? null;
  if (navigationRef.isReady()) {
    navigationRef.navigate('Account');
  }
}

/**
 * `requireAccount(run, resume?)` : avec un compte, `run()` tout de suite.
 * Sans compte : tunnel (Compte → Prénom + âge → Quartier → Règles), puis
 * `resume` (navigation seule) ou retour à l’écran d’origine, action prête.
 */
export function useRequireAccount() {
  const { state } = useChance();
  const hasAccount = !!state.currentUser;
  return useCallback(
    (run: () => void, resume?: () => void): boolean => {
      if (hasAccount) {
        run();
        return true;
      }
      openAccountFlow(resume);
      return false;
    },
    [hasAccount],
  );
}
