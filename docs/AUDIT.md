# Audit de l'écosystème Studio Prism (22 octobre 2026)

Audit réalisé avant le développement de Nexus, en lecture seule, sur les dépôts de l'organisation `groupestudioprism` (clones superficiels de la branche principale). **Aucun dépôt existant n'a été modifié.**

## Dépôts examinés

| Dépôt | Lu | Contenu utile à Nexus |
| --- | --- | --- |
| `Studio-Prism` | oui | Site, comptes, catalogue, licences, administration, CMS, règles Firestore/Storage, Cloud Functions (non déployées) |
| `ArchiPlan` | oui | App de modélisation ; compte commun ; cloud `ap*` |
| `ArchiTraffic` | oui | App ARCHITRAFIC ; cloud `at*` ; script `make_rules.py` |
| `ArchiIndus` | oui | App ARCHIINDUS ; cloud `ai*` ; tests Chromium |
| `ArchiVision` | oui | Visionneuse web + projet Unity (APK Android) ; **pas de cloud Firestore** |
| `SpectraWriter`, `SpectraCalc`, `SpectraSlide` | oui | Gamme SPECTRA ; cloud `sw*` / `sc*` / `ss*` ; IA via Firebase AI Logic |
| `Nexus` | oui | Vide au départ |

L'URL `https://github.com/Kmauger18/Studio-Prism` de la demande correspond à l'ancien emplacement : le dépôt actif est `groupestudioprism/Studio-Prism` (le site redirige lui-même les anciens liens `kmauger18.github.io`, voir `js/links.js`). Le dépôt privé `claude-contexte` n'a pas été ouvert (hors périmètre).

## 1. Technologies

- **Site statique** HTML/CSS/JavaScript sans framework, publié par **GitHub Pages**. Les applications sont assemblées par un petit script Python (`tools/build.py`) en un seul `index.html`, qui injecte la configuration Firebase.
- **Firebase** : Authentication (e-mail + mot de passe), Cloud Firestore, Storage (médiathèque du site). Le site utilise le SDK modulaire 10.14.1 ; les applications le SDK « compat » 10.12.2 ; l'IA SPECTRA le SDK 13.0.0 (`firebase-ai`).
- Three.js, OpenCascade (WebAssembly) dans les applications Archi ; Unity pour l'APK ArchiVision.
- Adresses publiées (vérifiées, HTTP 200) : `https://<app>.studio-prism.com/` pour chaque application ; le site : `https://groupestudioprism.github.io/Studio-Prism/`.

## 2. Comptes : connexion, inscription, déconnexion

