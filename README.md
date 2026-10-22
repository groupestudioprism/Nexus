# NEXUS · Studio Prism

**Nexus relie les applications Studio Prism.** Avec le compte Studio Prism habituel, on y retrouve ses applications et ses licences, on autorise ce que Nexus peut faire avec chacune, on enchaîne des tâches d'une application à l'autre, et l'on accède à AXION, l'intelligence de Studio Prism, dès qu'elle est activée.

Nexus ne remplace aucune application : la conception reste dans ARCHIPLAN, la rédaction dans SPECTRA Writer, la présentation dans SPECTRA Slide.

> Version 0.1.0 · interface en français · site statique (GitHub Pages) · Firebase, forfait Spark · aucun service payant.

## Fonctionnalités réelles (testées)

| Domaine | Ce qui fonctionne |
| --- | --- |
| **Compte** | Connexion avec le compte Studio Prism existant (même projet Firebase `archivision-studioprism`, même profil `users/{uid}`, mêmes rôles), « rester connecté », mot de passe oublié, session partagée avec le site Studio Prism, comptes désactivés / Entreprise en attente / supprimés refusés, désactivation détectée pendant la session, session expirée, déconnexion. Pas de second système de comptes : l'inscription se fait sur le site. |
| **Applications** | Les 7 applications (ARCHIPLAN, ARCHITRAFIC, ARCHIINDUS, ARCHIVISION, SPECTRA Writer, Calc, Slide), leur fiche (catalogue Studio Prism + fonctions vérifiées), votre licence, l'état de l'intégration, un lien vers l'application. |
| **Connexions** | Autorisations par application (lister vos projets, les partages reçus, créer des documents SPECTRA Writer), **vérifiées par une lecture réelle**, révocables. Les règles de sécurité de chaque application restent seules juges. |
| **Projets** | Vos projets et documents de 6 applications listés (nom, date, taille, miniature) avec un lien d'ouverture directe ; partages reçus. |
| **Automatisations** | Éditeur d'étapes validé en direct (récupérer, filtrer, résumé AXION, rapport, confirmation, création SPECTRA Writer), 3 modèles, exécution suivie étape par étape, arrêt, nouvelle tentative sans doublon, confirmation obligatoire avant toute écriture, **document relu avant d'être déclaré créé**. |
| **Historique** | Chaque opération : proposée, en attente de confirmation, exécutée, vérifiée, échouée ou annulée — sans copier le contenu des documents. |
| **AXION** | Architecture indépendante du fournisseur, fournisseur Firebase AI Logic prêt, réponses JSON validées, actions proposées puis confirmées. **Désactivé par défaut** : état « non configuré » affiché tant qu'un administrateur ne l'a pas activé (voir les conditions dans `docs/DEPLOIEMENT.md`). |
| **Administration** | Réglage d'AXION (moteur, modèle, limites quotidiennes), vérification des règles publiées. Comptes, rôles et licences restent dans l'administration du site. |

