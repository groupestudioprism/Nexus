/* Modèles d'automatisation proposés au départ (point de départ modifiable, pas des automatisations actives). */
import { newStep } from "./steps.js";

const step = (type, config = {}, n) => { const s = newStep(type, `${type}-${n}`); Object.assign(s.config, config); return s; };

export const TEMPLATES = [
  {
    id: "rapport-projets",
    name: "Rapport d'activité des projets",
    description: "Liste vos projets ARCHIPLAN, ARCHITRAFIC et ARCHIINDUS modifiés ces 30 derniers jours, puis crée un rapport dans SPECTRA Writer après votre confirmation.",
    needsAxion: false,
    build: () => [
      step("collect", { apps: ["archiplan", "architrafic", "archiindus"], includeShared: false, max: 200 }, "t1"),
      step("filter", { days: 30, contains: "" }, "t2"),
      step("report", { title: "Rapport d'activité des projets", groupByApp: true }, "t3"),
      step("confirm", { message: "Vérifiez le rapport avant sa création dans SPECTRA Writer." }, "t4"),
      step("writer", {}, "t5")
    ]
  },
  {
    id: "synthese-axion",
    name: "Synthèse de la semaine par AXION",
    description: "Rassemble l'activité de la semaine dans toutes les applications connectées, demande une synthèse à AXION et la dépose dans SPECTRA Writer après confirmation.",
    needsAxion: true,
    build: () => [
      step("collect", { apps: ["archiplan", "architrafic", "archiindus", "spectrawriter", "spectracalc", "spectraslide"], includeShared: true, max: 200 }, "t1"),
      step("filter", { days: 7, contains: "" }, "t2"),
      step("summarize", { instruction: "Fais une synthèse courte de l'activité de la semaine : ce qui a avancé, par application, et ce qui semble en attente." }, "t3"),
      step("report", { title: "Synthèse de la semaine", groupByApp: true }, "t4"),
      step("confirm", { message: "Relisez la synthèse d'AXION avant sa création dans SPECTRA Writer." }, "t5"),
      step("writer", {}, "t6")
    ]
  },
  {
    id: "inventaire-documents",
    name: "Inventaire de mes documents SPECTRA",
    description: "Compose la liste de vos documents, classeurs et présentations (partages compris), sans rien écrire.",
    needsAxion: false,
    build: () => [
      step("collect", { apps: ["spectrawriter", "spectracalc", "spectraslide"], includeShared: true, max: 300 }, "t1"),
      step("report", { title: "Inventaire de mes documents SPECTRA", groupByApp: true }, "t2")
    ]
  }
];
