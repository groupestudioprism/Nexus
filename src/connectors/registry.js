/* Registre des applications Studio Prism connues de Nexus.
 *
 * TOUT ce qui figure ici a été vérifié dans le code des dépôts (audit du 22/10/2026, voir docs/AUDIT.md) :
 *  - productId  : identifiant de licence (constante LICENSE_PRODUCT de src/js/auth.js de chaque application) ;
 *  - url        : adresse publiée (CNAME du dépôt, réponse HTTP 200 vérifiée) ;
 *  - cloud      : collections Firestore de l'application (src/js/cloud.js + bloc de règles), préfixe ap/at/ai/sw/sc/ss ;
 *  - deepLink   : adresse d'ouverture directe gérée par readLinkFromUrl() dans src/js/cloud.js de l'application ;
 *  - features   : fonctions décrites dans le README et le code de l'application (aucune n'est inventée).
 *
 * Nexus n'écrit dans les données d'une application QUE par les opérations listées dans `writes`, avec les mêmes champs et le même
 * compteur de quota que l'application elle-même (sinon les règles Firestore refusent l'écriture).
 */

export const SCOPES = Object.freeze({
  "catalog.read": { label: "Voir la fiche et votre licence", risk: "low" },
  "projects.read": { label: "Lister vos projets et documents (nom, taille, dates, miniature)", risk: "low" },
  "shared.read": { label: "Lister les éléments partagés avec vous", risk: "low" },
  "documents.create": { label: "Créer de nouveaux documents dans votre espace (avec confirmation)", risk: "medium" }
});

const ARCHI_FEATURES = {
  archiplan: ["Modélisation 3D du bâtiment sur téléphone, tablette et ordinateur", "Cloud des projets, dossiers et partage par e-mail ou par lien", "Bibliothèque personnelle (matériaux, compositions de parois, familles)", "Compatible avec Archi Vision (réalité augmentée)"],
  architrafic: ["Routes barrées et déviations automatiques", "Simulation du trafic en 3D", "Documents de chantier (plan de signalisation, projet d'arrêté, avis aux riverains)", "Cloud des chantiers, dossiers et partage"],
  archiindus: ["Plans industriels et réseaux techniques (réseaux humides, réseaux secs, CVC…)", "Pièces 3D sur noyau OpenCascade", "Échanges IFC4, DXF, STEP, STL", "Cloud des projets, dossiers et partage"]
};

