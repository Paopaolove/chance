# Chance

Application mobile iOS / Android (Expo) pour des sorties IRL à **Paris intramuros**.  
Pas de dating : un fil de vraies sorties (restaurant, bar, culture, autre), en 1-to-1 ou petit groupe (2–4).

> MVP **démo** avec état local mock. Lot E : stubs `src/services/` + `.env.example` (Supabase / Stripe **TEST**) — **pas branchés**, démo OK sans clés. ≠ backend réel, ≠ Stripe live.


## Modèle d’invitation (Chance)

Chance = **invitation plafonnée**, pas une addition partagée ni un repas illimité.

- L’**hôte** couvre **jusqu’à X € par invité**, réglé **sur place au lieu** (pas via l’app). Au-delà du plafond = hors invitation.
- **Publication gratuite** pour l’hôte.
- L’**invité** paie les frais Chance + une **caution 20 €** à la confirmation (≠ addition). Pas de transfert entre personnes.
- Champ `budgetMaxEuros` = plafond d’invitation (0 = Gratuit). Optionnels : `inviteIncludes`, `inviteExtras`, `ticketsAlreadyBought` (culture).

### Réservations / états (Lot B)

Machine à places par demande (`RequestStatus`) + cycle de l’annonce (`OutingStatus`) :

| Action | Effet |
|--------|--------|
| **accept** | Réserve une place (`spotsLeft--`), fenêtre **10 min** (`CONFIRM_WINDOW_MS`) ; deadline en **ISO UTC** |
| **confirmSlot** | Idempotent (2e confirm → ok, pas de double caution / crédit) ; après deadline → expire ; course capacité → `race_lost` |
| **cancel** (`cancelRequest`) | Invité retire *sa* demande (pending/accepted/confirmed) — ne casse pas les autres confirmés |
| **closeOuting** | Hôte ferme les inscriptions ; confirmés **gardent** leur place |
| **cancelOuting** | Hôte annule toute la sortie (y compris confirmés) ; cautions rendues |
| **completeOuting** | Sortie terminée (après `startsAt` / démo) → `completed` |

Affichage horaires : **Europe/Paris** (`src/utils/parisTime.ts`). Stockage : UTC. Annulation invité confirmé : caution rendue si ≥ `CANCEL_FREE_BEFORE_HOURS` (3 h) avant `startsAt`, sinon perdue.

### Caution & imprévu (Lot C)

Taxonomie détaillée : [`docs/deposit-imprevu.md`](docs/deposit-imprevu.md).

| `depositStatus` | Sens |
|-----------------|------|
| `none` | Pas de caution |
| `held` | Bloquée à la confirmation (20 € mock, une fois) |
| `returned` | Rendue (cancel ≥3 h, hôte annule / no-show, lieu alt. refusé, imprévu accepté, sortie terminée…) |
| `forfeited` | Perdue (cancel &lt;3 h, ghost, auto-refus imprévu invité à l’heure) |

- Caution **≠** frais Chance **≠** invitation / addition.
- Imprévu **1× / personne / sortie** : accepté → caution rendue + sortie annulée (**pas** de no-show) ; refusé → **règle des 3 h** (pas de forfeit immédiat).
- **Non tranché — ne pas inventer** : amendes hors 20 €, destinataire de la forfaite, remboursements abonnement, Stripe.

Helper UI : `describeDepositOutcome` / `DEPOSIT_STATUS_LABELS` (`src/data/pricing.ts`).

### Profils / avis / dispo (Lot D)

- Âge réel saisi (18+), **pas de défaut silencieux à 28**.
- Champs inscription / édition de profil harmonisés (prénom*, âge*, quartier*, bio optionnelle…).
- Boutons Apple / Google = **connexion démo** (pas de vraie auth) — indiqué dans l’UI.
- Trust stats « X sorties » = sorties **honorées** (terminées / participées), pas le nombre d’avis.
- Avis seulement entre participants d’une sortie **terminée** (`completed`).
- Signaler / bloquer ≠ note publique ; un signalement = un enregistrement (pas de multi-sanctions inventées).
- Dispo ce soir : pas de proposition à soi-même ; destinataire conservé depuis un profil.
- Dispo expire à minuit **Europe/Paris** (`nextParisMidnight`).

### Démo vs simulé vs réel

| Couche | Ce que c’est | Ce que ce n’est pas |
|--------|----------------|---------------------|
| **Démo** | App Expo locale, mocks + `ChanceContext`, parcours cliquable **sans** `.env`. | Un produit connecté à une base. |
| **Simulé** | Paiements / caution / accept hôte : **Alert** + état local. Stubs `src/services/*` no-op. | Stripe, ni « carte enregistrée = caution ». |
| **Réel** | Futur : Supabase (auth, sorties, demandes) + Stripe **TEST** puis live. Esquisse : [`docs/backend-prep.md`](docs/backend-prep.md). | Les stubs Lot E (pas encore branchés). |

