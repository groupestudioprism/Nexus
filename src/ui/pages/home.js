/* Accueil : où en sont mes connexions, ce qui m'attend, ce qui a bougé dans mes applications. */
import { html, raw, mount, delegate } from "../../core/dom.js";
import { relativeTime, plural } from "../../core/format.js";
import { errorMessage } from "../../core/errors.js";
import { appStatus, STATUS_LABEL, licenseState } from "../../core/permissions.js";
import { APPS, appById } from "../../connectors/registry.js";
import * as hub from "../../data/hub.js";
import * as repo from "../../data/repo.js";
import { onLive, pendingConfirmations } from "../../workflows/live.js";
import { notice, empty, skeletonList, appDot, statusPill, errorBlock } from "../components.js";
import { icon } from "../icons.js";

function hello(name) {
  const h = new Date().getHours();
  return `${h < 5 || h >= 18 ? "Bonsoir" : "Bonjour"}${name ? " " + name : ""}`;
}

function map(states) {
  const W = 640, H = 330, cx = W / 2, cy = H / 2 - 6, rx = 248, ry = 118;
  const nodes = APPS.map((a, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / APPS.length;
    return { a, x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang), st: states[a.id] };
  });
  const lines = nodes.map((n) => `<path class="link ${n.st === "connected" ? "on" : n.st === "error" || n.st === "forbidden" ? "err" : ""}" d="M${cx} ${cy} L${n.x.toFixed(1)} ${n.y.toFixed(1)}"/>`).join("");
  const boxes = nodes.map((n) => {
    const w = 132, h = 42, x = n.x - w / 2, y = n.y - h / 2;
    const label = STATUS_LABEL[n.st] || "";
    return `<a href="#/applications/${n.a.id}" aria-label="${n.a.name} : ${label}"><g class="node ${n.st === "connected" ? "on" : ""}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${h}" rx="10"/><text x="${n.x.toFixed(1)}" y="${(n.y - 3).toFixed(1)}" text-anchor="middle">${n.a.name.replace(/&/g, "&amp;")}</text><text class="st" x="${n.x.toFixed(1)}" y="${(n.y + 12).toFixed(1)}" text-anchor="middle">${label}</text></g></a>`;
  }).join("");
  return raw(`<svg class="map" viewBox="0 0 ${W} ${H}" role="group" aria-label="Carte des connexions entre Nexus et les applications">
    <defs><linearGradient id="nxLink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F7FF2"/><stop offset="1" stop-color="#11B3A4"/></linearGradient></defs>
    ${lines}<circle cx="${cx}" cy="${cy}" r="40" fill="#fff" stroke="#DCE5F0"/><image href="assets/brand/nexus-mark.svg" x="${cx - 26}" y="${cy - 26}" width="52" height="52"/>${boxes}</svg>`);
}