export const APPS = Object.freeze([
  {
    id: "archiplan", productId: "archiplan", name: "ARCHIPLAN", family: "archi",
    tagline: "Conception de plans et modélisation 3D",
    url: "https://archiplan.studio-prism.com/",
    color: "#0877B9",
    features: ARCHI_FEATURES.archiplan,
    cloud: { prefix: "ap", items: "apProjects", shares: "apShares", kind: "project", noun: ["projet", "projets"] },
    deepLink: (id) => `https://archiplan.studio-prism.com/#/p/${encodeURIComponent(id)}`,
    quota: "10 Mo sans licence, 50 Mo avec licence, 1 Go administrateur",
    scopes: ["catalog.read", "projects.read", "shared.read"],
    writes: []
  },
  {
    id: "architrafic", productId: "architrafic", name: "ARCHITRAFIC", family: "archi",
    tagline: "Routes barrées, déviations et simulation du trafic",
    url: "https://architraffic.studio-prism.com/",
    color: "#169999",
    features: ARCHI_FEATURES.architrafic,
    cloud: { prefix: "at", items: "atProjects", shares: "atShares", kind: "project", noun: ["chantier", "chantiers"] },
    deepLink: (id) => `https://architraffic.studio-prism.com/#/p/${encodeURIComponent(id)}`,
    quota: "50 Mo pour tout compte actif, 1 Go administrateur",
    freeForAll: true,
    scopes: ["catalog.read", "projects.read", "shared.read"],
    writes: []
  },
  {
    id: "archiindus", productId: "archiindus", name: "ARCHIINDUS", family: "archi",
    tagline: "Plans industriels, réseaux techniques et pièces 3D",
    url: "https://archiindus.studio-prism.com/",
    color: "#1F89C5",
    features: ARCHI_FEATURES.archiindus,
    cloud: { prefix: "ai", items: "aiProjects", shares: "aiShares", kind: "project", noun: ["projet", "projets"] },
    deepLink: (id) => `https://archiindus.studio-prism.com/#/p/${encodeURIComponent(id)}`,
    quota: "10 Mo sans licence, 50 Mo avec licence, 1 Go administrateur",
    scopes: ["catalog.read", "projects.read", "shared.read"],
    writes: []
  },
  {
    id: "archivision", productId: "archivision", name: "ARCHIVISION", family: "archi",
    tagline: "Maquettes BIM en visite 3D et en réalité augmentée",
    url: "https://archivision.studio-prism.com/",
    color: "#071B55",
    features: ["Visite 3D de maquettes BIM (IFC, GLB)", "Réalité augmentée (application Android)", "Sur téléphone, tablette et ordinateur"],
    cloud: null,   // aucune collection de données dans le dépôt : pas d'intégration de données possible aujourd'hui
    deepLink: null,
    scopes: ["catalog.read"],
    writes: [],
    limitation: "ARCHIVISION n'enregistre pas de projets dans Firestore : Nexus peut seulement afficher sa fiche, votre licence et l'ouvrir."
  },
  {
    id: "spectrawriter", productId: "spectrawriter", name: "SPECTRA Writer", family: "spectra",
    tagline: "Traitement de texte",
    url: "https://spectrawriter.studio-prism.com/",
    color: "#2E5BD8",
    features: ["Documents mis en forme (thèmes, blocs, modèles)", "Cloud des documents, dossiers et partage", "Modèles personnels et Communauté", "Assistant IA intégré à l'application"],
    cloud: { prefix: "sw", items: "swDocs", shares: "swShares", usage: "swUsage", folders: "swFolders", kind: "document", noun: ["document", "documents"] },
    deepLink: (id) => `https://spectrawriter.studio-prism.com/#/doc/${encodeURIComponent(id)}`,
    quota: "10 Mo sans licence, 50 Mo avec licence, 1 Go administrateur",
    scopes: ["catalog.read", "projects.read", "shared.read", "documents.create"],
    writes: ["documents.create"]
  },
  {
    id: "spectracalc", productId: "spectracalc", name: "SPECTRA Calc", family: "spectra",
    tagline: "Tableur",
    url: "https://spectracalc.studio-prism.com/",
    color: "#169999",
    features: ["Classeurs, formules et graphiques", "Cloud des classeurs, dossiers et partage", "Modèles personnels et Communauté"],
    cloud: { prefix: "sc", items: "scDocs", shares: "scShares", kind: "document", noun: ["classeur", "classeurs"] },
    deepLink: (id) => `https://spectracalc.studio-prism.com/#/doc/${encodeURIComponent(id)}`,
    quota: "10 Mo sans licence, 50 Mo avec licence, 1 Go administrateur",
    scopes: ["catalog.read", "projects.read", "shared.read"],
    writes: []
  },
  {
    id: "spectraslide", productId: "spectraslide", name: "SPECTRA Slide", family: "spectra",
    tagline: "Présentations",
    url: "https://spectraslide.studio-prism.com/",
    color: "#1F89C5",
    features: ["Présentations à partir de modèles", "Ouverture de fichiers PowerPoint", "Cloud des présentations, dossiers et partage", "Modèles personnels et Communauté"],
    cloud: { prefix: "ss", items: "ssDocs", shares: "ssShares", kind: "document", noun: ["présentation", "présentations"] },
    deepLink: (id) => `https://spectraslide.studio-prism.com/#/doc/${encodeURIComponent(id)}`,
    quota: "10 Mo sans licence, 50 Mo avec licence, 1 Go administrateur",
    scopes: ["catalog.read", "projects.read", "shared.read"],
    writes: []
  }
]);

export const appById = (id) => APPS.find((a) => a.id === id) || null;
export const dataApps = () => APPS.filter((a) => a.cloud);
export const FAMILIES = { archi: "Gamme Archi", spectra: "Gamme SPECTRA" };
