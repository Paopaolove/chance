# Notifications (démo locale)

## État actuel

Les notifications Chance sont **locales** (`expo-notifications` + toasts in-app).  
Pas de push serveur, pas de tokens Expo Push, pas de synchronisation multi-appareils.

| Couche | Rôle |
|--------|------|
| **Locale** | `src/utils/notifications.ts` — schedule / cancel sur *cet* appareil |
| **Toast** | `ToastBanner` — bandeau in-app cliquable si `type` + ids |
| **Tap** | `openNotificationTarget` + `NotificationTapHandler` |

## Mapping tap → écran

| Type | Cible |
|------|--------|
| `new_request` | Demandes |
| `accepted` / `confirm_reminder` | ConfirmSlot si `requestId` encore `accepted`, sinon Demandes (+ Alert si expiré) |
| `confirmed` | OutingDetail (ou Demandes) |
| `chat_unlock` / `message` | ChatPlaceholder (`outingId` + `requestId`) |
| `late` / `new_venue` | OutingDetail |
| `imprevu` | Imprevu si pending pour moi, sinon OutingDetail |
| `cancellation` | OutingDetail (+ Alert si annulée) |
| `rate_after` | LeaveReview si éligible (présent), sinon Profil « Mes sorties à noter » |

À l’ouverture : revalidation (demande expirée, sortie annulée) → Alert + écran de repli, pas un écran vide.

Rappels accept / 3 min / chat H−1 : annulés après confirm / expire / cancel (`clearRequestSchedules` / `clearOutingSchedules`).

## Priorité wiring (en attendant le complet)

1. **Demandes** — accept + fenêtre 10 min / rappel 3 min  
2. **Profil** — notation (`rate_after`)  
3. **Fiche sortie** — imprévu / nouveau lieu  

## Limite démo : 2 téléphones

Deux appareils = **plus tard, côté serveur** (Expo Push tokens + backend qui envoie au bon user).  
Aujourd’hui chaque téléphone ne voit que ses notifs locales / son état mock — pas de livraison croisée.

Voir aussi [`backend-prep.md`](./backend-prep.md) (Lot E stubs).
