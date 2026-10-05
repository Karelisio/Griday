# Moteur Griday (`/engine`)

TypeScript pur, sans dépendance UI. Tout puzzle publié doit rester **identique pour toujours, sur tous les appareils**.

## Structure
- `core/` — PRNG figé (cyrb128 + sfc32), dates entières, calendrier versionné, pipeline (graines, tentatives, secours).
- `config.ts` — calendrier officiel (epoch, `validThrough`, rotation des types, versions datées).
- `queens/` — règles, encodage, solveur exact (évolutifs), indices.
- `queens/v1/` — **Queens V1 figée** : générateur, solveur logique/notation, plan hebdo, bandes de score, secours.
  Autonome à l'exécution (seuls `core/prng.ts` et des imports de types). Verrouillée par `freeze.test.ts`.
- `binairo/` — Binairo (Takuzu) : types, règles, encodage, solveur exact indépendant (`exact.ts`), indices.
- `binairo/v1/` — **Binairo V1 figée** (même organisation que Queens V1, voir plus bas). En rotation depuis le n°1 :
  Queens les jours pairs depuis l'epoch, Binairo les jours impairs (7 étant impair, chacun passe par tous les jours de la semaine).
- `registry.ts` — définitions par type ; `AnyDailyPuzzle` ne couvre que les types des `rotations` de `config.ts`
  (calendrier littéral `as const satisfies Schedule`) : ajouter un type à la rotation élargit ce type et le
  compilateur signale le code UI à compléter. `getUnlimitedPuzzle('binairo', …)` est typé par son argument.
- `selfcheck.ts` — auto-vérification à lancer au démarrage de l'app (dans le WebView réel) : jours du calendrier des
  deux types, plus Binairo V1 par version explicite. Valeurs attendues dans `selfcheck-expected.ts` (données pures :
  l'app en tire `SELFCHECK_REVISION` et relance le contrôle quand elles changent).

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
- `scripts/validate-future.ts` (CI à chaque push) revalide au moins 10 ans et compare les références figées
  (`scripts/golden/` : sortie de chaque version et puzzle du jour servi ; ajout seul via `--write-golden`).
  À chaque publication : repousser `validThrough`, puis `npm run validate:future -- --write-golden`.
  Chaque type est validé chaque jour, rotation ou non ; `--pin=type:version` rend obligatoires (et donc écrites
  par `--write-golden`) toutes les références d'une version pas encore servie (Binairo V1 : 2026-10 → 2056-09).
- Ajouter un membre d'interface après publication : envelopper la V1 dans `queens/index.ts`, ne pas éditer `v1/`.
- `epoch` (numéro du puzzle, visible) : à fixer au jour du lancement, puis figé.

## Binairo V1
Grille n×n, n pair. Cases (données, solution, marques du joueur) : `0` vide, `1` symbole A, `2` symbole B.
Règles : jamais trois symboles identiques adjacents ; n/2 de chaque symbole par ligne et colonne ; lignes (et
colonnes) toutes différentes. Une case donnée vaut toujours sa donnée (marque posée dessus ignorée ; `solved`
exige qu'elle soit vide ou égale). `encode` (figé) : données puis solution, un chiffre par case (`"0102…/1212…"`).

Techniques (`v1/solver.ts`, identifiants = clés i18n de l'UI), essayées de la plus facile à la plus difficile :

| id | niveau | poids | déduction (une étape) |
|---|---|---|---|
| `pair` | 1 | 1 | XX → cases vides voisines = autre symbole |
| `sandwich` | 2 | 1 | X·X → milieu = autre symbole |
| `count` | 3 | 2 | ligne avec n/2 X → ses cases vides = autre symbole |
| `line` | 4 | 4 | cases communes à toutes les complétions valides de la ligne (règles 1–2) |
| `unique` | 5 | 7 | idem, la complétion égale à une ligne parallèle complète `other` étant exclue (règle 3) |
| `contradiction` | 6 | 12 | hypothèse sur une case, propagée par pair/sandwich/count jusqu'à une règle enfreinte |

Palier = niveau max utilisé (≤ 3 → 1, 4 → 2, 5 → 3, 6 → 4) ; score = somme des poids. `BinairoStep` : `place`
(cases déduites, ≥ 1, toutes vides avant l'étape), `cells` (pivots : paire, extrémités, cases du symbole complet,
cases connues de la ligne, ligne comparée, cases en faute sous l'hypothèse), `line`, `other` (voir l'en-tête du
solveur). Indices (`hint.ts`) : erreurs d'abord, sinon l'étape la plus facile depuis l'état du joueur, sinon une
case dévoilée.

Générateur (`v1/generator.ts`) : grille pleine aléatoire (rangées valides mélangées, colonnes toujours complétables,
passes courtes recommencées), puis creusement en deux phases dans un ordre mélangé : phase 1 avec les techniques du
palier inférieur, phase 2 avec celles du palier visé ; toute donnée retirée en phase 2 rend une technique du palier
visé nécessaire (palier garanti). Résolubilité vérifiée par une fermeture rapide équivalente au solveur pas à pas.
Unicité : conséquence de la résolution logique ; `verify` la revérifie avec `exact.ts`.

Plan (lun → dim) : 6/1, 8/1, 8/2, 8/3, 10/2, 10/3, 10/4 ; illimité : 6, 8, 10, 12 × paliers 1–4.
Bandes de score (`v1/version.ts`) : 8/2 [54, 70], 8/3 [66, 90], 10/2 [82, 106], 10/3 [96, 125], 10/4 [120, 190] ;
médianes servies 31, 50, 59, 75, 91, 107, 141. Mesures et réglages : `npx tsx scripts/binairo-gen-stats.ts`.
Secours : 64 (4 par taille × palier), `npx tsx scripts/build-binairo-fallbacks.ts` (une fois, avant publication).
Valeurs de gel : `npx tsx scripts/print-golden.ts binairo`.
