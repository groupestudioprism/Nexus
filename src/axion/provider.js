/* AXION — interface de fournisseur de modèle.
 *
 * AXION (l'intelligence de Studio Prism) ne dépend d'AUCUN fournisseur en particulier : Nexus ne parle qu'à cette interface.
 *   provider.id                     identifiant ("firebase-ai-logic", demain "backend-proxy", "local"…)
 *   provider.generate(request)      → Promise<string> (texte brut renvoyé par le modèle)
 *       request = { system, prompt, json: true|false, signal, settings }
 * Un fournisseur qui exige une clé secrète DOIT passer par un backend (jamais de clé dans le navigateur ni dans le dépôt).
 */
const providers = new Map();

export function registerProvider(id, factory) { providers.set(id, factory); }
export function providerIds() { return [...providers.keys()]; }
export function makeProvider(id, deps) {
  const f = providers.get(id);
  if (!f) throw Object.assign(new Error("provider"), { code: "nx/axion-off" });
  return f(deps);
}
