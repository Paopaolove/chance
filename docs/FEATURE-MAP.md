# Carte des écrans (pour le testeur)

Construite à partir du code de `feat/invitation-offer-lots` (17/10). Rien n'est inventé : chaque libellé
ci-dessous figure tel quel dans le fichier cité.

## À savoir avant de tester

- **testID : aucun dans le code** (`rg testID src` → 0). Les sélecteurs utiles sont donc :
  - les `accessibilityLabel` → sur le web, `aria-label` (Playwright : `getByLabel('…')`) ;
  - le texte des boutons (`title="…"` du composant `Button`) → `getByText('…', { exact: true })` ;
  - les onglets → `getByRole('tab', { name: '…' })` sur le web.
  - testID manquants à prévoir plus tard (non ajoutés ici) : onglets, segments Annonces/Dispo et
    Liste/Carte du fil, boutons de présence (« Je suis arrivé », « Marquer X présent », « Pas venu »),
    encart de contestation (`NoShowContestCard`), menu démo et chacun de ses boutons.
- **Pas de liens profonds** : `NavigationContainer` n'a pas de `linking`. Aucune URL ne mène à un écran ;
  on y arrive en naviguant.
- **Pas de persistance** : l'état repart de zéro à chaque lancement (aucun AsyncStorage / localStorage).
- **Menu démo** (`src/components/DemoMenuModal.tsx`) : 5 taps sur le logo du fil (`FeedScreen`,
  `onLogoTap`), seulement si `__DEV__` (Expo Go via Metro / tunnel, voir `src/utils/devMode.ts`).
  Absent de l'export web de production, donc absent des captures de `npm run verify`.
- **Web** : le bouton « Suivant » des slides ne fait pas défiler (scrollToIndex inopérant sur le web) ;
  `scripts/verify.cjs` fait défiler la liste à la main. La carte (`MomentsMap`) est un bouchon vide sur le web.

## Navigation

Pile racine (`src/navigation/RootNavigator.tsx`). Sans compte et slides non vues : seul `Onboarding`.
Ensuite : `MainTabs` + écrans de pile ci-dessous. Onglets (`src/navigation/MainTabs.tsx`) :
« Autour de toi » (Feed), « Publier » (Create), « Demandes » (Requests), « Profil » (Profile).

---

## Onboarding (slides)
- Fichier : `src/screens/OnboardingScreen.tsx` (`OnboardingScreen`)
- Accès : premier lancement (`!state.slidesSeen && !state.currentUser`).
- Sélecteurs : boutons « Suivant » puis « Commencer » (dernier slide).
- Menu démo : aucun.
- Actions : « Commencer » → `markSlidesSeen()` → fil sans compte.
- Capture verify : `01-onboarding.png`.

## Compte (tunnel d'inscription)
- Fichier : `src/screens/OnboardingScreen.tsx` (`AccountScreen`), route `Account` (modale plein écran).
- Accès : `openAccountFlow` (`src/navigation/accountGate.ts`), par exemple onglet « Publier » sans compte,
  ou rejoindre un moment sans compte.
