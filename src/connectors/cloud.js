/* Connecteurs de données des applications Studio Prism.
 *
 * MÉCANISME D'INTÉGRATION RÉEL : les applications enregistrent leurs projets et documents dans le MÊME projet Firestore que Nexus,
 * protégés par leurs propres règles (bloc ARCHIPLAN, ARCHITRAFIC, SPECTRA… du fichier de règles commun). Connecté avec
 * le même compte Studio Prism, Nexus lit ces données AVEC VOS DROITS, exactement comme l'application : vos projets
 * (`where ownerUid == vous`) et ce qui vous est partagé par e-mail (`where email == votre e-mail`). Les règles de chaque application
 * restent seules juges : Nexus n'obtient aucun droit supplémentaire, et ne voit jamais les données des autres comptes.
 *
 * Écriture : une seule opération, « créer un document SPECTRA Writer », reproduite à l'identique de l'application
 * (src/js/cloud.js de SpectraWriter : fiche + contenu + compteur de quota dans le même lot), après confirmation explicite.
 *
 * Les fonctions reçoivent `svc` ({ db, F }) : elles sont indépendantes de l'interface et testables.
 */
import { textOf } from "../core/dom.js";

export const MAX_SW_DATA = 950000;   // même plafond que SPECTRA Writer (MAX_DATA)
const SW_DEF_PAGE = { size: "A4", orient: "p", margins: "normal", numbers: false, numStyle: "n", numPos: "c", header: "", footer: "", bg: "#ffffff", watermark: "" };
const THUMB_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export const byteLen = (s) => new TextEncoder().encode(String(s || "")).length;
const ms = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : typeof t === "number" ? t : 0);

/* Fiche d'un projet / document, réduite à ce que Nexus affiche. Le HTML d'aperçu n'est JAMAIS inséré tel quel (texte seulement). */
export function mapItem(app, id, d, extra = {}) {
  const thumb = typeof d.thumb === "string" && d.thumb.length < 95000 && THUMB_RE.test(d.thumb) ? d.thumb : "";
  return {
    id, appId: app.id, name: String(d.name || "Sans nom").slice(0, 120), size: Number(d.size) || 0,
    updatedAt: ms(d.updatedAt), createdAt: ms(d.createdAt), ownerName: String(d.ownerName || "").slice(0, 160),
    updatedByName: String(d.updatedByName || "").slice(0, 160), folderId: String(d.folderId || ""), thumb,
    previewHtml: typeof d.preview === "string" ? d.preview.slice(0, 6000) : "", words: Number(d.words) || 0,
    role: "owner", openUrl: app.deepLink ? app.deepLink(id) : app.url, ...extra
  };
}

export async function listOwn(svc, app, uid) {
  const { db, F } = svc;
  const q = F.query(F.collection(db, app.cloud.items), F.where("ownerUid", "==", uid));
  const snap = await F.getDocs(q);
  return snap.docs.map((d) => mapItem(app, d.id, d.data())).sort((a, b) => b.updatedAt - a.updatedAt);
}

