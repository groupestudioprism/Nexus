/* Tests des règles Firestore (fichier COMPLET firebase/firestore.rules) sur l'émulateur Firestore.
 * Lancement : npm run test:rules   (démarre l'émulateur, exécute, l'arrête)
 * Couvre le bloc Nexus ET quelques garanties des règles communes dont Nexus dépend (profil, données SPECTRA Writer, refus final). */
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, orderBy, limit, writeBatch, serverTimestamp, Timestamp, increment } from "firebase/firestore";

let env;
const P = "demo-nexus";
const day = () => { const d = new Date(), p = (x) => String(x).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const users = {
  alice: { firstName: "Alice", lastName: "A", email: "alice@test.fr", accountKind: "individual", subscription: "free", role: "user", status: "active" },
  bob: { firstName: "Bob", lastName: "B", email: "bob@test.fr", accountKind: "individual", subscription: "free", role: "user", status: "active" },
  sus: { firstName: "Sus", lastName: "S", email: "sus@test.fr", accountKind: "individual", subscription: "free", role: "user", status: "suspended" },
  admin: { firstName: "Ad", lastName: "M", email: "admin@test.fr", accountKind: "individual", subscription: "free", role: "admin", status: "active" }
};
const as = (uid) => env.authenticatedContext(uid, { email: users[uid]?.email || `${uid}@test.fr`, email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const later = () => Timestamp.fromMillis(Date.now() + 180 * 864e5);

before(async () => {
  env = await initializeTestEnvironment({ projectId: P, firestore: { rules: readFileSync(process.env.RULES_FILE || "firebase/firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, u] of Object.entries(users)) await setDoc(doc(db, "users", uid), { ...u, createdAt: Timestamp.now(), updatedAt: Timestamp.now(), lastLogin: Timestamp.now() });
    await setDoc(doc(db, "nxUsers", "bob", "connections", "archiplan"), { appId: "archiplan", scopes: ["projects.read"], status: "active", grantedAt: Timestamp.now(), updatedAt: Timestamp.now(), revokedAt: null });
    await setDoc(doc(db, "apProjects", "pAlice"), { ownerUid: "alice", name: "Maison", folderId: "", linkMode: "off", size: 10, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    await setDoc(doc(db, "apProjects", "pBob"), { ownerUid: "bob", name: "Garage", folderId: "", linkMode: "off", size: 10, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  });
});
const conn = (scopes = ["projects.read"], extra = {}) => ({ appId: "archiplan", scopes, status: "active", grantedAt: serverTimestamp(), updatedAt: serverTimestamp(), revokedAt: null, ...extra });
const enableAxion = (on = true, limits = { free: 2, licensed: 3, admin: 5 }) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "nxConfig", "axion"), { enabled: on, backend: "googleai", model: "gemini-3.6-flash", location: "global", dailyLimit: limits, updatedAt: Timestamp.now(), updatedBy: "admin" }));

/* ------------------------------------------------------------------ connexions */
test("connexion : le titulaire crée, lit et liste les siennes", async () => {
  const db = as("alice");
  await assertSucceeds(setDoc(doc(db, "nxUsers/alice/connections/archiplan"), conn()));
  await assertSucceeds(getDoc(doc(db, "nxUsers/alice/connections/archiplan")));
  await assertSucceeds(getDocs(collection(db, "nxUsers/alice/connections")));
});
test("connexion : un autre compte ne lit ni n'écrit", async () => {
  const db = as("alice");
  await assertFails(getDoc(doc(db, "nxUsers/bob/connections/archiplan")));
  await assertFails(getDocs(collection(db, "nxUsers/bob/connections")));
  await assertFails(setDoc(doc(db, "nxUsers/bob/connections/spectrawriter"), { ...conn(), appId: "spectrawriter" }));
  await assertFails(deleteDoc(doc(db, "nxUsers/bob/connections/archiplan")));
});
test("connexion : un administrateur n'accède pas aux données Nexus d'un autre compte", async () => {
  await assertFails(getDoc(doc(as("admin"), "nxUsers/bob/connections/archiplan")));
  await assertFails(getDocs(collection(as("admin"), "nxUsers/bob/connections")));
  await assertFails(deleteDoc(doc(as("admin"), "nxUsers/bob/connections/archiplan")));
});
test("connexion : visiteur et compte désactivé refusés", async () => {
  await assertFails(getDocs(collection(anon(), "nxUsers/bob/connections")));
  await assertFails(setDoc(doc(as("sus"), "nxUsers/sus/connections/archiplan"), conn()));
  await assertFails(getDocs(collection(as("sus"), "nxUsers/sus/connections")));
});
test("connexion : autorisations invalides refusées", async () => {
  const db = as("alice");
  await assertFails(setDoc(doc(db, "nxUsers/alice/connections/archiplan"), conn(["projects.read", "admin.all"])));
  await assertFails(setDoc(doc(db, "nxUsers/alice/connections/archiplan"), conn(["documents.create"])));       // écriture réservée à SPECTRA Writer
  await assertFails(setDoc(doc(db, "nxUsers/alice/connections/inconnue"), { ...conn(), appId: "inconnue" }));
  await assertFails(setDoc(doc(db, "nxUsers/alice/connections/archiplan"), { ...conn(), appId: "archiindus" }));  // id ≠ appId
  await assertFails(setDoc(doc(db, "nxUsers/alice/connections/archiplan"), conn([])));                              // active sans autorisation
  await assertSucceeds(setDoc(doc(db, "nxUsers/alice/connections/spectrawriter"), { ...conn(["projects.read", "documents.create"]), appId: "spectrawriter" }));
});
test("connexion : retrait puis date d'octroi non falsifiable", async () => {
  const db = as("bob");
  await assertSucceeds(updateDoc(doc(db, "nxUsers/bob/connections/archiplan"), { status: "revoked", scopes: [], revokedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, "nxUsers/bob/connections/archiplan"), { grantedAt: Timestamp.fromMillis(0), updatedAt: serverTimestamp() }));
});

/* ------------------------------------------------------------------ automatisations */
const wf = (extra = {}) => ({ name: "Rapport", description: "", trigger: { type: "manual" }, steps: [{ id: "collect-t1", type: "collect", config: {} }], status: "active", template: "", runCount: 0, lastRunAt: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra });
test("automatisation : création valide, formes invalides refusées", async () => {
  const db = as("alice");
  await assertSucceeds(setDoc(doc(db, "nxUsers/alice/workflows/w1"), wf()));
  await assertFails(setDoc(doc(db, "nxUsers/alice/workflows/w2"), wf({ steps: [] })));
  await assertFails(setDoc(doc(db, "nxUsers/alice/workflows/w3"), wf({ steps: Array.from({ length: 11 }, (_, i) => ({ id: "x-" + i })) })));
  await assertFails(setDoc(doc(db, "nxUsers/alice/workflows/w4"), wf({ trigger: { type: "cron" } })));
  await assertFails(setDoc(doc(db, "nxUsers/alice/workflows/w5"), wf({ runCount: 4 })));
  await assertFails(setDoc(doc(db, "nxUsers/alice/workflows/w6"), wf({ owner: "bob" })));
  await assertFails(setDoc(doc(as("bob"), "nxUsers/alice/workflows/w7"), wf()));
});
test("automatisation : compteur d'exécutions +1 seulement", async () => {
  const db = as("alice");
  await assertSucceeds(setDoc(doc(db, "nxUsers/alice/workflows/w1"), wf()));
  await assertSucceeds(updateDoc(doc(db, "nxUsers/alice/workflows/w1"), { runCount: increment(1), lastRunAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, "nxUsers/alice/workflows/w1"), { runCount: 50, updatedAt: serverTimestamp() }));
});

/* ------------------------------------------------------------------ exécutions */
const run = (extra = {}) => ({ workflowId: "w1", workflowName: "Rapport", trigger: "manual", status: "running", steps: [], error: "", result: null, scopes: [], startedAt: serverTimestamp(), updatedAt: serverTimestamp(), endedAt: null, expireAt: later(), ...extra });
test("exécution : cycle de vie et exécution réussie figée", async () => {
  const db = as("alice"), r = doc(db, "nxUsers/alice/runs/r1");
  await assertFails(setDoc(doc(db, "nxUsers/alice/runs/r0"), run({ status: "succeeded", endedAt: serverTimestamp() })));   // naît « en cours »
  await assertSucceeds(setDoc(r, run()));
  await assertSucceeds(updateDoc(r, { status: "awaiting_confirmation", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(r, { status: "succeeded", updatedAt: serverTimestamp() }));                                   // terminée sans date de fin
  await assertSucceeds(updateDoc(r, { status: "succeeded", endedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(r, { status: "running", endedAt: null, updatedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(as("bob"), "nxUsers/alice/runs/r1")));
});
test("exécution : un échec peut repartir (Réessayer)", async () => {
  const db = as("alice"), r = doc(db, "nxUsers/alice/runs/r1");
  await assertSucceeds(setDoc(r, run()));
  await assertSucceeds(updateDoc(r, { status: "failed", error: "x", endedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(r, { status: "running", error: "", endedAt: null, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(r, { workflowName: "Autre", updatedAt: serverTimestamp() }));
});
test("exécution : liste triée par date (index automatique)", async () => {
  const db = as("alice");
  await assertSucceeds(setDoc(doc(db, "nxUsers/alice/runs/r1"), run()));
  await assertSucceeds(getDocs(query(collection(db, "nxUsers/alice/runs"), orderBy("startedAt", "desc"), limit(30))));
});

/* ------------------------------------------------------------------ historique */
const act = (extra = {}) => ({ action: "spectrawriter.create", label: "Doc", appId: "spectrawriter", status: "pending_confirmation", summary: "", error: "", runId: "", confirmedAt: null, at: serverTimestamp(), updatedAt: serverTimestamp(), expireAt: later(), ...extra });
test("historique : progression puis opération figée", async () => {
  const db = as("alice"), a = doc(db, "nxUsers/alice/activity/a1");
  await assertSucceeds(setDoc(a, act()));
  await assertSucceeds(updateDoc(a, { status: "executed", confirmedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(a, { action: "autre", updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(a, { status: "verified", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(a, { status: "failed", updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, "nxUsers/alice/activity/a2"), act({ status: "réussi" })));
  await assertFails(setDoc(doc(db, "nxUsers/alice/activity/a3"), act({ appId: "inconnue" })));
});

/* ------------------------------------------------------------------ AXION */
test("AXION : réglage lisible par un compte actif, modifiable par un administrateur seulement", async () => {
  await enableAxion(false);
  await assertSucceeds(getDoc(doc(as("alice"), "nxConfig/axion")));
  await assertFails(getDoc(doc(anon(), "nxConfig/axion")));
  await assertFails(getDoc(doc(as("sus"), "nxConfig/axion")));
  const cfg = (uid, extra = {}) => ({ enabled: true, backend: "googleai", model: "gemini-3.6-flash", location: "global", dailyLimit: { free: 10, licensed: 50, admin: 100 }, updatedAt: serverTimestamp(), updatedBy: uid, ...extra });
  await assertFails(setDoc(doc(as("alice"), "nxConfig/axion"), cfg("alice")));
  await assertSucceeds(setDoc(doc(as("admin"), "nxConfig/axion"), cfg("admin")));
  await assertFails(setDoc(doc(as("admin"), "nxConfig/axion"), cfg("admin", { backend: "openai" })));
  await assertFails(setDoc(doc(as("admin"), "nxConfig/axion"), cfg("admin", { apiKey: "secret" })));
  await assertFails(setDoc(doc(as("admin"), "nxConfig/axion"), cfg("alice")));
  await assertFails(setDoc(doc(as("admin"), "nxConfig/autre"), cfg("admin")));
});
test("AXION : compteur refusé tant qu'AXION est désactivé", async () => {
  await enableAxion(false);
  await assertFails(setDoc(doc(as("alice"), `nxUsers/alice/aiUsage/${day()}`), { count: 1, updatedAt: serverTimestamp() }));
});
test("AXION : compteur pas à pas, plafonné", async () => {
  await enableAxion(true, { free: 2, licensed: 3, admin: 5 });
  const r = doc(as("alice"), `nxUsers/alice/aiUsage/${day()}`);
  await assertFails(setDoc(r, { count: 2, updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(r, { count: 1, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(r, { count: 3, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(r, { count: 2, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(r, { count: 3, updatedAt: serverTimestamp() }));     // plafond non administrateur = max(gratuit, licence)
  await assertFails(updateDoc(r, { count: 4, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(r, { count: 2, updatedAt: serverTimestamp() }));         // jamais en arrière
});
test("AXION : jour du compteur = jour de la requête", async () => {
  await enableAxion(true);
  await assertFails(setDoc(doc(as("alice"), "nxUsers/alice/aiUsage/2020-01-01"), { count: 1, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(as("alice"), "nxUsers/alice/aiUsage/demain"), { count: 1, updatedAt: serverTimestamp() }));
});

/* ------------------------------------------------------------------ préférences, effacement */
test("préférences : champs fermés, titulaire seul", async () => {
  await assertSucceeds(setDoc(doc(as("alice"), "nxUsers/alice"), { reduceMotion: true, updatedAt: serverTimestamp() }, { merge: true }));
  await assertFails(setDoc(doc(as("alice"), "nxUsers/alice"), { role: "admin", updatedAt: serverTimestamp() }, { merge: true }));
  await assertFails(getDoc(doc(as("bob"), "nxUsers/alice")));
  await assertSucceeds(deleteDoc(doc(as("alice"), "nxUsers/alice")));
});

/* ------------------------------------------------------------------ règles communes dont Nexus dépend */
test("profil : lecture du sien uniquement, rôle non modifiable", async () => {
  await assertSucceeds(getDoc(doc(as("alice"), "users/alice")));
  await assertFails(getDoc(doc(as("alice"), "users/bob")));
  await assertFails(updateDoc(doc(as("alice"), "users/alice"), { role: "admin", updatedAt: serverTimestamp() }));
  await assertFails(getDocs(collection(as("alice"), "users")));
});
test("licences : lecture des siennes par where userId == uid", async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "licenses/alice_archiplan"), { userId: "alice", productId: "archiplan", productName: "ARCHIPLAN", licenseType: "pro", status: "active", activatedAt: Timestamp.now(), expiresAt: null, createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
  await assertSucceeds(getDocs(query(collection(as("alice"), "licenses"), where("userId", "==", "alice"))));
  await assertFails(getDocs(query(collection(as("bob"), "licenses"), where("userId", "==", "alice"))));
  await assertFails(getDocs(collection(as("alice"), "licenses")));
});
test("connecteur ARCHIPLAN : la requête de Nexus (ownerUid == moi) est autorisée, celle d'un autre non", async () => {
  await assertSucceeds(getDocs(query(collection(as("alice"), "apProjects"), where("ownerUid", "==", "alice"))));
  await assertFails(getDocs(query(collection(as("alice"), "apProjects"), where("ownerUid", "==", "bob"))));
  await assertFails(getDoc(doc(as("alice"), "apProjects/pBob")));
});
test("connecteur SPECTRA Writer : création d'un document exactement comme Nexus la fait", async () => {
  const db = as("alice");
  const id = "nxDocTest01";
  const data = JSON.stringify({ v: 1, app: "spectrawriter", title: "Rapport", html: "<h1>Rapport</h1>", theme: { id: "spectra" }, page: { size: "A4" } });
  const size = new TextEncoder().encode(data).length;
  await assertSucceeds(setDoc(doc(db, "swUsage/alice"), { bytes: 0, lastPid: "", updatedAt: serverTimestamp() }));
  const b = writeBatch(db);
  b.set(doc(db, "swDocs", id), { ownerUid: "alice", ownerEmail: "alice@test.fr", ownerName: "Alice A", name: "Rapport", folderId: "", size, preview: "<h1>Rapport</h1>", theme: "spectra||", words: 1, pageSize: "A4", starred: false, linkMode: "off", linkKey: "", linkToken: "", linkPw: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: "alice", updatedByName: "Alice A" });
  b.set(doc(db, "swDocs", id, "content", "main"), { data, updatedAt: serverTimestamp() });
  b.set(doc(db, "swUsage/alice"), { bytes: increment(size), lastPid: id, updatedAt: serverTimestamp() }, { merge: true });
  await assertSucceeds(b.commit());
  await assertSucceeds(getDoc(doc(db, "swDocs", id)));
  await assertSucceeds(getDoc(doc(db, "swDocs", id, "content", "main")));
  await assertFails(getDoc(doc(as("bob"), "swDocs", id)));
});
test("connecteur SPECTRA Writer : sans mise à jour du compteur de quota, refusé", async () => {
  const db = as("alice");
  const b = writeBatch(db);
  b.set(doc(db, "swDocs", "nxDocTest02"), { ownerUid: "alice", name: "X", folderId: "", size: 100, linkMode: "off", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  b.set(doc(db, "swDocs", "nxDocTest02", "content", "main"), { data: "x".repeat(100), updatedAt: serverTimestamp() });
  await assertFails(b.commit());
});
test("refus par défaut : collection inconnue", async () => {
  await assertFails(getDoc(doc(as("admin"), "nexusSecrets/x")));
  await assertFails(setDoc(doc(as("alice"), "nxOther/x"), { a: 1 }));
});
