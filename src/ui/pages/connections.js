/* Connexions : ce que Nexus a le droit de faire avec chaque application, comment c'est vérifié, et comment le retirer. */
import { html, mount, delegate } from "../../core/dom.js";
import { dateLabel, relativeTime } from "../../core/format.js";
import { errorMessage } from "../../core/errors.js";
import { appStatus, STATUS_LABEL, grantableScopes } from "../../core/permissions.js";
import { APPS, appById, SCOPES } from "../../connectors/registry.js";
import * as hub from "../../data/hub.js";
import { appDot, pill, notice, dialog, confirmDialog, toast, busy, errorBlock, skeletonList } from "../components.js";
import { icon } from "../icons.js";

const KIND = { connected: "ok", connecting: "info run", error: "err", forbidden: "warn", disconnected: "", available: "plain" };

/* Dialogue d'autorisation : chaque autorisation est décrite, celles qui écrivent sont signalées. */
export function openConnectDialog(app, after) {
  const conn = hub.connectionOf(app.id);
  const current = conn && conn.status === "active" ? conn.scopes : grantableScopes(app.id).filter((s) => s !== "documents.create");
  const dlg = dialog({
    title: `${conn && conn.status === "active" ? "Autorisations de" : "Connecter"} ${app.name}`,
    body: html`<p class="muted" style="margin-bottom:14px">Nexus utilisera ${app.name} avec VOS droits, ni plus ni moins : les règles de sécurité de l'application continuent de tout contrôler. Vous pourrez retirer ces autorisations à tout moment.</p>
      <fieldset style="border:0;padding:0;margin:0"><legend class="sr-only">Autorisations</legend>
      ${grantableScopes(app.id).map((s) => html`<label class="check" style="margin-bottom:10px"><input type="checkbox" value="${s}" ${current.includes(s) ? "checked" : ""} ${s === "catalog.read" ? "checked disabled" : ""}><span><b>${SCOPES[s].label}</b>${SCOPES[s].risk === "medium" ? html`<br><span class="muted">Écrit dans ${app.name} : chaque création vous est montrée et demande votre confirmation.</span>` : ""}</span></label>`)}
      </fieldset>
      ${app.cloud ? notice("info", "Après l'enregistrement, Nexus vérifie réellement l'accès en lisant une fois vos données dans l'application.") : ""}
      <p class="form-error" id="cx-err" role="alert"></p>`,
    foot: html`<button class="btn" data-x="cancel">Annuler</button><button class="btn primary" data-x="ok">${conn && conn.status === "active" ? "Enregistrer" : "Autoriser"}</button>`
  });
  dlg.el.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-x]");
    if (!b) return;
    if (b.dataset.x === "cancel") return dlg.close(false);
    const scopes = [...dlg.el.querySelectorAll("input[type=checkbox]")].filter((i) => i.checked).map((i) => i.value);
    busy(b, true, "Vérification…");
    try {
      const check = await hub.grant(app.id, scopes);
      dlg.close(true);
      toast(check.ok ? `${app.name} est connectée${app.cloud ? " : accès vérifié" : ""}.` : `${app.name} : autorisations enregistrées, mais l'accès a échoué — ${errorMessage({ code: check.code })}`, check.ok ? "" : "err");
      after && after();
    } catch (x) { busy(b, false); dlg.el.querySelector("#cx-err").textContent = errorMessage(x); }
  });
}

