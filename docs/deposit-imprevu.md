# Caution & imprévu — taxonomie (Lot C)

> Mock local uniquement — **pas de Stripe**, pas de nouveaux montants au-delà de la **caution 20 €** (`DEPOSIT_EUROS`).  
> Source de vérité runtime : `ChanceContext` + `src/data/pricing.ts` (`CANCEL_FREE_BEFORE_HOURS = 3`).

## Ce que la caution n’est pas

| Notion | Rôle |
|--------|------|
| **Caution 20 €** | Garantie **invité** bloquée **une fois** à `confirmSlot`. Mock carte. |
| **Frais Chance** | Abonnement / à-la-sortie (Essentiel, Illimité, Payg…) — **≠** caution, **≠** invitation. |
| **Invitation (`budgetMaxEuros`)** | Plafond couvert **par l’hôte au lieu** — pas via l’app, pas un transfert P2P. |
| **Addition** | Ce qui se règle sur place hors plafond — hors scope caution. |

**Règle produit :** annulation libre invité **≥ 3 h** avant `startsAt` → caution **rendue**. Pas d’amendes inventées.

---

## `depositStatus` (par `Request` confirmée)

| Valeur | Signification |
|--------|----------------|
| `none` | Pas de caution (demande non confirmée, ou jamais bloquée). |
| `held` | Caution bloquée à la confirmation (idempotent : pas de double hold). |
| `returned` | Caution rendue (invité non fautif / fenêtre libre / imprévu accepté…). |
| `forfeited` | Caution perdue (annulation tardive, ghost, absence après refus imprévu auto…). |

Helper UI : `describeDepositOutcome` / `DEPOSIT_STATUS_LABELS` (`src/data/pricing.ts`).

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
| **Imprévu accepté** (hôte ou invité répondant) | `RESPOND_IMPREVU` accepted → cautions rendues + sortie fermée ; **pas** de strike no-show |
| **Sortie terminée** (`completeOuting`) | Invité venu → cautions `held` → `returned` |

### → `forfeited`

| Événement | Détail code |
|-----------|-------------|
| Annulation **invité** confirmé **< 3 h** | `cancelRequest` guest |
| **Ghost** invité après confirm | `reportGuestNoShow` |
| **Imprévu sans réponse à `startsAt`** (`auto_refused`) si le reporter est un **invité** | Traité comme absence → forfeit reporter (hôte n’a pas de caution) |

### Imprévu refusé (manuel) — règle des 3 h

| Décision | Effet caution | Sortie |
|----------|---------------|--------|
| **Accepté** | Toutes les cautions held de la sortie → `returned` ; pas de no-show | Outing `closed`, demandes actives cancelled |
| **Refusé** (réponse explicite) | Caution **reste `held`** — règle normale des 3 h (annuler ≥3 h → rendu ; <3 h / ghost → perdu) | Sortie continue |
| **Auto-refusé** à l’heure | Comme refus + **absence** : forfeit si reporter invité | Sortie non annulée par l’imprévu |

Une seule déclaration d’imprévu **par personne et par sortie** (motif + raison écrite, accept/refus — pas de chat libre).

---

## Non tranché — ne pas inventer

Ne pas ajouter dans le code ni l’UI (marqué **« non tranché — ne pas inventer »**) :

- Amendes, pénalités ou montants **autres que** la caution **20 €**
- Destinataire / partage de la caution forfaite (plateforme ? hôte ?)
- Remboursement des **frais Chance** / crédits sortie après forfeit ou imprévu
- Délais Stripe / partial capture / litiges bancaires
- Imprévu accepté pour **un seul** invité d’un groupe sans fermer toute la sortie (le mock actuel ferme toute la sortie)
- Barème de « retards » monétaire (les retards signalés ≠ caution)
- Toute autre sanction argent hors strikes mock (avertissement / ban / priorité)

---

## Alignement code ↔ produit

| Produit | Implémentation |
|---------|----------------|
| Free cancel ≥ 3 h | `CANCEL_FREE_BEFORE_HOURS` + `isCancelFreeWindow` |
| Caution 20 € | `DEPOSIT_EUROS` |
| Imprévu 1× / personne | garde `REPORT_IMPREVU` |
| Accepté → pas no-show + caution rendue + sortie annulée | `cancelOuting: true`, pas de `report*NoShow` |
| Refus → règle 3 h | **pas** de forfeit immédiat au refus manuel |
