/* Vérification des fichiers publiés : aucun secret, aucune insertion de HTML non échappé hors des cas maîtrisés. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const published = ["index.html", "404.html", "manifest.webmanifest", ...walk("src"), ...walk("assets").filter((f) => !f.endsWith(".png"))];

test("aucun secret dans les fichiers publiés", () => {
  const bad = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /"private_key"\s*:/, /"type"\s*:\s*"service_account"/, /sk-[A-Za-z0-9]{20,}/, /sk-ant-[A-Za-z0-9-]{10,}/, /ghp_[A-Za-z0-9]{20,}/, /xox[bp]-[A-Za-z0-9-]{10,}/, /AIza[0-9A-Za-z_-]{35}/g];
  for (const f of published) {
    const s = readFileSync(f, "utf8");
    for (const re of bad) {
      const m = s.match(re);
      if (!m) continue;
      // Seule exception documentée : la clé de CONFIGURATION Web Firebase (publique par conception), dans un seul fichier.
      if (String(re).startsWith("/AIza")) { assert.equal(f, join("src", "config", "firebase-config.js"), `clé d'API inattendue dans ${f}`); assert.equal(m.length, 1); continue; }
      assert.fail(`motif de secret ${re} trouvé dans ${f}`);
    }
  }
});
test("la configuration Firebase est celle du projet Studio Prism existant", () => {
  const s = readFileSync("src/config/firebase-config.js", "utf8");
  assert.match(s, /projectId: "archivision-studioprism"/);
  assert.match(s, /authDomain: "archivision-studioprism\.firebaseapp\.com"/);
});
test("innerHTML n'est utilisé qu'à travers mount() ou des chaînes construites par Nexus", () => {
  const allowed = new Set([join("src", "core", "dom.js"), join("src", "ui", "components.js"), join("src", "ui", "pages", "app-detail.js")]);
  for (const f of walk("src").filter((x) => x.endsWith(".js"))) {
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)) {
      const rhs = m[1].trim();
      const ok = rhs === '""' || allowed.has(f);
      assert.ok(ok, `${f} : innerHTML = ${rhs.slice(0, 60)}`);
    }
  }
});
