/* Catalogue Studio Prism (collection `products`, lecture publique des produits publiés) : nom, logo, présentation et page de chaque
 * produit tels que l'administration du site les a saisis. Nexus ne modifie jamais le catalogue. */
import { services } from "../auth/session.js";
import { APP_CONFIG } from "../config/app-config.js";
import { withTimeout } from "../core/errors.js";

let cache = null, cachedAt = 0;

export async function loadProducts(force = false) {
  if (!force && cache && Date.now() - cachedAt < 120000) return cache;
  const { db, F } = services();
  // La requête doit respecter la règle de lecture publique (statuts publiés), sinon Firestore la refuse en bloc.
  const q = F.query(F.collection(db, "products"), F.where("status", "in", ["published", "unavailable", "active"]));
  const snap = await withTimeout(F.getDocs(q), APP_CONFIG.TIMEOUTS.query);
  cache = {};
  snap.docs.forEach((d) => { cache[d.id] = { id: d.id, ...d.data() }; });
  cachedAt = Date.now();
  return cache;
}

/* Lien ou image du catalogue : seulement https://, ou relatif au site Studio Prism (assets/…, #/…). */
export function safeCatalogUrl(u) {
  const s = String(u || "");
  if (/^https:\/\/[^\s"'<>]+$/.test(s)) return s;
  if (/^(assets\/|#\/)[^\s"'<>]*$/.test(s)) return APP_CONFIG.SITE_URL + s;
  return "";
}
