# Animation d'ouverture

Voile `#nx-intro` posé au-dessus de `#app` (`src/ui/intro.js`, `src/styles/intro.css`, lancé par `src/intro-boot.js`, notifié par `main.js`).

- Scène de 2,8 s en CSS keyframes (points = applications du registre, couleurs du catalogue ; liens ; symbole officiel tracé puis rempli avec les tracés de `assets/brand/nexus-mark.svg` ; mot NEXUS ; constellation discrète), tenue jusqu'à 3,2 s.
- Ne retarde jamais l'authentification ni le routage : `#app` tourne derrière, rendu `inert` le temps du voile. Session encore en chargement après la scène : l'image finale reste avec une fine barre. Session en erreur : le voile se retire aussitôt (`errorScreen` visible). Garde-fou à 15 s.
- Une fois par session de navigation (`sessionStorage["prism-intro-nexus"]`), `?intro=1` force le rejeu. Bouton « Passer l'animation », Échap, Entrée ; `prefers-reduced-motion` : image finale directe.
- Tests de bout en bout : le script pose `prism-intro-nexus` pour ne pas être gêné par le voile.
