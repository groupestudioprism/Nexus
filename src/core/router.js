/* Routeur à base d'adresses « #/… » : fonctionne sur GitHub Pages sans configuration serveur, accès direct et actualisation compris.
 * Fonctions pures (parse, match) testées dans tests/unit. */

export function parseHash(hash) {
  let h = String(hash || "").replace(/^#/, "");
  if (!h.startsWith("/")) h = "/" + h;
  const [pathPart, queryPart = ""] = h.split("?");
  const path = pathPart.replace(/\/+$/, "") || "/";
  const query = {};
  new URLSearchParams(queryPart).forEach((v, k) => { query[k] = v; });
  return { path, query };
}

/* Motif « /applications/:id » → { params } ou null. Les paramètres sont limités à des identifiants sûrs. */
export function matchRoute(pattern, path) {
  const a = pattern.split("/").filter(Boolean), b = path.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) {
      let v;
      try { v = decodeURIComponent(b[i]); } catch (e) { return null; }
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(v)) return null;
      params[a[i].slice(1)] = v;
    } else if (a[i] !== b[i]) return null;
  }
  return { params };
}

export function resolve(routes, path) {
  for (const r of routes) {
    const m = matchRoute(r.path, path);
    if (m) return { route: r, params: m.params };
  }
  return null;
}

/* Adresse de retour après connexion : uniquement une route interne (« /… »), jamais une adresse externe. */
export function safeReturn(v) {
  const s = String(v || "");
  return /^\/[A-Za-z0-9/_-]{0,120}$/.test(s) && !s.startsWith("//") ? s : "/accueil";
}

export const go = (path) => { if (location.hash !== "#" + path) location.hash = "#" + path; else window.dispatchEvent(new HashChangeEvent("hashchange")); };
export const replace = (path) => { history.replaceState(null, "", "#" + path); window.dispatchEvent(new HashChangeEvent("hashchange")); };
