import { test } from "node:test";
import assert from "node:assert/strict";
import { validateWorkflow, normalizeWorkflow } from "../../src/workflows/schema.js";
import { newStep, requiredScopes } from "../../src/workflows/steps.js";
import { TEMPLATES } from "../../src/workflows/templates.js";
import { createRunner } from "../../src/workflows/engine.js";
import { composeReport, filterItems, itemsDigest } from "../../src/workflows/report.js";

const items = [
  { id: "p1", appId: "archiplan", name: "Maison <b>Dupont</b>", updatedAt: Date.now() - 2 * 864e5, size: 12000 },
  { id: "p2", appId: "architrafic", name: "Rue du Port", updatedAt: Date.now() - 60 * 864e5, size: 3_000_000 }
];
const wf = (steps) => ({ name: "Test", steps });
const allow = () => ({ ok: true });

function services(over = {}) {
  const calls = { create: 0, verify: 0 };
  const prepared = [];
  return {
    calls, prepared,
    now: () => Date.now(),
    checkScope: allow,
    collect: async () => items.slice(),
    summarize: async () => "Synthèse : deux projets.",
    confirm: async () => true,
    writer: {
      prepare: (report) => { const p = { id: "doc" + prepared.length, payload: { title: report.title } }; prepared.push(p); return p; },
      create: async (p) => { calls.create++; return { id: p.id, created: calls.create === 1 }; },
      verify: async () => { calls.verify++; return { ok: true }; },
      openUrl: (id) => "https://spectrawriter.studio-prism.com/#/doc/" + id
    },
    ...over
  };
}

test("les modèles fournis sont valides", () => {
  for (const t of TEMPLATES) assert.deepEqual(validateWorkflow({ name: t.name, steps: t.build() }).errors, [], t.id);
});
test("validation : source d'abord, dépendances, confirmation avant écriture", () => {
  assert.ok(!validateWorkflow(wf([])).ok);
  assert.ok(!validateWorkflow({ name: "", steps: [newStep("collect")] }).ok);
  assert.match(validateWorkflow(wf([newStep("report")])).errors.join(), /première étape/);
  const noConfirm = validateWorkflow(wf([newStep("collect"), newStep("report"), newStep("writer")]));
  assert.match(noConfirm.errors.join(), /confirmation/);
  const twoWrites = validateWorkflow(wf([newStep("collect"), newStep("report"), newStep("confirm"), newStep("writer"), newStep("writer")]));
  assert.match(twoWrites.errors.join(), /Étape 5.*confirmation/);
  assert.match(validateWorkflow(wf([newStep("collect"), newStep("writer")])).errors.join(), /rapport/);
  const bad = newStep("collect"); bad.config.apps = ["archivision"];
  assert.ok(!validateWorkflow(wf([bad])).ok);
  const many = [newStep("collect"), ...Array.from({ length: 10 }, () => newStep("filter"))];
  assert.match(validateWorkflow(wf(many)).errors.join(), /10 étapes/);
});
test("autorisations requises calculées depuis les étapes", () => {
  const s = newStep("collect"); s.config = { apps: ["archiplan"], includeShared: true, max: 10 };
  assert.deepEqual(requiredScopes([s, newStep("report"), newStep("confirm"), newStep("writer")]), [["archiplan", "projects.read"], ["archiplan", "shared.read"], ["spectrawriter", "documents.create"]]);
});
test("normalisation : seuls les champs attendus", () => {
  const n = normalizeWorkflow({ name: "  A  ", steps: [newStep("collect")], evil: 1, status: "x" });
  assert.equal(n.name, "A"); assert.equal(n.status, "active"); assert.equal("evil" in n, false);
});

