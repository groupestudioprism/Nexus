# AXION — clé API personnelle (BYOK)

Chaque personne peut faire fonctionner AXION avec sa propre clé : Anthropic, OpenAI, Google Gemini, Mistral, ou un endpoint compatible OpenAI. Code : `src/axion/byok.js` (pur, testé), `src/axion/providers/byok.js` (stockage et appel).

## Règles (non négociables)
1. **Aucun droit administrateur.** AXION ne reçoit aucun jeton, rôle ni accès Firestore ; il renvoie seulement du texte.
2. **Liste blanche stricte** : `create_document` et `open_item` (voir `ACTION_TYPES`). Toute autre action est écartée et comptée.
3. **Validation côté code** (`parseAxionResponse`) : la sortie du modèle n'est jamais exécutée ; `open_item` ne vise que les éléments transmis ; 3 actions au plus ; tailles bornées ; rendu HTML échappé.
4. **Confirmation** : toute écriture passe par une boîte de dialogue montrant le contenu, puis relecture après exécution. Droits vérifiés par `hub.allowed`, comme le reste de Nexus.
5. **Injection de prompt** : consignes de sécurité ajoutées au prompt système (`INJECTION_GUARD`), données entourées de `<donnees>`, noms neutralisés (`sanitizeUntrusted`). Cela réduit le risque ; la vraie barrière reste les points 1 à 4.
6. **Limites de débit** locales : 6/minute, 200/jour, prompt ≤ 12 000 caractères, sortie ≤ 1 500 jetons.
7. **Isolation** : AXION ne reçoit que la question et, si cochée, les métadonnées des éléments de la personne connectée. Rien d'autres utilisateurs.
8. **Clé** : chiffrée AES-GCM (clé non extractible, IndexedDB, par compte). Jamais dans Firestore, le dépôt, les journaux (`redactKey` sur les erreurs) ni l'activité. Suppression en un clic. Envoyée uniquement au fournisseur choisi, sans cookies ni referrer.
9. **Endpoint personnalisé** : HTTPS, hôte public (pas de localhost, IP privée, identifiants dans l'URL).
10. **Avertissement UI** : panneau « Ma clé API » (frais à la charge de la personne, appareil non partagé, clé dédiée plafonnée).

## Limite connue
Stockée dans le navigateur, la clé reste exposée à un script malveillant de la même origine (XSS) : d'où la CSP et l'échappement systématique.
