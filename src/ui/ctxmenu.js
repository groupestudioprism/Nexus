/* Menu clic droit de Nexus (appui long au doigt).
 *
 * 1) NOYAU COMMUN « PrismCtx » : identique dans toutes les apps Studio Prism (ARCHIPLAN, ARCHITRAFIC, SPECTRA…).
 *    Il ne connaît rien de l'app : on lui donne une liste d'actions { label, hint, checked, danger, disabled, onClick, sub:[…] }.
 * 2) ACTIONS DE NEXUS : ce que propose le menu selon ce qu'on vise (application, connexion, automatisation, étape, exécution,
 *    lien, page). Les actions réutilisent les boutons déjà présents dans la page : mêmes confirmations, mêmes contrôles d'accès.
 *    Le menu du navigateur reste disponible dans les champs de saisie, sur un texte sélectionné et avec Maj + clic droit.
 */

/* ---------- 1) noyau commun ---------- */
export const PrismCtx = (() => {
  let menus = [], prevFocus = null, armed = false;
  const mk = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const close = () => {
    for (const m of menus) m.remove(); menus = [];
    if (armed){ armed = false; for (const [t, f, o] of LISTEN) window.removeEventListener(t, f, o); }
    if (prevFocus?.isConnected) try { prevFocus.focus({preventScroll:true}); } catch(_){ } prevFocus = null;
  };
  const isOpen = () => menus.length > 0;
  const place = (m, x, y, anchor) => {
    m.style.left = '0px'; m.style.top = '0px'; m.style.visibility = 'hidden'; document.body.appendChild(m);
    const w = m.offsetWidth, h = m.offsetHeight, W = innerWidth, H = innerHeight, g = 6;
    let l = x, t = y;
    if (anchor){ l = anchor.right - 3; if (l + w > W - g) l = Math.max(g, anchor.left - w + 3); t = anchor.top - 6; }
    else if (l + w > W - g) l = x - w;                 // pas la place à droite du curseur : le menu s'ouvre vers la gauche
    if (t + h > H - g) t = anchor ? H - g - h : y - h;  // pas la place en bas : vers le haut
    m.style.left = Math.max(g, Math.min(l, W - w - g)) + 'px'; m.style.top = Math.max(g, Math.min(t, H - h - g)) + 'px'; m.style.visibility = '';
  };
  const closeFrom = depth => { while (menus.length > depth){ menus.pop().remove(); } };
  function build(items, depth, title){
    const m = mk('div', 'pctx'); m.setAttribute('role', 'menu'); m.tabIndex = -1; m.dataset.depth = depth;
    if (title) m.appendChild(mk('div', 'pctx-h', title));
    let any = false;
    for (const it of items){
      if (!it) continue;
      if (it.sep){ if (any) m.appendChild(Object.assign(mk('div', 'pctx-sep'), {role:'separator'})); continue; }
      if (it.header){ m.appendChild(mk('div', 'pctx-h', it.header)); continue; }
      any = true;
      const b = mk('button', 'pctx-i' + (it.danger ? ' danger' : '')); b.type = 'button'; b.disabled = !!it.disabled;
      b.setAttribute('role', it.checked != null ? 'menuitemradio' : 'menuitem'); if (it.checked != null) b.setAttribute('aria-checked', String(!!it.checked));
      b.append(mk('span', 'pctx-ic', it.checked ? '✓' : (it.icon || '')), mk('span', 'pctx-t', it.label));
      if (it.hint) b.appendChild(mk('kbd', 'pctx-k', it.hint));
      if (it.sub){ b.appendChild(mk('span', 'pctx-ar', '›')); b.setAttribute('aria-haspopup', 'true'); }
      const openSub = focus => { closeFrom(depth + 1); for (const x of m.querySelectorAll('.open')) x.classList.remove('open'); b.classList.add('open');
        const s = build(it.sub, depth + 1); menus.push(s); place(s, 0, 0, b.getBoundingClientRect()); if (focus) s.querySelector('.pctx-i:not(:disabled)')?.focus(); };
      b.addEventListener('pointerenter', () => { if (b.disabled) return; if (it.sub) openSub(false); else { closeFrom(depth + 1); m.querySelectorAll('.open').forEach(x => x.classList.remove('open')); } });
      b.addEventListener('click', ev => { ev.stopPropagation(); if (b.disabled) return; if (it.sub){ openSub(true); return; }
        close(); try { it.onClick?.(); } catch(err){ console.warn('menu contextuel', err); } });
      b.addEventListener('keydown', ev => { if (it.sub && ev.key === 'ArrowRight' && !b.disabled){ ev.preventDefault(); openSub(true); } });
      m.appendChild(b);
    }
    m.addEventListener('keydown', ev => {
      const bs = [...m.querySelectorAll(':scope > .pctx-i:not(:disabled)')], i = bs.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown'){ ev.preventDefault(); bs[(i + 1) % bs.length]?.focus(); }
      else if (ev.key === 'ArrowUp'){ ev.preventDefault(); bs[(i - 1 + bs.length) % bs.length]?.focus(); }
      else if (ev.key === 'Home'){ ev.preventDefault(); bs[0]?.focus(); } else if (ev.key === 'End'){ ev.preventDefault(); bs.at(-1)?.focus(); }
      else if (ev.key === 'ArrowLeft' && depth){ ev.preventDefault(); const p = menus[depth - 1]; closeFrom(depth); p?.querySelector('.pctx-i.open')?.focus(); }
    });
    return m;
  }
  /* fermeture : clic ailleurs, Échap, défilement, redimensionnement, changement de fenêtre */
  const away = ev => { if (ev.type === 'keydown'){ if (ev.key === 'Escape'){ ev.preventDefault(); ev.stopPropagation(); if (menus.length > 1) closeFrom(menus.length - 1); else close(); } return; }
    if (ev.type === 'blur' || ev.type === 'resize') return close();
    if (!menus.some(m => m.contains(ev.target))) close(); };
  const LISTEN = [['pointerdown', away, true], ['wheel', away, {capture:true, passive:true}], ['keydown', away, true], ['resize', away, false], ['blur', away, false]];
  function open(x, y, items, title){
    close(); if (!items?.some(i => i && !i.sep && !i.header)) return false;
    prevFocus = document.activeElement; const m = build(items, 0, title); menus = [m]; place(m, x, y);
    armed = true; for (const [t, f, o] of LISTEN) window.addEventListener(t, f, o);
    m.focus({preventScroll:true}); return true;
  }
  /* branche le menu sur un élément : clic droit sans glisser, appui long au doigt ; getItems(ev) → {items, title} | tableau | null
     (ev porte clientX/clientY ; renvoyer null laisse le comportement par défaut du navigateur) */
  function attach(target, getItems, o = {}){
    const LP = o.longPress ?? 520, TOL = 6; let rt = null, tp = null, lastRight = -1e9;
    const show = (ev, x, y) => { const r = getItems(ev, x, y); const items = Array.isArray(r) ? r : r?.items; return !!items?.length && open(x, y, items, r?.title); };
    const stopLP = () => { if (tp){ clearTimeout(tp.t); tp = null; } };
    target.addEventListener('pointerdown', ev => {
      if (ev.pointerType === 'mouse'){ if (ev.button === 2){ rt = {x:ev.clientX, y:ev.clientY, at:performance.now()}; lastRight = rt.at; } return; }
      if (!ev.isPrimary){ stopLP(); return; }
      stopLP(); const d = {x:ev.clientX, y:ev.clientY, clientX:ev.clientX, clientY:ev.clientY, target:ev.target, pointerType:ev.pointerType};
      tp = {x:d.x, y:d.y, t:setTimeout(() => { tp = null; if (show(d, d.x, d.y)) o.onLongPress?.(); }, LP)};
    });
    target.addEventListener('pointermove', ev => { if (tp && Math.hypot(ev.clientX - tp.x, ev.clientY - tp.y) > 8) stopLP(); });
    for (const t of ['pointerup', 'pointercancel']) target.addEventListener(t, ev => {
      stopLP(); if (!rt) return; const r = rt; rt = null;
      if (t === 'pointerup' && ev.button === 2 && Math.hypot(ev.clientX - r.x, ev.clientY - r.y) <= TOL && performance.now() - r.at < 600) show(ev, ev.clientX, ev.clientY);
    });
    target.addEventListener('contextmenu', ev => { ev.preventDefault();
      if (performance.now() - lastRight < 800) return;               // clic droit souris : déjà traité au relâchement
      if (ev.pointerType === 'touch' || ev.pointerType === 'pen') return;   // appui long : déjà traité par le minuteur
      show(ev, ev.clientX, ev.clientY); });                          // Ctrl+clic (Mac), touche Menu du clavier
  }
  return {open, close, isOpen, attach};
})();