export async function render({ root, state }) {
  let loaded = false, err = null;
  const draw = () => {
    mount(root, html`
      <div class="page-head"><div><h1>Connexions</h1><p class="lede">Choisissez ce que Nexus peut faire avec chaque application. Rien n'est lu ni écrit sans autorisation, et tout se retire en un clic.</p></div></div>
      ${err ? errorBlock(err, "reload") : ""}
      <div class="two">
        <div>${!loaded ? skeletonList(5) : html`<ul class="list">${APPS.map((a) => {
          const c = hub.connectionOf(a.id), on = c && c.status === "active";
          const st = appStatus({ app: a, profile: state.profile, connection: c, lastCheck: hub.lastCheck(a.id) });
          const chk = hub.lastCheck(a.id);
          return html`<li class="li" style="align-items:flex-start;flex-wrap:wrap">
            ${appDot(a)}
            <div class="li-main" style="min-width:200px">
              <div class="row" style="gap:8px"><a class="li-title" href="#/applications/${a.id}" style="color:inherit">${a.name}</a>${pill(KIND[st] ?? "", STATUS_LABEL[st])}</div>
              <div class="li-sub" style="white-space:normal">${!a.cloud ? a.limitation : on ? html`${c.scopes.map((s) => SCOPES[s]?.label || s).join(" · ")}<br>Autorisée le ${dateLabel(c.grantedAt)}${chk ? ` · vérifiée ${relativeTime(chk.at)}${chk.ok ? "" : " : échec"}` : ""}` : c && c.status === "revoked" ? `Retirée le ${dateLabel(c.revokedAt)}` : "Non autorisée"}</div>
              ${chk && !chk.ok ? html`<div class="step-err">${errorMessage({ code: chk.code })}</div>` : ""}
            </div>
            <div class="li-side">${a.cloud ? (on ? html`<button class="btn sm" data-act="verify" data-app="${a.id}">Vérifier</button><button class="btn sm" data-act="edit" data-app="${a.id}">Modifier</button><button class="btn sm danger" data-act="revoke" data-app="${a.id}">Retirer</button>` : html`<button class="btn sm primary" data-act="edit" data-app="${a.id}">Connecter</button>`) : html`<a class="btn sm" href="${a.url}" target="_blank" rel="noopener">Ouvrir</a>`}</div>
          </li>`;
        })}</ul>`}</div>
        <aside class="panel"><div class="panel-head"><h2>Comment ça marche</h2></div><div class="panel-body stack" style="--gap:12px">
          <p class="small">Les applications Studio Prism enregistrent vos projets dans le même espace sécurisé que votre compte. Une fois autorisé, Nexus les lit <b>avec vos droits</b> : vos éléments, et ceux qu'on vous a partagés si vous l'acceptez.</p>
          <p class="small">Les règles de sécurité de chaque application restent seules juges : Nexus ne voit jamais les données d'un autre compte et n'obtient aucun droit supplémentaire.</p>
          <p class="small">Une seule écriture existe aujourd'hui : créer un document SPECTRA Writer, toujours après votre confirmation, puis relu pour vérifier qu'il a bien été créé.</p>
          <p class="small muted">Les autorisations sont un engagement de Nexus envers vous : retirées, Nexus cesse d'utiliser l'application. Vos droits dans l'application elle-même ne changent pas.</p>
        </div></aside>
      </div>`);
  };
  const load = async () => { try { await hub.loadConnections(true); err = null; } catch (e) { err = e; } loaded = true; draw(); };
  const off = delegate(root, {
    reload: load,
    edit: (e, b) => openConnectDialog(appById(b.dataset.app), draw),
    verify: async (e, b) => { busy(b, true, "…"); try { const r = await hub.verify(b.dataset.app); toast(r.ok ? "Accès vérifié." : errorMessage({ code: r.code }), r.ok ? "" : "err"); } catch (x) { toast(errorMessage(x), "err"); } draw(); },
    revoke: async (e, b) => {
      const a = appById(b.dataset.app);
      const ok = await confirmDialog({ title: `Retirer ${a.name} de Nexus ?`, body: html`<p>Nexus cessera de lister vos ${a.cloud.noun[1]} et ne pourra plus l'utiliser dans vos automatisations. Rien n'est supprimé dans ${a.name}.</p>`, confirmLabel: "Retirer la connexion", danger: true });
      if (!ok) return;
      try { await hub.revoke(a.id); toast(`${a.name} n'est plus connectée.`); } catch (x) { toast(errorMessage(x), "err"); }
      draw();
    }
  });
  draw();
  await load();
  return off;
}
