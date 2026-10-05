# Griday

Puzzle logique quotidien pour Android : un puzzle par jour, identique pour tous, généré hors ligne à partir de la date.
Deux jeux en alternance quotidienne (Reines, Binairo), mode illimité, série, statistiques, archives, rappel quotidien.

Stack : React 19 + Vite + TypeScript + Capacitor 8 (Android), Material You maison (`src/ui`), i18n FR/EN (`locales/`),
moteur pur TypeScript et déterministe dans [`engine/`](engine/README.md). Projet Android : [`android/`](android/README-griday.md).

## Commandes
```bash
npm ci                    # installation
npm run dev               # application dans le navigateur (vidéos récompensées simulées en développement)
npm test                  # tests unitaires (Vitest : moteur + application)
npm run typecheck         # types (moteur sans DOM/Node, scripts, application)
npm run build             # build web (dist/)
npm run cap:sync          # build + synchronisation du projet Android
npm run validate:future   # génère et vérifie les 10 prochaines années de puzzles
```

## Organisation
- `engine/` : générateurs versionnés et figés, solveurs logiques, notation, indices, calendrier (`config.ts`).
- `src/` : application (écrans, jeu générique `src/game/core` + un dossier par type, progression, rappels, partage,
  monétisation `src/monetization`).
- `locales/` : textes FR et EN (mêmes clés). `store/` : fiche Play Store FR/EN, politique de confidentialité,
  aide-mémoire Play Console.

## Monétisation et variantes de build
- Version gratuite : 2 indices par grille puis une courte vidéo par indice ; archives des 7 derniers jours libres, plus
  anciennes débloquées par une vidéo ; un gel de série offert par semaine contre une vidéo ; un interstitiel après le
  puzzle du jour et toutes les 3 parties illimitées ; jamais de bannière. Consentement RGPD par l'UMP de Google.
- Premium (achat unique Google Play, codes promo compris) : aucune publicité, indices et archives illimités.
- Variables de build : `VITE_ADS=false` (APK personnel sans publicité ni achat, tout débloqué),
  `VITE_ADMOB_REWARDED_ID`, `VITE_ADMOB_INTERSTITIAL_ID`, `VITE_PREMIUM_PRODUCT_ID` ; `ADMOB_APP_ID` pour Gradle.
  Sans identifiants réels (et toujours en développement) : annonces de test de Google.

## APK
Le workflow [`android.yml`](.github/workflows/android.yml) produit à chaque push deux APK en artefacts : `pub`
(publicités + Premium) et `perso` (`VITE_ADS=false`) ; release signée (APK + AAB) si le keystore est fourni en secret,
sinon APK de debug ; un tag `v*` les joint à une release GitHub. Secrets et compilation locale :
[`android/README-griday.md`](android/README-griday.md).

## Validation long terme
`scripts/validate-future.ts` (logique dans `scripts/lib/validate.ts`, testée) génère chaque puzzle du jour, pour chaque type
et avec la version active à chaque date, sur [mois courant, aujourd'hui + 10 ans] étendu à l'epoch et à toutes les
références figées (30 ans pour Queens V1 et Binairo V1). Pour chaque jour : génération nominale sans secours, solution unique
(vérification indépendante du générateur), taille et palier conformes au plan, note recalculée identique, critère
d'acceptation, temps < 500 ms (1re mesure ; une 2e mesure n'excuse qu'une pause isolée, au plus 3 ; arrêt anticipé après
20 lenteurs) et temps à froid (processus neuf, chargement des modules compris, minimum de 2 essais) pour le jour le plus
lent de chaque jour de semaine. Plus : courbe hebdomadaire croissante,
registre/calendrier cohérents, tous les puzzles de secours vérifiés.

Références figées (`scripts/golden/`, ajout seul) :
- `<type>-v<N>.json` : sortie de chaque version, par mois, indépendante du calendrier ;
- `daily.json` : puzzle effectivement servi (type + version) de l'epoch jusqu'à `validThrough`.

Une référence divergente est une erreur ; une référence absente aussi pour un puzzle servi jusqu'à `validThrough`
(simple avertissement au-delà). `--write-golden` n'ajoute que ces références obligatoires, ne remplace jamais, et n'écrit
rien si une erreur subsiste. En CI, `scripts/check-golden.ts` compare en plus les références à la révision de base :
toute clé supprimée ou modifiée échoue (contournement avant lancement uniquement : « [golden-reset] » dans le message).
Options : `--years=N`, `--from=YYYY-MM-DD`, `--max-ms=N`, `--types=queens,binairo`, `--report=fichier.json`, `--write-golden`,
`--pin=type:version` (version pas encore servie : toutes ses références de la plage deviennent obligatoires, ex.
`--types=binairo --years=30 --pin=binairo:1 --write-golden`), `--no-cold`. Chaque type est validé chaque jour, qu'il
soit dans la rotation ou non. Code de sortie : 0 OK, 1 échec, 2 arguments invalides.

Le workflow [`validate.yml`](.github/workflows/validate.yml) lance types, tests et validation à chaque push,
sur les pull requests et chaque lundi (la fenêtre de 10 ans avance).
