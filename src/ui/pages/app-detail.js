/* Fiche d'une application : présentation, licence, autorisations accordées à Nexus, et vos projets / documents. */
import { html, mount, delegate } from "../../core/dom.js";
import { relativeTime, bytesLabel, dateLabel } from "../../core/format.js";
import { errorMessage } from "../../core/errors.js";
import { appStatus, STATUS_LABEL, hasScope } from "../../core/permissions.js";
import { appById, SCOPES, FAMILIES } from "../../connectors/registry.js";
import { previewText } from "../../connectors/cloud.js";
import * as hub from "../../data/hub.js";
import { loadProducts, safeCatalogUrl } from "../../data/catalog.js";
import { appDot, pill, empty, notice, skeletonList, errorBlock, toast } from "../components.js";
import { icon } from "../icons.js";
import { licenseText } from "./apps.js";
import { openConnectDialog } from "./connections.js";

const KIND = { connected: "ok", connecting: "info run", error: "err", forbidden: "warn", disconnected: "", available: "plain" };

export async function render({ root, params, state, setCrumbs, setTitle }) {
  const app = appById(params.id);
  if (!app) {
    setCrumbs([{ path: "/accueil", label: "Nexus" }, { path: "/applications", label: "Applications" }, { path: "", label: "Introuvable" }]);
    mount(root, empty({ icon: "info", title: "Application inconnue", text: "Cette application ne fait pas partie de Nexus.", action: html`<a class="btn" href="#/applications">Toutes les applications</a>` }));
    return;
  }
  setTitle(app.name);
  setCrumbs([{ path: "/accueil", label: "Nexus" }, { path: "/applications", label: "Applications" }, { path: "", label: app.name }]);
  let product = null, data, dataErr = null, tab = "own";

  const draw = () => {
    const conn = hub.connectionOf(app.id);
    const st = appStatus({ app, profile: state.profile, connection: conn, lastCheck: hub.lastCheck(app.id) });
    const lic = licenseText(app, state.licenses);
    const link = (product && safeCatalogUrl(product.url)) || "";
    const canList = hasScope(conn, "projects.read");
    const list = data ? (tab === "own" ? data.own : data.shared) : null;
    mount(root, html`
      <div class="page-head">
        <div class="row" style="gap:16px;align-items:center">${appDot(app, true)}<div><h1>${(product && product.name) || app.name}</h1><p class="lede" style="margin-top:2px">${(product && product.tagline) || app.tagline} · ${FAMILIES[app.family]}</p></div></div>
        <div class="actions"><a class="btn primary" href="${app.url}" target="_blank" rel="noopener">${icon("external")}Ouvrir ${app.name}</a></div>
      </div>
      <div class="two">
        <div class="stack" style="--gap:20px">
          ${app.cloud ? html`<section class="panel">
            <div class="panel-head"><h2>${app.cloud.noun[1].replace(/^./, (c) => c.toUpperCase())}</h2><span class="spacer"></span>${canList ? html`<button class="btn ghost sm" data-act="refresh">${icon("refresh")}Actualiser</button>` : ""}</div>
            <div class="panel-body">
              ${!canList ? empty({ icon: "lock", title: `Nexus ne liste pas encore vos ${app.cloud.noun[1]}`, text: `Autorisez Nexus à lire la liste de vos ${app.cloud.noun[1]} ${app.name} (nom, taille, dates). Le contenu reste dans l'application.`, action: html`<button class="btn primary" data-act="connect">Autoriser</button>` })
                : html`${hasScope(conn, "shared.read") ? html`<div class="tabs" role="tablist"><button role="tab" aria-selected="${tab === "own"}" data-act="tab" data-tab="own">Mes ${app.cloud.noun[1]}${data ? ` (${data.own.length})` : ""}</button><button role="tab" aria-selected="${tab === "shared"}" data-act="tab" data-tab="shared">Partagés avec moi${data ? ` (${data.shared.length})` : ""}</button></div>` : ""}
                  ${dataErr ? errorBlock(dataErr, "refresh") : list == null ? skeletonList(3) : list.length ? html`<ul class="list">${list.map((it) => html`<li><a class="li" href="${it.openUrl}" target="_blank" rel="noopener">
                      ${it.thumb ? html`<img class="thumb" src="${it.thumb}" alt="">` : html`<span class="app-dot" style="background:var(--surface-2);color:var(--muted)">${icon(it.kind === "folder" ? "folder" : it.locked ? "lock" : "doc")}</span>`}
                      <div class="li-main"><div class="li-title">${it.name}</div><div class="li-sub">${it.locked ? (state.user.emailVerified ? "Accès impossible : partage retiré par son propriétaire" : "Accès impossible : confirmez d'abord votre adresse e-mail (lien envoyé par l'application)") : it.kind === "folder" ? `Dossier partagé par ${it.ownerName || "un autre compte"} · ${it.role === "edit" ? "modification" : "lecture"}` : html`${relativeTime(it.updatedAt)}${it.size ? " · " + bytesLabel(it.size) : ""}${it.shared ? ` · ${it.ownerName || "partagé"} · ${it.role === "edit" ? "modification" : "lecture"}` : ""}${previewText(it) ? " · " + previewText(it) : ""}`}</div></div>
                      <span class="li-side muted small">${icon("external")}</span></a></li>`)}</ul>`
                    : empty({ icon: "folder", title: tab === "own" ? `Aucun ${app.cloud.noun[0]} dans votre espace ${app.name}` : "Rien n'est partagé avec vous", text: tab === "own" ? `Créez-en un dans ${app.name} : il apparaîtra ici.` : "" })}
                  <p class="small muted" style="margin-top:10px">Les liens ouvrent l'élément dans ${app.name}. Les éléments partagés s'ouvrent depuis l'accueil de l'application.</p>`}
            </div></section>` : notice("info", app.limitation)}
          <section class="panel"><div class="panel-head"><h2>Fonctions de l'application</h2></div><div class="panel-body">
            ${product && product.description ? html`<p style="margin-bottom:12px;color:var(--ink-2)" class="measure">${String(product.description).slice(0, 600)}</p>` : ""}
            <ul class="feat">${app.features.map((f) => html`<li>${f}</li>`)}</ul>
            ${link ? html`<p style="margin-top:12px"><a href="${link}" target="_blank" rel="noopener">Fiche du produit sur le site Studio Prism</a></p>` : ""}
          </div></section>
        </div>
        <aside class="stack" style="--gap:20px">
          <section class="panel"><div class="panel-head"><h2>Dans Nexus</h2><span class="spacer"></span>${pill(KIND[st] ?? "", STATUS_LABEL[st])}</div><div class="panel-body stack" style="--gap:14px">
            ${st === "error" || st === "forbidden" ? notice("err", errorMessage({ code: hub.lastCheck(app.id)?.code })) : ""}
            ${app.cloud ? html`<div><p class="small" style="font-weight:600;margin-bottom:6px">Autorisations accordées</p>
              ${conn && conn.status === "active" ? html`<ul class="feat small">${conn.scopes.map((s) => html`<li>${SCOPES[s]?.label || s}</li>`)}</ul><p class="small muted" style="margin-top:6px">Depuis le ${dateLabel(conn.grantedAt)}</p>` : html`<p class="small muted">Aucune : Nexus n'utilise pas ${app.name}.</p>`}</div>
              <div class="row"><button class="btn sm ${conn && conn.status === "active" ? "" : "primary"}" data-act="connect">${conn && conn.status === "active" ? "Modifier" : "Connecter"}</button>${conn && conn.status === "active" ? html`<button class="btn sm" data-act="verify">${icon("shield")}Vérifier l'accès</button>` : ""}</div>` : html`<p class="small muted">Pas d'intégration de données possible aujourd'hui.</p>`}
          </div></section>
          <section class="panel"><div class="panel-head"><h2>Votre compte</h2></div><div class="panel-body">
            <dl class="kv"><dt>Licence</dt><dd>${lic.text}</dd>${app.quota ? html`<dt>Stockage</dt><dd>${app.quota}</dd>` : ""}<dt>Adresse</dt><dd><a href="${app.url}" target="_blank" rel="noopener">${app.url.replace(/^https:\/\//, "").replace(/\/$/, "")}</a></dd></dl>
          </div></section>
        </aside>
      </div>`);
  };

  const loadItems = async (force) => {
    if (!app.cloud || !hasScope(hub.connectionOf(app.id), "projects.read")) return draw();
    data = null; dataErr = null; draw();
    try { data = await hub.items(app.id, { force }); } catch (e) { dataErr = e; }
    draw();
  };
  const off = delegate(root, {
    tab: (e, b) => { tab = b.dataset.tab; draw(); },
    refresh: () => loadItems(true),
    connect: () => openConnectDialog(app, () => loadItems(true)),
    verify: async () => { try { const r = await hub.verify(app.id); toast(r.ok ? "Accès vérifié : les règles de l'application autorisent la lecture." : errorMessage({ code: r.code }), r.ok ? "" : "err"); } catch (e) { toast(errorMessage(e), "err"); } draw(); }
  });
  draw();
  try { await hub.loadConnections(); } catch (e) { mount(root, errorBlock(e)); return off; }
  loadProducts().then((p) => { product = p[app.productId] || null; draw(); }).catch(() => {});
  loadItems(false);
  return off;
}
