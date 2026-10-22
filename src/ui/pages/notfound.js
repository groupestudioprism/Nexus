import { html, mount } from "../../core/dom.js";
import { empty } from "../components.js";
export function render({ root, setCrumbs }) {
  setCrumbs([{ path: "/accueil", label: "Nexus" }, { path: "", label: "Page introuvable" }]);
  mount(root, html`<div class="page-head"><h1>Page introuvable</h1></div>${empty({ icon: "info", title: "Cette adresse ne correspond à aucune page de Nexus.", text: "Le lien est peut-être ancien ou incomplet.", action: html`<a class="btn primary" href="#/accueil">Revenir à l'accueil</a>` })}`);
}
