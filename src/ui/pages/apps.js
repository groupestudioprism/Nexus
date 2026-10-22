/* Applications : le catalogue Studio Prism, vos licences et l'état de chaque intégration. */
import { html, mount, delegate } from "../../core/dom.js";
import { appStatus, licenseState, STATUS_LABEL } from "../../core/permissions.js";
import { APPS, FAMILIES } from "../../connectors/registry.js";
import * as hub from "../../data/hub.js";
import { loadProducts } from "../../data/catalog.js";
import { appDot, pill, errorBlock } from "../components.js";

export const LIC_LABEL = { free: "Gratuite", pro: "Pro", pro_entreprise: "Pro Entreprise", trial: "Essai", demo: "Démo", education: "Éducation", standard: "Standard" };
export function licenseText(app, licenses) {
  if (licenses == null) return { kind: "", text: "Licence : inconnue" };
  const l = licenses.find((x) => x.productId === app.productId);
  const st = licenseState(l);
  if (st === "active") return { kind: "ok", text: `Licence ${LIC_LABEL[l.licenseType] || l.licenseType}` };
  if (st === "expired") return { kind: "warn", text: "Licence expirée" };
  if (st === "suspended") return { kind: "err", text: "Licence suspendue" };
  return { kind: "", text: app.freeForAll ? "Licence gratuite (tous les comptes)" : "Offre gratuite" };
}
const KIND = { connected: "ok", connecting: "info run", error: "err", forbidden: "warn", disconnected: "", available: "plain" };

export async function render({ root, state }) {
  let products = null, err = null;
  const draw = () => {
    mount(root, html`
      <div class="page-head"><div><h1>Applications</h1><p class="lede">Les applications Studio Prism de votre compte. Ouvrez-les directement, ou connectez-les à Nexus pour retrouver vos projets et les utiliser dans vos automatisations.</p></div></div>
      ${err ? errorBlock(err, "reload") : ""}
      ${["archi", "spectra"].map((f) => html`<h2 class="family-title">${FAMILIES[f]}</h2><div class="tiles">${APPS.filter((a) => a.family === f).map((a) => {
        const st = appStatus({ app: a, profile: state.profile, connection: hub.connectionOf(a.id), lastCheck: hub.lastCheck(a.id) });
        const lic = licenseText(a, state.licenses);
        const p = products && products[a.productId];
        return html`<a class="tile" href="#/applications/${a.id}">
          <div class="tile-top">${appDot(a)}<div style="min-width:0"><h3>${(p && p.name) || a.name}</h3><p class="tag">${(p && p.tagline) || a.tagline}</p></div></div>
          <div class="tile-foot">${pill(KIND[st] ?? "", STATUS_LABEL[st])}<span>${lic.text}</span></div></a>`;
      })}</div>`)}
      <p class="small muted measure" style="margin-top:28px">Chaque application garde son propre écran de connexion : à la première ouverture, connectez-vous avec le même compte Studio Prism. « Connectée » signifie que vous avez autorisé Nexus à utiliser ses données ; l'accès est revérifié à chaque lecture et une erreur s'affiche ici si les règles le refusent.</p>`);
  };
  draw();
  const load = async () => {
    try { await Promise.all([hub.loadConnections(), loadProducts().then((p) => { products = p; }).catch(() => { products = null; })]); err = null; }
    catch (e) { err = e; }
    draw();
  };
  const off = delegate(root, { reload: load });
  await load();
  return off;
}
