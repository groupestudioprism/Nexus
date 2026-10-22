#!/usr/bin/env python3
"""Tests de bout en bout de Nexus dans Chromium (Playwright), contre les ÉMULATEURS Firebase (jamais le vrai projet).

Prérequis (voir docs/TESTS.md) :
  npx firebase emulators:start --only auth,firestore --project demo-nexus
  python3 -m http.server 8000 --bind 127.0.0.1
  node tests/e2e/seed.mjs seed
  python3 tests/e2e/test_e2e.py
Variables facultatives : NEXUS_URL (défaut http://127.0.0.1:8000/), HTTPS_PROXY (pour charger le SDK depuis www.gstatic.com).
"""
import asyncio, json, os, re, subprocess, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("NEXUS_URL", "http://127.0.0.1:8000/") + "?emu=1"
ART = os.path.join(os.path.dirname(__file__), "artifacts")
PW = "Motdepasse!2026"
os.makedirs(ART, exist_ok=True)
results = []


def seed(*args):
    out = subprocess.run(["node", "tests/e2e/seed.mjs", *args], capture_output=True, text=True, check=True).stdout.strip()
    return json.loads(out) if out.startswith(("{", "[")) else out


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("  ok   " if ok else "  ÉCHEC ") + name + (f" — {detail}" if detail and not ok else ""))


async def new_page(browser, w=1440, h=900, mobile=False):
    ctx = await browser.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, has_touch=mobile, locale="fr-FR")
    page = await ctx.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.on("console", lambda m: page.errors.append(m.text) if m.type == "error" and "favicon" not in m.text else None)
    return ctx, page


async def go(page, route):
    await page.goto(BASE + "#" + route)


async def login(page, email, pw=PW):
    await go(page, "/connexion")
    await page.wait_for_selector("#email")
    await page.fill("#email", email)
    await page.fill("#pw", pw)
    await page.click("#go")


async def no_overflow(page):
    if await page.evaluate("innerWidth > screen.width + 1"):
        return f"page élargie à {await page.evaluate('innerWidth')} px"
    # body masque le débordement (overflow-x: hidden) : on vérifie donc qu'aucun élément ne dépasse le bord droit de l'écran
    return await page.evaluate("""[...document.querySelectorAll('#app *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > Math.min(innerWidth, screen.width) + 1 && !e.closest('.tabs, .chips') && getComputedStyle(e).visibility !== 'hidden'; }).map(e => e.className || e.tagName).slice(0, 3).join(' | ') || true""")


async def shot(page, name):
    await page.screenshot(path=os.path.join(ART, name + ".png"), full_page=True)


