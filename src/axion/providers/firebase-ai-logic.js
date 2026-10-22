/* Fournisseur AXION : Firebase AI Logic (SDK firebase-ai), sur le projet Studio Prism — aucun serveur, aucune clé dans le code.
 *
 * Deux moteurs possibles, choisis par un administrateur (nxConfig/axion.backend) :
 *  - "googleai"  : Gemini Developer API. Offre gratuite possible (forfait Spark) MAIS, selon les conditions de l'API Gemini, une
 *                  application proposée à des utilisateurs de l'EEE, de la Suisse ou du Royaume-Uni doit utiliser l'offre PAYANTE,
 *                  et les contenus envoyés à l'offre gratuite peuvent servir à améliorer les produits Google. → à valider avant activation.
 *  - "vertexai"  : Vertex AI Gemini API (AgentPlatformBackend dans le SDK 13). Exige le forfait Blaze (payant).
 * Firebase annonce qu'App Check sera obligatoire pour Firebase AI Logic à partir du 2 novembre 2026.
 */
import { registerProvider } from "../provider.js";

export function createFirebaseAiProvider({ app, loadAi }) {
  let cache = { key: "", model: null };
  async function model(settings, system, json) {
    const key = [settings.backend, settings.location, settings.model, system.length, json].join("|");
    if (cache.key === key && cache.model) return cache.model;
    const I = await loadAi();
    const backend = settings.backend === "vertexai" ? new I.AgentPlatformBackend(settings.location || "global") : new I.GoogleAIBackend();
    const ai = I.getAI(app, { backend });
    const m = I.getGenerativeModel(ai, {
      model: settings.model,
      systemInstruction: system,
      generationConfig: json ? { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 4096 } : { temperature: 0.4, maxOutputTokens: 4096 }
    });
    cache = { key, model: m };
    return m;
  }
  return {
    id: "firebase-ai-logic",
    async generate({ system, prompt, json = true, signal, settings }) {
      try {
        const m = await model(settings, system, json);
        const res = await m.generateContent(prompt, signal ? { signal } : undefined);
        const text = res && res.response && typeof res.response.text === "function" ? res.response.text() : "";
        if (!text) throw Object.assign(new Error("empty"), { code: "nx/axion-format" });
        return text;
      } catch (e) {
        if (signal && signal.aborted) throw Object.assign(new Error("cancelled"), { code: "nx/cancelled" });
        if (e && String(e.code || "").startsWith("nx/")) throw e;
        console.warn("[Nexus] AXION :", e && (e.code || e.message));
        throw Object.assign(new Error("unavailable"), { code: "nx/axion-unavailable", detail: [e && e.code, e && e.message].filter(Boolean).join(" : ").slice(0, 200) });
      }
    }
  };
}

registerProvider("firebase-ai-logic", createFirebaseAiProvider);