test("exécution valide : chaque étape réussie, écriture vérifiée", async () => {
  const S = services(), updates = [];
  const r = createRunner({ name: "R", steps: TEMPLATES[0].build() }, S, (st) => updates.push(st.status));
  const st = await r.start();
  assert.equal(st.status, "succeeded");
  assert.ok(st.steps.every((s) => s.status === "succeeded"));
  assert.equal(st.steps.at(-1).verified, true);
  assert.equal(st.result.documentId, "doc0");
  assert.ok(updates.includes("awaiting_confirmation"));
  assert.equal(S.calls.create, 1);
});
test("autorisation manquante : échec avant toute étape", async () => {
  const S = services({ checkScope: (a, s) => ({ ok: s !== "documents.create" }) });
  const st = await createRunner({ name: "R", steps: TEMPLATES[0].build() }, S).start();
  assert.equal(st.status, "failed");
  assert.match(st.error, /spectrawriter/);
  assert.equal(S.calls.create, 0);
});
test("refus à la confirmation : rien n'est écrit", async () => {
  const S = services({ confirm: async () => false });
  const st = await createRunner({ name: "R", steps: TEMPLATES[0].build() }, S).start();
  assert.equal(st.status, "cancelled");
  assert.equal(S.calls.create, 0);
  assert.equal(st.steps.at(-1).status, "cancelled");
});
test("écriture non retrouvée à la relecture : échec explicite, jamais « réussi »", async () => {
  const S = services();
  S.writer.verify = async () => ({ ok: false });
  const st = await createRunner({ name: "R", steps: TEMPLATES[0].build() }, S).start();
  assert.equal(st.status, "failed");
  assert.equal(st.steps.at(-1).verified, false);
  assert.equal(st.result, null);
});
test("étape en échec puis nouvelle tentative : même identifiant, pas de doublon", async () => {
  const S = services();
  let fail = true;
  const create = S.writer.create;
  S.writer.create = async (p) => { if (fail) { fail = false; throw Object.assign(new Error("réseau"), { code: "unavailable" }); } return create(p); };
  const r = createRunner({ name: "R", steps: TEMPLATES[0].build() }, S);
  let st = await r.start();
  assert.equal(st.status, "failed");
  assert.ok(r.canRetry());
  st = await r.retry();
  assert.equal(st.status, "succeeded");
  assert.equal(S.prepared.length, 1, "le document n'est préparé qu'une fois");
});
test("données manquantes / source en échec", async () => {
  const S = services({ collect: async () => { throw Object.assign(new Error("x"), { code: "permission-denied" }); }, describeError: (e) => e.code });
  const st = await createRunner({ name: "R", steps: TEMPLATES[0].build() }, S).start();
  assert.equal(st.status, "failed");
  assert.equal(st.steps[0].status, "failed");
  assert.equal(st.steps[0].error, "permission-denied");
  assert.ok(st.steps.slice(1).every((s) => s.status === "skipped"));
});
test("interruption pendant la confirmation", async () => {
  let release;
  const S = services({ confirm: ({ signal }) => new Promise((res) => { release = res; signal.addEventListener("abort", () => res(false)); }) });
  const r = createRunner({ name: "R", steps: TEMPLATES[0].build() }, S);
  const p = r.start();
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(r.state.status, "awaiting_confirmation");
  r.cancel();
  const st = await p;
  assert.equal(st.status, "cancelled");
  assert.equal(S.calls.create, 0);
  void release;
});
test("étape AXION : échec propre si AXION n'est pas configuré", async () => {
  const S = services({ summarize: async () => { throw Object.assign(new Error("off"), { code: "nx/axion-off" }); }, describeError: (e) => e.code });
  const st = await createRunner({ name: "S", steps: TEMPLATES[1].build() }, S).start();
  assert.equal(st.status, "failed");
  assert.equal(st.steps[2].error, "nx/axion-off");
});

test("rapport : valeurs échappées, filtre par période", () => {
  const kept = filterItems(items, { days: 30 });
  assert.deepEqual(kept.map((i) => i.id), ["p1"]);
  assert.deepEqual(filterItems(items, { contains: "port" }).map((i) => i.id), ["p2"]);
  const r = composeReport({ title: "T <script>", items, summary: "A & B\n\nC <i>", groupByApp: true });
  assert.ok(!r.html.includes("<script>") && !r.html.includes("<b>Dupont") && !r.html.includes("<i>"));
  assert.ok(r.html.includes("&lt;b&gt;Dupont&lt;/b&gt;"));
  assert.ok(r.html.includes("<h2>ARCHIPLAN</h2>") && r.html.includes("<h2>ARCHITRAFIC</h2>"));
  assert.match(itemsDigest(items), /\[ARCHIPLAN\] Maison/);
});
