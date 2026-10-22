/* Composants d'interface réutilisables. */
import { html, raw, esc, mount, announce } from "../core/dom.js";
import { icon } from "./icons.js";
import { errorMessage } from "../core/errors.js";

export function toast(msg, kind = "") {
  let box = document.querySelector(".toasts");
  if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("role", "status"); document.body.appendChild(box); }
  const t = document.createElement("div");
  t.className = "toast " + kind;
  t.textContent = msg;
  box.appendChild(t);
  announce(msg);
  setTimeout(() => t.remove(), kind === "err" ? 7000 : 4200);
}

export const pill = (kind, label) => html`<span class="pill ${kind}">${label}</span>`;

const STATUS_KIND = {
  connected: "ok", available: "plain", disconnected: "", connecting: "info run", error: "err", forbidden: "warn",
  running: "info run", awaiting_confirmation: "warn", succeeded: "ok", failed: "err", cancelled: "",
  proposed: "info", pending_confirmation: "warn", executed: "info", verified: "ok", active: "ok", paused: "", revoked: ""
};
export const STATUS_TEXT = {
  running: "En cours", awaiting_confirmation: "En attente de confirmation", succeeded: "Réussie", failed: "Échec", cancelled: "Annulée",
  proposed: "Proposée", pending_confirmation: "En attente de confirmation", executed: "Exécutée", verified: "Vérifiée",
  active: "Active", paused: "En pause", revoked: "Retirée", interrupted: "Interrompue"
};
export const statusPill = (status, label) => pill(STATUS_KIND[status] ?? "", label || STATUS_TEXT[status] || status);

export function empty({ icon: ic = "info", title, text, action = "" }) {
  return html`<div class="empty">${icon(ic)}<h3>${title}</h3>${text ? html`<p>${text}</p>` : ""}${action}</div>`;
}

export function notice(kind, body, ic) {
  const i = ic || (kind === "err" ? "warn" : kind === "warn" ? "warn" : kind === "ok" ? "check" : "info");
  return html`<div class="notice ${kind}" role="${kind === "err" ? "alert" : "status"}">${icon(i)}<div class="notice-body">${body}</div></div>`;
}

export function errorBlock(err, retryAct) {
  return notice("err", html`<b>${errorMessage(err)}</b>${retryAct ? html` <button class="btn sm" data-act="${retryAct}">${icon("retry")}Réessayer</button>` : ""}`);
}

export function skeletonList(n = 3) {
  return html`<ul class="list" aria-busy="true" aria-label="Chargement">${Array.from({ length: n }, () => html`<li class="li"><div class="skel" style="width:36px;height:36px;border-radius:10px"></div><div class="li-main"><div class="skel" style="width:46%"></div><div class="skel" style="width:28%;margin-top:8px;height:11px"></div></div></li>`)}</ul>`;
}

export function appDot(app, lg = false) {
  const letters = app.name.replace(/^SPECTRA\s+/i, "S").replace(/^ARCHI/i, "A").slice(0, 2);
  return html`<span class="app-dot ${lg ? "lg" : ""}" style="background:${raw(/^#[0-9A-Fa-f]{6}$/.test(app.color) ? app.color : "#071B55")}" aria-hidden="true">${letters}</span>`;
}

export function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin" aria-hidden="true"></span>${esc(label || "Patientez…")}`; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

/* Dialogue générique. Renvoie { el, close }. Le contenu passe par html`` (échappé). */
export function dialog({ title, body, foot, wide = false, onClose }) {
  const d = document.createElement("dialog");
  d.className = "dlg" + (wide ? " wide" : "");
  d.setAttribute("aria-labelledby", "dlg-title");
  mount(d, html`<div class="dlg-head"><h2 id="dlg-title">${title}</h2></div><div class="dlg-body">${body}</div><div class="dlg-foot">${foot}</div>`);
  document.body.appendChild(d);
  const prev = document.activeElement;
  const close = (v) => { if (!d.open) return; d.close(); d.remove(); if (prev && prev.focus) prev.focus(); onClose && onClose(v); };
  d.addEventListener("cancel", (e) => { e.preventDefault(); close(false); });
  d.showModal();
  return { el: d, close };
}

/* Confirmation explicite : dit ce qui va se passer, et ce que fait le bouton. Résout true / false. */
export function confirmDialog({ title, body, confirmLabel = "Confirmer", danger = false, wide = false, signal }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    const dlg = dialog({
      title, body, wide,
      foot: html`<button class="btn" data-v="0">Annuler</button><button class="btn ${danger ? "danger" : "primary"}" data-v="1">${confirmLabel}</button>`,
      onClose: (v) => finish(!!v)
    });
    dlg.el.querySelector('[data-v="1"]').focus();
    dlg.el.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) dlg.close(b.dataset.v === "1"); });
    if (signal) signal.addEventListener("abort", () => dlg.close(false), { once: true });
  });
}
