import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHash, matchRoute, safeReturn } from "../../src/core/router.js";
import { relativeTime, bytesLabel, dayKey, initials, toMillis } from "../../src/core/format.js";
import { html, raw, esc } from "../../src/core/dom.js";
import { errorMessage } from "../../src/core/errors.js";

test("routeur : analyse des adresses #/…", () => {
  assert.deepEqual(parseHash("#/applications/archiplan?x=1"), { path: "/applications/archiplan", query: { x: "1" } });
  assert.deepEqual(parseHash(""), { path: "/", query: {} });
  assert.equal(parseHash("#/accueil/").path, "/accueil");
});
test("routeur : paramètres limités à des identifiants sûrs", () => {
  assert.deepEqual(matchRoute("/applications/:id", "/applications/spectrawriter"), { params: { id: "spectrawriter" } });
  assert.equal(matchRoute("/applications/:id", "/applications/<script>"), null);
  assert.equal(matchRoute("/applications/:id", "/applications/a/b"), null);
  assert.equal(matchRoute("/applications/:id", "/applications/%E0%A4%A"), null);
});
test("routeur : retour après connexion uniquement interne", () => {
  assert.equal(safeReturn("/automatisations"), "/automatisations");
  assert.equal(safeReturn("//evil.com"), "/accueil");
  assert.equal(safeReturn("https://evil.com"), "/accueil");
  assert.equal(safeReturn("/x?y=javascript:alert(1)"), "/accueil");
  assert.equal(safeReturn(undefined), "/accueil");
});
test("html`` échappe les valeurs, raw() non", () => {
  const v = '<img src=x onerror="alert(1)">';
  assert.equal(String(html`<p>${v}</p>`), "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
  assert.equal(String(html`<p>${raw("<b>ok</b>")}</p>`), "<p><b>ok</b></p>");
  assert.equal(String(html`${["<a>", raw("<b>")]}`), "&lt;a&gt;<b>");
  assert.equal(esc("`"), "&#96;");
});
test("formats français", () => {
  const now = Date.UTC(2026, 9, 22, 12);
  assert.equal(relativeTime(now - 10e3, now), "à l'instant");
  assert.equal(relativeTime(now - 5 * 60e3, now), "il y a 5 min");
  assert.equal(relativeTime(now - 864e5, now), "hier");
  assert.equal(relativeTime(0, now), "—");
  assert.equal(bytesLabel(500), "500 o");
  assert.match(bytesLabel(2_500_000), /^2,5\sMo$/);
  assert.equal(dayKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(initials("Alice", "Martin"), "AM");
  assert.equal(initials("", "", "zoe@x.fr"), "Z");
  assert.equal(toMillis({ seconds: 2 }), 2000);
});
test("messages d'erreur : jamais le message brut de Firebase", () => {
  assert.equal(errorMessage({ code: "auth/invalid-credential", message: "Firebase: Error (auth/invalid-credential)." }), "E-mail ou mot de passe incorrect.");
  assert.match(errorMessage({ code: "auth/quelque-chose" }), /La connexion a échoué/);
  assert.match(errorMessage({ code: "zzz", message: "stack trace" }), /inattendue/);
  assert.match(errorMessage({ code: "app/pending" }), /Entreprise/);
});
