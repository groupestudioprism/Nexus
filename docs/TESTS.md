# Tests de Nexus

Trois niveaux, tous exécutés le 22 octobre 2026 sur cette version. **Aucun test n'a été exécuté contre le vrai projet Firebase** : les tests de règles et de bout en bout utilisent les émulateurs Firebase (projet fictif `demo-nexus`).

| Niveau | Commande | Résultat |
| --- | --- | --- |
| Unitaires (Node, modules purs) | `npm test` | **37 / 37** |
| Règles Firestore (émulateur, fichier complet `firebase/firestore.rules`, à télécharger depuis Studio-Prism — voir firebase/README.md) | `npm run test:rules` | **23 / 23** |
| Règles — variante sans les blocs SPECTRA (règles des dépôts Archi + Nexus) | `RULES_FILE=… npm run test:rules` | 22 / 23 : seule la création SPECTRA Writer échoue, comme attendu (bloc SPECTRA absent) |
| Bout en bout (Chromium + émulateurs Auth/Firestore) | voir ci-dessous | **71 / 71** |

## Ce qui est vérifié

**Authentification** : connexion réussie ; identifiants incorrects ; validation du formulaire ; compte désactivé et compte Entreprise en attente refusés sans boucle ; retour à la page demandée ; actualisation (session conservée) ; accès direct à une route protégée ; rôle insuffisant (administration) ; adresse inconnue ; désactivation pendant la session (déconnexion immédiate) ; session révoquée/expirée (message, reconnexion) ; déconnexion.

**Interface** : navigation ; 7 applications et leurs licences ; aucune application « connectée » sans autorisation ; ARCHIVISION sans bouton de connexion ; états vides et de chargement ; absence de débordement horizontal sur 8 pages × 3 formats (1440×900, 820×1180, 390×844) ; barre d'onglets et feuille « Plus » sur mobile ; lien d'évitement au clavier ; aucun bouton sans action ; aucune erreur JavaScript.

**Sécurité** : données d'un autre compte inaccessibles (règles) ; administrateur sans accès aux données Nexus des autres ; rôle non modifiable ; réglage AXION réservé aux administrateurs et sans champ de clé ; autorisation non accordée → action refusée (moteur et éditeur) ; aperçu HTML malveillant d'un document jamais exécuté ; noms malveillants échappés dans les rapports ; texte d'AXION converti sans balise ; aucun secret dans les fichiers publiés.

**Connecteurs et automatisations** : connexions enregistrées puis vérifiées par une lecture réelle ; projets ARCHIPLAN listés avec lien direct ; partage reçu affiché (verrouillé si l'e-mail n'est pas vérifié) ; modèle valide ; écriture sans confirmation refusée par l'éditeur ; aperçu avant écriture ; **document réellement créé dans SPECTRA Writer, compteur de quota mis à jour, document relu** ; refus à la confirmation → rien n'est créé ; échec d'une étape puis nouvelle tentative sans doublon ; interruption ; données manquantes ; étape AXION non configurée ; exécutions enregistrées ; historique (vérifiée / annulée / connexions).

**AXION** : état « non configuré » sans fausse réponse ; activation par un administrateur (avec confirmation) ; état « activé, non testé » et compteur du jour ; protocole de réponse (actions inconnues ou inventées écartées) ; fournisseur testé avec un SDK de substitution (moteur, modèle, annulation, erreurs).

## Non testé (et pourquoi)

- **Vrai projet Firebase** : publication et comportement réel des règles, domaines autorisés, e-mails de réinitialisation — à vérifier après publication (`docs/DEPLOIEMENT.md`, § Vérification).
- **AXION avec un vrai modèle** : Firebase AI Logic n'a pas d'émulateur, et les tests ne doivent pas consommer le service du projet. À tester par un administrateur avec « Tester la connexion » après activation.
- **App Check** : aucune clé reCAPTCHA configurée.
- **Ouverture des liens directs dans les applications** : les adresses (`#/p/<id>`, `#/doc/<id>`) sont celles gérées par le code des applications, mais l'ouverture effective (connexion dans l'application) n'a pas été jouée.
- Safari / Firefox réels, lecteurs d'écran : non joués (Chromium uniquement).

## Lancer les tests

```bash
npm install                              # dépendances de test uniquement (rien n'est publié)
npm test                                 # unitaires
npm run test:rules                       # règles (démarre et arrête l'émulateur Firestore ; Java requis)

# bout en bout : 3 terminaux
npx firebase emulators:start --only auth,firestore --project demo-nexus
python3 -m http.server 8000 --bind 127.0.0.1
python3 tests/e2e/test_e2e.py            # réinitialise les émulateurs, crée les comptes de test, lance Chromium
```

Le mode émulateur de Nexus ne s'active que sur `localhost`/`127.0.0.1` avec `?emu=1`. Les captures d'écran sont écrites dans `tests/e2e/artifacts/` (non versionné).
