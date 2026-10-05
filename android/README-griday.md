# Projet Android de Griday

Projet Capacitor 8 (`npx cap add android`) : package `io.github.karelisio.griday`, minSdk 24, compileSdk et targetSdk 36.
Le code TypeScript associé est dans [`src/platform/`](../src/platform).

## Écarts avec le gabarit Capacitor

| Fichier | Changement |
| --- | --- |
| `app/src/main/java/.../MainActivity.java` | Enregistre `MaterialYouPlugin` avant `super.onCreate`. Edge-to-edge sur toutes les versions (`setDecorFitsSystemWindows(false)`). WebView transparent : la couleur de fenêtre (claire/sombre) reste visible avant le premier rendu, sans flash blanc. |
| `app/src/main/java/.../MaterialYouPlugin.java` | Plugin natif des couleurs dynamiques (voir plus bas). |
| `app/src/main/AndroidManifest.xml` | `enableOnBackInvokedCallback="true"` (retour prédictif) et activité en portrait. Rappel quotidien : `POST_NOTIFICATIONS` ; `SCHEDULE_EXACT_ALARM` (ajoutée par le plugin) **retirée** (`tools:node="remove"`) : Google Play réserve les alarmes exactes aux réveils et agendas, les rappels sont programmés en alarmes inexactes. |
| `app/src/main/res/drawable/ic_stat_griday.xml` | Petite icône monochrome (couronne blanche) des notifications. |
| `app/src/main/res/values*/styles.xml`, `colors.xml` | Barres système transparentes, sans voile de contraste (`values-v26`, `v27`, `v29`), découpage d'écran `shortEdges`. Écran de démarrage `Theme.SplashScreen` : fond violet de la marque (#5B4FC4) et icône de l'app. Un style redéfini dans `values-vNN` remplace entièrement celui de `values/` : d'où le parent `Base.*`. |
| `app/src/main/res/drawable/ic_launcher_*.xml`, `mipmap-anydpi-v26/` | Icône adaptative **provisoire** (couronne sur grille 3x3) avec couche `monochrome` (icônes thématiques, Android 13+). Aussi utilisée comme icône du splash. |
| `app/src/main/res/mipmap-*/ic_launcher*.png` | Replis pour Android 7.0 et 7.1 (pas d'icônes adaptatives avant 8.0), même dessin. |
| `app/build.gradle` | `versionName` = version de `package.json`, `versionCode` = M×10000 + m×100 + p (0.1.0 donne 100), surchargeable avec `-PversionCode=N`. Identifiant d'application AdMob (`ADMOB_APP_ID`, voir « Publicité »). Signature de release par variables d'environnement (voir « Compiler »). |
| `app/src/main/AndroidManifest.xml` (AdMob) | `com.google.android.gms.ads.APPLICATION_ID` = `${admobAppId}` (placeholder Gradle) : sans lui, le SDK publicitaire plante au démarrage. |
| `app/src/test`, `app/src/androidTest` | Tests d'exemple conservés, déplacés dans le bon package. |
| Supprimés | `drawable*/splash.png`, `mipmap-*/ic_launcher_foreground.png`, `drawable-v24/` (images du gabarit devenues inutiles). |

À ne pas éditer (régénérés par `cap sync`) : `app/capacitor.build.gradle`, `capacitor.settings.gradle`, `app/src/main/assets/` (config, plugins, `public/`), `app/src/main/res/xml/config.xml`, `capacitor-cordova-android-plugins/`.

`capacitor.config.ts` : `plugins.App.disableBackButtonHandler: true`, voir « Retour prédictif » ; `plugins.LocalNotifications` (petite icône `ic_stat_griday`, couleur de la marque), pris en compte après `cap sync`.

## Rappel quotidien

`src/reminders/` planifie les 14 prochains rappels (un par jour à l'heure choisie, sauf aujourd'hui si le puzzle est résolu ou l'heure passée) et les reprogramme à l'ouverture, au retour au premier plan et à chaque changement (réglage, langue, victoire, série). Identifiant = date AAAAMMJJ. Après une mise à jour de l'app, Android efface les alarmes : elles reviennent à la prochaine ouverture. Le redémarrage du téléphone est géré par le plugin.

## Couleurs dynamiques

1. `MaterialYou.getPalettes()` (Java) lit les 65 ressources `android.R.color.system_<palette>_{0,10,50,100,...,1000}` (accent1-3, neutral1-2 ; tons HCT 100, 99, 95, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0). Réponse : `{ supported: false }` avant Android 12, sinon `{ supported: true, accent1, accent2, accent3, neutral1, neutral2 }`, 13 entiers ARGB chacun. Les `int` Java sont signés ; le plugin les envoie non signés (`& 0xFFFFFFFFL`).
2. `getSystemPalettes()` (`src/platform/dynamicColor.ts`) vérifie 5 palettes de 13 entiers, normalise avec `>>> 0` et renvoie un `SystemPalettes` (`src/shared/systemPalettes.ts`), ou `null` : web, Android < 12, réponse invalide ou erreur. Le thème retombe alors sur la palette de la marque.
3. Changement de palette : à chaque `onResume` et `onConfigurationChanged`, le plugin compare les couleurs à celles que le JS a lues en dernier et émet `paletteChanged` si elles diffèrent. `onSystemPalettesChanged(cb)` relit alors les palettes et appelle `cb`. Si Android recrée l'activité (cela peut arriver après un changement de fond d'écran), le JS se recharge et relit au démarrage.

## Retour prédictif

Pile vide : le gestionnaire du plugin App est désactivé et Android joue l'animation système « retour à l'accueil ». Dès qu'une feuille, un dialogue ou un sous-écran s'ouvre (`pushBackHandler`), le gestionnaire est réactivé et l'événement `backButton` appelle le gestionnaire du dessus. `disableBackButtonHandler: true` fixe l'état initial (désactivé) ; `initBackHandling()` se déclenche aussi au premier `pushBackHandler`.

## Publicité et Premium

- AdMob (`@capacitor-community/admob`) : vidéos avec récompense et interstitiels, consentement RGPD par l'UMP de Google. Code : `src/monetization/`.
- Premium : produit non consommable Google Play (`cordova-plugin-purchase`, plugin Cordova intégré par Capacitor dans `capacitor-cordova-android-plugins/`).
- Identifiants : application AdMob via `ADMOB_APP_ID` (Gradle) ; blocs d'annonces via `VITE_ADMOB_REWARDED_ID` et `VITE_ADMOB_INTERSTITIAL_ID` (build web). Sans eux, ou en développement, ce sont ceux **de test** de Google. Produit Premium : `VITE_PREMIUM_PRODUCT_ID` (défaut `griday_premium`).
- APK personnel sans publicité : `VITE_ADS=false npm run build && VITE_ADS=false npx cap sync android` (ou `VITE_ADS=false` dans `.env.local`, lu par Vite comme par `capacitor.config.ts`). `capacitor.config.ts` exclut alors les deux plugins de monétisation du projet (ni SDK publicitaire, ni facturation, ni permission `AD_ID`) et l'app débloque tout.

## Compiler

Prérequis : JDK 21, Android SDK avec la plateforme 36 et les build-tools 36.0.0 (`ANDROID_HOME`, ou `sdk.dir` dans `android/local.properties`, non versionné).

```bash
npm ci
npm run cap:sync                  # tsc + vite build + cap sync android
cd android && ./gradlew assembleDebug
# APK : android/app/build/outputs/apk/debug/app-debug.apk
```

Version de release signée : définir `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (et `ANDROID_KEY_PASSWORD` s'il diffère), puis `./gradlew assembleRelease bundleRelease` (`-PversionCode=N` au besoin). Sans keystore, `assembleRelease` produit un APK non signé (non installable).

### GitHub Actions (`.github/workflows/android.yml`)

À chaque push, l'APK `pub` (publicités + Premium) en artefact : release signée avec les vrais identifiants AdMob si le keystore est fourni, sinon APK de debug avec annonces de test. Un tag `v*` joint APK et AAB à une release GitHub (refusée sans identifiants AdMob). L'APK `perso` (`VITE_ADS=false`) ne se construit qu'à la demande (lancement manuel, case « perso ») et n'est jamais publié : sur un dépôt public, les artefacts sont téléchargeables par tout compte GitHub.

| Secret / variable | Rôle |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Keystore de publication encodé en base64 (`base64 -w0 release.jks`). Absent : APK de debug. |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | Mots de passe et alias de la clé. |
| `ADMOB_APP_ID`, `ADMOB_REWARDED_ID`, `ADMOB_INTERSTITIAL_ID` | Identifiants AdMob réels (sinon : test). |
| `PREMIUM_PRODUCT_ID` (variable) | Identifiant du produit Premium, s'il diffère de `griday_premium`. |

Créer un keystore : `keytool -genkeypair -v -keystore release.jks -alias griday -keyalg RSA -keysize 2048 -validity 10000`. À conserver précieusement : sans lui, impossible de publier une mise à jour (sauf signature d'application gérée par Google Play).

## À faire plus tard

- Icône et splash définitifs (Image Asset Studio, ou remplacer les trois vecteurs `ic_launcher_*.xml` et les PNG de repli).
- Permission `INTERNET` : nécessaire aux publicités et à Google Play ; le jeu lui-même reste entièrement hors ligne.