/* Éléments partagés avec vous par e-mail. Un élément devenu inaccessible reste listé, verrouillé (comme dans l'application). */
export async function listShared(svc, app, email) {
  const { db, F } = svc;
  const q = F.query(F.collection(db, app.cloud.shares), F.where("email", "==", String(email || "").trim().toLowerCase()));
  const snap = await F.getDocs(q);
  const out = [];
  await Promise.all(snap.docs.slice(0, 60).map(async (s) => {
    const x = s.data();
    if (x.kind === "folder") {
      out.push({ id: "F_" + x.fid, appId: app.id, name: String(x.name || "Dossier partagé").slice(0, 120), kind: "folder", role: x.role, ownerName: String(x.ownerName || ""), openUrl: app.url, updatedAt: 0, shared: true });
      return;
    }
    try {
      const d = await F.getDoc(F.doc(db, app.cloud.items, x.pid));
      if (d.exists()) out.push(mapItem(app, d.id, d.data(), { role: x.role, shared: true, openUrl: app.url }));
    } catch (e) {
      out.push({ id: x.pid, appId: app.id, name: String(x.name || "Élément partagé").slice(0, 120), role: x.role, ownerName: String(x.ownerName || ""), locked: true, shared: true, openUrl: app.url, updatedAt: 0 });
    }
  }));
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/* Vérification RÉELLE d'une connexion : une lecture minimale soumise aux règles de l'application. */
export async function checkAccess(svc, app, uid) {
  const { db, F } = svc;
  try {
    await F.getDocs(F.query(F.collection(db, app.cloud.items), F.where("ownerUid", "==", uid), F.limit(1)));
    return { ok: true, at: Date.now() };
  } catch (e) {
    return { ok: false, code: e.code || "unknown", at: Date.now() };
  }
}

/* ------------------------------------------------------------------ SPECTRA Writer : création d'un document */

const countWords = (t) => (String(t).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

/* Contenu au format de SPECTRA Writer (80-main.js : getJSON / parseDoc). `html` doit déjà être un HTML sûr construit par Nexus
 * (balises simples, valeurs échappées) ; l'application l'assainit de toute façon à l'ouverture (SAN). */
export function buildWriterPayload({ title, html, plainText }) {
  const t = String(title || "Document Nexus").trim().slice(0, 120) || "Document Nexus";
  const body = String(html || "<p><br></p>");
  const data = JSON.stringify({ v: 1, app: "spectrawriter", title: t, html: body, theme: { id: "spectra" }, page: { ...SW_DEF_PAGE } });
  // Aperçu : les premiers blocs, jamais plus de 5 600 caractères (comme previewHtml de l'application)
  let preview = "";
  for (const m of body.match(/<(h1|h2|h3|p|ul|ol|table|blockquote)[\s\S]*?<\/\1>/g) || []) {
    if (preview.length + m.length > 5600) break;
    preview += m;
  }
  return { title: t, data, size: byteLen(data), meta: { preview, theme: "spectra||", words: countWords(plainText || ""), pageSize: "A4" } };
}

/* Crée le document (idempotent : identifiant choisi à l'avance ; s'il existe déjà, rien n'est réécrit).
 * Renvoie { id, created } — `created: false` si le document existait déjà (nouvelle tentative après une coupure). */
export async function createWriterDoc(svc, { uid, email, ownerName, id, payload }) {
  const { db, F } = svc;
  if (payload.size > MAX_SW_DATA) throw Object.assign(new Error("too-big"), { code: "nx/too-big" });
  const ref = F.doc(db, "swDocs", id);
  try {
    const prev = await F.getDoc(ref);
    if (prev.exists()) {
      if (prev.data().ownerUid === uid) return { id, created: false };
      throw Object.assign(new Error("exists"), { code: "nx/invalid" });
    }
  } catch (e) { if (e.code === "nx/invalid") throw e; /* lecture refusée = n'existe pas encore pour nous */ }

  // Compteur de stockage : créé s'il n'existe pas encore (somme de vos documents), comme le fait l'application.
  const uref = F.doc(db, "swUsage", uid);
  const us = await F.getDoc(uref);
  if (!us.exists()) {
    const mine = await F.getDocs(F.query(F.collection(db, "swDocs"), F.where("ownerUid", "==", uid)));
    const bytes = mine.docs.reduce((a, d) => a + (Number(d.data().size) || 0), 0);
    await F.setDoc(uref, { bytes, lastPid: "", updatedAt: F.serverTimestamp() });
  }
  const name = String(ownerName || email || "").slice(0, 160);
  const b = F.writeBatch(db);
  b.set(ref, {
    ownerUid: uid, ownerEmail: String(email || "").trim().toLowerCase(), ownerName: name, name: payload.title, folderId: "",
    size: payload.size, preview: payload.meta.preview, theme: payload.meta.theme, words: payload.meta.words, pageSize: payload.meta.pageSize,
    starred: false, linkMode: "off", linkKey: "", linkToken: "", linkPw: false,
    createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp(), updatedBy: uid, updatedByName: name
  });
  b.set(F.doc(db, "swDocs", id, "content", "main"), { data: payload.data, updatedAt: F.serverTimestamp() });
  b.set(uref, { bytes: F.increment(payload.size), lastPid: id, updatedAt: F.serverTimestamp() }, { merge: true });
  try { await b.commit(); }
  catch (e) { throw e && e.code === "permission-denied" ? Object.assign(new Error("denied"), { code: "nx/quota-or-denied" }) : e; }
  return { id, created: true };
}

/* Vérification après écriture : le document est relu depuis Firestore (fiche ET contenu). Sans relecture réussie, pas de « vérifié ». */
export async function verifyWriterDoc(svc, { uid, id, payload }) {
  const { db, F } = svc;
  const [m, c] = await Promise.all([F.getDoc(F.doc(db, "swDocs", id)), F.getDoc(F.doc(db, "swDocs", id, "content", "main"))]);
  if (!m.exists() || !c.exists()) return { ok: false, reason: "absent" };
  const d = m.data();
  const ok = d.ownerUid === uid && d.name === payload.title && c.data().data === payload.data;
  return ok ? { ok: true } : { ok: false, reason: "différent" };
}

export const previewText = (item) => item.previewHtml ? textOf(item.previewHtml, 180) : "";
