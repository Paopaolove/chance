/**
 * Outils démo / QA (menu 5 taps sur le logo + fonctions démo du contexte) :
 * actifs seulement en développement (__DEV__ : Expo Go via Metro / tunnel).
 * En build de production (__DEV__ = false) : menu absent, fonctions inertes.
 * Lu à l’appel (pas en constante de module) pour que le harnais puisse simuler
 * __DEV__ = false.
 */
export function isDemoEnabled(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

/** Réponse uniforme des fonctions démo désactivées. */
export const DEMO_DISABLED = { ok: false as const, reason: 'demo_disabled' };