/* ---------- 2) actions de Nexus ---------- */
import { go } from "../core/router.js";
import { APPS } from "../connectors/registry.js";
import { toast } from "./components.js";

const NAV = [["/accueil", "Accueil"], ["/applications", "Applications"], ["/connexions", "Connexions"], ["/automatisations", "Automatisations"], ["/axion", "AXION"], ["/historique", "Historique"], ["/compte", "Mon compte"]];
const txt = (el, sel) => (el?.querySelector(sel)?.textContent || "").trim();
const click = (btn) => () => { if (btn && !btn.disabled) btn.click(); };
const appById = (id) => APPS.find((a) => a.id === id);
const absolute = (href) => { try { return new URL(href, location.href).href; } catch { return ""; } };
async function copy(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); }
  catch { toast("Copie impossible depuis ce navigateur : sélectionnez l'adresse et copiez-la à la main.", "err"); }
}
const openTab = (url) => () => { window.open(url, "_blank", "noopener"); };
const linkItems = (a) => {
  const href = a.getAttribute("href") || ""; if (!href || href === "#") return [];
  const url = absolute(href), local = href.startsWith("#/");
  return [{ label: "Ouvrir", onClick: () => (local ? go(href.slice(1)) : openTab(url)()) }, { label: "Ouvrir dans un nouvel onglet", onClick: openTab(url) }, { label: "Copier l'adresse du lien", onClick: () => copy(url, "Adresse copiée.") }];
};
const appItems = (app) => !app ? [] : [
  { label: "Voir la fiche", onClick: () => go(`/applications/${app.id}`) },
  { label: `Ouvrir ${app.name} (nouvel onglet)`, onClick: openTab(app.url) },
  { label: "Autorisations de connexion", onClick: () => go("/connexions") },
  { label: "Copier l'adresse de l'application", onClick: () => copy(app.url, "Adresse copiée.") }];

