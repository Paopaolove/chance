# Préparation backend — Supabase + Stripe TEST (Lot E)

> Scaffold uniquement. **Pas de backend branché**, pas de charge live.  
> La démo Expo (mocks + `ChanceContext`) doit tourner **sans** `.env`.

## Démo vs simulé vs réel

| Couche | Signification |
|--------|----------------|
| **Démo** | App locale, mocks, Context React — parcours cliquable. |
| **Simulé** | Alert + état local (caution, accept hôte, abonnement). ≠ Stripe. |
| **Réel** | Supabase + Stripe TEST (puis live plus tard) — **pas encore**. |

Les stubs `src/services/*` documentent les frontières ; ils **no-op** si l’env manque.  
Ne pas les présenter comme un backend opérationnel.

---

## Variables d’environnement

Voir `.env.example` :

- `SUPABASE_URL` / `SUPABASE_ANON_KEY`
- `STRIPE_PUBLISHABLE_KEY_TEST` (`pk_test_…` uniquement)

Lecture runtime : `src/services/config.ts` (accepte aussi `EXPO_PUBLIC_*`).  
`isSupabaseConfigured()` / `isStripeTestConfigured()` → `false` en démo par défaut.

---

## Esquisse tables Supabase

Schéma **indicatif** (pas de migration appliquée dans ce lot) :

### `profiles`
- `id` (uuid, PK, = `auth.users.id`)
- `first_name`, `age`, `gender`, `neighborhood`, `bio`
- `photo_url`, `interests` (jsonb / text[])
- `plan_id`, `plan_interval`, `outing_credits`, `trial_ends_at`
- `created_at`, `updated_at`

### `outings`
- `id`, `host_id` → profiles
- `title`, `description`, `category`, `neighborhood`
- `venue_name`, `approx_area`, `exact_address` (visible post-confirm)
- `starts_at` (timestamptz UTC), `capacity`, `spots_left`
- `status` : `open` | `full` | `closed` | `completed`
- `budget_max_euros`, `women_only`, champs invitation optionnels
- `created_at`

Règle produit démo à conserver : **max 1 annonce active** par hôte.

### `requests`
- `id`, `outing_id`, `guest_id`
- `status` : `pending` | `accepted` | `confirmed` | `declined` | `expired` | `cancelled` | …
- `confirm_deadline_at` (UTC, fenêtre ~10 min après accept)
- `deposit_status` : `none` | `held` | `returned` | `forfeited`
- `message`, `created_at`

Auth : Supabase Auth (Apple / Google / email) — les boutons actuels restent **connexion démo** jusqu’au branchement.

Autres tables futures (hors Lot E) : `reviews`, `chat_messages`, `imprevu_reports`, push tokens.

---

## Stripe TEST mode only

1. **Uniquement** clés TEST (`pk_test_…`). `STRIPE_LIVE_ENABLED = false` dans `src/services/stripe.ts`.
2. Cas d’usage futurs :
   - Abonnements (Essentiel / Illimité / Payg)
   - Caution **20 €** à `confirmSlot` (hold → release / forfeit selon taxonomie Lot C)
3. **« Carte enregistrée ≠ caution bloquée »**
   - Enregistrer une carte (SetupIntent / customer) **ne** bloque **pas** 20 €.
   - La caution = autorisation / PaymentIntent distincte au moment de la confirmation.
4. Sans clé TEST : `prepareSaveCardTest` / `prepareHoldDepositTest` no-op ; mock Context inchangé.
5. Ne jamais coller `pk_live_` : `isStripeTestConfigured()` refuse le live.

Réf. caution : [`deposit-imprevu.md`](./deposit-imprevu.md).

---

## Séparation de concerns (cible)

```
Aujourd’hui (monolithe démo)
  ChanceContext  →  état + réservations + cautions + notifs + outils QA

Cible (progressive, pas faite dans Lot E)
  screens / components
       ↓
  ChanceContext (orchestration UI / état session)
       ↓
  src/services/reservations | deposits | notifications | demoTools
       ↓
  supabase.ts / stripe.ts  (adaptateurs)
```

Fichiers stub : `src/services/*.ts`.  
**Ne pas migrer** le reducer tant que les contrats ne sont pas stabilisés.

---

## Invariants démo à ne pas casser

- Onboarding **3 slides**
- Chat logique **H−1**
- **1** annonce active max
- Pas de Stripe live, pas de vente du mock comme paiement réel
