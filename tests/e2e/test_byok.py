#!/usr/bin/env python3
"""AXION clé personnelle : vrai Chromium, CSP réelle d'index.html, faux serveurs de fournisseurs (page.route).
Lancer depuis la racine : python3 tests/e2e/test_byok.py"""
import asyncio, re, subprocess, sys, time
from playwright.async_api import async_playwright

csp = re.search(r'Content-Security-Policy" content="([^"]+)"', open("index.html").read()).group(1)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "--bind", "127.0.0.1"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
OK = {"anthropic": {"content": [{"type": "text", "text": "ok"}]}, "gemini": {"candidates": [{"content": {"parts": [{"text": "ok"}]}}]}}
CASES = [("anthropic", "https://api.anthropic.com/v1/messages", "claude-x", None), ("openai", "https://api.openai.com/v1/chat/completions", "gpt-x", None),
         ("gemini", "https://generativelanguage.googleapis.com/v1beta/models/gem-x:generateContent", "gem-x", None),
         ("mistral", "https://api.mistral.ai/v1/chat/completions", "mis-x", None), ("compatible", "https://llm.exemple.com/v1/chat/completions", "m-x", "https://llm.exemple.com/v1")]
fails = []
def check(n, ok, d=""):
    print(("  ok   " if ok else "  ECHEC ") + n + ("" if ok else " : " + str(d)));
    if not ok: fails.append(n)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        await pg.route("http://127.0.0.1:8765/__t.html", lambda r: r.fulfill(content_type="text/html", body=f'<meta http-equiv="Content-Security-Policy" content="{csp}"><script type="module">import "/src/axion/providers/byok.js";import {{createProvider}} from "/src/axion/provider.js";</script>'))
        await pg.goto("http://127.0.0.1:8765/__t.html")
        await pg.evaluate("window.__m = Promise.all([import('/src/axion/providers/byok.js')]).then(([m])=>m)")
        mode = {"v": 200}; seen = {}
        async def fake(route):
            req = route.request; seen[req.url] = req.headers
            s = mode["v"]
            if s == "net": return await route.abort("failed")
            body = (OK.get(next((k for k in OK if k in req.url or (k == "gemini" and "google" in req.url)), ""), {"choices": [{"message": {"content": "ok"}}]})) if s == 200 else {"error": "x"}
            await route.fulfill(status=s, content_type="application/json", body=__import__("json").dumps(body), headers={"access-control-allow-origin": "*", "access-control-allow-headers": "*"})
        await pg.route(re.compile(r"https://(api\.|generativelanguage|llm\.).*"), fake)
        for prov, url, model, ep in CASES:
            for mode_v, code in [(200, None), (401, "nx/axion-key"), (429, "nx/axion-quota"), ("net", "nx/axion-network")]:
                mode["v"] = mode_v
                r = await pg.evaluate("""async ([prov, model, ep]) => { const m = await window.__m; await m.clearConfig('u');
                  await m.saveConfig('u', {provider: prov, model, endpoint: ep || '', key: 'sk-test-12345678'});
                  try { return {ok: true, t: await m.createByokProvider({uid: 'u'}).generate({system: 's', prompt: 'p', json: false})}; }
                  catch (e) { return {ok: false, code: e.code, detail: e.detail || ''}; } }""", [prov, model, ep])
                good = r.get("ok") if code is None else (not r.get("ok") and r.get("code") == code and "sk-test" not in r.get("detail", ""))
                check(f"{prov} {mode_v}", good, r)
            if prov == "anthropic":
                check("en-tête anthropic-dangerous-direct-browser-access", seen[url].get("anthropic-dangerous-direct-browser-access") == "true")
        # format invalide
        r = await pg.evaluate("""async () => { const m = await window.__m; try { await m.saveConfig('u', {provider:'openai', model:'gpt-x', key:'sk abc 12345678'}); return 'ok'; } catch (e) { return e.message; } }""")
        check("format de clé invalide précis", r.startswith("Format de clé invalide"), r)
        await b.close()
asyncio.run(main()); srv.terminate()
sys.exit(1 if fails else 0)
