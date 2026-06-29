# SCM CSTimer Migration Lab

Outil public de validation de migration CSTimer vers Speedcube Master.

Le but est simple: faire tester de vrais exports utilisateurs avant intégration finale dans SCM.

## Fonctionnalités

- Import d'exports CSTimer (`.txt` / `.json`)
- Mapping des puzzles WCA (incluant FTO)
- Conservation des sessions CSTimer (nom, puzzle, solves)
- Persistance locale robuste en `localStorage` (format compact)
- Réimport idempotent par session CSTimer (remplacement, pas d'append aveugle)
- Bloc `DIAGNOSTIC IMPORT` + bouton `COPIER RAPPORT BUG`

## Lancer en local

Option rapide:

1. Ouvrir `index.html` dans ton navigateur.

Option propre (recommandé):

1. Depuis ce dossier, lancer un serveur statique (ex: VSCode Live Server, `npx serve`, ou `python -m http.server`).
2. Ouvrir l'URL locale fournie.

## Workflow de test utilisateur

1. Importer le fichier CSTimer.
2. Vérifier puzzle / session / nombre de solves.
3. Recharger la page (validation persistance).
4. Réimporter le même fichier (validation anti-doublon par session).
5. En cas de bug: cliquer `COPIER RAPPORT BUG` puis partager:
   - rapport copié
   - nom du fichier
   - résultat attendu
   - résultat réel

## Déploiement public

Le projet est 100% statique, donc déploiement très simple:

- **Vercel**: import du repo -> deploy direct (aucun build requis)
- **Netlify**: import du repo -> publish directory `./`
- **GitHub Pages**: servir la racine du repo

## Structure

- `index.html`: UI
- `styles.css`: design
- `app.js`: logique timer/import/storage/diagnostics

## Limites connues

- `localStorage` reste limité par quota navigateur.
- Certains `scrType` non-WCA/custom CSTimer peuvent être ignorés (comptés dans le diagnostic).
- Projet orienté test migration, pas remplacement complet de CSTimer.