- Sélecteurs : `getByLabel(/Étape \d+ sur \d+/)` (barre d'étapes), `getByLabel('Retour')`,
  `getByLabel('Autre quartier')` ; boutons « Continuer avec Apple (démo) », « Continuer avec Google (démo) »,
  « Continuer avec e-mail (démo) », « Continuer », « C’est compris » (règles).
- Menu démo : « Se connecter (démo) » (section Compte, visible sans compte) crée Camille, 29 ans, Belleville,
  sans passer par le tunnel.
- Actions : choix du fournisseur, identité, quartier, acceptation des règles.
- Capture verify : `06-publier-compte.png`.

## Autour de toi (fil)
- Fichier : `src/screens/FeedScreen.tsx`, onglet `Feed`.
- Accès : onglet « Autour de toi » ; arrivée par défaut après les slides.
- Sélecteurs : segments « Annonces » / « Dispo », vues « Liste » / « Carte » (Annonces seulement) ;
  `getByLabel` : « Inviter », « Je suis déjà sur place », « Je suis dispo », « Propose le premier »,
  « Réglages Dispo », « Autres filtres », « Temps de trajet maximum », « Heure minimum à partir de »,
  « Filtrer par autre quartier », « Autre quartier d’origine », « Autre budget maximum en euros »,
  « Autre catégorie : précise une activité », « Autre durée de trajet en minutes », « Autre jour, date JJ/MM ».
- Menu démo : ouverture du menu ici (5 taps sur le logo).
- Actions : ouvrir un moment (→ `OutingDetail`), « Inviter » / « Je suis déjà sur place » (→ onglet Publier),
  Dispo (→ `DispoSoir`), proposer un moment à une personne dispo.
- Captures verify : `02-fil-annonces.png`, `03-fil-dispo.png`.

## Publier (créer une annonce)
- Fichier : `src/screens/CreateOutingScreen.tsx`, onglet `Create` (paramètres `CreateOutingParams`).
- Accès : onglet « Publier » (avec compte ; sans compte → tunnel `Account`), « Inviter » du fil,
  « Créer une annonce » (Dispo, Profil).
- Sélecteurs : boutons « Publier », « Publier maintenant », « Clôturer les inscriptions », « Voir le moment » ;
  `getByLabel` : « Je suis déjà sur place », « Femmes uniquement », « Quartier, choix ou saisie libre »,
  « Autre jour, date JJ/MM », « Autre montant en euros », « Autre geste offert »,
  « Autre remise en pourcentage » (partenaire), « Voir le profil de <prénom> » (invitation ciblée).
- Menu démo : « Passer en partenaire (resto|bar|culture) » change le formulaire en annonce de lieu.
- Actions : publier (→ `OutingDetail`), invitation urgente sur place.

## Demandes
- Fichier : `src/screens/RequestsScreen.tsx`, onglet `Requests`.
- Accès : onglet « Demandes » (pastille = demandes reçues en attente + acceptations à confirmer).
- Sélecteurs : pastilles « Reçue » / « Envoyée » ; boutons « Accepter », « Refuser », « Ouvrir le chat »,
  « J’accepte » ou « Confirmer ma venue » (→ `ConfirmSlot`) ; `getByLabel('Libérer ma place')`,
  `getByLabel('Moment <titre> …')`, `getByLabel('Voir le profil de <prénom>')`.
- Menu démo : « Simuler demande Juliette » (il faut une annonce publiée), « Simuler acceptation (hôte) »
  (il faut une demande envoyée).
- Actions : accepter / refuser une demande, confirmer sa place, ouvrir le chat.
- Capture verify : `04-demandes.png`.

## Profil
- Fichier : `src/screens/ProfileScreen.tsx`, onglet `Profile` (paramètre `focusSection: 'rate' | 'photos'`).
- Accès : onglet « Profil ».
- Sélecteurs : `getByLabel('Photo de profil')`, `getByLabel('Ajouter : <intérêt>')` ; boutons « Gérer » (Dispo),
  « Créer une annonce », « Voir » (moment actif), « Noter le moment », « Marquer présent et noter »
  (hôte seulement), « Valider la présence et noter », « Je représente un lieu », « Gérer ma formule »,
  « Autoriser la localisation », « Autoriser les notifications ».
- Menu démo : « Simuler sortie terminée » renvoie ici (`focusSection: 'rate'`) s'il n'y a personne à noter ;
  section « Moments passés (photos) ».
- Actions : modifier le profil (→ `EditProfile`), avis (→ `Reviews`), noter (→ `LeaveReview`),
  formule (→ `Paywall`), demande partenaire (→ `PartnerApply`).
- Capture verify : `05-profil.png`.

## Détail d'un moment
- Fichier : `src/screens/OutingDetailScreen.tsx`, route `OutingDetail { outingId }`.
- Accès : carte du fil, Demandes, Profil (« Voir »), après publication, notification.
- Sélecteurs (selon rôle et heure) : « Demander à rejoindre », « Rejoindre », « Annuler ma demande »,
  « Confirmer ma place » / « Confirmer ma venue », « Je suis arrivé », « Je quitte la table », « Imprévu »,
  « Utiliser mon joker », « Libérer ma place », « Me désister », « Annuler le moment »,
  « Clôturer les inscriptions », « Marquer comme terminée », « Chat avec <prénom> »,
  « Marquer <prénom> présent », « Signaler absence de <prénom> », « Pas venu (<prénom>) »,
  « Pas venu (<prénom> dit être arrivé) », « Accepter l’imprévu », « Refuser », « Refuser (caution remboursée) »,
  « Accepter le lieu alternatif », « Oui » / « Non » ; lien « Signaler un souci » (→ `ReportTable`) ;
  `getByLabel('Voir les avis du lieu <lieu>')` (→ `VenueDetail`), `getByLabel('Voir le profil de <prénom>')`.
  Encarts de contestation : `NoShowContestCard` (invité), `HostNoShowContestCard` (hôte).
- Menu démo : « Simuler J−50 min (ouvrir le chat) », « Simuler H+6 », « Simuler sortie terminée »,
  « Signaler l’absence d’un invité », « Simuler mon absence (caution perdue) », « No-show hôte sur moi (1er/2e) »,
  « Lieu : mon annonce a commencé il y a 5 min (« Pas venu ») »,
  « Invité : sortie lieu dans ~10 min (« Je suis arrivé ») », « Simuler lendemain (silence → caution rendue) ».
- Actions : demande, confirmation, présence, absence, départ, imprévu, chat, signalement.

## Confirmation de place
- Fichier : `src/screens/ConfirmSlotScreen.tsx`, route `ConfirmSlot { requestId }`.
- Accès : Demandes (« J’accepte » / « Confirmer ma venue »), détail du moment, notification.
- Sélecteurs : « Voir le moment », « Voir les formules » (→ `Paywall`), « Retour au fil », « Retour aux annonces », « Retour ».
- Menu démo : « Simuler acceptation (hôte) » puis Demandes ; « Lieu : 1 invité confirme sa venue »,
  « Lieu : 2 confirmations simultanées (1 chaise) », « Course 2 confirmations (1er timestamp) ».
- Actions : confirmer dans les 10 min (caution), abonnement requis.

## Chat
- Fichier : `src/screens/ChatPlaceholderScreen.tsx`, route `ChatPlaceholder { outingId, requestId? }`.
- Accès : « Ouvrir le chat » (Demandes), « Chat avec <prénom> » (détail), notification.
- Sélecteurs : « Imprévu » (→ `Imprevu`), « J’ai un retard » ; `getByLabel('Voir le profil de <prénom>')`.
- Menu démo : « Simuler J−50 min (ouvrir le chat) », « Simuler retard de l’autre », « Simuler imprévu de l’autre »,
  « Simuler restaurant fermé ».
- Actions : messages, retard, imprévu.

## Imprévu
- Fichier : `src/screens/ImprevuScreen.tsx`, route `Imprevu { outingId, requestId? }`.
- Accès : bouton « Imprévu » (détail ou chat), notification.
- Sélecteurs : « Envoyer », « Utiliser mon joker », « Retour ».
- Menu démo : « Simuler imprévu de l’autre ».
- Actions : signaler un imprévu, joker (1 par mois, avant le début).

## Signaler (table)
- Fichier : `src/screens/ReportTableScreen.tsx`, route `ReportTable { outingId }`.
- Accès : lien « Signaler un souci » du détail (membres, chat de table ouvert).
- Sélecteurs : « Envoyer le signalement ».
- Menu démo : « Simuler J−50 min (ouvrir le chat) » pour ouvrir la fenêtre de signalement.
- Actions : catégorie (une seule) + phrase, envoi.

## Dispo du soir
- Fichier : `src/screens/DispoSoirScreen.tsx`, route `DispoSoir`.
- Accès : fil (`getByLabel('Réglages Dispo')` ; l'interrupteur « Je suis dispo » bascule sur place),
  Profil (« Gérer »), intention d'entrée `dispo`.
- Sélecteurs : « Enregistrer », « Créer une annonce » ; `getByLabel` : « Jour libre », « Heure libre »,
  « Autre créneau : jour et heure libres », « Autre : précise le moment ».
- Menu démo : « Simuler minuit (couper Dispo) ».
- Actions : se rendre visible, régler créneau et préférences.

## Modifier le profil
- Fichier : `src/screens/EditProfileScreen.tsx`, route `EditProfile`.
- Accès : Profil (nom ou « À propos »), détail du moment (alerte de profil incomplet).
- Sélecteurs : « Enregistrer » ; `getByLabel` : « Changer la photo », « Autre quartier », « Femmes uniquement par défaut ».
- Menu démo : aucun.

## Créer un compte (e-mail)
- Fichier : `src/screens/RegisterScreen.tsx`, route `Register { reason? }` (modale).
- Accès : détail du moment, après une demande (`reason: 'after_request'`).
- Sélecteurs : champs « E-mail », « Mot de passe » ; boutons « Enregistrer mon compte », « Plus tard ».
- Menu démo : aucun.

## Abonnements
- Fichier : `src/screens/PaywallScreen.tsx`, route `Paywall { returnToConfirmRequestId? }`.
- Accès : Profil (« Gérer ma formule »), confirmation (« Voir les formules »), détail du moment.
- Sélecteurs : textes « Choisis ta formule », « Essai en cours » / « Essai terminé », « Facturation », « Actuelle ».
  Aucun `accessibilityLabel` ni `Button` titré : sélection par texte uniquement.
- Menu démo : « Simuler fin d’essai (J+30) ».
- Actions : choisir une formule (démo, aucun paiement réel).

## Avis reçus
- Fichier : `src/screens/ReviewsScreen.tsx`, route `Reviews { userId, userName }`.
- Accès : Profil (ligne de note).
- Sélecteurs : « Répondre », « Fermer » ; `getByLabel('Voir le profil de <prénom>')`.
- Menu démo : aucun (outil démo interne à l'écran, `__DEV__`).

## Profil d'une autre personne
- Fichier : `src/screens/HostProfileScreen.tsx`, route `HostProfile { userId }`.
- Accès : tout `Voir le profil de <prénom>` (`src/utils/openUserProfile.ts`).
- Sélecteurs : « Proposer un moment à <prénom> », « Voir son moment », « Signaler », « Bloquer »,
  « Envoyer le signalement », « Annuler ».
- Menu démo : « Seed : moment passé avec photo acceptée (Nina) » ouvre le profil de Nina.

## Noter un moment
- Fichier : `src/screens/LeaveReviewScreen.tsx`, route `LeaveReview { outingId, toUserId, toUserName }`.
- Accès : Profil (« Noter le moment »), notification `rate_after`.
- Sélecteurs : `getByLabel('<n> étoile(s)')`, `getByLabel('Lieu · <n> étoile(s)')`,
  `getByLabel('Autre motif, en une ligne')` ; boutons « Publier l’avis », « Ajouter une photo du moment »,
  « Annuler », « Retour ».
- Menu démo : « Simuler sortie terminée » ouvre directement cet écran s'il y a quelqu'un à noter.
- Actions : note sur 5, note du lieu, photo.

## Je représente un lieu
- Fichier : `src/screens/PartnerApplyScreen.tsx`, route `PartnerApply`.
- Accès : Profil (« Je représente un lieu »).
- Sélecteurs : « Envoyer la demande ».
- Menu démo : « Confirmer la demande lieu (équipe Moment) », « Refuser la demande lieu », « Repasser particulier ».

## Avis du lieu
- Fichier : `src/screens/VenueDetailScreen.tsx`, route `VenueDetail { venueKey, venueName, … }`.
- Accès : détail du moment (`getByLabel('Voir les avis du lieu <lieu>')`).
- Sélecteurs : « Fermer ».
- Menu démo : aucun.

## Menu démo (rappel des sections)
`src/components/DemoMenuModal.tsx`, `__DEV__` seulement : Compte, Flux, Jour J / chat, Cas limites,
Notifs prioritaires (« Simuler toutes les notifs »), Partenaires (lieux), Moments passés (photos), Dispo,
Reset (« Réinitialiser la démo »).
