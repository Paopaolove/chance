# Vérification avant push

## `npm run verify`

Enchaîne, avec arrêt au premier échec :

1. `tsc --noEmit`
2. `npm run test:rules`
3. export web : `expo export --platform web` vers `.verify/dist` (hors ligne, `EXPO_OFFLINE=1`)
4. 6 captures Playwright de l'export, taille fixe 390×844, dans `.verify/captures` :
   `01-onboarding`, `02-fil-annonces`, `03-fil-dispo`, `04-demandes`, `05-profil`, `06-publier-compte`

Sortie : une seule ligne.

```
verify OK · tsc 0 · 722/722 tests · export OK · 6 captures · 42 s
verify KO · <étape> · <premier échec>
```

Détails : `.verify/verify.log`. Tout `.verify/` est ignoré par git.

- Node 22 : le script met `$HOME/.local/node22/bin` en tête du PATH de ses sous-processus.
- Navigateur : `playwright-core` (devDependency, sans téléchargement de navigateur) pilote le Chrome
  installé sur la machine (`/opt/google/chrome/chrome`, etc.). Variable `VERIFY_CHROME` pour en imposer un.
- Captures : aucune comparaison de pixels. On vérifie que chaque fichier existe, pèse plus de 5 Ko,
  et que l'écran attendu est affiché.
- Web : `react-native-maps` n'existe pas sur le web ; `metro.config.js` le remplace par un bouchon
  (`scripts/verify/web-stubs/`) pour la plateforme web seulement. iOS et Android ne changent pas.

## Hook pre-push

Le hook versionné `.githooks/pre-push` lance `npm run verify` et bloque le push si la vérification échoue.

Activation, une fois par clone :

```
git config core.hooksPath .githooks
```