- **Un seul compte Studio Prism** pour le site et toutes les applications : même projet Firebase **`archivision-studioprism`** (configuration Web identique dans `Studio-Prism/js/firebase.js` et dans le `tools/build.py` de chaque application).
- Connexion e-mail / mot de passe ; persistance locale ou de session (« Se souvenir de moi ») ; réinitialisation par e-mail (réponse identique que l'adresse existe ou non).
- Inscription sur le site (et dans les applications) : `users/{uid}` créé avec `role: user`, `subscription: free`, `status: active` (particulier) ou `pending` (entreprise, validation manuelle), `companies/{id}`, éventuellement `licenseRequests`.
- À la connexion : profil absent → compte supprimé (trace `deletedAccounts/{uid}`) ; `suspended` / `pending` → refus avec message ; profil surveillé pendant la session (`onSnapshot`).
- Chaque application est sur **son propre domaine** : la session Firebase n'y est pas partagée (connexion à faire une fois par application). Le site et Nexus partagent en revanche l'origine `groupestudioprism.github.io`, donc la session.

## 3. Firebase et règles

- Un **fichier de règles commun** contient le site et les blocs de chaque application. Deux versions coexistent dans les dépôts :
  - 108 393 octets (Studio-Prism, ArchiPlan, ArchiTraffic, ArchiIndus) : site + ARCHIPLAN + ARCHITRAFIC + ARCHIINDUS ;
  - 150 743 octets (SpectraWriter, SpectraCalc, SpectraSlide) : la précédente (commentaires réduits) **+ les trois blocs SPECTRA**.
  La version réellement publiée dans la console n'est pas visible depuis le code : **à vérifier par le propriétaire** (voir `firebase/README.md`).
- Principes : refus par défaut, administrateur = `role == 'admin'` et `status == 'active'` relus à chaque requête, validation stricte des champs, plafond de 20 `get()` par lot.
- `storage.rules` (site) : dossier `media/` réservé aux administrateurs.
- **Forfait Spark** : les Cloud Functions du site sont présentes mais **non déployées** (exigent Blaze) ; tout fonctionne sans elles.

## 4. Profils et rôles

`users/{uid}` : `firstName`, `lastName`, `email`, `accountKind` (`individual` / `company`), `subscription` (`free` / `pro` / `pro_entreprise`), `role` (`user` / `admin`), `status` (`active` / `suspended` / `pending`), dates ; entreprise : `companyId`, `companyName`, `companyEmail`, `companyUserRange`, `companyUserLimit`, `jobTitle` ; organisation : `orgId`, `orgName`, `orgRole`, `orgClass`. Un utilisateur ne peut modifier que son nom, sa fonction et ses dates.

## 5. Abonnements et licences

- `products/{id}` (catalogue, lecture publique des produits publiés), `subscriptions` (formules), `prices` (prix), `licenses/{uid}_{produit}` (une licence par utilisateur et par produit, lisible par son titulaire avec `where userId == uid`), `licenseKeys` (clés d'activation), `organizations`.
- Identifiants de produit utilisés par les applications : `archiplan`, `architrafic` (un seul « f »), `archiindus`, `archivision`, `spectrawriter`, `spectracalc`, `spectraslide`.
- Aucun paiement en ligne : licences attribuées par un administrateur ou par clé.

## 6. Conventions graphiques

Site : Inter, bleu nuit `#071B55`, bleu `#0877B9`, cyan `#1F89C5`, turquoise `#169999`, fonds `#FFFFFF` / `#F2F7FA`, bordures `#DCE7EF`. Applications Archi : en-tête et barre d'outils sobres ; SPECTRA : panneau « prismatique ». Nexus reprend la palette (parenté) mais adopte sa propre typographie de titres (Sora), le bleu nuit comme couleur de texte et une seule pièce graphique forte (la carte des connexions).

## 7. Intégrations réellement possibles

| Application | Données Firestore | Lecture par Nexus | Écriture par Nexus | Ouverture directe |
| --- | --- | --- | --- | --- |
| ARCHIPLAN | `apProjects` (+ `content/main`), `apFolders`, `apShares`, `apUsage` | oui (vos projets, partages reçus) | non | `#/p/<id>` |
| ARCHITRAFIC | `atProjects`… | oui | non | `#/p/<id>` |
| ARCHIINDUS | `aiProjects`… | oui | non | `#/p/<id>` |
| ARCHIVISION | aucune | non | non | page d'accueil |
| SPECTRA Writer | `swDocs` (+ `content/main`), `swUsage`… | oui | **oui : création d'un document** (format `{v:1, app, title, html, theme, page}`, compteur de quota dans le même lot) | `#/doc/<id>` |
| SPECTRA Calc / Slide | `scDocs` / `ssDocs`… | oui | non (le format de leurs contenus n'a pas été validé pour une écriture par Nexus) | `#/doc/<id>` |

Le mécanisme est réel : même projet Firestore, même compte, **mêmes règles** que l'application. Aucun dépôt GitHub n'est utilisé comme « API ».

## 8. Limites, dépendances, coûts

- **Pas de backend** sur Spark : aucun déclencheur planifié ni traitement en arrière-plan ; les automatisations s'exécutent dans l'onglet ouvert.
- **IA** : les applications SPECTRA utilisent Firebase AI Logic (Gemini Developer API) sans serveur. Points à valider (sources : [tarifs Firebase AI Logic](https://firebase.google.com/docs/ai-logic/pricing), [conditions de l'API Gemini](https://ai.google.dev/terms)) :
  - l'offre gratuite reste sur Spark, mais les conditions de l'API Gemini n'autorisent, pour des utilisateurs situés dans l'EEE, en Suisse ou au Royaume-Uni, que les **offres payantes** ; les contenus envoyés à l'offre gratuite peuvent servir à Google ;
  - Firebase annonce **App Check obligatoire pour AI Logic à partir du 2 novembre 2026** (l'IA des applications SPECTRA est aussi concernée) ;
  - Vertex AI exige Blaze.
- Taille des règles : 163 Ko avec Nexus (limite Firebase : 256 Ko).
- Quotas Spark Firestore : 50 000 lectures et 20 000 écritures par jour — usage de Nexus faible (une requête par application connectée à l'affichage, quelques écritures par exécution).
