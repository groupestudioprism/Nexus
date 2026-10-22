# Règles Firestore de Nexus — à publier À LA MAIN

Nexus ne publie rien lui-même. Ce dossier contient :

| Fichier | Rôle |
| --- | --- |
| `firestore-nexus.rules` | le **bloc Nexus seul** (à insérer dans vos règles actuelles) |
| `firestore.rules` | le **fichier complet** prêt à coller : règles communes Studio Prism (version SPECTRA, la plus complète des dépôts : site + ARCHIPLAN + ARCHITRAFIC + ARCHIINDUS + SPECTRA Writer / Calc / Slide) **+ bloc Nexus**. 163 Ko (limite Firebase : 256 Ko) |

**Storage** : Nexus n'utilise pas Firebase Storage. `storage.rules` du site reste **inchangé** : rien à publier.

## Avant de publier : quelle version est en ligne ?

Les dépôts contiennent deux versions des règles communes (108 Ko sans SPECTRA, 150 Ko avec SPECTRA). Ouvrez *Console Firebase → Firestore Database → Règles* et cherchez `match /swDocs/{pid}` :

- **présent** → collez `firebase/firestore.rules` en entier, puis **Publier** ;
- **absent**, ou vous avez modifié les règles en ligne depuis → ne remplacez pas : copiez le contenu de `firestore-nexus.rules` et insérez-le **juste avant** le bloc final
  ```
      match /{document=**} {
        allow read, write: if false;
      }
  ```
  puis **Publier**. (Sans les blocs SPECTRA, tout Nexus fonctionne sauf la création de documents SPECTRA Writer, refusée par les règles.)
- Ou générez le fichier complet à partir de vos règles actuelles : `python3 tools/build_rules.py règles-actuelles.rules > firestore.rules`.

Aucune règle existante n'est modifiée : seul le bloc Nexus est ajouté (et le titre du fichier mentionne NEXUS).

## Dépendances

Le bloc utilise les fonctions des règles communes `isSignedIn()`, `isActiveUser()`, `isAdmin()`, `isActiveAdminProfile()`, `isString()`. Il ajoute `nxUsers/{uid}/**` et `nxConfig/{cid}` et rien d'autre.

## Vérifier après publication

1. Nexus → (compte administrateur) **Administration → Règles Firestore de Nexus → Vérifier** : deux lignes vertes.
2. *Console → Firestore → Règles → Simulateur* :

| Opération | Authentifié comme | Chemin | Attendu |
| --- | --- | --- | --- |
| get | A (actif) | `nxUsers/A/connections/archiplan` | autorisé |
| get | B | `nxUsers/A/connections/archiplan` | **refusé** |
| get | administrateur | `nxUsers/A/runs/x` | **refusé** |
| create | A, données `{appId:"archiplan", scopes:["projects.read"], status:"active", grantedAt: maintenant, updatedAt: maintenant}` | `nxUsers/A/connections/archiplan` | autorisé |
| create | A, `scopes:["documents.create"]` | `nxUsers/A/connections/archiplan` | **refusé** |
| get | A (actif) | `nxConfig/axion` | autorisé |
| set | A (non administrateur) | `nxConfig/axion` | **refusé** |
| get | non authentifié | `nxUsers/A` | **refusé** |

3. Les tests automatiques correspondants (23 cas) : `npm run test:rules` (émulateur).

## Facultatif : suppression automatique (TTL)

Les exécutions et l'historique portent un champ `expireAt` (+180 jours). Pour les supprimer automatiquement : *Console → Firestore → TTL* → groupe de collections `runs` puis `activity`, champ `expireAt`. Vérifiez au préalable que la fonctionnalité est disponible et sans coût sur votre forfait ; sinon, rien ne change (l'utilisateur peut tout effacer depuis Mon compte).
