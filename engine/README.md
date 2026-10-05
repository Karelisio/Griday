# Moteur Griday (`/engine`)

TypeScript pur, sans dépendance UI. Tout puzzle publié doit rester **identique pour toujours, sur tous les appareils**.

## Règles de déterminisme
- Aléatoire : uniquement `core/prng.ts` (cyrb128 + sfc32). Jamais `Math.random`, jamais l'heure dans la logique.
- Calculs entiers uniquement (masques de bits, `Math.imul`, tirages par rejet).
- Ordres de parcours fixes et documentés.
- Le seul usage de l'horloge est le filet `deadlineMs` (sécurité, ne doit jamais se déclencher).

## Pipeline du puzzle du jour
1. `config.ts` → type du jour (rotation) et version du générateur (tables datées).
2. Graine de base : `"YYYY-MM-DD:type:vN"` ; tentative k : `"…#k"` (graine + k).
3. Chaque tentative : candidat → solution unique (solveur exact) → résolution logique sans deviner → difficulté = cible du jour (courbe lundi → dimanche).
4. Budget déterministe de tentatives, puis puzzle de secours pré-calculé choisi par hash de la graine.

## Versionnage (après publication)
- Ne **jamais** modifier une entrée existante de `config.ts`, ni le comportement d'une version publiée.
- Changer un générateur/solveur/courbe = créer `vN+1` (copier le code concerné si besoin), l'ajouter au registre,
  puis ajouter `{ from: <date future>, version: N+1 }` dans `config.ts`.
- Ajouter un type de puzzle = nouveau dossier + `PUZZLE_TYPE_IDS` + nouvelle entrée de rotation datée dans le futur.
- Les tests « golden » (empreintes de puzzles à dates fixes) et `scripts/validate-future.ts` échouent si une version publiée change.
