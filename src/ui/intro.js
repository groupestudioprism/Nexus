/* Animation d'ouverture de Nexus : « la connexion devient visible ».
 *
 * Les applications Studio Prism connectées (couleurs du catalogue, src/connectors/registry.js) se matérialisent sur un anneau,
 * se relient, leurs liens convergent vers le symbole officiel (mêmes tracés que assets/brand/nexus-mark.svg), qui se construit
 * à partir d'eux ; le mot NEXUS apparaît, puis les liens se calment en une constellation discrète.
 *
 * Principes (voir docs/INTRO.md) :
 *  - c'est un VOILE posé au-dessus de #app : l'authentification, le routage, #/connexion, les liens profonds et safeReturn
 *    continuent derrière sans attendre (#app est rendu inerte pour le clavier et les lecteurs d'écran le temps du voile) ;
 *  - la scène dure 2,8 s (CSS keyframes, donc déterministe), tenue 0,4 s ; ensuite le voile attend la fin du chargement de
 *    session (dernière image = écran de chargement avec une fine barre), puis fond 450 ms ;
 *  - une seule fois par session de navigation (sessionStorage), rejouable avec ?intro=1 ;
 *  - « Passer l'animation » (bouton, Échap, Entrée) ; prefers-reduced-motion : image finale directe ;
 *  - jamais bloquant : erreur de session = le voile se retire aussitôt (errorScreen visible) ; garde-fou à 15 s. */
import { APPS } from "../connectors/registry.js";

const KEY = "prism-intro-nexus";
const SCENE_MS = 2800, HOLD_MS = 3200, FADE_MS = 450, GUARD_MS = 15000;
const C = { x: 180, y: 165, r: 148 };                 // anneau (repère 360 × 360 de la scène)
const M = { tx: 105, ty: 75, k: 1.5 };                 // symbole : translate(105 75) scale(1.5) sur le repère 100 × 100 de nexus-mark.svg
const mx = (x) => +(M.tx + M.k * x).toFixed(2), my = (y) => +(M.ty + M.k * y).toFixed(2);
/* sommets du « N » (repère du symbole) où aboutissent les liens, dans l'ordre angulaire */
const TARGETS = [[34, 14], [84, 10], [84, 76], [66, 86], [16, 90], [16, 24]];

let overlay = null, host = null, status = "loading", sceneDone = false, holdDone = false, closing = false, started = false;
const timers = [];

function safeStore(read, v) {
  try { return read ? sessionStorage.getItem(KEY) : sessionStorage.setItem(KEY, v); } catch (e) { return null; }
}