Ordinateur, tablette et mobile (barre d'onglets) ; navigation au clavier ; contrastes AA ; réduction des animations.

## Architecture

Modules JavaScript natifs, sans framework ni étape de build — comme le reste de l'écosystème. Détail : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · données : [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) · audit préalable : [`docs/AUDIT.md`](docs/AUDIT.md).

```
index.html            page unique
src/config/           configuration publique (Firebase Web, SDK, App Check) — aucun secret
src/core/             SDK Firebase (point d'entrée unique), routeur, HTML échappé, erreurs, permissions
src/auth/             session Studio Prism
src/data/             données Nexus, catalogue, hub (contrôle des autorisations + historique)
src/connectors/       registre des applications, connecteurs Firestore
src/workflows/        étapes, validation, moteur, rapport, modèles
src/axion/            interface fournisseur, Firebase AI Logic, protocole
src/ui/               coque, composants, pages ; src/styles/ : jetons et styles
assets/brand/         logo Nexus (SVG + planche d'origine)
firebase/             règles Firestore à publier À LA MAIN
tests/                unitaires, règles (émulateur), bout en bout (Playwright)
tools/build_rules.py  assemble règles communes + bloc Nexus
docs/                 audit, architecture, modèle de données, tests, déploiement
```

## Prérequis

- Pour utiliser Nexus : un navigateur récent et un compte Studio Prism.
- Pour développer : Python 3 (serveur local) ; pour les tests : Node.js ≥ 20, Java ≥ 11 (émulateur Firestore), Python + Playwright (bout en bout).

## Installation et lancement local

```bash
git clone https://github.com/groupestudioprism/Nexus.git && cd Nexus
python3 -m http.server 8000
# http://localhost:8000  (les modules JavaScript ne fonctionnent pas en file://)
```

En local, Nexus se connecte au **vrai** projet Firebase (si `localhost` est un domaine autorisé, ce qui est le cas par défaut). Pour travailler sans toucher aux vraies données : lancer les émulateurs (`npm run emulators`) et ouvrir `http://127.0.0.1:8000/?emu=1`.

## Configuration Firebase

- `src/config/firebase-config.js` : configuration **Web** du projet `archivision-studioprism`, reprise à l'identique du site Studio Prism. Elle est publique par conception (elle ne donne aucun droit).
- `src/config/app-config.js` : version du SDK, adresse du site, **clé de site** App Check (vide par défaut), émulateurs, délais. Modèle commenté : `src/config/app-config.example.js`.
- Il n'y a **pas de variables d'environnement** ni de secrets : Nexus n'a pas de serveur. Un futur fournisseur d'IA à clé secrète passera par un backend dédié, jamais par le navigateur.

## Règles Firebase à publier manuellement

`firebase/firestore.rules` (fichier complet) ou `firebase/firestore-nexus.rules` (bloc seul). Mode d'emploi, vérification de la version en ligne et scénarios de contrôle : [`firebase/README.md`](firebase/README.md). **Storage : aucune modification.**

## Tests

```bash
npm install
npm test             # 37 tests unitaires
npm run test:rules   # 23 tests des règles sur l'émulateur Firestore
```

Bout en bout (71 vérifications, Chromium + émulateurs) et liste de ce qui n'a pas pu être testé : [`docs/TESTS.md`](docs/TESTS.md).

## Déploiement

GitHub Pages (branche `main`, racine), sans domaine personnalisé pour partager la session avec le site : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md). Rien n'a été publié automatiquement.

## Limites connues

- **Pas de serveur** (forfait Spark) : les automatisations s'exécutent dans l'onglet ouvert ; pas de déclenchement planifié ni en arrière-plan. Une exécution interrompue (onglet fermé) est signalée comme telle.
- **Écriture** limitée à la création de documents SPECTRA Writer. Les autres applications sont en lecture seule (pas de format d'écriture validé ; ARCHIVISION n'a pas de données Firestore).
- Les applications sont sur leurs propres domaines : il faut s'y connecter une fois pour ouvrir un élément depuis Nexus.
- **AXION** n'est pas actif : son activation demande une décision (conditions de l'API Gemini pour des utilisateurs européens, coût éventuel, App Check obligatoire pour AI Logic à partir du 2 novembre 2026).
- Les autorisations de Nexus engagent Nexus envers l'utilisateur ; elles ne réduisent pas les droits de l'utilisateur sur ses propres données (seules les règles de chaque application font foi).
- Le compteur quotidien d'AXION encadre l'usage dans Nexus mais ne protège pas le service ; App Check et les quotas AI Logic le font.
- Les données Nexus d'un compte supprimé depuis le site restent jusqu'à suppression depuis la console (le site ne connaît pas les collections Nexus).

## Prévu

Activation d'AXION (moteur conforme, App Check), écriture dans SPECTRA Slide / Calc une fois leurs formats validés avec ces applications, déclenchements planifiés (nécessitent un backend), fiche produit `nexus` dans le catalogue si une licence doit être exigée.

---
Nexus est une application **Studio Prism**. © 2026 Studio Prism.
