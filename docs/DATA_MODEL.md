# Modèle de données de Nexus

Nexus **ne duplique aucune donnée de compte** : profil (`users`), licences (`licenses`), catalogue (`products`) et données des applications (`apProjects`, `swDocs`…) restent ceux de Studio Prism et sont seulement **lus** (sauf la création d'un document SPECTRA Writer, confirmée). Tout ce que Nexus enregistre est regroupé sous `nxUsers/{uid}` et dans `nxConfig`.

Les dates sont des horodatages serveur (`serverTimestamp`). `expireAt` permet d'activer, si souhaité, une politique **TTL** Firestore (suppression automatique) sur les sous-collections `runs` et `activity` ; à défaut, la conservation affichée (180 jours) est une durée indicative et l'utilisateur peut tout effacer depuis Mon compte.

## Données existantes lues par Nexus

| Collection | Lecture par Nexus | Écriture |
| --- | --- | --- |
| `users/{uid}` | le profil du compte connecté (et sa surveillance pendant la session) | jamais |
| `licenses` | `where userId == uid` | jamais |
| `products` | produits publiés (`status in [published, unavailable, active]`) | jamais |
| `apProjects`, `atProjects`, `aiProjects`, `swDocs`, `scDocs`, `ssDocs` | `where ownerUid == uid` (fiches seulement, jamais `content/main` sauf relecture du document créé) | `swDocs` : création d'un document uniquement |
| `apShares`, `atShares`, `aiShares`, `swShares`, `scShares`, `ssShares` | `where email == e-mail du compte` | jamais |
| `swUsage/{uid}` | pour la création d'un document | initialisation et incrément, comme l'application |

## Collections de Nexus

### `nxUsers/{uid}` — préférences
- **Champs** : `reduceMotion` (bool), `home` (`accueil` / `applications` / `automatisations`), `axionConsent` (bool), `updatedAt`.
- **Propriétaire** : le compte `uid`. **Lecture/écriture** : titulaire actif. **Suppression** : titulaire.
- **Conservation** : jusqu'à effacement. **Jamais** : rôle, abonnement, données de compte.

### `nxUsers/{uid}/connections/{appId}` — autorisations accordées à Nexus
- **Champs** : `appId` (= identifiant du document, parmi les 7 applications), `scopes` (`catalog.read`, `projects.read`, `shared.read`, `documents.create` — ce dernier pour `spectrawriter` seulement), `status` (`active` / `revoked` ; retirée ⇒ liste vide), `grantedAt` (non modifiable), `revokedAt`, `updatedAt`.
- **Propriétaire / droits** : titulaire actif ; un administrateur n'y a pas accès.
- **Relations** : utilisée par les connecteurs et les automatisations ; journalisée dans `activity`.
- **Jamais** : jeton, clé, mot de passe ou identifiant d'une application.

### `nxUsers/{uid}/workflows/{id}` — automatisations
- **Champs** : `name` (1–80), `description` (≤ 300), `trigger` (`{type: "manual"}`), `steps` (1–10 étapes `{id, type, config}`), `status` (`active` / `paused`), `template`, `runCount` (+1 seulement), `lastRunAt`, `createdAt`, `updatedAt`.
- **Droits** : titulaire actif. **Conservation** : jusqu'à suppression.
- **Jamais** : contenu de documents, données d'autres comptes.

### `nxUsers/{uid}/runs/{id}` — exécutions
- **Champs** : `workflowId`, `workflowName`, `trigger`, `status` (`running` / `awaiting_confirmation` / `succeeded` / `failed` / `cancelled`), `steps` (≤ 10 : `id`, `type`, `label`, `status`, `summary` ≤ 200, `error` ≤ 300, `verified`), `error`, `result` (`summary`, `links`, `documentId`), `scopes`, `startedAt`, `endedAt` (obligatoire une fois terminée), `updatedAt`, `expireAt`.
- **Droits** : titulaire actif ; une exécution **réussie ou annulée est figée** ; une exécution en échec peut repartir.
- **Conservation** : 180 jours (`expireAt`). **Jamais** : le rapport complet ni le contenu des projets.

### `nxUsers/{uid}/activity/{id}` — historique
- **Champs** : `action` (ex. `connection.grant`, `workflow.run`, `spectrawriter.create`, `axion.ask`), `label`, `appId`, `status` (`proposed` / `pending_confirmation` / `executed` / `verified` / `failed` / `cancelled`), `summary` (≤ 300), `error` (≤ 300), `runId`, `confirmedAt` (confirmation donnée par la personne), `at`, `updatedAt`, `expireAt`.
- **Droits** : titulaire actif ; seule une opération non terminée évolue, et seulement ses champs de statut.
- **Conservation** : 180 jours. **Jamais** : texte des questions ou réponses AXION, contenu de documents.

### `nxUsers/{uid}/aiUsage/{AAAA-MM-JJ}` — compteur AXION
- **Champs** : `count`, `updatedAt`. Création à 1, puis +1 exactement ; plafond = limite du réglage AXION ; jour = jour de la requête (± 1).
- **Limite** : ce compteur encadre l'usage dans Nexus mais ne protège pas le service lui-même (App Check et quotas AI Logic le font).

### `nxConfig/axion` — réglage global d'AXION
- **Champs** : `enabled`, `backend` (`googleai` / `vertexai`), `model`, `location`, `dailyLimit` (`free`, `licensed`, `admin`, 0–5000), `updatedAt`, `updatedBy` (= auteur).
- **Lecture** : comptes actifs. **Écriture** : administrateur actif. **Jamais** : clé d'API ou secret (aucun champ prévu, toute clé supplémentaire est refusée par les règles).

## Index

Aucun index composite : toutes les requêtes de Nexus portent sur une sous-collection (tri sur un seul champ, index automatique) ou sur une égalité simple.