/* éléments propres à ce qu'on vise : renvoie { items, title } ou null */
export function contextFor(t) {
  const items = []; let title = "";
  const step = t.closest("li.step"), row = t.closest("li.li, li"), tile = t.closest("a.tile[href^='#/applications/']"), a = t.closest("a[href]");
  if (step) {                                       // étape d'une automatisation
    const b = (act) => step.querySelector(`.step-tools [data-act="${act}"]`);
    title = txt(step, ".step-title") || "Étape";
    items.push({ label: "Monter l'étape", disabled: !b("up") || b("up").disabled, onClick: click(b("up")) }, { label: "Descendre l'étape", disabled: !b("down") || b("down").disabled, onClick: click(b("down")) }, { sep: true }, { label: "Retirer l'étape", danger: true, disabled: !b("remove"), onClick: click(b("remove")) });
  } else if (row?.querySelector('[data-act="run"][data-id]')) {   // ligne d'automatisation
    const run = row.querySelector('[data-act="run"][data-id]'), id = run.dataset.id; title = txt(row, ".li-title");
    items.push({ label: "Exécuter", disabled: run.disabled, onClick: click(run) }, { label: "Modifier", onClick: () => go(`/automatisations/${id}`) }, { sep: true }, { label: "Copier le lien de l'automatisation", onClick: () => copy(absolute(`#/automatisations/${id}`), "Adresse copiée.") });
  } else if (row?.querySelector("[data-app]")) {   // ligne de connexion d'une application
    const id = row.querySelector("[data-app]").dataset.app, app = appById(id); title = app?.name || txt(row, ".li-title");
    for (const b of row.querySelectorAll("button[data-app]")) items.push({ label: b.textContent.trim(), danger: b.classList.contains("danger"), disabled: b.disabled, onClick: click(b) });
    items.push({ sep: true }, ...appItems(app));
  } else if (tile) {                                // vignette d'application
    const app = appById(tile.getAttribute("href").split("/").pop()); title = app?.name || txt(tile, "h3"); items.push(...appItems(app));
  } else if (a && /^#\/executions\//.test(a.getAttribute("href") || "")) {   // exécution
    title = txt(a, ".li-title") || "Exécution"; items.push(...linkItems(a));
  } else if (a) {                                   // n'importe quel lien
    title = (a.textContent || "").trim().slice(0, 40); items.push(...linkItems(a));
  }
  /* ce qui vaut sur toute la page */
  const reload = document.querySelector('#app [data-act="reload"], #app [data-act="refresh"]');
  const page = [];
  if (reload) page.push({ label: "Actualiser les données", onClick: click(reload) });
  page.push({ label: "Aller à", sub: NAV.map(([p, l]) => ({ label: l, checked: location.hash.split("?")[0] === "#" + p, onClick: () => go(p) })) });
  if (history.length > 1) page.push({ label: "Retour", hint: "Alt+←", onClick: () => history.back() });
  if (items.length) items.push({ sep: true });
  items.push(...page);
  return { items, title };
}

