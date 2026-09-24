# Chance

Application mobile iOS / Android (Expo) pour des sorties IRL à **Paris intramuros**.  
Pas de dating : un fil de vraies sorties (restaurant, bar, culture, autre), en 1-to-1 ou petit groupe (2–4).

> MVP démo avec état local mock — **pas de Supabase ni Stripe** pour l’instant.


## Modèle d’invitation (Chance)

Chance = **invitation plafonnée**, pas une addition partagée ni un repas illimité.

- L’**hôte** couvre **jusqu’à X EUR par invité**, réglé **sur place au lieu** (pas via l’app). Au-delà du plafond = hors invitation.
- **Publication gratuite** pour l’hôte.
- L’**invité** paie les frais Chance + une **caution 20 EUR** à la confirmation (≠ addition). Pas de transfert entre personnes.
- Champ `budgetMaxEuros` = plafond d’invitation (0 = Gratuit). Optionnels : `inviteIncludes`, `inviteExtras`, `ticketsAlreadyBought` (culture).

### Démo vs simulé vs réel

| Couche | Ce que c’est |
|--------|----------------|
| **Démo** | App Expo locale, mocks + Context React, parcours cliquable sans backend. |
| **Simulé** | Paiements / caution / acceptation hôte : Alert + état local (pas de Stripe). |
| **Réel** | Pas encore : Supabase (auth, sorties) + Stripe (abonnements, caution) à venir. |

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
  data/           # types, mocks, ChanceContext (useReducer)
  navigation/     # stack + tabs
  screens/        # tous les écrans MVP
  components/     # Button, OutingCard, EmptyState
  utils/          # format dates / countdown
```


## Parcours démo suggéré

1. Complète l’onboarding (3 slides) et crée un profil local
2. Parcours le fil **Autour de toi**, ouvre une sortie → **Rejoindre**
3. Onglet **Demandes** → **Simuler acceptation hôte (démo)** → confirme en 10 min
4. Onglet **Créer** → publie une sortie (une demande « Juliette » arrive automatiquement)
5. Accepte Juliette côté hôte ; teste **Dispo ce soir** et **Abonnements**

## Ce qui est mock

- Profil, sorties, demandes : mémoire React (Context)
- Paiements / caution : Alert + changement de plan local
- Chat : messages d’exemple
- Pas de persistance (reload = reset + onboarding)

## Prochaines étapes

1. **Supabase** — auth, profils, sorties, demandes, realtime chat
2. **Stripe** — abonnements + caution (PaymentIntent / SetupIntent)
3. Push notifications (rappel H−1, acceptation, deadline 10 min)
4. Géoloc / quartiers Paris intramuros plus fine
5. Modération & signalement

## Scripts

```bash
npx expo start
npx tsc --noEmit
```

Marque : **Chance**.