async def main():
    ids = seed("seed")
    args = ["--proxy-bypass-list=127.0.0.1;localhost"] + (["--proxy-server=" + os.environ["HTTPS_PROXY"]] if os.environ.get("HTTPS_PROXY") else [])
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=args)

        print("Authentification")
        ctx, page = await new_page(browser)
        await go(page, "/automatisations")
        await page.wait_for_url(re.compile(r"#/connexion\?retour=%2Fautomatisations"), timeout=20000)
        check("accès direct à une route protégée → connexion avec retour", True)
        await page.wait_for_selector("text=Connectez-vous pour accéder à cette page.")
        await page.fill("#email", "alice@nexus.test"); await page.fill("#pw", "mauvais"); await page.click("#go")
        await page.wait_for_selector("#err:has-text('E-mail ou mot de passe incorrect.')", timeout=20000)
        check("identifiants incorrects → message clair", True)
        await page.fill("#email", "pas-un-email"); await page.click("#go")
        check("validation du formulaire (e-mail)", await page.inner_text("#err") == "Saisissez une adresse e-mail valide.")
        await login(page, "sus@nexus.test")
        await page.wait_for_selector("text=Ce compte est désactivé", timeout=20000)
        check("compte désactivé refusé, sans boucle", "#/connexion" in page.url)
        await login(page, "pend@nexus.test")
        await page.wait_for_selector("text=en attente de validation", timeout=20000)
        check("compte Entreprise en attente refusé avec message", "#/connexion" in page.url)
        await login(page, "alice@nexus.test")
        await page.wait_for_url(re.compile(r"#/accueil"), timeout=20000)
        await page.wait_for_selector("h1.greet")
        check("connexion réussie → retour à la page d'origine ou à l'accueil", "Alice" in await page.inner_text("h1.greet"))
        await page.reload()
        await page.wait_for_selector("h1.greet", timeout=20000)
        check("actualisation : session conservée", "#/accueil" in page.url)
        await go(page, "/admin")
        await page.wait_for_selector("text=Accès réservé", timeout=10000)
        check("rôle insuffisant : page d'administration refusée", True)
        await go(page, "/n-importe-quoi")
        await page.wait_for_selector("text=Page introuvable", timeout=10000)
        check("adresse inconnue → page introuvable", True)

        print("Applications et connexions")
        await go(page, "/applications")
        await page.wait_for_selector(".tile")
        tiles = await page.locator(".tile").count()
        check("6 applications affichées", tiles == 6, str(tiles))
        txt = await page.inner_text("#nx-main")
        check("licence ARCHIPLAN Pro affichée", "Licence Pro" in txt)
        check("aucune application « Connectée » sans autorisation", "Connectée" not in txt.replace("« Connectée »", ""))
        await go(page, "/applications/archivision")
        await page.wait_for_selector("text=n'enregistre pas de projets")
        check("ARCHIVISION : limitation affichée, pas de bouton de connexion", await page.locator("button[data-act=connect]").count() == 0)
        await go(page, "/connexions")
        await page.wait_for_selector("button[data-act=edit][data-app=archiplan]")
        await page.click("button[data-act=edit][data-app=archiplan]")
        await page.wait_for_selector("dialog.dlg")
        await page.click("dialog.dlg [data-x=ok]")
        await page.wait_for_selector(".toast:has-text('accès vérifié')", timeout=20000)
        check("connexion ARCHIPLAN accordée et vérifiée", True)
        for app in ("architrafic", "spectrawriter"):
            await page.click(f"button[data-act=edit][data-app={app}]")
            await page.wait_for_selector("dialog.dlg")
            if app == "spectrawriter":
                await page.check("dialog.dlg input[value='documents.create']")
            await page.click("dialog.dlg [data-x=ok]")
            await page.wait_for_selector(f".toast:has-text('accès vérifié')", timeout=20000)
            await page.wait_for_timeout(300)
        conns = seed("dump", ids["alice"], "connections")
        sw = next(c for c in conns if c["id"] == "spectrawriter")
        check("connexions enregistrées dans Firestore avec les bonnes autorisations", "documents.create" in sw["scopes"] and len(conns) == 4)
        await go(page, "/applications/archiplan")
        await page.wait_for_selector("text=Maison Dupont", timeout=20000)
        check("projets ARCHIPLAN listés (connecteur réel)", "Extension garage" in await page.inner_text("#nx-main"))
        link = await page.get_attribute("a.li:has-text('Maison Dupont')", "href")
        check("lien direct vers le projet dans ARCHIPLAN", link == "https://archiplan.studio-prism.com/#/p/apA1", link)
        check("projet d'un autre compte absent de « Mes projets »", "Projet de Bob" not in await page.inner_text(".list"))
        await page.click("button[data-act=tab][data-tab=shared]")
        await page.wait_for_selector("text=Projet de Bob partagé")
        check("partage reçu affiché (verrouillé tant que l'e-mail n'est pas vérifié)", "confirmez d'abord votre adresse" in await page.inner_text(".list"))
        await go(page, "/applications/spectrawriter")
        await page.wait_for_selector("text=Note <script>", timeout=20000)
        xss = await page.evaluate("window.__xss === 1")
        check("aperçu HTML d'un document jamais exécuté (XSS)", not xss)
        await go(page, "/accueil")
        await page.wait_for_selector(".map .node.on")
        on = await page.locator(".map .node.on").count()
        check("carte des connexions : 4 applications connectées", on == 4, str(on))
        await page.wait_for_selector("text=Rue du Port", timeout=20000)
        check("accueil : éléments récents de plusieurs applications", True)
        await shot(page, "desktop-accueil")

        print("Automatisations")
        await go(page, "/automatisations")
        await page.click("button[data-act=use][data-tpl=rapport-projets]")
        await page.wait_for_selector("#wf-name")
        await page.wait_for_selector("text=L'automatisation est valide.")
        check("modèle chargé et valide", True)
        await page.click("button[data-act=remove][data-i='3']")   # retire la confirmation → invalide
        await page.wait_for_selector("text=À corriger avant d'enregistrer")
        check("écriture sans confirmation préalable : refusée par l'éditeur", True)
        await page.click("button[data-act=add][data-type=confirm]")
        await page.click("button[data-act=up][data-i='4']")
        await page.wait_for_selector("text=L'automatisation est valide.")
        await page.fill("#wf-name", "Rapport mensuel E2E")
        await page.click("button[data-act=saveRun]")
        try:
            await page.wait_for_selector("dialog.dlg .report-preview", timeout=30000)
        except Exception:
            await shot(page, "echec-lancement"); print(page.url, page.errors); raise
        prev = await page.inner_text("dialog.dlg .report-preview")
        check("confirmation : aperçu du document avant écriture", "Maison Dupont" in prev and "Extension garage" not in prev)
        await page.click("dialog.dlg [data-v='1']")
        await page.wait_for_selector(".pill:has-text('Réussie')", timeout=30000)
        txt = await page.inner_text("#nx-main")
        check("exécution réussie, écriture vérifiée par relecture", "vérifié par relecture" in txt)
        href = await page.get_attribute("a.btn.primary[href*='spectrawriter']", "href")
        docs = seed("swdocs", ids["alice"])
        created = [d for d in docs["docs"] if d["name"] == "Rapport d'activité des projets"]
        check("document réellement créé dans SPECTRA Writer (Firestore)", len(created) == 1 and created[0]["content"] > 100, json.dumps(docs)[:200])
        check("compteur de quota SPECTRA Writer mis à jour", docs["usage"] and docs["usage"]["bytes"] >= created[0]["size"])
        check("lien vers le document créé", href and href.endswith(created[0]["id"]), href)
        await shot(page, "desktop-execution")
        # deuxième exécution refusée
        await go(page, "/automatisations")
        await page.wait_for_selector("button[data-act=run]")
        await page.click("button[data-act=run]")
        await page.click("dialog.dlg [data-v='1']")               # confirmer le lancement
        await page.wait_for_selector("dialog.dlg .report-preview", timeout=30000)
        await page.click("dialog.dlg [data-v='0']")               # refuser à l'étape de confirmation
        await page.wait_for_selector(".pill:has-text('Annulée')", timeout=20000)
        docs2 = seed("swdocs", ids["alice"])
        check("refus à la confirmation : rien n'est créé", len(docs2["docs"]) == len(docs["docs"]))
        runs = seed("dump", ids["alice"], "runs")
        check("exécutions enregistrées (réussie + annulée)", sorted(r["status"] for r in runs) == ["cancelled", "succeeded"], str([r["status"] for r in runs]))

        print("Historique et AXION")
        await go(page, "/historique")
        await page.wait_for_selector(".pill:has-text('Vérifiée')", timeout=15000)
        h = await page.inner_text("#nx-main")
        check("historique : document vérifié, connexions, exécutions", "Vérifiée" in h and "Connexion autorisée : ARCHIPLAN" in h and "Annulée" in h)
        await go(page, "/axion")
        await page.wait_for_selector("text=AXION n'est pas encore disponible")
        check("AXION non configuré : état explicite, aucune fausse réponse", await page.locator("#ask").count() == 0)

        print("Session")
        seed("suspend", ids["alice"])
        await page.wait_for_selector("text=Ce compte est désactivé", timeout=20000)
        check("compte désactivé pendant la session → déconnexion immédiate", "#/connexion" in page.url)
        await ctx.close()

        ctx, page = await new_page(browser)
        await login(page, "eve@nexus.test")
        await page.wait_for_selector("h1.greet", timeout=20000)
        seed("deleteAuth", ids["eve"])
        await page.evaluate("window.__nexusTest.auth.currentUser.getIdToken(true).catch(() => {}).then(() => window.dispatchEvent(new Event('focus')))")
        await page.wait_for_selector("text=Votre session a expiré", timeout=20000)
        check("session expirée / révoquée → message et reconnexion possible", "#/connexion" in page.url)
        await ctx.close()

        print("Administration et déconnexion")
        ctx, page = await new_page(browser)
        await login(page, "admin@nexus.test")
        await page.wait_for_selector("h1.greet", timeout=20000)
        await go(page, "/admin")
        await page.wait_for_selector("#ax")
        await page.click("button[data-act=rules]")
        await page.wait_for_selector("#rules-out .notice.ok", timeout=10000)
        check("administration : règles Nexus vérifiées", await page.locator("#rules-out .notice.err").count() == 0)
        await page.fill("#ax-free", "-3"); await page.click("#ax-save")
        check("réglage AXION invalide refusé", "Limite" in await page.inner_text("#ax-err"))
        await page.fill("#ax-free", "15"); await page.click("#ax-save")
        await page.wait_for_selector(".toast:has-text('enregistré')", timeout=10000)
        check("réglage AXION enregistré (désactivé)", True)
        await page.check("#ax-on"); await page.click("#ax-save")
        await page.wait_for_selector("dialog.dlg:has-text('Activer AXION')")
        await page.click("dialog.dlg [data-v='1']")
        await page.wait_for_selector(".toast:has-text('enregistré')", timeout=10000)
        await go(page, "/axion")
        await page.wait_for_selector("#ask", timeout=15000)
        await page.wait_for_timeout(800); st = await page.inner_text(".axion aside")
        check("AXION activé : composeur affiché, état « non testé », compteur du jour", "Activé, non testé" in st and "0 / 500" in st, st[:200])
        # (aucune demande n'est envoyée : Firebase AI Logic n'a pas d'émulateur et le vrai service ne doit pas être appelé par les tests)
        await go(page, "/admin"); await page.wait_for_selector("#ax")
        await page.uncheck("#ax-on"); await page.click("#ax-save")
        await page.wait_for_selector(".toast:has-text('enregistré')", timeout=10000)
        await page.click(".me-btn")
        try:
            await page.click(".menu [data-act=signout]", timeout=5000)
        except Exception:
            await shot(page, "echec-menu"); raise
        await page.wait_for_url(re.compile(r"#/connexion"), timeout=10000)
        await go(page, "/accueil")
        await page.wait_for_url(re.compile(r"#/connexion\?retour"), timeout=10000)
        check("déconnexion : retour à l'état non connecté", True)
        await ctx.close()

        print("Responsive et accessibilité")
        for (w, h, mob, label) in [(1440, 900, False, "desktop"), (820, 1180, True, "tablette"), (390, 844, True, "mobile")]:
            ctx, page = await new_page(browser, w, h, mob)
            await login(page, "zoe@nexus.test")
            await page.wait_for_selector("h1.greet", timeout=20000)
            for route in ("/accueil", "/applications", "/connexions", "/automatisations", "/automatisations/nouvelle?modele=synthese-axion", "/axion", "/historique", "/compte"):
                await go(page, route)
                await page.wait_for_timeout(900)
                ok = await no_overflow(page)
                check(f"{label} {route} : pas de débordement horizontal", ok is True, str(ok))
                if route in ("/accueil", "/automatisations/nouvelle?modele=synthese-axion", "/connexions"):
                    await shot(page, f"{label}{route.replace('/', '-').split('?')[0]}")
            if label == "mobile":
                check("mobile : barre d'onglets visible, rail masqué", await page.is_visible(".tabbar") and not await page.is_visible(".rail"))
                await page.click(".tabbar [data-act=more]")
                await page.wait_for_selector(".sheet")
                check("mobile : feuille « Plus » (Connexions, Historique, Compte)", "Historique" in await page.inner_text(".sheet"))
                await page.keyboard.press("Escape")
            if label == "desktop":
                await go(page, "/accueil"); await page.reload(); await page.wait_for_selector("h1.greet"); await page.wait_for_timeout(500)
                await page.keyboard.press("Tab")
                f = await page.evaluate("document.activeElement.className")
                check("clavier : premier arrêt = lien d'évitement", "skip" in f, f)
                # boutons sans action
                await go(page, "/automatisations"); await page.wait_for_timeout(800)
                dead = await page.evaluate("""[...document.querySelectorAll('#nx-main button')].filter(b => !b.dataset.act && !b.type.match(/submit/) && !b.closest('form')).length""")
                check("aucun bouton sans action (Automatisations)", dead == 0, str(dead))
            check(f"{label} : aucune erreur JavaScript", not [e for e in page.errors if "permission" not in e.lower()], "; ".join(page.errors[:3]))
            await ctx.close()

        await browser.close()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} / {len(results)} vérifications réussies")
    sys.exit(1 if failed else 0)


try:
    asyncio.run(main())
except Exception as e:
    print("ARRÊT :", type(e).__name__, str(e).splitlines()[0])
    sys.exit(2)
