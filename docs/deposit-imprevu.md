# Caution & imprévu — taxonomie (Lot C+)

> Mock local uniquement — **pas de Stripe live**.  
> Caution **20 €** (`DEPOSIT_EUROS`). Split forfeit : **6,90 € Chance** + **13,10 € hôte** (`DEPOSIT_FORFEIT_*`).  
> Source runtime : `ChanceContext` + `src/data/pricing.ts` (`CANCEL_FREE_BEFORE_HOURS = 3`).  
> Joker : **1× / mois calendaire Europe/Paris** (`parisMonthKey` / `jokerUsedMonthKey`).

## Ce que la caution n’est pas

| Notion | Rôle |
|--------|------|
| **Caution 20 €** | Garantie **invité** bloquée **une fois** à `confirmSlot`. Mock carte. |
| **Frais Chance** | Abonnement / à-la-sortie — ce n’est pas la caution, ni l’invitation. |
| **Invitation (`budgetMaxEuros`)** | Plafond couvert **par l’hôte au lieu** — pas via l’app, pas un transfert P2P. |
| **Addition** | Ce qui se règle sur place hors plafond — hors scope caution. |

**Règle produit :** annulation libre invité **au moins 3 heures** avant `startsAt` → caution **rendue**.  
**Perdue** (trop tard / absence) → **6,90 € Chance + 13,10 € hôte**. Pas d’autres amendes inventées.

---

## `depositStatus` (par `Request` confirmée)

| Valeur | Signification |
|--------|----------------|
| `none` | Pas de caution (demande non confirmée, ou jamais bloquée). |
| `held` | Caution bloquée à la confirmation (idempotent : pas de double hold). |
| `returned` | Caution rendue (invité non fautif / fenêtre libre / imprévu accepté / **joker**…). |
| `forfeited` | Caution perdue — split **6,90 / 13,10** (annulation tardive, absence, auto_refuse imprévu…). |

Helper UI : `describeDepositOutcome` / `describeDepositForfeitMoment` / `DEPOSIT_STATUS_LABELS` (`src/data/pricing.ts`).

---

## Matrice — quand `held` / `returned` / `forfeited`

### → `held`

| Événement | Détail |
|-----------|--------|
| `confirmSlot` (accepted → confirmed) | Une seule fois ; re-confirm idempotent → pas de 2ᵉ hold. |

### → `returned`

| Événement | Détail code |
|-----------|-------------|
| Annulation **invité** confirmé **≥ 3 h** | `cancelRequest` + `isCancelFreeWindow` |
| Annulation **hôte** d’une place confirmée | `cancelRequest` `by: 'host'` |
| **Annulation sortie** par l’hôte | `cancelOuting` — toutes les cautions held → returned |
| **No-show hôte** | `reportHostNoShow` → `RETURN_DEPOSITS_FOR_OUTING` |
| **Lieu alternatif refusé** par l’invité | `RESPOND_VENUE_ALTERNATE` refused → caution de *cet* invité rendue |
| **Imprévu accepté** | `RESPOND_IMPREVU` accepted → cautions rendues + sortie fermée ; **pas** d’absence |
| **Joker** après refus / auto_refus | `USE_JOKER_ON_IMPREVU` → caution returned, **pas** d’absence, **hôte 0 €**, joker consommé le mois Paris |
| **Sortie terminée** (`completeOuting` / auto H+30 min) | Invité **présent** (`attendance: present`) → `held` → `returned`. Confirmé seul ≠ présent ; absence (`reportGuestNoShow`) reste `forfeited`. |

### → `forfeited` (split 6,90 / 13,10)

| Événement | Détail code |
|-----------|-------------|
| Annulation **invité** confirmé **trop tard** (< 3 h) | `cancelRequest` guest |
| **Absence** invité après confirm | `reportGuestNoShow` |
| **Imprévu sans réponse à `startsAt`** (`auto_refused`) si reporter **invité** | Forfeit reporter (sauf joker ensuite) |

### Imprévu refusé (manuel) — règle des 3 h + joker

| Décision | Effet caution | Sortie |
|----------|---------------|--------|
| **Accepté** | Toutes les cautions held → `returned` ; pas d’absence | Outing `closed` |
| **Refusé** | Caution **reste `held`** — règle 3 h ; **ou joker** → returned, hôte 0 € | Sortie continue |
| **Auto-refusé** à l’heure | Comme refus + absence → forfeit si invité ; **ou joker** | Sortie non annulée par l’imprévu |

Une seule déclaration d’imprévu **par personne et par sortie** (motif + raison écrite).  
**1 joker / mois calendaire Paris** (`hasJokerAvailable` / `useJokerOnImprevu`).

---

## Non tranché — ne pas inventer

Ne pas ajouter dans le code ni l’UI :

- Amendes, pénalités ou montants **autres que** caution **20 €** et le split forfeit **6,90 / 13,10**
- Remboursement des **frais Chance** / crédits sortie après forfeit ou imprévu
- Délais Stripe / partial capture / litiges bancaires
- Imprévu accepté pour **un seul** invité d’un groupe sans fermer toute la sortie (le mock actuel ferme toute la sortie)
- Barème de « retards » monétaire (les retards signalés ce n’est pas la caution)
- Toute autre sanction argent hors strikes mock (avertissement / ban / priorité)

> ~~Destinataire / partage de la caution forfaite~~ — **tranché** : 6,90 € Chance + 13,10 € hôte.

---

## Alignement code ↔ produit

| Produit | Implémentation |
|---------|----------------|
| Free cancel ≥ 3 h | `CANCEL_FREE_BEFORE_HOURS` + `isCancelFreeWindow` |
| Caution 20 € | `DEPOSIT_EUROS` |
| Forfeit split 6,90 / 13,10 | `DEPOSIT_FORFEIT_CHANCE_EUROS` / `DEPOSIT_FORFEIT_HOST_EUROS` |
| Joker 1× / mois Paris | `jokerUsedMonthKey` + `parisMonthKey` |
| Imprévu 1× / personne | garde `REPORT_IMPREVU` |
| Accepté → pas absence + caution rendue + sortie annulée | `cancelOuting: true` |
| Refus → règle 3 h (ou joker) | **pas** de forfeit immédiat au refus manuel |
