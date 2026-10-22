import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWriterPayload, mapItem, byteLen, MAX_SW_DATA, createWriterDoc } from "../../src/connectors/cloud.js";
import { appById } from "../../src/connectors/registry.js";
import { parseAxionResponse, textToHtml, dailyLimitFor, validateSettings, DEFAULT_SETTINGS } from "../../src/axion/protocol.js";

test("SPECTRA Writer : contenu au format de l'application", () => {
  const p = buildWriterPayload({ title: "Rapport", html: "<h1>Rapport</h1><p>Texte</p>", plainText: "Rapport Texte" });
  const j = JSON.parse(p.data);
  assert.equal(j.v, 1); assert.equal(j.app, "spectrawriter"); assert.equal(j.title, "Rapport");
  assert.deepEqual(j.theme, { id: "spectra" }); assert.equal(j.page.size, "A4");
  assert.equal(p.size, byteLen(p.data));
  assert.equal(p.meta.theme, "spectra||"); assert.equal(p.meta.words, 2); assert.ok(p.meta.preview.length <= 5600);
  assert.equal(buildWriterPayload({ title: "   " }).title, "Document Nexus");
  assert.equal(buildWriterPayload({ title: "x".repeat(300) }).title.length, 120);
});
test("SPECTRA Writer : refuse un contenu trop volumineux avant tout envoi", async () => {
  const p = { title: "x", data: "x", size: MAX_SW_DATA + 1, meta: {} };
  await assert.rejects(createWriterDoc({ db: {}, F: {} }, { uid: "u", id: "d", payload: p }), (e) => e.code === "nx/too-big");
});
test("fiche d'un élément : miniature acceptée seulement en data:image sûre", () => {
  const app = appById("archiplan");
  assert.equal(mapItem(app, "a", { name: "X", thumb: "data:image/png;base64,iVBORw0KGgo=" }).thumb, "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(mapItem(app, "a", { name: "X", thumb: "javascript:alert(1)" }).thumb, "");
  assert.equal(mapItem(app, "a", { name: "X", thumb: "data:image/svg+xml;base64,PHN2Zz4=" }).thumb, "");
  assert.equal(mapItem(app, "a", {}).name, "Sans nom");
  assert.equal(mapItem(app, "p1", { name: "X" }).openUrl, "https://archiplan.studio-prism.com/#/p/p1");
});

test("AXION : réponse JSON validée, actions filtrées", () => {
  const known = new Map([["archiplan|p1", { name: "Maison", openUrl: "https://archiplan.studio-prism.com/#/p/p1" }]]);
  const text = JSON.stringify({ reply: "Voici.", limits: "aucune", actions: [
    { type: "open_item", app: "archiplan", id: "p1" },
    { type: "create_document", title: "Note", content: "## Titre\n- a" },
    { type: "open_item", app: "archiplan", id: "inventé" },
    { type: "delete_everything" }   // 4e action : au-delà du maximum de 3, écartée
  ] });
  const r = parseAxionResponse(text, { known, connectedApps: ["archiplan"] });
  assert.equal(r.reply, "Voici.");
  assert.equal(r.actions.length, 2);
  assert.equal(r.rejected, 2);
  assert.equal(r.actions[0].url, "https://archiplan.studio-prism.com/#/p/p1");
  assert.equal(r.actions[1].app, "spectrawriter");
  const r2 = parseAxionResponse(text, { known, connectedApps: [] });
  assert.equal(r2.actions.filter((a) => a.type === "open_item").length, 0, "application non connectée");
});
test("AXION : réponse inexploitable → erreur explicite", () => {
  assert.throws(() => parseAxionResponse("pas du json"), (e) => e.code === "nx/axion-format");
  assert.throws(() => parseAxionResponse('{"reply":""}'), (e) => e.code === "nx/axion-format");
  assert.equal(parseAxionResponse('Bien sûr ! {"reply":"ok"} voilà').reply, "ok");
});
test("AXION : texte → HTML sans aucune balise venue du modèle", () => {
  const h = textToHtml("## Titre <img src=x onerror=alert(1)>\n\n- un\n- <b>deux</b>\n\nParagraphe & fin");
  assert.ok(!/<img|<b>/.test(h));
  assert.ok(h.includes("<h3>Titre &lt;img") && h.includes("<ul><li>un</li><li>&lt;b&gt;deux&lt;/b&gt;</li></ul>") && h.includes("<p>Paragraphe &amp; fin</p>"));
});
test("AXION : limites et réglages", () => {
  assert.equal(dailyLimitFor(DEFAULT_SETTINGS, { admin: true }), 500);
  assert.equal(dailyLimitFor(DEFAULT_SETTINGS, { licensed: true }), 100);
  assert.equal(dailyLimitFor(DEFAULT_SETTINGS, {}), 20);
  assert.deepEqual(validateSettings({ ...DEFAULT_SETTINGS }), []);
  assert.ok(validateSettings({ ...DEFAULT_SETTINGS, backend: "openai" }).length);
  assert.ok(validateSettings({ ...DEFAULT_SETTINGS, model: "<x>" }).length);
  assert.ok(validateSettings({ ...DEFAULT_SETTINGS, dailyLimit: { free: -1, licensed: 1, admin: 1 } }).length);
});

/* Fournisseur Firebase AI Logic : vérifié avec un module SDK de substitution (le vrai service n'a pas d'émulateur). */
import { createFirebaseAiProvider } from "../../src/axion/providers/firebase-ai-logic.js";
function fakeAi(behaviour) {
  const seen = {};
  const I = {
    GoogleAIBackend: class { constructor() { seen.backend = "googleai"; } },
    AgentPlatformBackend: class { constructor(loc) { seen.backend = "vertexai"; seen.location = loc; } },
    getAI: (app, o) => { seen.app = app; return { o }; },
    getGenerativeModel: (ai, o) => { seen.model = o.model; seen.system = o.systemInstruction; seen.json = o.generationConfig.responseMimeType; return { generateContent: (p, opts) => { seen.prompt = p; seen.signal = opts && opts.signal; return behaviour(); } }; }
  };
  return { seen, loadAi: async () => I };
}
test("fournisseur AXION : moteur, modèle, signal d'annulation", async () => {
  const f = fakeAi(async () => ({ response: { text: () => '{"reply":"ok"}' } }));
  const p = createFirebaseAiProvider({ app: "APP", loadAi: f.loadAi });
  const ctrl = new AbortController();
  const t = await p.generate({ system: "S", prompt: "P", signal: ctrl.signal, settings: { backend: "vertexai", location: "europe-west1", model: "m-1" } });
  assert.equal(t, '{"reply":"ok"}');
  assert.deepEqual([f.seen.backend, f.seen.location, f.seen.model, f.seen.system, f.seen.json, f.seen.prompt, f.seen.app], ["vertexai", "europe-west1", "m-1", "S", "application/json", "P", "APP"]);
  assert.equal(f.seen.signal, ctrl.signal);
});
test("fournisseur AXION : erreurs traduites, jamais de réponse inventée", async () => {
  const p1 = createFirebaseAiProvider({ app: 1, loadAi: fakeAi(async () => { throw Object.assign(new Error("App Check token invalid"), { code: "fetch-error" }); }).loadAi });
  await assert.rejects(p1.generate({ system: "S", prompt: "P", settings: { backend: "googleai", model: "m" } }), (e) => e.code === "nx/axion-unavailable" && /App Check/.test(e.detail));
  const p2 = createFirebaseAiProvider({ app: 1, loadAi: fakeAi(async () => ({ response: { text: () => "" } })).loadAi });
  await assert.rejects(p2.generate({ system: "S", prompt: "P", settings: { backend: "googleai", model: "m" } }), (e) => e.code === "nx/axion-format");
  const ctrl = new AbortController(); ctrl.abort();
  const p3 = createFirebaseAiProvider({ app: 1, loadAi: fakeAi(async () => { throw new Error("aborted"); }).loadAi });
  await assert.rejects(p3.generate({ system: "S", prompt: "P", signal: ctrl.signal, settings: { backend: "googleai", model: "m" } }), (e) => e.code === "nx/cancelled");
});
