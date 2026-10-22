/* Lancement le plus tôt possible de l'animation d'ouverture (script séparé, chargé avant main.js : l'intro ne dépend ni du SDK ni de la session). */
import { start } from "./ui/intro.js";
try { start(); } catch (e) { console.warn("[Nexus] animation d'ouverture indisponible", e); }
