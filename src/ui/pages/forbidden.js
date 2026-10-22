import { html, mount } from "../../core/dom.js";
import { empty } from "../components.js";
export function render({ root, setCrumbs }) {
  setCrumbs([{ path: "/accueil", label: "Nexus" }, { path: "", label: "Accès refusé" }]);
  mount(root, html`<div class="page-head"><h1>Accès réservé</h1></div>${empty({ icon: "lock", title: "Cette page est réservée aux administrateurs Studio Prism.", text: "Votre compte n'a pas le rôle administrateur. Si vous pensez qu'il devrait l'avoir, contactez Studio Prism : le rôle se gère depuis l'administration du site.", action: html`<a class="btn" href="#/accueil">Revenir à l'accueil</a>` })}`);
}
