# Moteur Griday (`/engine`)

TypeScript pur, sans dépendance UI. Tout puzzle publié doit rester **identique pour toujours, sur tous les appareils**.

## Structure
- `core/` — PRNG figé (cyrb128 + sfc32), dates entières, calendrier versionné, pipeline (graines, tentatives, secours).
- `config.ts` — calendrier officiel (epoch, `validThrough`, rotation des types, versions datées).
- `queens/` — règles, encodage, solveur exact (évolutifs), indices.
- `queens/v1/` — **Queens V1 figée** : générateur, solveur logique/notation, plan hebdo, bandes de score, secours.
  Autonome à l'exécution (seuls `core/prng.ts` et des imports de types). Verrouillée par `freeze.test.ts`.
- `selfcheck.ts` — auto-vérification à lancer au démarrage de l'app (dans le WebView réel).

## Règles de déterminisme
- Aléatoire : uniquement `core/prng.ts`. Jamais `Math.random`, jamais l'heure dans la logique (lint dans `prng.test.ts`).
- Calculs entiers uniquement (masques de bits, `Math.imul`, tirages par rejet), ordres de parcours fixes.
- `deadlineMs` est un filet de sécurité non déterministe (résultat `source: 'emergency'`) : ne pas l'utiliser pour le puzzle du jour.

## Pipeline du puzzle du jour
1. `config.ts` → type du jour (rotation) et version du générateur (tables datées).
2. Graine de base `"YYYY-MM-DD:type:vN"` ; tentative k : `"…#k"` (graine + k).
3. Tentative : candidat → solution unique → résolution logique sans deviner → palier + bande de score de la cible du jour.
4. Budget déterministe (200 tentatives), puis puzzle de secours pré-calculé choisi par hash de la graine.

## Versionnage (après publication)
- Ne **jamais** modifier `queens/v1/` (hors tests) ni `core/prng.ts` : `freeze.test.ts` compare l'empreinte des sources,
  des puzzles du jour, de chaque candidat du générateur (même rejeté) et des secours.
- Faire évoluer les indices : copier `v1/solver.ts` en `queens/solver.ts` et y brancher `hint.ts`.
- Nouveau générateur : copier dans `queens/v2/`, modifier la copie, l'ajouter au registre, puis ajouter
  `{ from, version: 2 }` dans `config.ts` avec `from` > `validThrough` de **tous** les builds déjà publiés.
- Nouveau type : nouveau dossier + `PUZZLE_TYPE_IDS` + entrée de rotation datée (même règle sur `from`).
- `validThrough` : repoussé à chaque publication ; au-delà, l'app invite à mettre à jour (`isScheduleStale`).
- `epoch` (numéro du puzzle, visible) : à fixer au jour du lancement, puis figé.
