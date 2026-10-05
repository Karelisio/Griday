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
`scripts/validate-future.ts` (logique dans `scripts/lib/validate.ts`, testée) génère chaque puzzle du jour, pour chaque type
et avec la version active à chaque date, sur [mois courant, aujourd'hui + 10 ans] étendu à l'epoch et à toutes les
références figées (30 ans pour Queens V1). Pour chaque jour : génération nominale sans secours, solution unique
(vérification indépendante du générateur), taille et palier conformes au plan, note recalculée identique, critère
d'acceptation, temps < 500 ms (1re mesure ; une 2e mesure n'excuse qu'une pause isolée, au plus 3) et temps à froid
dans un processus neuf pour le jour le plus lent de chaque jour de semaine. Plus : courbe hebdomadaire croissante,
registre/calendrier cohérents, tous les puzzles de secours vérifiés.

Références figées (`scripts/golden/`, ajout seul) :
- `<type>-v<N>.json` : sortie de chaque version, par mois, indépendante du calendrier ;
- `daily.json` : puzzle effectivement servi (type + version) de l'epoch jusqu'à `validThrough`.

Une référence divergente est une erreur ; une référence absente aussi jusqu'à `validThrough` (simple avertissement au-delà).
`--write-golden` n'ajoute que les références manquantes, ne remplace jamais, et n'écrit rien si une erreur subsiste.
Options : `--years=N`, `--from=YYYY-MM-DD`, `--max-ms=N`, `--types=queens`, `--report=fichier.json`, `--write-golden`,
`--no-cold`. Code de sortie : 0 OK, 1 échec, 2 arguments invalides.

Le workflow [`validate.yml`](.github/workflows/validate.yml) lance types, tests et validation à chaque push,
sur les pull requests et chaque lundi (la fenêtre de 10 ans avance).