function markup() {
  const apps = APPS.slice(0, 8);
  const n = apps.length || 1;
  const pts = apps.map((a, i) => {
    const ang = (-100 + (360 / n) * i) * Math.PI / 180;
    const [tx, ty] = TARGETS[i % TARGETS.length];
    return { color: a.color, x: +(C.x + C.r * Math.cos(ang)).toFixed(2), y: +(C.y + C.r * Math.sin(ang)).toFixed(2), vx: mx(tx), vy: my(ty) };
  });
  const d = (i, base, step) => `--d:${base + i * step}ms`;
  let s = "";
  // ring + liens en étoile (hexagramme très discret, tracé tard)
  s += `<circle class="nxi-ring nxi-draw" cx="${C.x}" cy="${C.y}" r="${C.r}" pathLength="1" style="--d:60ms;--t:900ms;--o:.16"/>`;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % n];
    s += `<path class="nxi-link nxi-draw" d="M${p.x} ${p.y}L${q.x} ${q.y}" pathLength="1" style="${d(i, 430, 70)};--t:520ms;--o:.2"/>`;
  });
  if (n >= 5) pts.forEach((p, i) => {
    const q = pts[(i + 2) % n];
    s += `<path class="nxi-link nxi-draw nxi-late" d="M${p.x} ${p.y}L${q.x} ${q.y}" pathLength="1" style="${d(i, 1500, 60)};--t:700ms;--o:.1"/>`;
  });
  // liens vers les sommets du N (la pointe du tracé est portée par une impulsion)
  pts.forEach((p, i) => {
    s += `<path class="nxi-link nxi-spoke nxi-draw" d="M${p.x} ${p.y}L${p.vx} ${p.vy}" pathLength="1" style="${d(i, 700, 55)};--t:560ms;--o:.2"/>`;
  });
  pts.forEach((p, i) => {
    s += `<circle class="nxi-pulse" cx="${p.x}" cy="${p.y}" r="2.6" style="${d(i, 700, 55)};--t:560ms;--dx:${(p.vx - p.x).toFixed(2)}px;--dy:${(p.vy - p.y).toFixed(2)}px"/>`;
    s += `<circle class="nxi-arrive" cx="${p.vx}" cy="${p.vy}" r="7" style="--d:${700 + i * 55 + 520}ms"/>`;
  });
  // points = applications connectées (couleurs du catalogue)
  pts.forEach((p, i) => {
    s += `<g class="nxi-node" style="${d(i, 160, 90)}" transform="translate(${p.x} ${p.y})"><g class="nxi-node-in" style="${d(i, 160, 90)}">`
      + `<circle class="nxi-halo" r="11" stroke="${p.color}"/><circle class="nxi-dot" r="6" fill="${p.color}"/></g></g>`;
  });
  // symbole officiel : mêmes tracés et dégradés que assets/brand/nexus-mark.svg
  s += `<circle class="nxi-glow nxi-fadein" cx="180" cy="150" r="92" fill="url(#nxiG)" style="--d:1900ms;--t:700ms"/>`;
  s += `<g transform="translate(${M.tx} ${M.ty}) scale(${M.k})">`
    + `<g class="nxi-trace" fill="none" stroke-linejoin="round" stroke-linecap="round">`
    + `<path class="nxi-draw nxi-out" pathLength="1" d="M16 24 34 14v66L16 90Z" style="--d:1350ms;--t:480ms"/>`
    + `<path class="nxi-draw nxi-out" pathLength="1" d="M34 14 84 76 66 86 16 24Z" style="--d:1500ms;--t:520ms"/>`
    + `<path class="nxi-draw nxi-out" pathLength="1" d="M84 10v66L66 86V20Z" style="--d:1650ms;--t:480ms"/></g>`
    + `<path class="nxi-fadein" d="M16 24 34 14v66L16 90Z" fill="url(#nxiL)" style="--d:1800ms;--t:450ms"/>`
    + `<path class="nxi-fadein" d="M16 70 34 80 16 90Z" fill="#1B2FA6" opacity=".45" style="--d:2200ms;--t:300ms;--o:.45"/>`
    + `<path class="nxi-fadein" d="M66 20 84 10v66L66 86Z" fill="url(#nxiR)" style="--d:2100ms;--t:450ms"/>`
    + `<path class="nxi-fadein" d="M66 20 84 10 84 30Z" fill="#fff" style="--d:2250ms;--t:300ms;--o:.18"/>`
    + `<path class="nxi-fadein" d="M16 24 34 14 84 76 66 86Z" fill="url(#nxiD)" style="--d:1950ms;--t:450ms;--o:.93"/>`
    + `<path class="nxi-fadein" d="M25 19 75 81" stroke="#fff" stroke-opacity=".28" stroke-width="1" style="--d:2300ms;--t:300ms"/>`
    + `<path class="nxi-fadein" d="M34 14 84 76" stroke="#fff" stroke-opacity=".55" stroke-width=".8" style="--d:2300ms;--t:300ms"/></g>`;
  const defs = `<defs>
    <linearGradient id="nxiL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F7FF2"/><stop offset=".62" stop-color="#2459DE"/><stop offset="1" stop-color="#3A3FC9"/></linearGradient>
    <linearGradient id="nxiR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2D74EE"/><stop offset=".55" stop-color="#2496E6"/><stop offset="1" stop-color="#17C2C4"/></linearGradient>
    <linearGradient id="nxiD" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3ED8F5"/><stop offset=".55" stop-color="#22C3E3"/><stop offset="1" stop-color="#11B3A4"/></linearGradient>
    <radialGradient id="nxiG"><stop offset="0" stop-color="#22C3E3" stop-opacity=".30"/><stop offset="1" stop-color="#22C3E3" stop-opacity="0"/></radialGradient></defs>`;
  const word = [..."NEXUS"].map((c, i) => `<span style="--d:${1950 + i * 65}ms">${c}</span>`).join("");
  return `<div class="nxi-stage" role="img" aria-label="Nexus">
      <svg viewBox="0 0 360 360" aria-hidden="true" focusable="false">${defs}${s}</svg>
      <div class="nxi-word" aria-hidden="true">${word}</div>
      <div class="nxi-load" aria-hidden="true"><i></i></div>
    </div>
    <p class="nxi-sr" role="status">Ouverture de Nexus</p>
    <button type="button" class="nxi-skip">Passer l'animation</button>`;
}

