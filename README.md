# Griday

Puzzle logique quotidien pour Android : un puzzle par jour, identique pour tous, généré hors ligne à partir de la date.
Stack : React + Vite + TypeScript + Capacitor (à venir), moteur pur TypeScript dans [`engine/`](engine/README.md).

## Commandes
```bash
npm ci                    # installation
npm test                  # tests unitaires (Vitest)
npm run typecheck         # types (moteur sans DOM/Node + scripts)
npm run validate:future   # génère et vérifie les 10 prochaines années de puzzles
```

## Validation long terme
`scripts/validate-future.ts` génère chaque puzzle du jour sur 10 ans (pour chaque type, avec la version active à chaque date)
et vérifie : génération nominale sans secours, solution unique, résolution logique, difficulté conforme à la courbe
hebdomadaire, temps < 500 ms, et empreintes mensuelles identiques aux références figées (`scripts/golden/`, 30 ans).
Options : `--years=N`, `--from=YYYY-MM-DD`, `--max-ms=N`, `--types=queens`, `--report=fichier.json`,
`--write-golden` (ajoute les mois manquants ; ne remplace jamais une référence existante).

Le workflow [`validate.yml`](.github/workflows/validate.yml) lance types, tests et validation à chaque push,
sur les pull requests et chaque lundi (la fenêtre de 10 ans avance).
