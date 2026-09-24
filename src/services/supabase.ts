/**
 * Client Supabase — scaffold TEST / prépa (Lot E).
 *
 * - Pas de dépendance `@supabase/supabase-js` pour l’instant (Expo Go OK sans backend).
 * - getSupabaseClient() → null si env manquante → la démo continue en mock.
 * - Ne pas présenter ce stub comme un backend réel.
 *
 * Schéma cible : docs/backend-prep.md (auth, profiles, outings, requests).
 */

import { getBackendEnv, isSupabaseConfigured } from './config';

/** Surface minimale documentaire — pas un vrai client SDK. */
export type SupabaseClientStub = {
  readonly configured: true;
  readonly url: string;
  /**
   * Placeholder : future `from('outings').select(...)`.
   * Aujourd’hui : toujours no-op / vide.
   */
  from(table: string): {
    select: (columns?: string) => Promise<{ data: null; error: { message: string } }>;
  };
};

/**
 * Retourne null sans URL/anon key — l’app ne doit jamais crasher.
 * Avec env : objet stub documentaire (pas de réseau).
 */
export function getSupabaseClient(): SupabaseClientStub | null {
  if (!isSupabaseConfigured()) return null;
  const { supabaseUrl } = getBackendEnv();
  return {
    configured: true,
    url: supabaseUrl!,
    from(_table: string) {
      return {
        async select(_columns?: string) {
          return {
            data: null,
            error: {
              message:
                'Supabase SDK non branché (Lot E scaffold). Voir docs/backend-prep.md.',
            },
          };
        },
      };
    },
  };
}

/** true si on pourrait tenter un appel (env présente) — faux en démo par défaut. */
export function hasSupabaseEnv(): boolean {
  return isSupabaseConfigured();
}