function finishAnimations() {
  try { overlay.getAnimations({ subtree: true }).forEach((a) => { try { a.finish(); } catch (e) { try { a.cancel(); } catch (x) { /* rien */ } } }); } catch (e) { /* rien */ }
}

function release() {
  if (!overlay) return;
  const wasInside = overlay.contains(document.activeElement);
  timers.forEach(clearTimeout);
  overlay.remove(); overlay = null;
  if (host) host.removeAttribute("inert");
  document.documentElement.classList.remove("nxi-on");
  if (wasInside || document.activeElement === document.body) { const f = document.querySelector("#app [autofocus], #app #email"); if (f) f.focus({ preventScroll: true }); }
  document.removeEventListener("keydown", onKey, true);
}

function close(fast) {
  if (!overlay || closing) return;
  closing = true;
  overlay.classList.remove("is-waiting");
  overlay.classList.add("is-leaving");
  const reduced = overlay.classList.contains("is-static");
  timers.push(setTimeout(release, fast || reduced ? 160 : FADE_MS + 40));
}

function check() {
  if (!overlay || closing) return;
  if (status === "error") { finishAnimations(); overlay.classList.add("is-final"); return close(true); }
  if (status === "loading") { if (sceneDone) overlay.classList.add("is-waiting"); return; }
  if (holdDone) close();
}

function skip() {
  if (!overlay || closing) return;
  finishAnimations();
  overlay.classList.add("is-final");
  sceneDone = holdDone = true;
  check();
}

function onKey(e) {
  if (!overlay || closing) return;
  if (e.key === "Escape" || (e.key === "Enter" && (e.target === document.body || e.target === overlay || (e.target.classList && e.target.classList.contains("nxi-skip"))))) {
    if (e.key === "Enter" && e.target.classList && e.target.classList.contains("nxi-skip")) return;   // le bouton réagit lui-même
    e.preventDefault(); skip();
  }
}

/* Appelé par main.js à chaque changement d'état de session : "loading" | "out" | "in" | "error". */
export function notify(next) { status = next; check(); }

export function start() {
  if (started) return; started = true;
  host = document.getElementById("app");
  let force = false;
  try { force = new URLSearchParams(location.search).get("intro") === "1"; } catch (e) { /* rien */ }
  if (safeStore(true) === "1" && !force) return;          // déjà vue : l'écran de chargement existant (bootScreen) suffit
  safeStore(false, "1");
  const reduced = (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) || document.documentElement.classList.contains("reduce-motion");
  overlay = document.createElement("div");
  overlay.id = "nx-intro";
  if (reduced) overlay.classList.add("is-static", "is-final");
  try { overlay.insertAdjacentHTML("beforeend", markup()); } catch (e) { overlay = null; console.warn("[Nexus] intro", e); return; }
  document.body.appendChild(overlay);
  document.documentElement.classList.add("nxi-on");
  if (host) host.setAttribute("inert", "");
  overlay.querySelector(".nxi-skip").addEventListener("click", skip);
  document.addEventListener("keydown", onKey, true);
  if (reduced) { sceneDone = holdDone = true; overlay.querySelector(".nxi-skip").hidden = true; }
  else {
    timers.push(setTimeout(() => { sceneDone = true; if (overlay) { overlay.classList.add("is-final"); check(); } }, SCENE_MS));
    timers.push(setTimeout(() => { holdDone = true; check(); }, HOLD_MS));
  }
  timers.push(setTimeout(() => { if (overlay) close(true); }, GUARD_MS));
  check();
}
