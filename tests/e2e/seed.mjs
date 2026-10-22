/* Données de test pour les émulateurs (jamais pour le vrai projet). Usage : node tests/e2e/seed.mjs <commande> [arg] */
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, Timestamp } from "firebase/firestore";

const AUTH = "http://127.0.0.1:9099";
const P = "demo-nexus";
const env = await initializeTestEnvironment({ projectId: P, firestore: { rules: readFileSync("firebase/firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
const admin = async (fn) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = await fn(ctx.firestore()); }); return out; };
const now = () => Timestamp.now();
const ago = (d) => Timestamp.fromMillis(Date.now() - d * 864e5);

async function signUp(email, password = "Motdepasse!2026", name = "") {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, displayName: name, returnSecureToken: true }) });
  const j = await r.json();
  if (!j.localId) throw new Error(JSON.stringify(j));
  return j.localId;
}
const profile = (first, last, email, extra = {}) => ({ firstName: first, lastName: last, email, accountKind: "individual", subscription: "free", role: "user", status: "active", createdAt: ago(200), updatedAt: now(), lastLogin: now(), ...extra });

const cmd = process.argv[2];
if (cmd === "seed") {
  await fetch(`${AUTH}/emulator/v1/projects/${P}/accounts`, { method: "DELETE" });
  await env.clearFirestore();
  const ids = {};
  for (const [k, first, extra] of [["alice", "Alice", {}], ["bob", "Bob", {}], ["admin", "Camille", { role: "admin" }], ["sus", "Sacha", { status: "suspended" }], ["pend", "Paul", { status: "pending", accountKind: "company", companyId: "c1", companyName: "Atelier Test", companyEmail: "contact@atelier.test", companyUserRange: "2-10", companyUserLimit: 10 }], ["eve", "Eve", {}], ["zoe", "Zoé", {}]]) {
    const email = `${k}@nexus.test`;
    ids[k] = await signUp(email, "Motdepasse!2026", first);
    await admin((db) => setDoc(doc(db, "users", ids[k]), profile(first, "Test", email, extra)));
  }
  await admin(async (db) => {
    const a = ids.alice, b = ids.bob;
    await setDoc(doc(db, "licenses", `${a}_archiplan`), { userId: a, productId: "archiplan", productName: "ARCHIPLAN", licenseType: "pro", status: "active", activatedAt: ago(30), expiresAt: null, createdAt: ago(30), updatedAt: ago(30) });
    const proj = (owner, name, days, extra = {}) => ({ ownerUid: owner, ownerEmail: "", ownerName: owner === a ? "Alice Test" : "Bob Test", name, folderId: "", size: 24000, linkMode: "off", createdAt: ago(days + 5), updatedAt: ago(days), ...extra });
    await setDoc(doc(db, "apProjects", "apA1"), proj(a, "Maison Dupont", 2, { thumb: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" }));
    await setDoc(doc(db, "apProjects", "apA2"), proj(a, "Extension garage", 45));
    await setDoc(doc(db, "apProjects", "apB1"), proj(b, "Projet de Bob partagé", 3));
    await setDoc(doc(db, "apShares", "apB1__alice@nexus.test"), { kind: "project", pid: "apB1", email: "alice@nexus.test", role: "view", ownerUid: b, name: "Projet de Bob partagé", ownerName: "Bob Test", createdAt: ago(3) });
    await setDoc(doc(db, "atProjects", "atA1"), proj(a, "Rue du Port — déviation", 6));
    await setDoc(doc(db, "swDocs", "swA1"), { ...proj(a, "Note <script>window.__xss=1</script>", 1), preview: '<p>Aperçu</p><img src=x onerror="window.__xss=1">', theme: "spectra||", words: 3, pageSize: "A4", starred: false, linkKey: "", linkToken: "", linkPw: false });
  });
  console.log(JSON.stringify(ids));
} else if (cmd === "suspend") {
  await admin((db) => updateDoc(doc(db, "users", process.argv[3]), { status: "suspended" }));
} else if (cmd === "deleteAuth") {
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${P}/accounts:delete`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" }, body: JSON.stringify({ localId: process.argv[3] }) });
} else if (cmd === "swdocs") {
  const r = await admin((db) => getDocs(query(collection(db, "swDocs"), where("ownerUid", "==", process.argv[3]))));
  const out = [];
  for (const d of r.docs) { const c = await admin((db) => getDoc(doc(db, "swDocs", d.id, "content", "main"))); out.push({ id: d.id, name: d.data().name, size: d.data().size, content: c.exists() ? c.data().data.length : 0 }); }
  const u = await admin((db) => getDoc(doc(db, "swUsage", process.argv[3])));
  console.log(JSON.stringify({ docs: out, usage: u.exists() ? u.data() : null }));
} else if (cmd === "dump") {
  const r = await admin((db) => getDocs(collection(db, "nxUsers", process.argv[3], process.argv[4])));
  console.log(JSON.stringify(r.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
await env.cleanup();
process.exit(0);
