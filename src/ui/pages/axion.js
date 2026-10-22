/* AXION dans Nexus : demander, comprendre ce qui est envoyé, confirmer toute action proposée. Rien n'est simulé. */
import { html, raw, mount, delegate, $ } from "../../core/dom.js";
import { errorMessage } from "../../core/errors.js";
import { isAdmin } from "../../core/permissions.js";
import { appById } from "../../connectors/registry.js";
import * as axion from "../../axion/axion.js";
import { textToHtml } from "../../axion/protocol.js";
import * as hub from "../../data/hub.js";
import * as repo from "../../data/repo.js";
import { notice, empty, toast, busy, confirmDialog, pill } from "../components.js";
import { icon } from "../icons.js";

const thread = [];   // conversation de cet onglet uniquement : jamais enregistrée

export async function render({ root, state }) {
  const uid = state.user.uid;
  let usage = null, ctrl = null, pending = false, recentCount = 0;
  await axion.loadSettings(true);
  try { await hub.loadConnections(); } catch (e) { /* sans connexions : AXION répond sans contexte */ }

  const statusPanel = () => {
    const s = axion.status();
    const label = { off: ["", "Non configuré"], error: ["err", "Réglage illisible"], ready: ["info", "Activé, non testé"], ok: ["ok", "Opérationnel"], failing: ["err", "En échec"], loading: ["", "…"] }[s.state];
    return html`<section class="panel"><div class="panel-head"><h2>État d'AXION</h2><span class="spacer"></span>${pill(label[0], label[1])}</div><div class="panel-body stack" style="--gap:12px">
      ${s.state === "off" || s.state === "error" ? html`<p class="small">${s.state === "error" ? errorMessage({ code: s.code }) : "AXION n'est pas encore activé pour Nexus."}</p>` : html`<dl class="kv"><dt>Moteur</dt><dd>${s.backend === "vertexai" ? "Vertex AI (Gemini)" : "Gemini Developer API"}</dd><dt>Modèle</dt><dd>${s.model}</dd><dt>App Check</dt><dd>${s.appCheck ? "actif" : "non configuré"}</dd><dt>Aujourd'hui</dt><dd>${usage ? `${usage.used} / ${usage.limit} demandes` : "—"}</dd></dl>
        ${s.state === "failing" ? html`<p class="step-err">Dernier test : ${s.detail}</p>` : ""}
        <button class="btn sm" data-act="test">${icon("shield")}Tester la connexion</button>`}
      ${isAdmin(state.profile) ? html`<a class="small" href="#/admin">Régler AXION (administration)</a>` : ""}
    </div></section>
    <section class="panel"><div class="panel-head"><h2>Ce qui est envoyé</h2></div><div class="panel-body small stack" style="--gap:8px">
      <p>Votre question, et seulement si vous cochez la case : les noms, applications et dates de vos éléments récents. Jamais le contenu de vos documents.</p>
      <p class="muted">La conversation reste dans cet onglet : elle n'est pas enregistrée. L'historique note seulement qu'une demande a eu lieu.</p>
      <p class="muted">N'envoyez pas d'informations confidentielles ou personnelles sensibles.</p>
    </div></section>`;
  };

  const msgHtml = (m, i) => m.role === "me" ? html`<div class="msg me"><div class="who">Vous</div><div class="txt"><p>${m.text}</p></div></div>`
    : m.role === "err" ? notice("err", m.text)
    : html`<div class="msg"><div class="who">AXION</div><div class="txt">${raw(textToHtml(m.reply))}</div>
      ${m.limits ? html`<p class="small muted" style="margin-top:8px">Limites : ${m.limits}</p>` : ""}
      ${m.rejected ? html`<p class="small muted" style="margin-top:6px">${m.rejected} action(s) proposée(s) écartée(s) car non autorisée(s) ou mal formée(s).</p>` : ""}
      ${(m.actions || []).map((a, k) => html`<div class="proposal">${icon(a.type === "open_item" ? "external" : "doc")}<div class="li-main"><div class="li-title small">${a.type === "open_item" ? `Ouvrir « ${a.name} » dans ${appById(a.app)?.name}` : `Créer « ${a.title} » dans SPECTRA Writer`}</div><div class="li-sub">${a.done ? a.done : "Action proposée — rien n'est fait sans vous"}</div></div>
        ${a.type === "open_item" ? html`<a class="btn sm" href="${a.url}" target="_blank" rel="noopener">Ouvrir</a>` : a.done ? "" : html`<button class="btn sm primary" data-act="doc" data-m="${i}" data-a="${k}">Vérifier et créer…</button>`}</div>`)}</div>`;

  const draw = () => {
    const typed = $("#q", root) ? $("#q", root).value : "";
    const hadFocus = document.activeElement && document.activeElement.id === "q";
    const s = axion.status();
    const off = s.state === "off" || s.state === "error";
    mount(root, html`
      <div class="page-head"><div><h1>AXION</h1><p class="lede">L'intelligence de Studio Prism. Posez une question sur vos applications et vos projets ; AXION peut proposer des actions, que vous confirmez.</p></div></div>
      <div class="axion">
        <div class="stack" style="--gap:16px">
          ${off ? empty({ icon: "axion", title: "AXION n'est pas encore disponible dans Nexus", text: "Son activation demande un réglage par un administrateur Studio Prism (moteur, App Check et conditions d'utilisation). Tout le reste de Nexus fonctionne sans AXION.", action: isAdmin(state.profile) ? html`<a class="btn primary" href="#/admin">Configurer AXION</a>` : "" }) : html`
            <div class="thread" aria-live="polite">${thread.length ? thread.map(msgHtml) : html`<div class="msg"><div class="who">AXION</div><div class="txt"><p>Bonjour ${state.profile.firstName || ""}. Je peux résumer l'activité de vos applications connectées, vous aider à préparer un document, ou retrouver un projet parmi ceux que Nexus liste.</p></div></div>`}
              ${pending ? html`<div class="msg"><div class="who">AXION</div><div class="txt"><div class="skel" style="width:60%"></div><div class="skel" style="width:40%;margin-top:8px"></div></div></div>` : ""}</div>
            <form class="composer" id="ask">
              <label class="sr-only" for="q">Votre demande</label>
              <textarea class="input" id="q" maxlength="2000" placeholder="Ex. : Quels chantiers ARCHITRAFIC ont bougé cette semaine ? Prépare une note de synthèse." style="min-height:72px" ${pending ? "disabled" : ""}></textarea>
              <div class="row"><label class="check"><input type="checkbox" id="ctx" ${hub.connectedAppIds().length ? "checked" : "disabled"}><span>Joindre mes éléments récents ${hub.connectedAppIds().length ? `(noms et dates${recentCount ? ", " + recentCount + " éléments" : ""})` : "(aucune application connectée)"}</span></label>
                <span class="spacer"></span>${pending ? html`<button type="button" class="btn danger" data-act="stop">${icon("stop")}Arrêter</button>` : html`<button class="btn primary" type="submit">${icon("send")}Envoyer</button>`}</div>
            </form>`}
        </div>
        <aside class="stack" style="--gap:16px">${statusPanel()}</aside>
      </div>`);
    const f = $("#ask", root);
    if (f) f.onsubmit = (e) => { e.preventDefault(); send(); };
    const q = $("#q", root);
    if (q && typed && !pending) { q.value = typed; if (hadFocus) q.focus(); }
    if (q) q.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
  };

  async function send() {
    const q = $("#q", root);
    const question = q.value.trim();
    if (!question || pending) return;
    let items = [];
    if ($("#ctx", root)?.checked) {
      try { items = (await hub.recentAll({ includeShared: true })).list.slice(0, 60); } catch (e) { items = []; }
    }
    thread.push({ role: "me", text: question });
    pending = true; ctrl = new AbortController(); draw();
    try {
      const r = await axion.ask({ question, items, connectedApps: hub.connectedAppIds(), signal: ctrl.signal });
      thread.push({ role: "axion", ...r });
      repo.addActivity(uid, { action: "axion.ask", label: "Demande à AXION", status: "executed", summary: `Réponse reçue${r.actions.length ? ` · ${r.actions.length} action(s) proposée(s)` : ""}${items.length ? ` · ${items.length} élément(s) joints` : ""}` }).catch(() => {});
    } catch (e) {
      thread.push({ role: "err", text: errorMessage(e) });
      if (e.code !== "nx/cancelled") repo.addActivity(uid, { action: "axion.ask", label: "Demande à AXION", status: "failed", error: errorMessage(e) }).catch(() => {});
    }
    pending = false; ctrl = null;
    usage = await axion.usageToday().catch(() => usage);
    draw();
    $("#q", root)?.focus();
  }

  const off = delegate(root, {
    stop: () => ctrl && ctrl.abort(),
    test: async (e, b) => {
      busy(b, true, "Test…");
      try { await axion.testConnection(); toast("AXION a répondu : opérationnel."); } catch (x) { toast(errorMessage(x), "err"); }
      usage = await axion.usageToday().catch(() => usage);
      draw();
    },
    doc: async (e, b) => {
      const m = thread[+b.dataset.m], a = m.actions[+b.dataset.a];
      const perm = hub.allowed("spectrawriter", "documents.create");
      if (!perm.ok) { toast(errorMessage({ code: perm.reason }) + " (SPECTRA Writer)", "err"); return; }
      const w = hub.writerService();
      const prep = w.prepare({ title: a.title, html: textToHtml(a.content), text: a.content });
      const actId = await repo.addActivity(uid, { action: "spectrawriter.create", label: `Document proposé par AXION : ${a.title}`, appId: "spectrawriter", status: "pending_confirmation", summary: "En attente de votre confirmation" }).catch(() => "");
      const ok = await confirmDialog({ title: "Créer ce document dans SPECTRA Writer ?", wide: true, confirmLabel: "Créer le document",
        body: html`<p class="small muted" style="margin-bottom:8px">Rédigé par AXION : relisez-le. Il sera créé dans votre espace SPECTRA Writer (nouveau document, rien n'est remplacé).</p><div class="report-preview"><h1>${a.title}</h1>${raw(textToHtml(a.content))}</div>` });
      if (!ok) { if (actId) repo.updateActivity(uid, actId, { status: "cancelled", summary: "Refusé" }).catch(() => {}); return; }
      busy(b, true, "Création…");
      try {
        if (actId) await repo.updateActivity(uid, actId, { status: "executed", confirmed: true, summary: "Écriture envoyée" }).catch(() => {});
        const r = await w.create(prep);
        const v = await w.verify(prep);
        if (!v.ok) throw { code: "nx/not-verified" };
        if (actId) repo.updateActivity(uid, actId, { status: "verified", summary: "Document relu dans SPECTRA Writer" }).catch(() => {});
        a.done = html`Créé et vérifié · <a href="${w.openUrl(r.id)}" target="_blank" rel="noopener">ouvrir dans SPECTRA Writer</a>`;
        toast("Document créé et vérifié dans SPECTRA Writer.");
      } catch (x) {
        if (actId) repo.updateActivity(uid, actId, { status: "failed", error: errorMessage(x) }).catch(() => {});
        toast(errorMessage(x), "err");
      }
      draw();
    }
  });
  draw();
  if (axion.status().state !== "off") {
    usage = await axion.usageToday().catch(() => null);
    hub.recentAll().then((r) => { recentCount = Math.min(60, r.list.length); draw(); }).catch(() => {});
    draw();
  }
  return () => { off(); if (ctrl) ctrl.abort(); };
}
