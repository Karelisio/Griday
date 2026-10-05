# Play Console : déclarations liées à la monétisation

Aide-mémoire pour remplir la Play Console. **À revérifier** avec la documentation à jour de Google
(« Sécurité des données » d’AdMob : https://developers.google.com/admob/android/privacy/play-data-disclosure) avant publication.

## Contient des annonces

Oui (version Play Store). L’APK « perso » (`VITE_ADS=false`) n’en contient pas.

## Sécurité des données

Griday lui-même ne collecte ni ne transmet aucune donnée : tout reste sur l’appareil. Les déclarations viennent du SDK Google Mobile Ads (AdMob) et de Google Play Billing.

| Catégorie | Collectée | Partagée | Finalités |
| --- | --- | --- | --- |
| Identifiants de l’appareil ou autres (ID publicitaire) | Oui | Oui (Google) | Publicité, analyse, prévention des fraudes |
| Position approximative (adresse IP) | Oui | Oui (Google) | Publicité, prévention des fraudes |
| Interactions avec l’application (annonces) | Oui | Oui (Google) | Publicité, analyse |
| Informations de diagnostic (plantages, performances du SDK) | Oui | Oui (Google) | Analyse, prévention des fraudes |
| Historique des achats | Traité par Google Play | — | Fonctionnalité de l’application |

- Données chiffrées en transit : oui (SDK Google).
- Suppression des données : aucune donnée détenue par Griday ; les données publicitaires relèvent de Google.
- Collecte facultative ? Non pour l’ID publicitaire (l’utilisateur peut toutefois le réinitialiser ou le supprimer dans Android).

## Identifiant publicitaire

Déclarer que l’application utilise l’identifiant publicitaire (Règles relatives aux applications › Identifiant publicitaire) : finalités Publicité ou marketing, Analyse. La permission `com.google.android.gms.permission.AD_ID` est ajoutée par le SDK AdMob (absente de l’APK « perso »).

## AdMob

- Associer l’application AdMob à la fiche Play une fois publiée (AdMob › Applications › Paramètres de l’application).
- Publier un fichier `app-ads.txt` sur le site du développeur indiqué dans la fiche Play (ligne fournie par AdMob), sinon une partie de la demande publicitaire est refusée.
- Messages de confidentialité (AdMob › Confidentialité et messagerie) : créer le message RGPD (EEE, Royaume-Uni, Suisse) que l’application affiche via l’UMP.

## Public cible

13 ans et plus (pas d’application destinée aux enfants : sinon, régler AdMob en conséquence — `tagForChildDirectedTreatment` — et revoir les formats d’annonces).

## Politique de confidentialité

Publier `store/fr-FR/privacy_policy.md` et `store/en-US/privacy_policy.md` (en complétant date et adresse de contact) sur une page web publique, puis en indiquer l’URL dans la Play Console.

## Produit intégré

Produit **non consommable** `griday_premium` (ou la valeur de `VITE_PREMIUM_PRODUCT_ID`). Les codes promo se créent dans la Play Console (Monétiser › Codes promo) : une fois échangés dans le Play Store, l’achat est reconnu au prochain lancement de l’app (ou aussitôt si elle est ouverte).
