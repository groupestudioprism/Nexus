/* Configuration Web Firebase de Studio Prism (projet « archivision-studioprism »).
 *
 * Valeurs reprises À L'IDENTIQUE de groupestudioprism/Studio-Prism (js/firebase.js) et des applications
 * (tools/build.py d'ARCHIPLAN, ARCHITRAFIC, ARCHIINDUS, SPECTRA…) : Nexus utilise le MÊME projet et donc
 * les MÊMES comptes Studio Prism. Aucun nouveau projet ni aucune nouvelle application Firebase n'est créé.
 *
 * Cette configuration est PUBLIQUE par conception (documentation Firebase) : elle identifie le projet mais ne
 * donne aucun droit. La sécurité repose sur Firebase Authentication et sur les règles Firestore.
 * Ne JAMAIS placer ici une clé privée, un compte de service, un secret de fournisseur d'IA ou un mot de passe.
 */
export const firebaseConfig = Object.freeze({
  apiKey: "AIzaSyAAD5rrHuVh6_PC2_45L3y9F7zWe5ACW6E",
  authDomain: "archivision-studioprism.firebaseapp.com",
  projectId: "archivision-studioprism",
  storageBucket: "archivision-studioprism.firebasestorage.app",
  messagingSenderId: "226072216517",
  appId: "1:226072216517:web:0aeef645a4f1481fe801ac"
});