**Rappel caution :** carte enregistrée (futur SetupIntent) **≠** caution bloquée (hold 20 € à la confirmation). Voir Lot C / [`docs/deposit-imprevu.md`](docs/deposit-imprevu.md).

## Lancer la démo

```bash
cd chance
npx expo start
```

Puis ouvre avec **Expo Go** (QR code) sur iPhone ou Android, ou appuie sur `i` / `a` pour un simulateur.

Prérequis : Node 18+, compte Expo Go à jour.

## Ce qui fonctionne (démo)

- Onboarding 3 écrans + création d’un profil local
- Fil **Autour de toi** avec ~8 sorties Paris (Marais, Oberkampf, Bastille, Montmartre, Latin, Canal, Opéra, Belleville)
- Détail sortie, rejoindre, demandes hôte / invité
- Acceptation → **confirmation en 10 minutes** (compte à rebours) sinon place libérée
- Caution **20 €** simulée à la confirmation
- Adresse exacte uniquement après confirmation
- Chat placeholder (ouverture logique H−1)
- Création de sortie (max **1 annonce active**)
- Option **Femmes uniquement** (si profil femme)
- Dispo ce soir, paywall / formules (sélection locale)

## Tarifs affichés

- Essai 1 mois illimité
- Paiement à la sortie **6,90 €**
- Essentiel **12,90 €/mois** (4 sorties) ou **119 €/an**
- Illimité **19,90 €/mois** ou **189 €/an**
- Caution **20 €** bloquée à la confirmation

## Structure

```
src/
  theme/          # couleurs chaudes, typo, spacing
  data/           # types, mocks, ChanceContext (useReducer) — monolithe démo
  services/       # Lot E : ports / stubs (reservations, deposits, notifications,
                  #   demoTools, supabase, stripe TEST) — non branchés à l’UI
  navigation/     # stack + tabs (React Navigation)
  screens/        # tous les écrans MVP
  components/     # Button, OutingCard, EmptyState, DemoMenuModal…
  utils/          # format, parisTime, notifications expo, chat H−1…
docs/
  deposit-imprevu.md   # taxonomie caution (Lot C)
  backend-prep.md      # esquisse Supabase + Stripe TEST (Lot E)
.env.example           # SUPABASE_* / STRIPE_PUBLISHABLE_KEY_TEST (optionnel)
```

### Architecture — monolithe actuel vs split prévu (Lot E)

**Aujourd’hui :** presque toute la logique métier (réservations, cautions, notifs,
outils QA `simulate*`, abonnements mock) vit dans `ChanceContext.tsx`. C’est
volontaire pour une démo stable (3 slides onboarding, chat H−1, 1 annonce active).

**Cible (progressive, pas migrée dans ce lot) :**

| Module `src/services/` | Rôle futur | État Lot E |
|------------------------|------------|------------|
| `reservations` | accept / confirm / cancel / close / complete | Interface + stub no-op |
| `deposits` | hold / release / forfeit 20 € | Interface + stub no-op |
| `notifications` | push priorité, rappels 10 min, chat H−1 | Port ; démo = `utils/notifications` |
| `demoTools` | `simulate*` / reset QA | Interface + stub no-op |
| `supabase` | client si env présente | `null` / no-op sans clés |
| `stripe` | TEST only (`pk_test_`) | no-op ; `STRIPE_LIVE_ENABLED = false` |

Les écrans continuent d’appeler `useChance()` — **ne pas** brancher les stubs
depuis l’UI tant que le Context n’a pas délégué (évite double source de vérité).


## Parcours démo suggéré

1. Complète l’onboarding (3 slides) et crée un profil local
2. Parcours le fil **Autour de toi**, ouvre une sortie → **Rejoindre**
3. Onglet **Demandes** → **Simuler acceptation hôte (démo)** → confirme en 10 min
4. Onglet **Créer** → publie une sortie (une demande « Juliette » arrive automatiquement)
5. Accepte Juliette côté hôte ; teste **Dispo ce soir** et **Abonnements**

## Ce qui est mock

- Profil, sorties, demandes : mémoire React (Context)
- Paiements / caution : Alert + changement de plan local (**pas** Stripe)
- Chat : messages d’exemple (ouverture logique H−1)
- Pas de persistance (reload = reset + onboarding)
- `src/services/*` : stubs documentaires — **no-op** sans `.env` ; ≠ backend réel

## Prochaines étapes

1. **Brancher** les ports `src/services/` (extraire hors Context sans casser la démo)
2. **Supabase** — auth, profils, sorties, demandes (schéma : `docs/backend-prep.md`)
3. **Stripe TEST** — abonnements + caution ; jamais live tant que non validé
4. Push notifications backend (rappel H−1, acceptation, deadline 10 min)
5. Géoloc / quartiers Paris intramuros plus fine
6. Modération & signalement (au-delà du mock signaler / bloquer)

## Scripts

```bash
npx expo start
npx tsc --noEmit
```

Marque : **Chance**.
