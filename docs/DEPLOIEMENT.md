# Déploiement de Nexus

Rien n'a été publié : ni GitHub Pages, ni règles Firebase. Les étapes ci-dessous sont à faire par vous, dans l'ordre.

## 1. Publier les règles Firestore (obligatoire)

Voir `firebase/README.md`. Sans le bloc Nexus, la connexion fonctionne mais toutes les pages de Nexus affichent « Accès refusé par les règles de sécurité ».

## 2. Activer GitHub Pages

Dépôt `groupestudioprism/Nexus` → **Settings → Pages → Build and deployment → Deploy from a branch**, branche `main`, dossier `/ (root)` → **Save**. Après une minute : `https://groupestudioprism.github.io/Nexus/`.

- **Ne pas ajouter de fichier `CNAME`** si vous voulez garder la session partagée avec le site Studio Prism (même origine `groupestudioprism.github.io`) et éviter toute configuration Firebase supplémentaire : ce domaine est déjà autorisé pour le site.
- Avec un domaine personnalisé (ex. `nexus.studio-prism.com`) : *Console Firebase → Authentication → Settings → Authorized domains* → ajouter le domaine ; la session ne sera plus partagée avec le site.
- Si la clé d'API Web est restreinte par référent (Google Cloud → Credentials), vérifier que `https://groupestudioprism.github.io/*` est autorisé (c'est déjà le cas si le site fonctionne).

Aucun coût : GitHub Pages est gratuit pour un dépôt public ; Nexus reste dans les quotas du forfait Spark.

## 3. Vérification après publication (avec un compte de test, jamais un compte réel)

1. Ouvrir Nexus déconnecté : redirection vers la connexion ; « Découvrir Nexus » accessible.
2. Se connecter avec un compte Studio Prism existant : accueil « Bonjour … ». Actualiser : toujours connecté.
3. Connecté au site Studio Prism dans le même navigateur (« Se souvenir de moi ») : Nexus s'ouvre déjà connecté.
4. Connexions → connecter ARCHIPLAN : message « accès vérifié » ; la fiche ARCHIPLAN liste vos projets ; le lien ouvre le projet dans ARCHIPLAN (connexion à l'application requise une fois).
5. Connecter SPECTRA Writer avec « Créer de nouveaux documents » ; Automatisations → modèle « Rapport d'activité des projets » → Enregistrer et exécuter → confirmer : le document apparaît dans SPECTRA Writer.
6. Historique : les opérations sont notées « Vérifiée ».
7. Compte non administrateur → `#/admin` : « Accès réservé ». Compte administrateur → Administration → Vérifier les règles : deux lignes vertes.

## 4. AXION (facultatif — décision et éventuels coûts à votre charge)

AXION est **désactivé** par défaut. Avant de l'activer, choisir un moteur compatible avec vos contraintes :

| Option | Coût | Point bloquant |
| --- | --- | --- |
| Gemini Developer API, offre gratuite (comme les applications SPECTRA) | 0 € | Conditions de l'API Gemini : offres **payantes** exigées pour des utilisateurs de l'EEE, de la Suisse ou du Royaume-Uni ; contenus utilisables par Google. |
| Gemini Developer API, offre payante | à l'usage | Facturation Google Cloud (passe le projet en Blaze). |
| Vertex AI (moteur « vertexai ») | à l'usage | Forfait Blaze. |
| Autre fournisseur (ex. Mistral) via un petit backend (Cloudflare Workers, etc.) | selon fournisseur | Backend à créer et héberger (clé côté serveur) : non réalisé. |

Puis : (1) *Console Firebase → AI Logic → Commencer* avec le fournisseur choisi ; (2) **App Check** (obligatoire pour AI Logic à partir du 2 novembre 2026 selon Firebase) : *Console → App Check → Web* avec reCAPTCHA v3, puis renseigner la **clé de site** dans `src/config/app-config.js` (`APP_CHECK`) et l'imposer dans la console ; (3) Nexus → Administration → AXION → Activer → « Tester la connexion » sur la page AXION.

## 5. Tests continus

`.github/workflows/tests.yml` lance les tests unitaires et les tests de règles (émulateur) à chaque envoi sur GitHub (GitHub Actions, gratuit pour un dépôt public).
