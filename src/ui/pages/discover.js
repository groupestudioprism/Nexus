/* Page publique : ce que fait Nexus, sans compte. Aucune donnée personnelle n'est lue ici. */
import { html, mount } from "../../core/dom.js";
import { APPS, FAMILIES } from "../../connectors/registry.js";
import { appDot } from "../components.js";
import { icon } from "../icons.js";

export function render({ root, state }) {
  const signedIn = state.status === "in";
  const fam = (f) => APPS.filter((a) => a.family === f);
  mount(root, html`<div style="background:var(--surface);min-height:100vh">
    <header class="row" style="padding:18px var(--gutter);border-bottom:1px solid var(--line)">
      <a class="brand" href="#/decouvrir" style="padding:0"><img src="assets/brand/nexus-mark.svg" alt="" width="30" height="30"><span class="brand-word">NEXUS</span></a>
      <span class="spacer"></span>
      <a class="btn primary" href="#${signedIn ? "/accueil" : "/connexion"}">${signedIn ? "Ouvrir Nexus" : "Se connecter"}</a>
    </header>
    <main class="page" style="margin:0 auto">
      <section style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:40px;align-items:center;padding:40px 0 24px" class="disc-hero">
        <div class="stack" style="--gap:18px">
          <h1 class="greet" style="max-width:20ch">Une seule porte d'entrée pour les applications Studio Prism.</h1>
          <p class="measure" style="color:var(--ink-2);font-size:var(--fs-md)">Nexus ne remplace aucune application : la conception reste dans ARCHIPLAN, la rédaction dans SPECTRA Writer, la présentation dans SPECTRA Slide. Nexus les fait travailler ensemble, avec votre compte Studio Prism habituel.</p>
          <div class="row"><a class="btn primary" href="#${signedIn ? "/accueil" : "/connexion"}">${signedIn ? "Ouvrir Nexus" : "Se connecter avec mon compte Studio Prism"}</a></div>
        </div>
        <img src="assets/brand/nexus-app-icon.svg" alt="" style="width:min(260px,70%);justify-self:center">
      </section>
      <section class="section">
        <h2 style="margin-bottom:14px">Ce que Nexus fait aujourd'hui</h2>
        <ul class="list">
          <li class="li">${icon("apps")}<div class="li-main"><div class="li-title">Vos applications et vos licences</div><div class="li-sub" style="white-space:normal">Le catalogue Studio Prism, l'état de vos licences et un accès direct à chaque application.</div></div></li>
          <li class="li">${icon("link")}<div class="li-main"><div class="li-title">Des connexions que vous contrôlez</div><div class="li-sub" style="white-space:normal">Vous choisissez ce que Nexus peut lire ou créer dans chaque application, et vous le retirez quand vous voulez.</div></div></li>
          <li class="li">${icon("flow")}<div class="li-main"><div class="li-title">Des automatisations entre applications</div><div class="li-sub" style="white-space:normal">Par exemple : rassembler vos projets ARCHI du mois et en faire un rapport SPECTRA Writer, après votre confirmation.</div></div></li>
          <li class="li">${icon("history")}<div class="li-main"><div class="li-title">Un historique clair</div><div class="li-sub" style="white-space:normal">Chaque opération est notée : proposée, confirmée, exécutée, puis vérifiée.</div></div></li>
          <li class="li">${icon("axion")}<div class="li-main"><div class="li-title">AXION, l'intelligence de Studio Prism</div><div class="li-sub" style="white-space:normal">Accessible depuis Nexus dès que Studio Prism l'aura activé pour votre compte.</div></div></li>
        </ul>
      </section>
      ${["archi", "spectra"].map((f) => html`<section class="section"><h2 style="margin-bottom:14px">${FAMILIES[f]}</h2><div class="tiles">${fam(f).map((a) => html`<div class="tile"><div class="tile-top">${appDot(a)}<div><h3>${a.name}</h3><p class="tag">${a.tagline}</p></div></div></div>`)}</div></section>`)}
      <p class="small muted" style="margin-top:40px">Nexus est une application Studio Prism. Mentions légales et confidentialité : voir le <a href="https://groupestudioprism.github.io/Studio-Prism/" target="_blank" rel="noopener">site Studio Prism</a>.</p>
    </main></div>
    <style>@media (max-width:760px){.disc-hero{grid-template-columns:1fr !important}.disc-hero img{display:none}}</style>`);
}
