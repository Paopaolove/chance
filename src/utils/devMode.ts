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

/**
 * 25/10 · Mentions « (démo) » / « (mock) » : visibles en développement
 * seulement. Hors __DEV__, retirées du texte pour un parcours de test propre
 * (le reste de la phrase est inchangé).
 */
export function demoLabel(text: string): string {
  if (isDemoEnabled()) return text;
  return text
    .replace(/,\s+(?:Stripe\s+)?mock\)/g, ')')
    .replace(/\s*\((?:[Dd]émo|mock|Stripe\s+mock)(?:\s*:[^)]*)?\)/g, '')
    .replace(/ +([.,])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim();
}
