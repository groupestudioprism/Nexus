# Architecture de Nexus

## Choix principaux (et pourquoi)

| Choix | Raison |
| --- | --- |
| **Site statique, modules JavaScript natifs, sans framework ni build** | Même approche que tout l'écosystème Studio Prism ; publiable tel quel sur GitHub Pages ; aucune dépendance à maintenir côté navigateur. Une migration vers un framework n'apportait rien d'objectif ici. |
| **Même projet Firebase `archivision-studioprism`** | Exigence : le compte Studio Prism existant ouvre Nexus. Aucun nouveau projet, aucune nouvelle application Firebase, aucun second système de comptes. |
| **Hébergement prévu : `groupestudioprism.github.io/Nexus/`** (sans domaine personnalisé) | Même origine que le site Studio Prism → **session partagée** avec le site, et domaine déjà autorisé dans Firebase Authentication. Un domaine `nexus.studio-prism.com` reste possible (à ajouter aux domaines autorisés ; la session ne serait plus partagée). |
| **SDK Firebase modulaire 13.0.0 (CDN gstatic)** | Version déjà employée par l'IA SPECTRA sur ce projet, et qui fournit `firebase-ai` (AXION). Une seule version, définie dans `src/config/app-config.js`. |
| **Aucun backend** | Forfait Spark : pas de Cloud Functions. Tout ce qui est sensible est garanti par les **règles Firestore** (communes + bloc Nexus). Conséquence assumée : pas de déclencheur planifié. |
| **Routage `#/…`** | Accès direct et actualisation sans configuration serveur sur GitHub Pages. |

## Couches

```
index.html
└─ src/main.js                 démarrage, routes, gardes d'accès (affichage)
   ├─ config/                  configuration publique (Firebase Web, SDK, App Check) — aucun secret
   ├─ core/                    firebase.js (seul point d'entrée du SDK), router, dom (HTML échappé), erreurs FR, formats, permissions (pures)
   ├─ auth/session.js          compte Studio Prism : connexion, profil users/{uid}, licences, surveillance, expiration
   ├─ data/
   │   ├─ repo.js              données propres à Nexus (nxUsers/{uid}/…, nxConfig)
   │   ├─ catalog.js           catalogue Studio Prism (products, lecture seule)
   │   └─ hub.js               décide si Nexus PEUT agir (connexions + permissions) et journalise
   ├─ connectors/
   │   ├─ registry.js          applications vérifiées : identifiants, adresses, collections, liens directs, autorisations possibles
   │   └─ cloud.js             lecture des projets/documents ; création vérifiée d'un document SPECTRA Writer
   ├─ workflows/               étapes (définitions pures), validation, moteur, rapport, modèles, exécutions en cours
   ├─ axion/                   interface fournisseur, fournisseur Firebase AI Logic, protocole de réponse validé, service
   └─ ui/                      coque, composants, icônes, pages
firebase/                      règles à publier À LA MAIN (bloc Nexus + fichier complet)
tests/                         unitaires (Node), règles (émulateur), bout en bout (Playwright + émulateurs)
```

Les modules `core/permissions`, `core/router`, `core/format`, `workflows/*` (sauf `live.js`), `axion/protocol`, `connectors/registry` et une partie de `connectors/cloud` n'importent ni Firebase ni le DOM : ils sont testés directement sous Node.

## Les quatre piliers

1. **Applications** — registre vérifié + catalogue Firestore + licences de l'utilisateur. États : disponible, non connectée, connexion en cours, connectée, erreur, accès insuffisant (`core/permissions.js → appStatus`).
2. **Connexions** — une autorisation par application (`nxUsers/{uid}/connections/{app}`), limitée à ce que l'application peut recevoir (`registry.scopes`), vérifiée par une **lecture réelle** soumise aux règles de l'application, révocable. Les droits effectifs restent ceux des règles de l'application : Nexus n'en obtient aucun de plus.
3. **Automatisations** — suite linéaire d'étapes (récupérer → filtrer → résumé AXION → rapport → confirmation → écriture SPECTRA Writer). Validation stricte (`schema.js`) : source en premier, dépendances satisfaites, **confirmation obligatoire avant chaque écriture**. Moteur (`engine.js`) : statuts par étape, arrêt (AbortSignal), nouvelle tentative idempotente (identifiant du document choisi à l'avance), **réussite seulement après relecture**. Exécution persistée (`runs`) et journalisée (`activity`).
4. **AXION** — interface `provider.generate()` indépendante du fournisseur ; fournisseur Firebase AI Logic (Gemini Developer API ou Vertex AI) ; réponse **JSON validée** (`protocol.js`) : actions limitées à « créer un document » et « ouvrir un élément transmis », jamais exécutées sans confirmation. Désactivé tant qu'un administrateur ne l'a pas activé (`nxConfig/axion`). Un futur fournisseur exigeant une clé secrète passera par un backend (proxy) : aucune clé dans le navigateur.

## Sécurité

- Règles Firestore = seule barrière de sécurité ; le masquage d'un bouton n'est qu'un confort (`main.js` filtre l'affichage, `hub.js` refuse l'action, les règles refusent l'accès).
- Données affichées toujours échappées (`html```) ; l'aperçu HTML des documents SPECTRA n'est jamais inséré (texte seulement) ; miniatures limitées à `data:image/(png|jpeg|webp)` ; liens externes limités aux adresses du registre.
- Politique de sécurité du contenu (CSP) dans `index.html` ; aucun secret dans le dépôt (test automatique `tests/unit/security.test.mjs`).
- Pas de stockage du contenu des documents ni des conversations AXION dans Nexus.
