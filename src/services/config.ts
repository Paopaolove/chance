/**
 * Config backend (Lot E — scaffold).
 *
 * La démo tourne SANS ces variables. Aucune clé réelle n’est requise.
 * Quand on brancherait Expo : préférer le préfixe EXPO_PUBLIC_* (voir docs/backend-prep.md).
 *
 * Ne pas confondre avec un backend « branché » : isBackendConfigured() === false
 * ⇒ stubs no-op uniquement.
 */

export type BackendEnv = {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  /** Clé publishable Stripe TEST uniquement (pk_test_…). Jamais live. */
  stripePublishableKeyTest: string | undefined;
};

function readEnv(name: string): string | undefined {
  try {
    // Expo injecte process.env.EXPO_PUBLIC_* au bundling ; les noms sans préfixe
    // sont documentés dans .env.example pour le futur backend.
    const env = (typeof process !== 'undefined' ? process.env : undefined) as
      | Record<string, string | undefined>
      | undefined;
    if (!env) return undefined;
    const raw = env[name] ?? env[`EXPO_PUBLIC_${name}`];
    if (raw == null) return undefined;
    const trimmed = String(raw).trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/** Lit les placeholders .env — toujours safe si absents. */
export function getBackendEnv(): BackendEnv {
  return {
    supabaseUrl: readEnv('SUPABASE_URL'),
    supabaseAnonKey: readEnv('SUPABASE_ANON_KEY'),
    stripePublishableKeyTest: readEnv('STRIPE_PUBLISHABLE_KEY_TEST'),
  };
}

/** true seulement si URL + anon key Supabase sont présentes (pas le cas en démo). */
export function isSupabaseConfigured(): boolean {
  const { supabaseUrl, supabaseAnonKey } = getBackendEnv();
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/** true seulement si clé publishable TEST présente. Jamais de clé live ici. */
export function isStripeTestConfigured(): boolean {
  const key = getBackendEnv().stripePublishableKeyTest;
  if (!key) return false;
  // Garde-fou : refuser explicitement une clé live si collée par erreur.
  if (key.startsWith('pk_live_')) return false;
  return key.startsWith('pk_test_') || key.startsWith('pk_');
}

export function isBackendConfigured(): boolean {
  return isSupabaseConfigured();
}
