import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdmin, licenseState, hasScope, sanitizeScopes, appStatus, canUse, needsConfirmation } from "../../src/core/permissions.js";
import { APPS, appById } from "../../src/connectors/registry.js";

const active = { status: "active", role: "user" };
const conn = (scopes, status = "active") => ({ status, scopes });

test("administrateur = rôle admin ET compte actif", () => {
  assert.equal(isAdmin({ role: "admin", status: "active" }), true);
  assert.equal(isAdmin({ role: "admin", status: "suspended" }), false);
  assert.equal(isAdmin({ role: "user", status: "active" }), false);
  assert.equal(isAdmin(null), false);
});
test("état d'une licence", () => {
  const now = 1_000_000;
  assert.equal(licenseState(null, now), "none");
  assert.equal(licenseState({ status: "active", expiresAt: null }, now), "active");
  assert.equal(licenseState({ status: "active", expiresAt: now - 1 }, now), "expired");
  assert.equal(licenseState({ status: "active", expiresAt: { toMillis: () => now + 10 } }, now), "active");
  assert.equal(licenseState({ status: "suspended" }, now), "suspended");
});
test("autorisations : jamais au-delà de ce que l'application peut recevoir", () => {
  assert.deepEqual(sanitizeScopes("archiplan", ["projects.read", "documents.create", "x"]), ["projects.read"]);
  assert.deepEqual(sanitizeScopes("spectrawriter", ["documents.create", "documents.create"]), ["documents.create"]);
  assert.deepEqual(sanitizeScopes("inconnue", ["projects.read"]), []);
  assert.equal(hasScope(conn(["projects.read"], "revoked"), "projects.read"), false);
});
test("canUse : compte, application, autorisation", () => {
  assert.deepEqual(canUse({ profile: { status: "suspended" }, connection: conn(["projects.read"]), appId: "archiplan", scope: "projects.read" }), { ok: false, reason: "app/suspended" });
  assert.equal(canUse({ profile: active, connection: null, appId: "archiplan", scope: "projects.read" }).reason, "nx/not-connected");
  assert.equal(canUse({ profile: active, connection: conn(["catalog.read"]), appId: "archiplan", scope: "projects.read" }).reason, "nx/scope-missing");
  assert.equal(canUse({ profile: active, connection: conn(["documents.create"]), appId: "archiplan", scope: "documents.create" }).reason, "nx/scope-missing");
  assert.equal(canUse({ profile: active, connection: conn(["projects.read"]), appId: "archiplan", scope: "projects.read" }).ok, true);
  assert.equal(needsConfirmation("documents.create"), true);
});
test("état affiché d'une application", () => {
  const ap = appById("archiplan"), av = appById("archivision");
  assert.equal(appStatus({ app: ap, profile: { status: "suspended" } }), "forbidden");
  assert.equal(appStatus({ app: av, profile: active }), "available");
  assert.equal(appStatus({ app: ap, profile: active, connection: null }), "disconnected");
  assert.equal(appStatus({ app: ap, profile: active, pending: true }), "connecting");
  assert.equal(appStatus({ app: ap, profile: active, connection: conn(["projects.read"]) }), "connected");
  assert.equal(appStatus({ app: ap, profile: active, connection: conn(["projects.read"]), lastCheck: { ok: false, code: "unavailable" } }), "error");
  assert.equal(appStatus({ app: ap, profile: active, connection: conn(["projects.read"]), lastCheck: { ok: false, code: "permission-denied" } }), "forbidden");
});
test("registre : seules les applications avec données ont des autorisations de lecture ; seule SPECTRA Writer écrit", () => {
  for (const a of APPS) {
    assert.ok(a.url.startsWith("https://") && a.url.endsWith(".studio-prism.com/"), a.id);
    if (!a.cloud) assert.deepEqual(a.scopes, ["catalog.read"]);
    if (a.scopes.includes("documents.create")) assert.equal(a.id, "spectrawriter");
    if (a.deepLink) assert.ok(a.deepLink("ab_c-1").startsWith(a.url + "#/"));
  }
  assert.equal(appById("spectrawriter").deepLink("x y"), "https://spectrawriter.studio-prism.com/#/doc/x%20y");
});