export async function render({ root, state }) {
  const { profile } = state;
  const draw = (data) => {
    const { conns, workflows, activity, recent, err } = data;
    const states = {};
    APPS.forEach((a) => { states[a.id] = appStatus({ app: a, profile, connection: hub.connectionOf(a.id), lastCheck: hub.lastCheck(a.id) }); });
    const connected = Object.values(states).filter((s) => s === "connected").length;
    const waiting = pendingConfirmations();
    const errors = APPS.filter((a) => states[a.id] === "error" || states[a.id] === "forbidden");
    const todo = [];
    if (waiting) todo.push(html`<li><a class="li" href="#/automatisations">${icon("warn")}<div class="li-main"><div class="li-title">${plural(waiting, "automatisation attend", "automatisations attendent")} votre confirmation</div><div class="li-sub">Rien n'est écrit dans une application sans votre accord.</div></div>${statusPill("awaiting_confirmation", "À confirmer")}</a></li>`);
    errors.forEach((a) => todo.push(html`<li><a class="li" href="#/applications/${a.id}">${appDot(a)}<div class="li-main"><div class="li-title">${a.name} : accès aux données en échec</div><div class="li-sub">${errorMessage({ code: hub.lastCheck(a.id)?.code })}</div></div>${statusPill("failed", "Erreur")}</a></li>`));
    if (conns && !connected) todo.push(html`<li><a class="li" href="#/connexions">${icon("link")}<div class="li-main"><div class="li-title">Connectez vos premières applications</div><div class="li-sub">Nexus ne lit rien tant que vous ne l'avez pas autorisé.</div></div><span class="btn sm">Choisir</span></a></li>`);
    const expiring = (state.licenses || []).filter((l) => licenseState(l) === "expired");
    expiring.forEach((l) => todo.push(html`<li><a class="li" href="#/applications/${l.productId}">${icon("info")}<div class="li-main"><div class="li-title">Licence ${l.productName || l.productId} expirée</div><div class="li-sub">L'application reste utilisable selon son offre gratuite.</div></div></a></li>`));

    mount(root, html`
      <div class="page-head"><div><h1 class="greet">${hello(profile.firstName)}</h1><p class="lede">${connected ? `${plural(connected, "application connectée", "applications connectées")} à Nexus.` : "Aucune application n'est encore connectée à Nexus."}</p></div>
        <div class="actions"><a class="btn" href="#/connexions">${icon("link")}Gérer les connexions</a><a class="btn primary" href="#/automatisations/nouvelle">${icon("plus")}Nouvelle automatisation</a></div></div>
      ${err ? errorBlock(err, "reload") : ""}
      <div class="hub">
        <div class="hub-map">${map(states)}<div class="hub-legend" aria-hidden="true"><span><i></i>Connectée</span><span><i class="off"></i>Non connectée</span></div></div>
        <ul class="list hub-list" aria-label="Applications et état de connexion">${APPS.map((a) => html`<li><a class="li" href="#/applications/${a.id}">${appDot(a)}<div class="li-main"><div class="li-title">${a.name}</div></div><span class="small ${states[a.id] === "connected" ? "" : "muted"}">${STATUS_LABEL[states[a.id]]}</span></a></li>`)}</ul>
        <div class="hub-side">
          <div class="kpis">
            <div class="kpi"><b>${connected}</b><span>sur ${APPS.filter((a) => a.cloud).length} intégrables</span></div>
            <div class="kpi"><b>${workflows == null ? "—" : workflows.length}</b><span>automatisations</span></div>
            <div class="kpi"><b>${waiting}</b><span>à confirmer</span></div>
          </div>
          <div>
            <div class="section-head"><h2>À faire</h2></div>
            ${todo.length ? html`<ul class="list">${todo}</ul>` : empty({ icon: "check", title: "Rien en attente", text: "Les confirmations demandées par vos automatisations et les erreurs de connexion apparaîtront ici." })}
          </div>
        </div>
      </div>
      <section class="section">
        <div class="section-head"><h2>Récemment modifiés dans vos applications</h2><span class="spacer"></span>${connected ? html`<button class="btn ghost sm" data-act="refresh">${icon("refresh")}Actualiser</button>` : ""}</div>
        ${recent === undefined ? skeletonList(4) : !connected ? empty({ icon: "folder", title: "Vos projets apparaîtront ici", text: "Autorisez Nexus à lister vos projets dans une application pour les retrouver ici, avec un lien direct pour les ouvrir.", action: html`<a class="btn primary" href="#/connexions">Connecter une application</a>` })
          : html`${recent.errors.map((e) => notice("warn", html`<b>${appById(e.id)?.name}</b> : ${errorMessage(e.error)}`))}
            ${recent.list.length ? html`<ul class="list" style="margin-top:${recent.errors.length ? "10px" : "0"}">${recent.list.slice(0, 8).map((it) => { const a = appById(it.appId); return html`<li><a class="li" href="${it.openUrl}" target="_blank" rel="noopener">${it.thumb ? html`<img class="thumb" src="${it.thumb}" alt="">` : appDot(a)}<div class="li-main"><div class="li-title">${it.name}</div><div class="li-sub">${a.name} · ${relativeTime(it.updatedAt)}${it.shared ? " · partagé avec vous" : ""}</div></div><span class="li-side muted small">Ouvrir ${icon("external")}</span></a></li>`; })}</ul>` : empty({ icon: "folder", title: "Aucun projet ni document pour l'instant", text: "Les éléments créés dans vos applications connectées s'afficheront ici." })}`}
      </section>
      <section class="section">
        <div class="section-head"><h2>Dernières opérations</h2><span class="spacer"></span><a href="#/historique">Tout l'historique</a></div>
        ${activity == null ? skeletonList(2) : activity.length ? html`<ul class="list">${activity.slice(0, 5).map((a) => html`<li class="li"><div class="li-main"><div class="li-title">${a.label || a.action}</div><div class="li-sub">${relativeTime(a.at)}${a.summary ? " · " + a.summary : ""}</div></div>${statusPill(a.status)}</li>`)}</ul>` : empty({ icon: "history", title: "Aucune opération pour l'instant", text: "Connexions accordées, automatisations exécutées et documents créés seront notés ici." })}
      </section>`);
  };

  const data = { conns: null, workflows: null, activity: null, recent: undefined, err: null };
  draw(data);
  const load = async (force) => {
    try {
      const [conns, workflows, activity] = await Promise.all([hub.loadConnections(force), repo.listWorkflows(state.user.uid).catch(() => null), repo.listActivity(state.user.uid, 5).catch(() => [])]);
      Object.assign(data, { conns, workflows, activity, err: null });
      draw(data);
      data.recent = await hub.recentAll({ force });
    } catch (e) { data.err = e; data.recent = { list: [], errors: [] }; }
    draw(data);
  };
  const off1 = delegate(root, { refresh: () => { data.recent = undefined; draw(data); load(true); }, reload: () => load(true) });
  const off2 = onLive(() => draw(data));
  load(false);
  return () => { off1(); off2(); };
}