const SKIP = "input, textarea, select, [contenteditable], dialog[open], .pctx, video, audio";
function build(ev) {
  const t = ev.target; if (!(t instanceof Element) || ev.shiftKey || t.closest(SKIP)) return null;
  if (String(getSelection?.() || "").trim()) return null;           // du texte est sélectionné : menu du navigateur (Copier…)
  if (!t.closest("#app")) return null;                              // hors de l'application (ex. écran d'introduction)
  return contextFor(t);
}
let swallow = 0;
export function installContextMenu() {
  document.addEventListener("contextmenu", (ev) => {
    const r = build(ev); if (!r) return;
    ev.preventDefault(); PrismCtx.open(ev.clientX, ev.clientY, r.items, r.title);
  });
  /* appui long au doigt (iOS n'envoie pas d'évènement « contextmenu ») */
  let tp = null; const stop = () => { if (tp) { clearTimeout(tp.t); tp = null; } };
  document.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType !== "touch" || !ev.isPrimary) { stop(); return; }
    stop(); const d = { target: ev.target, clientX: ev.clientX, clientY: ev.clientY, shiftKey: false };
    tp = { x: ev.clientX, y: ev.clientY, t: setTimeout(() => { tp = null; const r = build(d); if (r && PrismCtx.open(d.clientX, d.clientY, r.items, r.title)) swallow = Date.now() + 900; }, 560) };
  }, { passive: true });
  document.addEventListener("pointermove", (ev) => { if (tp && Math.hypot(ev.clientX - tp.x, ev.clientY - tp.y) > 8) stop(); }, { passive: true });
  for (const type of ["pointerup", "pointercancel"]) document.addEventListener(type, stop, { passive: true });
  document.addEventListener("click", (ev) => { if (Date.now() < swallow) { ev.preventDefault(); ev.stopPropagation(); swallow = 0; } }, true);   // le relâchement après l'appui long n'ouvre pas le lien visé
}
